# Phase 2: Streaming Stability & Error UX - Research

**Researched:** 2026-04-13
**Domain:** AI SDK 6 streaming error path hardening + MCP client lifecycle + Next.js 16 serverless module-scope caching + Gemini 2.5 Flash multi-turn tool use + 한국어 인라인 에러 UX
**Confidence:** HIGH (installed package types read directly; 4 decisions shift from LOW to HIGH after verification)

## Summary

CONTEXT.md에 D-01..D-14 14개 결정이 이미 락다운되어 있다. 본 리서치는 **새로운 옵션을 제시하는 것이 아니라**, 14개 결정이 실제 설치된 AI SDK 6.0.158 / `@ai-sdk/mcp` 1.0.36 / `@ai-sdk/google` 3.0.62 / `@ai-sdk/react` 3.0.160 의 타입과 구현에 부합하는지 검증하고, 각 결정을 구현할 때 필요한 정확한 API shape과 함정을 planner 가 task 로 만들 수 있는 수준으로 문서화한다.

**주요 검증 결과 (설치된 node_modules 타입 직접 확인):**

1. **D-01 (Promise.race 타임아웃)** — VERIFIED. `createMCPClient(config)` 시그니처에 `AbortSignal` / `timeout` 필드가 없다. `Promise.race` 외에는 init 단계에서 타임아웃을 enforce 할 방법 자체가 없다.
2. **D-05 (structured JSON error body)** — PARTIAL. Pre-stream 에러(예: `createMCPClient` throw)는 `new Response(JSON.stringify(...), {status: 503})`로 반환 가능. 그러나 **mid-stream 에러 (streamText 실행 중 발생한 에러)** 는 HTTP status 를 바꿀 수 없다 — 이미 200 OK로 SSE 스트림이 시작된 이후이기 때문. `toUIMessageStreamResponse({onError: (error) => string})` 콜백이 반환하는 **순수 문자열**이 SSE `error` chunk 의 `errorText` 필드로 전달된다. 따라서 mid-stream 에러는 JSON status code 가 아니라 **클라이언트가 파싱 가능한 JSON-stringified 문자열**로 전달해야 한다.
3. **D-06 (에러 code → 한국어 매핑)** — VERIFIED + 주의점. Client 측 `useChat.error.message` 는 pre-stream 에러 경우에는 `HttpChatTransport` 가 `throw new Error(await response.text())` 를 통해 **raw response body 문자열**로 세팅하고, mid-stream 에러 경우에는 `processUIMessageStream` 이 `new Error(chunk.errorText)` 로 세팅한다. **두 경로 모두 "문자열" 이지만 포맷이 다를 수 있다** — 따라서 `error-messages.ts` 의 매핑 함수는 `JSON.parse` 를 `try/catch` 로 감싸고 실패 시 plain-string fallback 으로 분기해야 한다.
4. **D-09 (`regenerate()` 재시도 버튼)** — VERIFIED. `AbstractChat.regenerate: ({ messageId, ...options }?: { messageId?: string } & ChatRequestOptions) => Promise<void>` 에 `messageId` 없이 호출하면 **마지막 assistant 메시지를 regenerate** 한다. `useChat()` 이 `Pick<AbstractChat, 'regenerate' | ... >` 를 re-export 하므로 `const { regenerate } = useChat(...)` 로 직접 사용 가능. `clearError()` 도 같이 사용 가능.

**Primary recommendation:** Phase 2 구현은 D-01..D-14 를 그대로 따르되, **mid-stream vs pre-stream 두 에러 경로를 시그니처가 다른 것으로 취급**하고 client 매핑 함수가 JSON-stringified 와 plain-string 양쪽을 모두 수용하도록 만들 것. Fluid Compute 활성화 여부(아래 §10 Open Questions)를 UAT 전에 확인해 D-12 근거 문장을 재검증.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `createMCPClient` 5초 타임아웃은 **`Promise.race`** 로 구현. `Promise.race([createMCPClient(...), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_timeout')), 5000))])`. AbortController 는 MCP client 내부 지원이 불확실 → Promise.race가 가장 단순하고 의존성 없음.

**D-02:** MCP `tools()` 스키마 캐싱: `frontend/src/app/api/chat/route.ts` **모듈 스코프**에 `let cachedTools: Awaited<ReturnType<typeof mcpClient.tools>> | null = null; let cachedAt: number = 0;` TTL 5분. 호출부에서 `if (cachedTools && Date.now() - cachedAt < 300_000) { tools = cachedTools; }`. 단순 TTL 캐시, Redis/LRU 과도.

**D-03:** degraded mode(MCP 연결 실패 후 도구 없이 진행) UX는 **assistant bubble 내부 프리픽스**로 `[⚠️ 미확인 답변]` 태그 + STRE-04(c)의 한국어 메시지. 별도 global banner 없음.

**D-04:** warm-container PoC는 Phase 2 실행 **첫 커밋 전 별도 임시 스크립트**로 실행. `route.ts`에 `console.log(cachedTools ? 'cache hit' : 'cache miss')` 임시 삽입 → 프로덕션 배포 → 연속 2개 질문 → 로그 제거. 결과는 PROJECT.md Key Decisions 표에 1줄 기록.

**D-05:** route.ts는 에러 발생 시 **structured JSON body** 반환: `{ error: { code: "mcp_timeout" | "mcp_busy" | "mcp_offline" | "stream_timeout" | "unknown", message: "<한국어 메시지>" } }`. HTTP status는 의미에 맞게 (503, 504, 500).

**D-06:** 클라이언트 `useChat.error` 수신 시 JSON body 파싱해 `code`로 분기. STRE-04(a/b/c) 한국어 매핑은 **`frontend/src/lib/error-messages.ts`** (신규)에 테이블로.

**D-07:** 에러 배너는 **실패한 assistant bubble 내부**에 rounded border + `bg-destructive/5` 배경 + 에러 텍스트 + "다시 시도" 버튼. 기존 `chat-container.tsx:190-203` 의 global error block 제거하고 `chat-message.tsx`에 error prop 추가해 위임.

**D-08:** 서버(`route.ts`) 측 자동 재시도: MCP `createMCPClient` 또는 `mcpClient.tools()` 호출 결과가 503/"Max sessions" 감지 시 **1초 대기 후 1회 재시도**.

**D-09:** "다시 시도" 버튼은 AI SDK 6 `useChat.regenerate()` 호출. 실패한 assistant 턴을 제거하고 이전 user 메시지로 재호출.

**D-10:** 재시도 중복 방지: 버튼은 `status === 'streaming' || status === 'submitted'`일 때 disabled.

**D-11:** 503 vs 연결 실패 구분:
- `createMCPClient` throw (ENOTFOUND, ECONNREFUSED, timeout) → `mcp_offline` (또는 `mcp_timeout`)
- `createMCPClient` 성공 + `mcpClient.tools()` 에서 503 / "Max sessions" / 429 → `mcp_busy`
- `streamText` 중 abort/timeout → `stream_timeout`
- 그 외 → `unknown`

**D-12:** `maxDuration` = **60 유지** (상향 안 함). PROJECT.md Key Decisions 표에 기록. ⚠️ 이 결정은 Fluid Compute 비활성화 전제 — §10 Open Question 1 참조.

**D-13:** Gemini `thought_signature` smoke test는 **수동 실행**. "근로기준법 제60조", "그럼 제59조는?", "제58조는?" 3연속. 실패 시 `providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } }` 적용.

**D-14:** 시스템 프롬프트 완화: `SYSTEM_PROMPT` 상수의 "━━━ 절대 규칙 ━━━" 섹션에 일상 인사 예외 문장 추가 (기존 절대 규칙 병기, 삭제 금지).

### Claude's Discretion

User 지시: "claude 너 재량껏 진행해줘" — 세부 파일 정렬, 변수 이름, Tailwind 클래스, 에러 메시지 문구 미세 조정, 1초 대기 정확한 구현 방식(`setTimeout` vs `Promise delay` 등)은 모두 구현 시점 Claude 판단. 에러 메시지 테이블 위치가 `lib/error-messages.ts` vs 인라인 record인지도 구현 가독성으로 판단. Phase 1 완료 후 파일 형태에 따라 세부 refactoring 경계 조정 허용.

### Deferred Ideas (OUT OF SCOPE)

- 구조화된 로깅 / Sentry — v2 V2-OBS-01
- 메트릭 대시보드 — v2
- 에러 자동 신고 / reporting — v2
- MCP 캐시 LRU / 메모리 압력 — 단일 엔드포인트, 불필요
- 다중 MCP 서버 failover — v2
- Phase 3 (tool call UI chip 스타일/라벨) — Phase 3 scope
- 사이드바 에러 표시 / 재시도 이력 — Out of Scope

---

## Phase Requirements

| ID | Description | Locked Decisions that Address It | Research Support |
|----|-------------|----------------------------------|------------------|
| STRE-01 | 5초 타임아웃 + degraded mode fallback | D-01, D-03 | §1.1 `createMCPClient` 에 signal/timeout 필드 없음 확인 |
| STRE-02 | MCP `tools()` 5분 TTL 모듈 스코프 캐시 | D-02, D-04 | §2 Fluid Compute global state 공유 확인, D-02 패턴 타당 |
| STRE-03 | 에러 배너를 실패한 assistant bubble 내부에 | D-07 | §4 `chat-message.tsx` 현재 props 구조 확인 |
| STRE-04 | 3가지 실패 모드 한국어 메시지 | D-05, D-06 | §3 code 4개 중 `unknown`은 fallback, user-facing은 3개 |
| STRE-05 | 실패 턴에 "다시 시도" 버튼 | D-09, D-10 | §5 `AbstractChat.regenerate` 시그니처 확인 |
| STRE-06 | 503 자동 1회 재시도 | D-08 | §6 서버측 단일 재시도 + exponential 1초 |
| STRE-07 | SYSTEM_PROMPT 완화 (일상 인사 예외) | D-14 | §7 toolChoice vs system prompt 비교 |
| STRE-08 | Gemini 멀티턴 smoke test + 필요 시 `thinkingBudget: 0` | D-13 | §8 Gemini 2.5 thought_signature optional 확인 |
| STRE-09 | `maxDuration` 값 결정 + PROJECT.md 기록 | D-12 | §9 Fluid Compute 기본 300s 주의 — Open Question |

---

## 1. `@ai-sdk/mcp` createMCPClient API Validation (D-01)

### 1.1 createMCPClient 시그니처 (설치된 타입 직접 확인)

**Source: `frontend/node_modules/@ai-sdk/mcp/dist/index.d.ts` line 470-486** [VERIFIED]

```typescript
interface MCPClientConfig {
    transport: MCPTransportConfig | MCPTransport;
    onUncaughtError?: (error: unknown) => void;
    name?: string;
    version?: string;
    capabilities?: ClientCapabilities;
}
declare function createMCPClient(config: MCPClientConfig): Promise<MCPClient>;
```

**핵심**: `MCPClientConfig` 에 **`signal` 필드 없음**, **`timeout` 필드 없음**. `createMCPClient` 가 받을 수 있는 건 오직 위 5개. 따라서 init 레벨 타임아웃은 외부에서 `Promise.race` 로만 enforce 가능 — **D-01 결정이 정답** [VERIFIED: node_modules/@ai-sdk/mcp/dist/index.d.ts].

### 1.2 MCPClient 메서드에는 RequestOptions 존재

```typescript
type RequestOptions = {
    signal?: AbortSignal;
    timeout?: number;
    maxTotalTimeout?: number;
};

interface MCPClient {
    tools<TOOL_SCHEMAS extends ToolSchemas = 'automatic'>(options?: {
        schemas?: TOOL_SCHEMAS;
    }): Promise<McpToolSet<TOOL_SCHEMAS>>;
    listTools(options?: { params?: ...; options?: RequestOptions; }): Promise<...>;
    // ...
}
```

**주의**: `tools()` 자체는 `RequestOptions` 를 받지 **않는다**. `listTools()` 는 받음. Phase 2 는 고수준 `tools()` 를 계속 사용하므로 `tools()` 호출 자체에 타임아웃을 걸 수 없다 — `tools()` 호출도 필요 시 `Promise.race` 로 감싸야 한다. 다만 D-02 캐싱이 hit 되면 네트워크 왕복이 없으므로 대부분 문제 없음 [VERIFIED].

### 1.3 Promise.race 타임아웃 후 dangling connection 함정

**Source: `frontend/node_modules/@ai-sdk/mcp/dist/index.mjs` line 1679-1713** [VERIFIED]

`DefaultMCPClient.init()` 내부:
```javascript
async init() {
    try {
        await this.transport.start();
        this.isClosed = false;
        const result = await this.request({ /* initialize */ });
        // ...
        return this;
    } catch (error) {
        await this.close();
        throw error;
    }
}
```

**중요한 사실**: `init()` 이 내부에서 실패한 경우 **MCP SDK 가 직접 `close()` 를 호출**한다. 그러나 Promise.race 타임아웃이 걸린 경우 init() 내부 promise 는 **계속 진행**되어 나중에 성공할 수도 있다 (SSE transport 의 fetch 가 5초 이후 resolve). 이 경우:
- Race loser 의 resolved client 는 garbage collection 될 때까지 memory 를 점유
- 실제 TCP/SSE connection 이 open 상태로 남아 MCP 서버 측 session slot 1 개를 차지

**완화 방안** (research 발견, planner 가 판단):
```typescript
let timeoutClient: MCPClient | null = null;
try {
  const client = await Promise.race([
    createMCPClient(config).then((c) => (timeoutClient = c)),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('mcp_timeout')), 5000)
    ),
  ]);
  mcpClient = client;
} catch (e) {
  // mcp_timeout 후에도 race loser 가 뒤늦게 resolve 될 수 있으므로
  // 그 때를 대비해 뒤늦은 client 도 조용히 close
  Promise.resolve().then(() => timeoutClient?.close().catch(() => {}));
  throw e;
}
```

이 패턴은 100% 보장은 아니지만 (race loser 가 resolve 하기 전에 catch 가 먼저 실행되므로 `timeoutClient` 는 null), **race loser 의 이후 resolution 을 handle 할 수 있도록 Promise.then 경로를 미리 걸어두는** 더 안전한 형태는 planner 가 결정 [VERIFIED: mcp/dist/index.mjs].

**훨씬 더 간단한 대안**: Fly.io MCP 서버는 stateless 한 HTTP transport 이므로 dangling session 이 생겨도 server side idle timeout (보통 30-60s) 에 의해 자동 해제. serverless 워커가 재시작되면 socket 도 자연 해제. → Phase 2 에서는 **감지만 하고 cleanup 은 서버에 맡기는** 쪽이 실용적. Planner 가 결정.

### 1.4 에러 shape 감지 (D-11)

`DefaultMCPClient` init 실패 시 throw 되는 에러의 종류:
- `transport.start()` 의 `fetch()` 가 `ECONNREFUSED` / `ENOTFOUND` → `TypeError: fetch failed` (cause 에 `code: 'ENOTFOUND'` 또는 `ECONNREFUSED`)
- `response.status === 401 && !authProvider` → 401 경로 없음 (authProvider 없으므로) → 아래 경로 따름
- `response.status !== ok` → `MCPClientError({ message: 'MCP SSE Transport Error: ${status} ${statusText}' })`
- 405 → `MCPClientError({ message: 'MCP SSE Transport Error: 405... This server does not support SSE... Try using http transport' })`
- Unsupported protocol version → `MCPClientError({ message: 'Server's protocol version is not supported...' })`

**D-11 감지 규칙 정제**:
```typescript
function classifyMcpError(err: unknown): 'mcp_timeout' | 'mcp_busy' | 'mcp_offline' | 'unknown' {
  if (!(err instanceof Error)) return 'unknown';
  const msg = err.message;
  if (msg.includes('mcp_timeout')) return 'mcp_timeout';               // our Promise.race throw
  if (msg.includes('503') || msg.includes('429') || msg.match(/Max sessions/i)) return 'mcp_busy';
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) return 'mcp_offline';
  if (err.name === 'MCPClientError') return 'mcp_offline';
  // Node TypeError fetch failed: cause 확인
  const cause = (err as any).cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    if (cause.code === 'ECONNREFUSED' || cause.code === 'ENOTFOUND') return 'mcp_offline';
  }
  return 'unknown';
}
```

[VERIFIED: mcp/dist/index.mjs line 1122-1131 for MCPClientError, + Node.js fetch documented cause chain]

### 1.5 D-01 결론

- Promise.race 구현 그대로 진행. 대안 없음 (API 레벨).
- Race loser cleanup 은 best-effort — 완벽 해결책 없으므로 실용적으로 이전 패턴 그대로 채택 가능.
- 에러 classifier 는 최소 3개 체크 (`mcp_timeout` / HTTP 5xx / ENOTFOUND) 필수.

---

## 2. Module-Scope Caching (D-02) + Vercel Warm Container 검증

### 2.1 Next.js 16 Route Handler 의 모듈 스코프 수명

**Source: [Vercel Fluid Compute 문서](https://vercel.com/docs/functions/fluid-compute)** — "Isolation boundaries and global state" 섹션 [VERIFIED: 2026-04 확인]

> "Fluid compute uses a different approach to isolation. Instead of using a microVM for each function invocation, multiple invocations can share the same physical instance (a global state/process) concurrently. This allows functions to share resources and execute in the same environment, which can improve performance and reduce costs."

**의미**: Fluid Compute 가 활성화된 경우 **같은 프로세스에서 여러 요청이 동시에** 실행될 수 있고 모듈 스코프 변수를 공유한다. 비활성화(레거시 serverless) 인 경우에도 warm container 는 **순차적** 으로 같은 프로세스를 재사용한다 (이때는 동시성 없음, race 없음).

Phase 2 의 `route.ts` 는 어느 쪽이든 모듈 스코프 캐시 공유가 가능하다. **D-02 전략 자체는 타당** [VERIFIED].

### 2.2 Concurrent cache-fill race (cache stampede)

Fluid Compute 하에서 동시 요청 N 개가 cache miss 상태로 진입하면 각자 `createMCPClient` + `mcpClient.tools()` 를 호출한다. 결과를 `cachedTools = ...` 로 덮어쓰게 되는데, 이 경우:
- 마지막 writer 가 승리 (last-wins) — 원칙적으로 값은 같은 스키마이므로 문제 없음
- 그러나 N 번의 MCP 서버 호출이 발생 → 503 유발 가능

**완화 패턴**: **pending promise** 캐싱 — cache miss 시 cachedTools 에 `Promise<McpToolSet>` 자체를 저장:

```typescript
let cachedToolsPromise: Promise<McpToolSet> | null = null;
let cachedAt = 0;

async function getCachedTools(mcpClient: MCPClient): Promise<McpToolSet> {
  const now = Date.now();
  if (cachedToolsPromise && now - cachedAt < 300_000) {
    return cachedToolsPromise;  // 모든 동시 요청이 같은 promise 를 await
  }
  cachedToolsPromise = mcpClient.tools();
  cachedAt = now;
  try {
    return await cachedToolsPromise;
  } catch (e) {
    cachedToolsPromise = null;  // fail 시 재시도 가능하게 clear
    throw e;
  }
}
```

[CITED: 표준 cache stampede 방지 패턴; Vercel 공식 문서가 in-function concurrency 를 명시함] — Planner 가 D-02 의 단순 TTL 캐시 대신 이 패턴을 채택할지 판단.

**주의**: mcpClient 자체도 요청마다 새로 만들지, 모듈 스코프에 함께 캐싱할지는 별도 문제. D-02 는 **tools schema** 만 캐싱하라는 지시 — mcpClient 인스턴스는 매번 재생성이라는 뜻. 하지만 schema 가 캐시되어 있다면 굳이 mcpClient 를 만들 필요가 없다 (`streamText` 의 tool execute 는 schema 안의 `execute` 함수가 호출되는데, 그 함수는 client 인스턴스에 bind 된 closure 이므로 client 가 죽으면 execute 도 죽는다). 

**→ 경고 ⚠️**: `McpToolSet` 의 각 tool 의 `execute` 는 `mcpClient` 가 live 할 때만 동작. 모듈 스코프에 `cachedTools` 만 저장하면, 이전 request 의 mcpClient 가 이미 close 된 상태에서 execute 가 호출될 수 있다 — **이렇게 되면 tool 실행이 stale client 에러로 실패**. 

**해결**: Phase 2 구현은 다음 중 하나:
1. **`mcpClient` 를 모듈 스코프에 공유** (D-02 를 확장) — 여러 request 가 한 live client 를 공유. 한 request 에서 close 하지 않음 (lifecycle 을 모듈 레벨로 이관).
2. **매 request 새 mcpClient + 새 `tools()` 호출** — 캐싱 의미 없음, 원복.
3. **Tool schema 만 캐싱하되, tool.execute 를 새로 래핑** — schema 는 정적, execute 는 매 request 새 client 로 binding. 복잡도 상승.

→ **Planner 가 판단할 항목** (CONTEXT.md D-02 는 이 레이어를 명시하지 않음). Research 의 권장: **옵션 1** (mcpClient 모듈 스코프 공유). 단 `close()` 를 해당 모듈에서 어떻게 관리할지 정책 필요 — TTL 5분 만료 시점에 close() 후 null 재설정.

### 2.3 PoC 검증 (D-04)

D-04 의 PoC 는 `console.log(cachedTools ? 'cache hit' : 'cache miss')` 를 넣는 형태. 이는 **캐시 히트 여부** 는 검증하지만 Fluid Compute concurrency 로 인한 stampede 여부는 검증하지 못함. 추가 체크 포인트 제안 (planner 가 결정):
- `console.log('[mcp-cache]', { hit: !!cachedTools, age: Date.now() - cachedAt, createdAt: cachedAt })`
- 연속 3개 질문으로 (first = cold miss, second = warm hit, third = warm hit)
- Vercel 로그에서 첫 요청만 create/tools 호출, 둘째/셋째는 cache hit 로그 확인

### 2.4 D-02 결론

**D-02 채택 + 확장 권장**:
- Module-scope cache 패턴 자체 VERIFIED.
- 단순 TTL 대신 **pending-promise 캐시** 로 cache stampede 방지 (Planner 판단).
- **mcpClient 도 모듈 스코프에 공유** 해야 execute 가 stale 이 되지 않음. CONTEXT.md 에 이 세부사항이 없으므로 planner 가 이 변경을 CONTEXT 보강으로 다루거나 discretion 으로 처리.
- D-04 PoC 는 cache hit 여부만 검증하는 것으로 충분.

---

## 3. 에러 경로 매핑 (D-05, D-06, D-11, STRE-04)

### 3.1 Pre-stream 에러: Response body 로 status 503 / 504

`createMCPClient` 또는 `tools()` 가 throw 되면 `streamText` 호출 전에 catch 되므로 **순수 Response 객체**를 return 가능. HTTP status code 를 사용자 지정 가능:

```typescript
return new Response(
  JSON.stringify({
    error: {
      code: "mcp_busy",
      message: "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
    },
  }),
  {
    status: 503,
    headers: { "Content-Type": "application/json" },
  }
);
```

**클라이언트 수신 경로**:

**Source: `frontend/node_modules/ai/dist/index.mjs` line 12799-12813** [VERIFIED]
```javascript
const response = await fetch2(api, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
  credentials,
  signal: abortSignal
});
if (!response.ok) {
  throw new Error(
    (_e = await response.text()) ?? "Failed to fetch the chat response."
  );
}
```

**결론**: `HttpChatTransport.sendMessages` 는 non-2xx 응답을 `throw new Error(responseBody)` 로 변환한다. `useChat.error.message` 는 **raw JSON 문자열** (`'{"error":{"code":"mcp_busy","message":"..."}}'`) 이 된다. HTTP status code 는 client 에 직접 노출되지 않음 — 오로지 body 문자열만 남는다 [VERIFIED].

### 3.2 Mid-stream 에러: SSE error chunk 로 plain 문자열만

`streamText` 가 토큰을 이미 스트리밍하기 시작한 후 에러 (예: maxDuration timeout, provider error) 는:
- HTTP 응답은 이미 200 OK + `text/event-stream` 로 시작됨
- 에러는 SSE `error` chunk 로 전달됨

**Source: `frontend/node_modules/ai/dist/index.mjs` line 7950-7956** [VERIFIED]
```javascript
case "error": {
  controller.enqueue({
    type: "error",
    errorText: onError(part.error)  // onError 콜백이 반환한 문자열
  });
  break;
}
```

**Source: `frontend/node_modules/ai/dist/index.mjs` line 5763-5766** [VERIFIED]
```javascript
case "error": {
  onError?.(new Error(chunk.errorText));
  break;
}
```

**결론**: 서버 `toUIMessageStreamResponse({ onError: (error) => string })` 의 콜백이 반환한 **순수 문자열**만 클라이언트로 전달됨. JSON 문자열을 반환하는 것은 가능하지만, HTTP status code 는 바꿀 수 없음 [VERIFIED: ai/dist/index.mjs].

### 3.3 D-05/D-06 구현 설계 (두 경로 통합)

**서버 측** (`route.ts`):
```typescript
// Pre-stream: return Response directly
function makeErrorResponse(code: ErrorCode, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

// Mid-stream: toUIMessageStreamResponse onError
return result.toUIMessageStreamResponse({
  consumeSseStream: /* existing drain helper */,
  onError: (error) => {
    console.error("[route.ts] streamText error:", error);
    const code = classifyStreamError(error);  // 'stream_timeout' | 'unknown'
    const message = KOREAN_MESSAGES[code];
    // LAW_API_KEY redaction 은 여전히 필요
    const safeMsg = message.replace(/oc=[^&\s"]+/g, "oc=REDACTED");
    // JSON-serialize so client can parse uniformly
    return JSON.stringify({ error: { code, message: safeMsg } });
  },
});
```

**클라이언트 측** (`frontend/src/lib/error-messages.ts` 신규):
```typescript
export type ErrorCode = 'mcp_timeout' | 'mcp_busy' | 'mcp_offline' | 'stream_timeout' | 'unknown';

export interface ParsedError {
  code: ErrorCode;
  message: string;  // Korean-localized, ready to display
}

const KOREAN_MESSAGES: Record<ErrorCode, string> = {
  mcp_timeout:   "법령 검색 서버 연결이 지연되어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]",
  mcp_busy:      "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
  mcp_offline:   "법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]",
  stream_timeout:"응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요.",
  unknown:       "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.",
};

export function parseChatError(err: Error | undefined): ParsedError {
  if (!err) return { code: 'unknown', message: KOREAN_MESSAGES.unknown };
  const raw = err.message ?? '';

  // Try to parse as structured server error (pre-stream OR mid-stream-stringified)
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.code && parsed.error.code in KOREAN_MESSAGES) {
      const code = parsed.error.code as ErrorCode;
      return { code, message: KOREAN_MESSAGES[code] };
    }
  } catch { /* fall through to legacy detection */ }

  // Legacy fallback: raw string matching (robustness)
  if (raw.includes('503') || /Max sessions/i.test(raw)) {
    return { code: 'mcp_busy', message: KOREAN_MESSAGES.mcp_busy };
  }
  if (raw.includes('ECONNREFUSED') || raw.includes('ENOTFOUND')) {
    return { code: 'mcp_offline', message: KOREAN_MESSAGES.mcp_offline };
  }
  return { code: 'unknown', message: KOREAN_MESSAGES.unknown };
}
```

### 3.4 STRE-04 "3가지 실패 모드" vs D-06 4가지 code 의 해석

REQUIREMENTS.md STRE-04 는 사용자 노출 실패 모드를 **3가지**로 열거:
- (a) `maxDuration` 타임아웃 → `stream_timeout`
- (b) MCP 503/"Max sessions" → `mcp_busy`
- (c) MCP 연결 실패 → `mcp_offline` (+ `[⚠️ 미확인 답변]`)

D-06 은 이 3개 + `unknown` 4개 code를 정의. `unknown` 은 **fallback catch-all** 로 STRE-04 의 "3가지" 에 추가되는 것이 아니라 **예외 케이스의 안전망**. 사용자 노출 의도한 메시지는 3개, 실제 구현은 4개 code [VERIFIED: REQUIREMENTS.md + CONTEXT.md D-06 cross-check]. 

D-11 은 여기에 **`mcp_timeout`** 을 추가로 정의 — D-01 Promise.race timeout 에서 나오는 별도 코드. 최종 client code 수는 **5개**: `mcp_timeout`, `mcp_busy`, `mcp_offline`, `stream_timeout`, `unknown`. `mcp_timeout` 은 CONTEXT.md D-06 매핑 테이블에 명시적으로 없으므로 — planner 가 `mcp_offline` 과 같은 한국어 문구로 가거나 별도 라인을 추가 (⚠️ degraded mode 프리픽스 유지) 하는지 결정. **본 research 권장: `mcp_timeout` 은 사용자 기준으로 `mcp_offline` 과 UX 동일 (연결 안 됨) — 한국어 메시지 공유** [ASSUMED].

### 3.5 D-05/D-06 결론

- Pre-stream 경로와 mid-stream 경로가 HTTP status 측면에서 다르지만, **body 포맷을 JSON-stringified 로 통일**하면 client 매핑 함수가 하나의 `try JSON.parse` 로 처리 가능.
- HTTP status code (503/504/500) 는 **서버 로그/관측용**으로만 의미 있고 클라이언트 UI 분기에는 직접 쓰이지 않음.
- `parseChatError` 는 legacy raw-string 기반 분기도 fallback 으로 유지 (첫 배포에서 서버 경로가 아직 업데이트되지 않은 케이스 방어).

---

## 4. chat-message.tsx + chat-container.tsx 리팩토링 (D-07, STRE-03)

### 4.1 현재 chat-message.tsx 구조

**Source: `frontend/src/components/chat/chat-message.tsx` line 9-82** [VERIFIED: 직접 read]

```typescript
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  id?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}
```

단순 `role + content + id + favorite` 만 받음. content 가 ReactMarkdown 으로 렌더링되고, `content !== "검색 중..."` 체크로 로딩 상태를 구분한다.

### 4.2 에러 prop 추가 설계

**추가할 prop**:
```typescript
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  id?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  error?: {
    code: string;
    message: string;
  };
  onRetry?: () => void;  // wired to useChat.regenerate from parent
  isRetryDisabled?: boolean;  // status === 'streaming' | 'submitted'
}
```

**렌더링**: `content` 가 empty 이고 `error` 존재 시 → error bubble 렌더 (rounded border + `bg-destructive/5` + message + "다시 시도" 버튼). `content` 도 있고 `error` 도 있는 케이스(mid-stream abort 로 partial text + 에러 공존) 는 **content 렌더 뒤 아래에 error banner 세로 스택**. 

**검색 중... placeholder 충돌 방지**: `content === "검색 중..."` 은 계속 동작해야 함 (Phase 1 에서 유지 결정). Phase 2 에러 경로는 별도 — `error` prop 이 **undefined 가 아닐 때만** error bubble 표시. 두 상태가 동시에 공존하지 않음 (로딩 중에는 status === streaming → error 는 아직 undefined).

### 4.3 MessagePartRenderer 와의 연결

**Source: `frontend/src/components/chat/message-part-renderer.tsx` line 39-137** [VERIFIED]

현재 `MessagePartRenderer` 는 `ExtractableMessage` (UIMessage | LegacyMessage) 를 받고 user/assistant 분기 후 `<ChatMessage ...>` 를 렌더한다. **에러 prop 은 message 자체에 담기지 않고, chat-container 의 `error` 상태에서 와야 함** — 따라서 MessagePartRenderer 에 `error?: ParsedError` prop 을 추가하고, chat-container 가 **마지막 assistant 메시지에만** error prop 을 전달하는 패턴:

```typescript
{messages.map((m, idx) => {
  const isLastAssistant =
    idx === messages.length - 1 && m.role === 'assistant';
  // mid-stream 에러면 마지막 메시지가 assistant 일 수도 있고, 
  // pre-stream 에러면 마지막 메시지가 user (assistant 가 아예 안 생김) 일 수 있음
  const attachedError =
    error && isLastAssistant ? parseChatError(error) : undefined;
  return (
    <MessagePartRenderer
      key={m.id}
      message={m}
      isFavorite={favorites.has(m.id)}
      onToggleFavorite={handleToggleFavorite}
      error={attachedError}
      onRetry={regenerate}
      isRetryDisabled={isLoading}
    />
  );
})}

{/* pre-stream 에러로 assistant 메시지가 없는 경우: 
    마지막 user 메시지 아래에 별도 에러 bubble */}
{error && messages[messages.length - 1]?.role === 'user' && (
  <ErrorBubble
    error={parseChatError(error)}
    onRetry={regenerate}
    isRetryDisabled={isLoading}
  />
)}
```

**이 두 케이스 구분이 중요한 이유**:
- **Pre-stream 에러**: `createMCPClient` 실패 → assistant 메시지가 아예 생기지 않음. `useChat` 은 user 메시지만 append 한 상태. 이 상태에서 error banner 를 user 메시지 아래 또는 standalone bubble 로 표시해야 함.
- **Mid-stream 에러**: `streamText` 가 시작된 뒤 중단 → assistant 메시지가 존재하고 partial text 가 있을 수도 있음. 이 경우 error banner 를 assistant bubble 내부 또는 그 아래 stack.

CONTEXT.md D-07 은 "실패한 assistant bubble 내부" 만 언급 — pre-stream 케이스를 커버하지 않음. **Planner 가 이 경계 케이스를 plan 에 명시적으로 처리해야 함** (§10 Open Question).

### 4.4 삭제 대상: chat-container.tsx line 190-203

**현재 코드** (Phase 1 종료 상태에서 VERIFIED 실제 line 번호는 190-203):
```typescript
{error && (
  <div className="mx-auto max-w-3xl px-4 pb-4">
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive mb-1">오류가 발생했습니다</p>
      <p className="text-sm text-muted-foreground">
        {error.message?.includes("503") || error.message?.includes("혼잡")
          ? "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요."
          : error.message?.includes("429")
          ? "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
          : error.message || "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요."}
      </p>
    </div>
  </div>
)}
```

이 블록은 **완전히 삭제**되고 대신 MessagePartRenderer 의 error prop 경로로 전환. 단 **매개 layer** (MessagePartRenderer → ChatMessage) 모두 새 prop 을 통과시켜야 함 (D-07).

**주의**: CONTEXT.md 는 "chat-container.tsx:207-215 의 global error block" 이라고 참조하지만 실제 현재 파일은 190-203 라인 (`extractAssistantText` 가 inline helper 를 대체하면서 라인 번호가 밀림). Planner 는 grep 으로 `error && \(` 또는 `"혼잡"` 같은 substring 을 키로 삭제해야 안전.

### 4.5 D-07 결론

- `chat-message.tsx` 에 `error?`, `onRetry?`, `isRetryDisabled?` 3개 prop 추가.
- `message-part-renderer.tsx` 에 같은 3개 prop pass-through 추가.
- `chat-container.tsx` 에서 기존 global error block 삭제 + `<MessagePartRenderer>` 매핑 시 isLastAssistant 계산 후 error 주입.
- **Pre-stream 에러 (user 메시지만 있는 상태)** 경계 케이스는 `<ErrorBubble>` 별도 컴포넌트로 처리 — CONTEXT.md 에 명시 안 됨, planner 추가 결정 필요.

---

## 5. useChat regenerate() + onError 검증 (D-09, D-10)

### 5.1 AbstractChat.regenerate 시그니처

**Source: `frontend/node_modules/ai/dist/index.d.ts` line 3815-3821** [VERIFIED]

```typescript
/**
 * Regenerate the assistant message with the provided message id.
 * If no message id is provided, the last assistant message will be regenerated.
 */
regenerate: ({ messageId, ...options }?: {
    messageId?: string;
} & ChatRequestOptions) => Promise<void>;
```

**동작**:
1. messageId 생략 시 **마지막 assistant 메시지를 targeted 재생성**
2. 내부적으로 해당 assistant 메시지를 messages 에서 제거한 뒤 `trigger: 'regenerate-message'` 로 재전송
3. `ChatRequestOptions` 로 body 재지정 가능 (예: modelId)

**useChat 에서 노출 방식**:

**Source: `frontend/node_modules/@ai-sdk/react/dist/index.d.ts` line 13-25** [VERIFIED]
```typescript
type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
    readonly id: string;
    setMessages: (messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[])) => void;
    error: Error | undefined;
} & Pick<AbstractChat<UI_MESSAGE>, 'sendMessage' | 'regenerate' | 'stop' | 'resumeStream' | 'addToolResult' | 'addToolOutput' | 'addToolApprovalResponse' | 'status' | 'messages' | 'clearError'>;
```

**중요**: `useChat()` 이 **`regenerate`, `clearError`, `status`, `error` 모두 re-export**. D-09 구현:

```typescript
const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
  id: conversationId,
  onError: (err) => {
    // 로깅만, UI 는 error 상태로 처리
    console.error("[chat] onError:", err);
  },
});

async function handleRetry() {
  clearError();         // error 상태를 초기화 (status → ready)
  await regenerate();   // body: { modelId } 를 다시 포함하려면 옵션 전달
}

// Pre-stream 에러 (assistant 메시지 없음) 케이스에서는 regenerate 가 동작하지 않음!
// regenerate 는 "마지막 assistant 메시지" 를 대상으로 하므로, 
// assistant 메시지가 없으면 아무 것도 재실행하지 않을 가능성이 있음.
```

### 5.2 Pre-stream 에러 케이스에서 regenerate() 의 동작

**문제**: `createMCPClient` 가 실패해 pre-stream 에러 Response 가 반환되면 **assistant 메시지가 생성되지 않음**. AbstractChat 의 regenerate 는 "마지막 assistant 메시지를 재생성" 하는데, 마지막 메시지가 user 일 경우 어떻게 동작하는지는 doc 에 명시 없음.

**Source: `frontend/node_modules/ai/dist/index.mjs` line 12810-12812** — `sendMessages` 가 throw 한 뒤 UseChat state 상태:

```javascript
if (!response.ok) {
  throw new Error(
    (_e = await response.text()) ?? "Failed to fetch the chat response."
  );
}
```

`sendMessages` throw 후 `AbstractChat.makeRequest` 가 catch → `setStatus({ status: 'error', error })` 호출. **user 메시지는 이미 optimistic append 된 상태로 유지됨**. 

이 상태에서 `regenerate()` 호출 시:
- 마지막 assistant 메시지가 없음
- 구현 세부로는 `lastMessage` getter 가 user 메시지를 반환 → regenerate trigger 가 user 메시지를 re-send 하는 형태가 될 가능성

**→ 미검증 동작**: Planner 는 이 케이스의 정확한 동작을 로컬에서 확인해야 함 (pre-stream 에러 → retry 버튼 클릭 → 동작 관찰). 

**안전한 대안**: pre-stream 에러 케이스에서는 `regenerate` 대신 **마지막 user 메시지를 `sendMessage` 로 다시 submit**:
```typescript
async function handleRetry() {
  clearError();
  const lastUser = messages.findLast((m) => m.role === 'user');
  if (!lastUser) return;
  if (messages[messages.length - 1]?.role === 'assistant') {
    // Mid-stream error: assistant turn exists, use regenerate
    await regenerate();
  } else {
    // Pre-stream error: no assistant turn, re-send last user message
    const text = extractAssistantText(lastUser);
    await sendMessage({ text }, { body: { modelId } });
  }
}
```

[ASSUMED: 공식 doc 에 이 경계 케이스가 문서화되지 않음. Phase 2 UAT 에서 실측 검증 필요 — §10 Open Question 3]

### 5.3 D-10 재시도 중복 방지

`status` 값은 **`'submitted' | 'streaming' | 'ready' | 'error'`** 네 가지 [VERIFIED: ai/dist/index.d.ts line 3779-3783].

```typescript
const isLoading = status === 'streaming' || status === 'submitted';
// 재시도 버튼 disabled 조건
<button disabled={isLoading} onClick={handleRetry}>다시 시도</button>
```

D-10 정확. 단 **`clearError()` 후 `regenerate()` 사이 race** — `clearError` 는 status 를 `ready` 로 세팅, regenerate 는 status 를 `submitted` 로. 두 state update 가 연속 실행되며 아주 짧은 시간 동안 `ready` 상태가 노출될 수 있지만 React batch 처리로 사실상 동시 update. 문제 없음 [VERIFIED].

### 5.4 D-09/D-10 결론

- `useChat` 이 `regenerate`, `clearError`, `status`, `error` 모두 export — VERIFIED.
- `regenerate()` (messageId 생략) 동작: 마지막 assistant 메시지 재생성 — VERIFIED for mid-stream 케이스.
- **Pre-stream 에러 케이스에서 regenerate 가 기대대로 동작하는지는 미확인** — planner 가 fallback 경로 (`sendMessage` 로 last user 재전송) 를 구현하거나 로컬에서 실측 확인 후 결정.
- D-10 status 기반 disabled 는 정확.

---

## 6. 503 자동 재시도 (D-08, STRE-06)

### 6.1 설계

CONTEXT.md D-08: `createMCPClient` 또는 `mcpClient.tools()` 에서 503/"Max sessions" 감지 시 1초 대기 후 1회 재시도. 코드 스케치:

```typescript
async function connectMcpWithRetry(): Promise<MCPClient> {
  const makeClient = () =>
    Promise.race([
      createMCPClient({ transport: { type: 'http', url: getMcpUrl() } }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('mcp_timeout')), 5000)
      ),
    ]);

  try {
    return await makeClient();
  } catch (e) {
    const code = classifyMcpError(e);
    if (code !== 'mcp_busy') throw e;  // only retry 503
    await new Promise((r) => setTimeout(r, 1000));
    return await makeClient();  // single retry
  }
}
```

### 6.2 AI SDK 내장 `maxRetries` 와의 관계

**Source: `frontend/node_modules/ai/dist/index.d.ts` line 595-665** [VERIFIED]
```typescript
type CallSettings = {
    // ...
    maxRetries?: number;  // default: 2
    abortSignal?: AbortSignal;
    timeout?: TimeoutConfiguration;
    // ...
};
```

`streamText` 자체에는 `maxRetries: 2` default 가 이미 적용된다 → provider 레벨 retry (Gemini API 5xx 자동 재시도). MCP 레이어는 이 retry 의 적용 대상이 아님 (provider 와 별개). D-08 은 **MCP 레이어만** 재시도하는 것.

- `streamText` 의 기본 maxRetries=2 는 그대로 유지 (Gemini 일시적 5xx 대응).
- MCP 는 별도 수동 재시도. 이중 재시도로 성능 저하 없음 — 레이어가 다름.

### 6.3 D-08 결론

- 단순 1-회 retry, 구현 5줄. 복잡성 없음.
- `streamText` 의 `maxRetries` 는 그대로 두 것이 맞음.

---

## 7. SYSTEM_PROMPT 완화 (D-14, STRE-07)

### 7.1 Gemini tool bias 소스

Gemini 가 툴을 호출하는 이유:
1. **Tool definitions** (`tools` 파라미터) — 존재만으로 "call tools when helpful" 기본 편향
2. **`toolChoice`** — 명시적 제어 (`'auto' | 'none' | 'required' | {...}`)
3. **System prompt 문구** — 모델이 해석하는 자연어 지시

현재 `route.ts` 는 `toolChoice` 를 설정하지 않음 → default `'auto'`. 그리고 SYSTEM_PROMPT 에 "법령 관련 질문을 받으면 **먼저 도구를 호출하세요**. 절대 기억으로 답변하지 마세요" 라는 강제 문구가 존재. 이것이 Gemini 로 하여금 "안녕하세요" 같은 인사에도 무리해서 tool 호출을 유도.

### 7.2 D-14 보강 문장 vs `toolChoice`

**옵션 A**: D-14 그대로 — system prompt 에 예외 문장 추가. 모델이 자연어 지시를 해석.

**옵션 B**: `toolChoice: 'auto'` 명시 + 예외 문장 (같이 사용).

**옵션 C**: 첫 단계에서 `prepareStep` 으로 user 메시지를 빠르게 분류해 tool set 을 on/off 전환.

D-14 는 **옵션 A 고정**. 옵션 B 는 default 와 동일하므로 무의미. 옵션 C 는 복잡도 상승, Phase 2 스코프 밖.

→ **D-14 결정 유지**. 단 한 가지 추가 보강이 유용할 수 있음: `toolChoice: 'auto'` 를 **명시적으로** 옵션으로 넣어두면 AI SDK 타입 위에서 동작 명확성이 확보되고, 장래 Gemini 업그레이드 시 default 가 바뀌어도 안전. 하지만 CONTEXT.md 에 없으므로 planner discretion [ASSUMED].

### 7.3 단일턴 smoke test

D-14 검증: 프로덕션에서 "안녕하세요" 단일 turn → assistant 가 tool 호출 **없이** 응답해야 함. Vercel function log 에서 `finishReason` 과 `[tool] called` 로그 부재 확인. 

**주의**: Gemini 는 system prompt 해석이 결정론적이지 않음 — 여러 번 테스트해야 함. 1회 성공이 확정이 아님. 5-10회 "안녕하세요" 를 던져서 일관되게 tool call 없음 이 확인되면 pass [ASSUMED: LLM 확률적 행동].

### 7.4 D-14 결론

- System prompt 문장 추가 그대로 진행.
- 절대 규칙 섹션 **삭제 금지** 준수. 기존 문장 병기.
- Smoke test 는 5-10회 시도 후 일관성 확인 기준.

---

## 8. Gemini `thinkingConfig: { thinkingBudget: 0 }` (D-13, STRE-08)

### 8.1 Google provider 타입 확인

**Source: `frontend/node_modules/@ai-sdk/google/dist/index.d.ts` line 15-21** [VERIFIED]
```typescript
declare const googleLanguageModelOptions: _ai_sdk_provider_utils.LazySchema<{
    responseModalities?: ("TEXT" | "IMAGE")[] | undefined;
    thinkingConfig?: {
        thinkingBudget?: number | undefined;
        includeThoughts?: boolean | undefined;
        thinkingLevel?: "minimal" | "low" | "medium" | "high" | undefined;
    } | undefined;
    // ...
}>;
```

**VERIFIED**: `thinkingConfig.thinkingBudget: number | undefined` 가 존재. `0` 을 넘기면 thinking 비활성화.

### 8.2 streamText 에서 전달 경로

```typescript
const result = streamText({
  model: google(selectedModel),
  // ...
  providerOptions: {
    google: {
      thinkingConfig: { thinkingBudget: 0 },
    },
  },
});
```

**Source: `frontend/node_modules/ai/dist/index.d.ts` line 2841** [VERIFIED]
```typescript
providerOptions?: ProviderOptions;
```

`providerOptions.google` 는 AI SDK Google adapter 가 알아서 payload 로 변환. Nominal path [VERIFIED].

### 8.3 Gemini 2.5 Flash vs Gemini 3 thought_signature 행동 차이

**Source: [Google Cloud docs - Thought signatures](https://cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures), [AI SDK vercel/ai #10344, #12351](https://github.com/vercel/ai/issues/10344)** [CITED: 2026-04 확인]

**핵심 내용**:
- **Gemini 2.5**: thought_signature 는 **optional** — function calling 포함 모든 턴에서 선택적. 있으면 thinking state 유지, 없어도 모델이 동작.
- **Gemini 3**: thought_signature **mandatory** — function calling 시 이전 턴의 signature 를 재전송해야 함. 누락 시 500 Internal Server Error.

**프로젝트는 Gemini 2.5 Flash 사용** → 원칙적으로 thought_signature 이슈 없어야 함. 다만 AI SDK 의 `convertToModelMessages` 가 파트를 변환할 때 signature 를 drop 하는 케이스가 이슈 #10344 등에서 보고됨.

### 8.4 D-13 smoke test 의 실질

"근로기준법 제60조" → tool call → answer
"그럼 제59조는?" → 이 시점에서 이전 턴의 assistant.parts 에 `text` 파트 + `tool-*` 파트가 있는 상태로 재전송. Gemini 가 context를 이해해 tool 재호출을 할 수 있어야 함.

**smoke test 실패 조건**:
- 2번째 턴에서 assistant 가 빈 응답
- 2번째 턴에서 500 에러
- 2번째 턴에서 tool 을 호출하지 않고 엉뚱한 답변 ("이전 대화를 찾을 수 없습니다" 같은)

이 중 하나라도 발생하면 `thinkingBudget: 0` 적용. 단 `thinkingBudget: 0` 의 부작용:
- Gemini 가 chain-of-thought 없이 즉답
- 복잡한 질문의 품질 저하 가능 (특히 다단계 reasoning)
- 응답 속도는 빠름

Phase 2 UAT 후 판단 [CITED].

### 8.5 D-13 결론

- `providerOptions.google.thinkingConfig.thinkingBudget: 0` 타입 위에서 유효 VERIFIED.
- Gemini 2.5 Flash 는 원칙적으로 smoke test 통과해야 함.
- 실패 시 escape hatch 적용 — 품질 저하 tradeoff 수용.

---

## 9. maxDuration 결정 (D-12, STRE-09) + Fluid Compute 주의

### 9.1 Vercel Hobby plan 의 최신 기본값

**Source: [Vercel Fluid Compute docs](https://vercel.com/docs/functions/fluid-compute) Default settings by plan** [VERIFIED: 2026-04]

| Setting | Hobby | Pro | Enterprise |
|---------|-------|-----|------------|
| Default / Max duration | **300s / 300s** | 300s / 800s | 300s / 800s |

**중요**: Vercel 이 2025-04-23 **이후 신규 프로젝트에 Fluid Compute 를 기본 활성화**. 활성화된 Hobby 플랜은 `maxDuration` 기본값이 **300초**, 최대 300초 (5분).

**D-12 의 "무료 티어 60초" 근거는 Fluid Compute 비활성화 상태에서만 정확**하다.

### 9.2 프로젝트가 어느 쪽인지 확인해야 함

- 프로젝트가 Vercel 에 언제 생성되었는가? 2025-04-23 이전 생성 프로젝트는 Fluid Compute 기본 꺼져 있고, Functions Settings 에서 수동 켜야 함.
- 현재 `maxDuration = 60` 이 적용되어 동작 중 = Fluid 미활성화 상태에서 정상 (maxDuration override 가 60 이므로 가능). Fluid 활성화 상태에서도 60 으로 override 하면 그대로 60 초 한도.
- **상향하려면**: Functions Settings 에서 Fluid Compute 를 enable 후 `maxDuration = 300` 으로 상향 가능. 추가 비용 없음 (Hobby 플랜 내).

### 9.3 D-12 "60 유지" 의 정당성 재평가

D-12 근거:
1. Vercel 무료 티어 제약 — **부정확**. Fluid Compute 활성화 시 300초 가능. Hobby 플랜 그대로.
2. Fluid Compute 활성화는 별도 인프라 결정, 이번 스코프 밖 — **판단 대상**. 단순 토글 1회 + 재배포 1회이므로 "별도 인프라 결정" 은 과장.
3. `stopWhen: stepCountIs(8)` 이어도 평균 30초 이하 완료 — 사실 (Gemini Flash 는 빠름)
4. 타임아웃 케이스는 `stream_timeout` UX 로 방어 — 사실이지만, 상향으로 사용자 경험 개선 가능

**결론**: D-12 의 **구현 내용 (`maxDuration = 60` 유지)** 은 그대로 유지 가능하지만, **근거 문장 #1 ("Vercel 무료 티어 제약")** 은 업데이트 필요 — "Fluid Compute 활성화 여부와 무관하게 Phase 2 스코프에서는 60초 유지, 추후 필요 시 재평가" 가 정확.

**Planner 는 user 에게 확인**: Vercel 프로젝트에 Fluid Compute 가 활성화되어 있는가? 대시보드에서 Functions Settings 로 확인 → PROJECT.md Key Decisions 표에 결과 기록. §10 Open Question 1.

### 9.4 D-12 결론

- 구현: `maxDuration = 60` 유지. 변경 없음.
- PROJECT.md 업데이트 문구: "maxDuration 60 유지. Fluid Compute 활성화 여부 확인 결과 = {확인 결과}. 추후 300s 상향은 별도 결정 항목."
- Fluid Compute 활성화 확인은 UAT 단계에서 user 가 직접 대시보드 열람.

---

## 10. Open Questions

### Q1: Fluid Compute 활성화 여부 확인 (D-12 근거 보강)

**질문**: `glluga-law-mcp.fly.dev` 를 호출하는 Vercel 프로젝트 `frontend-phi-six-16` 의 Functions Settings 에서 Fluid Compute 가 활성화되어 있는가?

**왜 중요**: D-12 의 "60초 유지" 근거 중 "무료 티어 제약" 부분이 Fluid Compute 기본값(300초)으로 인해 부정확. 결정 내용 자체는 바꿀 필요 없지만 PROJECT.md 근거 문장이 변경되어야 함.

**Planner 가 해야 할 것**: UAT 가이드에 "Vercel 대시보드 → Project → Functions → Fluid Compute 토글 확인" 을 1 step 으로 넣기.

### Q2: MCPClient 인스턴스 공유 정책 (D-02 확장)

**질문**: D-02 는 **tools schema** 만 캐싱하라는 지시이지만, `McpToolSet` 의 각 tool 의 `execute` closure 는 mcpClient 가 live 할 때만 동작. 따라서 mcpClient 인스턴스 자체도 모듈 스코프에 공유해야 캐싱이 의미 있음.

**왜 중요**: schema 만 캐싱하고 mcpClient 는 매번 재생성하는 구조는 실제로 작동하지 않음 (execute 가 stale client 에 bind 된 상태). 

**Planner 가 해야 할 것**: D-02 를 **"mcpClient 인스턴스 + tools schema 모두 5분 TTL 로 모듈 스코프에 공유"** 로 해석해 구현. close 는 TTL 만료 시점. 이는 research-level 확장으로 CONTEXT 수정이 아니라 planner discretion 으로 처리.

### Q3: Pre-stream 에러 후 regenerate() 의 실제 동작 미확인

**질문**: `createMCPClient` 가 throw 되어 assistant 메시지가 생성되지 않은 상태에서 `regenerate()` 를 호출하면 어떻게 동작하는가? — 공식 doc 에 명시 없음.

**왜 중요**: Pre-stream 에러 케이스의 "다시 시도" 버튼 동작이 confirm 되어 있지 않음. Phase 2 의 기본 UX 가 여기에 달림.

**Planner 가 해야 할 것**: 
- 옵션 A: plan 에 로컬 실측 task 를 넣어 확인 후 결정.
- 옵션 B: 안전한 fallback 채택 — `handleRetry` 함수가 마지막 메시지가 assistant 면 `regenerate()`, user 면 `sendMessage` 로 re-submit.

Research 권장: **옵션 B**. 안전하고 로컬 실측 없이도 완전 동작.

### Q4: CONTEXT.md 에서 누락된 `mcp_timeout` 한국어 메시지

**질문**: D-06 매핑 테이블이 4개 code (`stream_timeout`, `mcp_busy`, `mcp_offline`, `unknown`) 만 정의. 그러나 D-01 의 Promise.race timeout 은 `mcp_timeout` 이라는 별도 code 를 생성 (D-11 도 이 이름을 언급).

**왜 중요**: `mcp_timeout` 에러가 발생하면 어떤 한국어 메시지를 보여줄지 불명확. 

**Planner 가 해야 할 것**: 
- 옵션 A: `mcp_timeout` 을 별도 code 로 두고 새 한국어 문구 ("법령 검색 서버 연결이 지연되어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]") 추가.
- 옵션 B: `mcp_timeout` 을 `mcp_offline` 으로 alias 처리 (classifier 에서 통합).

Research 권장: **옵션 A** — UX 측면에서 "연결 안됨" 과 "연결 타임아웃" 은 사용자 시간 감각이 다름. 별도 문구가 정확. CONTEXT.md 는 이 항목이 없으므로 **planner discretion**.

### Q5: Pre-stream 에러의 DOM 배치 — assistant bubble 없는 경우

**질문**: D-07 은 "실패한 assistant bubble 내부" 에 에러 배너를 그리라 함. 그러나 pre-stream 에러 (createMCPClient 실패) 케이스에서는 assistant 메시지가 존재하지 않음. 이 경우 에러 배너를 어디에 그리는가?

**왜 중요**: 가장 흔한 에러 경로 (MCP 다운) 가 이 케이스에 해당. D-07 은 이를 커버하지 않음.

**Planner 가 해야 할 것**: 
- 옵션 A: pre-stream 에러 전용 `<ErrorBubble>` 컴포넌트를 user 메시지 직후에 standalone 으로 렌더.
- 옵션 B: optimistic assistant placeholder 를 만들고 거기에 error prop 주입. 단 이 placeholder 는 useChat.messages 에 들어가지 않으므로 local state 로만 관리.

Research 권장: **옵션 A**. 단순하고 state 관리 불필요. MessagePartRenderer 와 같은 CSS 클래스 재사용하여 일관된 look.

---

## 11. Common Pitfalls

### Pitfall 1: 클라이언트가 `error.message` 를 raw JSON 으로 직접 렌더
**What**: `parseChatError` 없이 `<p>{error.message}</p>` 로 렌더하면 사용자에게 `{"error":{"code":"mcp_busy",...}}` 같은 JSON 이 그대로 보임.
**Prevention**: 반드시 `parseChatError(error).message` 로 렌더.

### Pitfall 2: `onError` 서버 콜백에서 throw
**What**: `toUIMessageStreamResponse` 의 `onError` 콜백은 **string 을 return 해야** 한다. 내부에서 throw 하면 AI SDK 가 default 에러 핸들러로 fallback → `"An error occurred"` 문자열이 사용자에게 전달됨.
**Prevention**: `onError` 는 synchronous, try/catch 로 throw 방지, 항상 문자열 return.

### Pitfall 3: `closeMcp()` 에서 unhandled rejection
**What**: Phase 1 에서 이미 해결. closeMcp 가 `try/catch` 로 감싸져 있으므로 OK. 그러나 **TTL 만료 시점**에 모듈 스코프 mcpClient 를 close 할 때도 같은 패턴 필요.
**Prevention**: 모든 close 호출에 try/catch.

### Pitfall 4: `cachedAt = Date.now()` 를 promise resolve 이전에 세팅
**What**: `cachedTools = await mcpClient.tools(); cachedAt = Date.now();` 순서로 쓰면 resolve 대기 중에 다른 request 가 들어와 stale cachedAt 이 보임 → cache miss 재발.
**Prevention**: pending-promise 패턴 사용 — `cachedToolsPromise = mcpClient.tools(); cachedAt = Date.now();` 를 동시에 세팅.

### Pitfall 5: Retry 버튼이 첫 번째 에러만 처리하고 두 번째에러 이후 동작 안 함
**What**: `clearError()` 를 호출하지 않고 `regenerate()` 만 호출하면 useChat 의 error state 가 이전 값 그대로 → UI 가 계속 에러 표시.
**Prevention**: `handleRetry` 에서 `clearError()` 를 먼저 호출.

### Pitfall 6: Gemini 2.5 Flash 가 긴 시스템 프롬프트에 대해 tool call 생략
**What**: D-14 에서 system prompt 가 더 길어짐. Gemini 가 "too many instructions" 로 tool call 을 건너뛸 수 있음 (알려진 편향).
**Prevention**: Smoke test 에서 일상 인사 뿐 아니라 **법령 질문 5개** 도 함께 테스트 — tool 이 정상 호출되는지 확인. 일상 인사 완화로 인해 법령 호출이 퇴화하지 않았는지 확인 필수.

### Pitfall 7: Pre-stream 에러가 너무 빠르게 발생해 UI 가 "검색 중..." 도 안 보임
**What**: `createMCPClient` 가 100ms 만에 throw 되면 `status === 'submitted'` → 바로 `error` 로 전환. 사용자는 "submit 했는데 즉시 에러 배너가 뜬" 경험 — 혼란 가능.
**Prevention**: 의도적 지연 추가 **금지** (theater). 대신 에러 배너에 "어떤 액션이 실패했는지" 를 명시 ("법령 검색 서버 연결 실패").

### Pitfall 8: chat-container.tsx 라인 번호 shift
**What**: CONTEXT.md 는 "chat-container.tsx:207-215" 를 참조하지만, Phase 1 의 refactor 로 현재 실제 라인은 190-203. Planner/구현자가 라인 번호로 grep 하면 실패.
**Prevention**: content substring (`"혼잡"`, `"error &&"`, `rounded-xl.*destructive`) 으로 식별.

### Pitfall 9: `stream_timeout` 감지 실패 — maxDuration abort 는 Error name 이 모호
**What**: Vercel 의 function timeout abort 는 Node.js `AbortError` 또는 `TypeError` 로 fallback. `classifyStreamError` 가 정확히 감지하지 못하면 `unknown` 으로 빠짐.
**Prevention**: `if (err.name === 'AbortError' || /aborted/i.test(err.message)) return 'stream_timeout'` 같이 여러 형태 수용.

### Pitfall 10: Module-scope cache 가 Hot Module Reload 로 사라짐
**What**: 로컬 `next dev` 에서 route.ts 수정 시 HMR 이 모듈을 재로드 → cache 가 초기화. 프로덕션 warm container 와 완전히 다른 동작.
**Prevention**: PoC 는 반드시 **프로덕션 배포 후** Vercel 로그로 검증. 로컬 HMR 로 캐시 동작을 결론짓지 말 것. D-04 가 이미 이렇게 지시.

---

## 12. Code Examples (검증된 패턴)

### 12.1 route.ts: MCP 연결 with timeout + retry + classify

```typescript
// Source: composed from @ai-sdk/mcp/dist/index.d.ts + CONTEXT.md D-01/D-08/D-11
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPClient } from "@ai-sdk/mcp";

export const maxDuration = 60;

// ---- Module-scope cache ----
let cachedClient: MCPClient | null = null;
let cachedTools: Awaited<ReturnType<MCPClient["tools"]>> | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---- Error classification (D-11) ----
type ErrorCode = "mcp_timeout" | "mcp_busy" | "mcp_offline" | "stream_timeout" | "unknown";

function classifyMcpError(err: unknown): ErrorCode {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message ?? "";
  if (msg === "mcp_timeout") return "mcp_timeout";
  if (/503|429|Max sessions/i.test(msg)) return "mcp_busy";
  if (/ENOTFOUND|ECONNREFUSED|fetch failed/i.test(msg)) return "mcp_offline";
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause?.code === "ENOTFOUND" || cause?.code === "ECONNREFUSED") return "mcp_offline";
  return "unknown";
}

function classifyStreamError(err: unknown): ErrorCode {
  if (!(err instanceof Error)) return "unknown";
  if (err.name === "AbortError" || /abort/i.test(err.message ?? "")) return "stream_timeout";
  return "unknown";
}

// ---- 5s timeout wrapper (D-01) ----
async function connectMcpWithTimeout(): Promise<MCPClient> {
  return Promise.race([
    createMCPClient({ transport: { type: "http", url: getMcpUrl() } }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("mcp_timeout")), 5000)
    ),
  ]);
}

// ---- 1-shot retry on 503 (D-08) ----
async function connectMcpWithRetry(): Promise<MCPClient> {
  try {
    return await connectMcpWithTimeout();
  } catch (e) {
    if (classifyMcpError(e) !== "mcp_busy") throw e;
    await new Promise((r) => setTimeout(r, 1000));
    return await connectMcpWithTimeout();
  }
}

// ---- Cached client + tools (D-02) ----
async function getMcpResources(): Promise<{
  client: MCPClient | null;
  tools: Awaited<ReturnType<MCPClient["tools"]>> | Record<string, never>;
  degraded: boolean;
  errorCode: ErrorCode | null;
}> {
  const now = Date.now();
  if (cachedClient && cachedTools && now - cachedAt < CACHE_TTL_MS) {
    return { client: cachedClient, tools: cachedTools, degraded: false, errorCode: null };
  }
  try {
    const client = await connectMcpWithRetry();
    const tools = await client.tools();
    cachedClient = client;
    cachedTools = tools;
    cachedAt = now;
    return { client, tools, degraded: false, errorCode: null };
  } catch (e) {
    const errorCode = classifyMcpError(e);
    console.error("[mcp] connect failed", errorCode, e);
    // Invalidate any stale cache
    cachedClient = null;
    cachedTools = null;
    return { client: null, tools: {}, degraded: true, errorCode };
  }
}
```

### 12.2 POST handler with structured errors

```typescript
// Source: composed from ai/dist/index.d.ts + CONTEXT.md D-05/D-06
export async function POST(req: Request) {
  const { messages: uiMessages, modelId } = await req.json();
  const selectedModel = modelId || "gemini-2.5-flash";
  const messages = await convertToModelMessages(uiMessages);

  const mcp = await getMcpResources();

  // Pre-stream hard-error paths: mcp_busy with no cached fallback → error response
  // For mcp_offline / mcp_timeout, we proceed in degraded mode (no tools)
  if (mcp.errorCode === "mcp_busy" && !cachedTools) {
    return makeErrorResponse("mcp_busy", KOREAN_MESSAGES.mcp_busy, 503);
  }

  const shouldIncludeTools = Object.keys(mcp.tools).length > 0;
  const degradedPrefix = mcp.degraded ? "[⚠️ 미확인 답변] " : "";
  const system = degradedPrefix + SYSTEM_PROMPT;  // simplistic; planner may use a smarter injection

  const result = streamText({
    model: google(selectedModel),
    system,
    messages,
    stopWhen: stepCountIs(8),
    // ...(shouldIncludeTools ? { tools: mcp.tools } : {}),  // planner decides tools inclusion
    providerOptions: { google: { /* thinkingConfig: { thinkingBudget: 0 } if D-13 fails */ } },
    onError: async ({ error }) => {
      console.error("[route.ts] streamText error:", error);
    },
  });

  return result.toUIMessageStreamResponse({
    consumeSseStream: async ({ stream }) => {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally { reader.releaseLock(); }
    },
    onError: (error) => {
      const code = classifyStreamError(error);
      const rawMsg = KOREAN_MESSAGES[code];
      const safeMsg = rawMsg.replace(/oc=[^&\s"]+/g, "oc=REDACTED");
      return JSON.stringify({ error: { code, message: safeMsg } });
    },
  });
}

function makeErrorResponse(code: ErrorCode, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
```

### 12.3 Client: parseChatError + retry button

```typescript
// Source: composed from ChatInit onError + AbstractChat.regenerate + CONTEXT.md D-06/D-09
// frontend/src/lib/error-messages.ts (new file)

export type ErrorCode = "mcp_timeout" | "mcp_busy" | "mcp_offline" | "stream_timeout" | "unknown";

export interface ParsedError {
  code: ErrorCode;
  message: string;
}

const KOREAN_MESSAGES: Record<ErrorCode, string> = {
  mcp_timeout:    "법령 검색 서버 연결이 지연되어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]",
  mcp_busy:       "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
  mcp_offline:    "법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]",
  stream_timeout: "응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요.",
  unknown:        "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.",
};

export function parseChatError(err: Error | undefined): ParsedError {
  if (!err) return { code: "unknown", message: KOREAN_MESSAGES.unknown };
  const raw = err.message ?? "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.code && parsed.error.code in KOREAN_MESSAGES) {
      const code = parsed.error.code as ErrorCode;
      return { code, message: KOREAN_MESSAGES[code] };
    }
  } catch { /* fall through */ }
  if (raw.includes("503") || /Max sessions/i.test(raw)) return { code: "mcp_busy", message: KOREAN_MESSAGES.mcp_busy };
  if (raw.includes("ENOTFOUND") || raw.includes("ECONNREFUSED")) return { code: "mcp_offline", message: KOREAN_MESSAGES.mcp_offline };
  return { code: "unknown", message: KOREAN_MESSAGES.unknown };
}
```

```typescript
// chat-container.tsx snippet (modified)
const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
  id: conversationId,
  onError: (err) => console.error("[chat] onError:", err),
});

const isLoading = status === "streaming" || status === "submitted";

async function handleRetry() {
  clearError();
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    await regenerate();
  } else if (last?.role === "user") {
    // Pre-stream error: re-send last user message
    const text = extractAssistantText(last);
    await sendMessage({ text }, { body: { modelId } });
  }
}
```

---

## 13. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AbortController-based timeout around `createMCPClient` | Custom AbortController forwarding | `Promise.race` with reject setTimeout | `createMCPClient` 가 signal 을 받지 않음 |
| Client-side retry state machine | Custom `retryCount` / `retryAt` useState | `useChat.regenerate()` + `clearError()` | AI SDK 6 내장, UI state sync 자동 |
| Mid-stream error → structured body via HTTP headers | Custom header injection | `onError: (error) => JSON.stringify(...)` | SSE 이미 200 OK, headers 변경 불가 |
| Error message classification via HTTP status code on client | Parsing `response.status` | `parseChatError(error.message)` with JSON parse fallback | HTTP status 는 client 에 노출되지 않음 |
| MCP session pooling / custom LRU cache | Custom LRU, Redis | Module-scope `let cachedClient + cachedTools` + TTL | 단일 서버, Vercel warm container 가 공짜 caching |
| Korean error message interpolation in JSX | Template literal in render | `KOREAN_MESSAGES[code]` lookup | 테스트 가능, 유지보수 용이 |

---

## 14. Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage`: 기존 conversations 는 Phase 1 COMPAT-* 로 read-time migration 만. Phase 2 는 저장 shape 변경 없음. | none |
| Live service config | `glluga-law-mcp.fly.dev` MCP 서버 — config 변경 없음. Vercel environment variables (`LAW_API_KEY`, `ALLOWED_EMAIL_DOMAIN`) 변경 없음. | none |
| OS-registered state | 해당 없음 (Vercel serverless) | none |
| Secrets/env vars | `LAW_API_KEY` 는 redact 로직 그대로 유지 (Phase 1 에서 도입). Phase 2 는 새 env var 추가 안 함. | none |
| Build artifacts | 해당 없음 (Next.js build 는 매번 fresh) | none |

**Nothing found in category:** 위 5개 카테고리 모두 확인됨 — Phase 2 는 순수 코드 변경 phase (config/state 이동 없음).

---

## 15. Validation Architecture

`workflow.nyquist_validation: true` 이므로 본 섹션 필수.

### 15.1 Test Framework 현황

| Property | Value |
|----------|-------|
| Framework | **없음** — frontend 에 테스트 프레임워크 미설치 |
| Config file | none (Phase 1 도 동일 — 테스트 생성 정책 없음) |
| Quick run command | `npx tsc --noEmit` + `npm run build` (type/build check) |
| Full suite command | 해당 없음 |

**Source**: `frontend/package.json` 에 `test` script 없음. Phase 1 도 테스트 추가 안 한 phase — 같은 정책 유지 (CONTEXT.md 명시 없음, 프로젝트 관행 유지).

### 15.2 Phase Requirements → Validation Signal Map

Phase 2 는 **코드 단위 테스트 가 없는** phase 이므로 검증 시그널은 **build/type check + 수동 프로덕션 UAT + Vercel 로그 확인** 조합.

| Req ID | Behavior | Validation Type | Signal |
|--------|----------|----------------|--------|
| STRE-01 | 5s MCP timeout → degraded | manual UAT | MCP 서버 고장 시나리오 (hosts file block) 또는 프로덕션 incident 관찰 — "법령 검색 서버 연결 안 됨" 문구 노출 |
| STRE-02 | Module-scope cache hit | manual UAT + log grep | D-04 PoC 의 `cachedTools` 로그가 2+ 요청에서 "cache hit" 기록 |
| STRE-03 | Inline error banner | manual UAT | 에러 상황에서 chat-message 내부 에러 박스 렌더, global banner 제거 확인 |
| STRE-04 | 3 Korean error strings | manual UAT | 각 케이스 재현 후 정확한 문구 노출 확인 |
| STRE-05 | "다시 시도" button | manual UAT | 에러 배너 아래 버튼 클릭 → regenerate 호출 → 정상 응답 복원 |
| STRE-06 | 1-shot 503 retry | log grep | Vercel 로그에 `[mcp] 503 detected, retrying` + 성공 시 후속 요청 정상 |
| STRE-07 | 일상 인사 exemption | manual UAT | "안녕하세요" 5-10회 → 모두 tool call 없이 응답 |
| STRE-08 | Gemini thought_signature smoke | manual UAT | 3연속 법령 질문에 모두 text part 포함 응답 |
| STRE-09 | maxDuration decision logged | file grep | PROJECT.md Key Decisions 표에 "maxDuration: 60 유지 + Fluid Compute 상태 확인 결과" 문장 존재 |

### 15.3 Sampling Rate

- **Per task commit**: `npx tsc --noEmit` + `npm run build` (no test suite)
- **Per wave merge**: 같음
- **Phase gate**: 위 9개 manual UAT signal 이 모두 녹색 + Vercel 프로덕션에 1일 이상 stable 한 뒤 `/gsd-verify-work`

### 15.4 Wave 0 Gaps

- [ ] 없음 — Phase 2 는 테스트 프레임워크 도입 phase 아님. Phase 1 과 같은 정책.
- [ ] D-04 PoC 스크립트 (임시 `console.log` 삽입 → 배포 → 로그 확인 → 제거) 는 Wave 0 전에 수행 (CONTEXT.md 명시).

*(Wave 0 gap 없음 — 기존 인프라로 충분. 수동 UAT 와 Vercel 로그 grep 이 nyquist validation 신호원.)*

---

## 16. Security Domain

`security_enforcement` 설정이 없으므로 기본값(활성) 으로 간주. Phase 2 에 적용되는 항목:

### 16.1 Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth v5 Google OAuth (기존 유지, 변경 없음) |
| V3 Session Management | yes | NextAuth session cookie (기존, 변경 없음) |
| V4 Access Control | yes | `ALLOWED_EMAIL_DOMAIN` 도메인 제한 (기존, 변경 없음) |
| V5 Input Validation | no (변경 없음) | 신규 input field 없음. `modelId` 는 기존 유효성. |
| V6 Cryptography | no | 해당 없음 |
| **V7 Error Handling & Logging** | **YES** | **핵심 영역 — Phase 2 의 주 scope** |
| V13 API / Web Services | no | 해당 없음 (신규 endpoint 없음) |

### 16.2 V7 Error Handling & Logging — Phase 2 의 핵심

Phase 2 는 에러 UX phase 이므로 V7 준수가 직접적. 체크포인트:

| 항목 | 준수 방법 |
|------|---------|
| **에러 메시지에 secrets 누출 금지** | Phase 1 에서 도입한 `oc=REDACTED` redaction 유지 + 새 에러 경로에도 같은 redact 적용 |
| **에러 메시지에 stack trace / internal path 누출 금지** | 사용자 대면 문구는 고정 한국어 테이블 (`KOREAN_MESSAGES`), raw error.message 직접 노출 금지 |
| **에러 로깅은 서버 측 console.error 로만** | 클라이언트 UI 는 한국어 메시지만, Vercel 로그에 raw Error 객체 기록 유지 |
| **에러 code 가 enumeration 공격에 사용되지 않음** | 4-5 개 유한 code, user-facing 이므로 enumeration 영향 없음 |
| **Error 발생 시 서비스 상태가 안전한 기본값으로 fallback** | degraded mode (tools 없이 답변) 로 fallback — 사용자에게 `[⚠️ 미확인 답변]` 로 명시 |

### 16.3 Known Threat Patterns for AI chat + MCP stack

| Pattern | STRIDE | Standard Mitigation | Phase 2 Status |
|---------|--------|---------------------|---------------|
| API key leak via error message | Information disclosure | `oc=REDACTED` regex redaction | Phase 1 완료, Phase 2 유지 |
| Replayable session ID in error | Information disclosure | 에러에 session ID 미포함 | N/A (세션 ID 미사용) |
| DoS via unbounded retry loop | Denial of service | 1-shot retry only (D-08) | Phase 2 scope |
| Tool injection via user message | Tampering | MCP schema validation (built-in) | 변경 없음 |
| Fake "검색 중..." keeps user waiting | Repudiation of service failure | `stream_timeout` 에 60s 상한 + UX 에러 배너 | Phase 2 scope |

---

## 17. State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useChat({ api: '/api/chat' }).reload()` | `useChat({ id }).regenerate({ messageId? })` | AI SDK 6.0 (2025 late) | API 명칭 변경 + messageId 옵션 추가 |
| `getErrorMessage` default 가 사용자 "An error occurred" 마스킹 | `onError: (error) => string` 로 직접 반환 | AI SDK 6.0 | error masking 해제, 서버가 메시지 결정 |
| HTTP status code 로 클라이언트 에러 분류 | body 문자열 파싱 (`HttpChatTransport` 는 status 를 버림) | AI SDK 5+ 부터 | `error.message` 가 유일한 채널 |
| `CallSettings.maxRetries` default 가 provider 별 상이 | 통일된 `maxRetries: 2` default | AI SDK 6 | MCP 레이어 수동 retry 와 분리 필수 |
| Vercel Hobby = 10s max duration | Hobby Fluid Compute = 300s default | 2024-2025 | D-12 근거 문장 업데이트 필요 (§9) |
| Gemini 2.5 thought_signature optional | Gemini 3 thought_signature mandatory | 2025-late | 2.5 Flash 유지 시 이슈 희박 |

**Deprecated / outdated:**
- `useChat().reload()` — `regenerate()` 로 대체.
- Pre-stream HTTP status code 를 client 에서 읽는 패턴 — AI SDK 6 는 body 만 남김.

---

## 18. Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js runtime (Next.js 16) | 전체 | ✓ | 20+ (Vercel 기본) | — |
| `ai` (AI SDK 6) | streamText, useChat | ✓ | 6.0.158 (verified) | — |
| `@ai-sdk/mcp` | createMCPClient | ✓ | 1.0.36 (verified) | — |
| `@ai-sdk/google` | google() provider + thinkingConfig | ✓ | 3.0.62 (verified) | — |
| `@ai-sdk/react` | useChat + regenerate + clearError | ✓ | 3.0.160 (verified) | — |
| Vercel Fluid Compute | warm container cache (D-02) | **unknown** | — | Legacy serverless 도 warm container 지원, 기본 TTL 유효 |
| Vercel function logs | D-04 PoC, Phase 2 UAT | ✓ | — | — |
| `glluga-law-mcp.fly.dev` reachability | MCP tool execution | ✓ (가정) | — | degraded mode (D-03) |

**Missing dependencies with no fallback:** 없음.

**Missing dependencies with fallback:** Fluid Compute 활성화 여부 미확인 — Legacy serverless 도 모듈 스코프 캐싱 작동하므로 blocker 아님. §10 Open Question 1.

---

## 19. Project Constraints (from CLAUDE.md)

**From `./CLAUDE.md`**: 없음 (루트에 CLAUDE.md 없음, frontend/ 에만 AGENTS.md 있음).

**From `frontend/AGENTS.md`**: 
> "# This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."

**적용**:
- Phase 2 의 모든 API 사용은 **설치된 `node_modules`** 에 기반 (✓ 이 research 는 설치된 .d.ts 와 .mjs 를 직접 읽음).
- 훈련 데이터 기반 훌륭한 추측 금지 — 모든 claim 을 VERIFIED 태그로 출처 명시.
- `regenerate()` / `clearError()` / `onError` 등 사용 전 반드시 `@ai-sdk/react/dist/index.d.ts` 확인 완료 (본 research §5).

**From `.planning/PROJECT.md` "Constraints"**:
- Vercel 무료 티어 60초 — §9 에서 재평가 (Fluid Compute 있으면 300s 가능하지만 Phase 2 는 60 유지).
- Slack 봇 경로 untouched — Phase 2 는 `frontend/` 와 `PROJECT.md` 만 수정, `bot/`, `main.py`, `law/` 는 건드리지 않음. ✓
- Next.js 16 / AI SDK 6 현행 유지 — Phase 2 는 업그레이드 없음. ✓
- localStorage 유지 — Phase 2 는 conversations 저장 경로 수정 없음. ✓

---

## 20. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pre-stream 에러 후 `regenerate()` 는 user 메시지 기준으로 동작하지 않을 가능성 → fallback sendMessage 필요 | §5.2 | 재시도 버튼이 pre-stream 에러 케이스에서 작동 안함. 사용자 혼란. |
| A2 | `mcp_timeout` 은 사용자 기준으로 `mcp_offline` 과 UX 동일 (degraded mode 동일 문구) | §3.4 | 사용자 혼동 경미 — 개선 여지 있음. |
| A3 | Gemini 2.5 Flash 가 system prompt 완화 후에도 법령 질문에 일관되게 tool 을 호출할 것 | §7.3 | 법령 답변 품질 저하. UAT 로 발견 가능. |
| A4 | Gemini 2.5 Flash smoke test 가 `thinkingBudget: 0` 없이 통과할 것 | §8.4 | 적용 시 응답 품질 저하 tradeoff. |
| A5 | Module-scope cache stampede 가 실제로 발생하고 / 사용자가 충분히 동시 요청을 발생시킴 | §2.2 | 단일 사용자 프로젝트라 실제 stampede 는 드물 것 — pending-promise 패턴은 보수적 선택. |
| A6 | `toolChoice: 'auto'` 의 기본값이 Gemini provider 에서 변경되지 않음 | §7.2 | 기존 route.ts 는 `toolChoice` 미설정 — 기본값 의존. |
| A7 | Vercel Hobby Fluid Compute 가 2026-04 현재에도 300s 기본이며 추가 비용 없음 | §9.1 | 프로젝트 Vercel 플랜 변경 시 영향 가능. 현재는 정확. |
| A8 | `onError` 콜백이 서버에서 JSON stringify 결과를 반환해도 AI SDK 가 escape 하지 않고 그대로 client 로 전달 | §3.2 | 반환값을 escape 한다면 client parse 실패. 실측 필요할 수 있음. |

**A1/A8 은 Phase 2 UAT 에서 직접 검증 필요**. 나머지는 보수적 가정.

---

## 21. Open Questions (요약)

§10 에서 다룬 5 개 질문이 핵심 open item:

1. **Q1**: Vercel Fluid Compute 활성화 여부 확인 (D-12 근거 업데이트용)
2. **Q2**: mcpClient 인스턴스를 모듈 스코프에 공유할지 결정 (D-02 확장)
3. **Q3**: Pre-stream 에러 + `regenerate()` 실제 동작 (A1 과 연결) — fallback 설계 채택 권장
4. **Q4**: `mcp_timeout` code 의 한국어 메시지 (D-06 누락) — 별도 문구 권장
5. **Q5**: Pre-stream 에러의 DOM 배치 — standalone ErrorBubble 권장

**Planner 는 Q2, Q3, Q4, Q5 를 plan 작성 시 discretion 으로 해결. Q1 은 UAT 단계 user 확인 항목으로 넘김.**

---

## 22. Sources

### Primary (HIGH confidence)

**설치된 node_modules 타입/구현 직접 확인:**
- `frontend/node_modules/ai/dist/index.d.ts` — `AbstractChat.regenerate`, `ChatInit.onError`, `CallSettings`, `UIMessageStreamResponseInit`, `UIMessageStreamOptions`, `ChatOnErrorCallback`, `StreamTextOnErrorCallback`
- `frontend/node_modules/ai/dist/index.mjs` — `HttpChatTransport.sendMessages`, `processUIMessageStream` error chunk handling, `createUIMessageStream` onError flow
- `frontend/node_modules/@ai-sdk/react/dist/index.d.ts` — `useChat`, `UseChatHelpers`, re-export of `regenerate/clearError/error/status`
- `frontend/node_modules/@ai-sdk/mcp/dist/index.d.ts` — `MCPClientConfig`, `createMCPClient`, `MCPClient`, `RequestOptions`
- `frontend/node_modules/@ai-sdk/mcp/dist/index.mjs` — `DefaultMCPClient.init`, SSE transport `start()`, error shape
- `frontend/node_modules/@ai-sdk/google/dist/index.d.ts` — `googleLanguageModelOptions.thinkingConfig.thinkingBudget`

**Phase 1 artifacts:**
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-01-SUMMARY.md`
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-02-SUMMARY.md`
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-03-SUMMARY.md`

**Codebase 직접 확인:**
- `frontend/src/app/api/chat/route.ts` (Phase 1 종료 상태)
- `frontend/src/components/chat/chat-container.tsx`
- `frontend/src/components/chat/chat-message.tsx`
- `frontend/src/components/chat/message-part-renderer.tsx`
- `frontend/src/lib/ui-message-parts.ts`
- `frontend/package.json` (버전 확인)
- `frontend/next.config.ts` (`serverExternalPackages`)

### Secondary (MEDIUM confidence — documentation 기반)

- [Vercel Fluid Compute docs](https://vercel.com/docs/functions/fluid-compute) — isolation boundaries and global state, Hobby plan defaults (2026-04)
- [AI SDK UI: Error Handling](https://ai-sdk.dev/docs/ai-sdk-ui/error-handling) — official regenerate + error patterns
- [AI SDK UI: useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat) — regenerate signature reference
- [Google Cloud - Thought signatures](https://cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures) — Gemini 2.5 vs 3 behavior
- [vercel/ai Issue #10344](https://github.com/vercel/ai/issues/10344) — Gemini 3 function call thought_signature missing
- [vercel/ai Issue #12351](https://github.com/vercel/ai/issues/12351) — @ai-sdk/google-vertex drops thoughtSignature

### Tertiary (LOW confidence — general search)

- Next.js 16 App Router module-scope singleton race condition discussion (GitHub vercel/next.js #65350, #55263) — fluid compute in-function concurrency 확인에만 사용

---

## 23. Metadata

**Confidence breakdown:**
- D-01 Promise.race timeout: **HIGH** (MCPClientConfig 타입 직접 확인, signal 필드 없음)
- D-02 Module-scope cache 타당성: **HIGH** (Fluid Compute global state docs + mcpClient execute closure 분석)
- D-05/D-06 에러 body 포맷: **HIGH** (HttpChatTransport.sendMessages + processUIMessageStream 구현 직접 확인)
- D-07 chat-message 리팩터 경로: **HIGH** (현재 파일 직접 read)
- D-09/D-10 regenerate/clearError/status: **HIGH** (AbstractChat + UseChatHelpers 타입 직접 확인)
- D-11 에러 classifier: **MEDIUM** (MCP error shape 확인 완료, Vercel abort 형태는 일부 LOW)
- D-12 maxDuration 60 유지: **MEDIUM** (결정 내용은 OK, 근거 #1 정확성은 Fluid Compute 상태에 따라 변동)
- D-13 thinkingBudget 0: **HIGH** (Google provider 타입 확인, Gemini 2.5 문서 확인)
- D-14 system prompt 완화: **MEDIUM** (LLM 확률적 동작, 5-10회 smoke test 필요)

**Research date:** 2026-04-13  
**Valid until:** 2026-04-20 (7-day window — AI SDK 6 는 active 개발 중)
