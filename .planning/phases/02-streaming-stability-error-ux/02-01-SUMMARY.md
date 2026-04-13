---
phase: 02-streaming-stability-error-ux
plan: 01
name: route-ts-server-hardening
subsystem: api/chat
tags: [mcp, streaming, error-handling, cache, timeout, system-prompt]
status: complete
completed: "2026-04-13"
duration_minutes: 12
task_commits:
  - hash: 63e9e76
    subject: "feat(02-01): SYSTEM_PROMPT 일상 인사 예외 문장 추가 (D-14)"
  - hash: 50610a1
    subject: "feat(02-01): MCP 타임아웃+캐시+재시도+구조화 에러 (D-01,02,04,05,08,11,12)"
dependency_graph:
  requires:
    - 01-01-fix-api-route (Phase 1 closeMcp/consumeSseStream/onError baseline)
    - 01-02-parts-module-and-renderer (불변 — client 측 contract 보존)
  provides:
    - "Plan 02-02 client error UX가 파싱할 표준 JSON body 계약 {error:{code,message}}"
    - "Plan 02-03 PoC log 제거 hook ([mcp-cache], mcp retry after 1s)"
  affects:
    - "frontend/src/app/api/chat/route.ts (단일 파일, 다른 파일 무손상)"
tech_stack:
  added:
    - "import type { ToolSet } from 'ai' (정확한 tools 시그니처 매칭)"
    - "import type { MCPClient } from '@ai-sdk/mcp' (캐시 타입 표현)"
  patterns:
    - "Module-scope pending-promise cache (RESEARCH §2.2 옵션 1)"
    - "Promise.race init-time timeout (RESEARCH §1.1 — createMCPClient는 signal/timeout 미지원)"
    - "Best-effort race-loser cleanup via queueMicrotask"
    - "Classify-and-route error pattern (5개 ErrorCode union)"
    - "Symmetric structured error contract (pre-stream Response body == mid-stream onError 문자열)"
key_files:
  modified:
    - path: "frontend/src/app/api/chat/route.ts"
      change: "134 → 271 lines (+177 / -40). MCP 캐시, 타임아웃, 분류, 재시도, 구조화 에러, SYSTEM_PROMPT 완화 통합."
decisions:
  - "RESEARCH §2.2 옵션 1 채택 — mcpClient와 tools를 같은 promise에 묶어 캐싱. tool.execute closure가 stale client에 bind되는 hazard 제거."
  - "요청별 closeMcp 제거. mcpClient 라이프사이클은 모듈 스코프 캐시가 소유. TTL 만료/onError 시에만 cache clear (lazy reconnect)."
  - "stream onError에서 cache clear — stream 중 에러 = client 오염 의심 → 다음 요청이 fresh connect."
  - "HTTP status는 관측용 (503/504/500). 클라이언트는 body의 code 필드로만 분기 (RESEARCH §3.1)."
  - "KOREAN_ERROR_MESSAGES (server) ≠ client KOREAN_MESSAGES — drift 허용. server 테이블은 debug log 용도, client가 canonical. 6줄 주석으로 contract 명시."
  - "tools 변수 타입을 ToolSet으로 명시 (Record<string, unknown>은 streamText의 ToolSet에 assign 불가)."
metrics:
  duration_minutes: 12
  task_count: 2
  files_changed: 1
  lines_added: 178
  lines_removed: 41
---

# Phase 02 Plan 01: route-ts-server-hardening Summary

**One-liner:** route.ts에 MCP 5초 Promise.race 타임아웃 + 모듈 스코프 pending-promise 캐시 + 503 1회 재시도 + 5-code 구조화 에러 + SYSTEM_PROMPT 일상 인사 예외를 단일 파일 hardening으로 통합.

## What Changed

### Task 02-01-01: SYSTEM_PROMPT 일상 인사 예외 (D-14) — `63e9e76`

기존 "━━━ 절대 규칙 (위반 금지) ━━━" 블록의 마지막 bullet `- 도구 검색 결과에 없는 내용을 추가하거나 꾸며내지 마세요.` 다음, 종료선 `━━━━━━━━━━━━━━━━━━━━━━` 바로 위에 한 줄 추가:

> `- 단, '안녕하세요', '고마워요' 같은 일상 인사나 봇 자체에 대한 메타 질문(이름, 기능)에는 도구를 호출하지 않고 자연스럽게 답변하세요. 도구는 법령·시행령·시행규칙·판례·행정규칙 등 **법률 내용 질문**에만 호출합니다.`

기존 5개 절대 규칙 bullet, 규칙 1-7, 쉬운 설명 원칙, 계약서/규정 검토, 답변 형식 섹션은 **전부 변경 없음** (git diff: 단일 insertion line).

### Task 02-01-02: MCP 타임아웃+캐시+재시도+구조화 에러 (D-01/02/04/05/08/11/12) — `50610a1`

route.ts를 134 → 271 line으로 확장. 변경 분포:

1. **import 추가:** `type { ToolSet } from "ai"`, `type { MCPClient } from "@ai-sdk/mcp"`.
2. **maxDuration 주석:** D-12 근거(Vercel 60s 유지) 한국어 2줄 주석.
3. **모듈 스코프 캐시 (D-02 + RESEARCH §2.2):**
   ```ts
   const CACHE_TTL_MS = 5 * 60 * 1000;
   let cachedClientPromise: Promise<{ client: MCPClient; tools: ToolSet }> | null = null;
   let cachedAt = 0;
   ```
   pending Promise 자체를 저장 → 동시 cache miss 요청들이 단 1번의 connect를 await.
4. **ErrorCode union + KOREAN_ERROR_MESSAGES 테이블:**
   `'mcp_timeout' | 'mcp_busy' | 'mcp_offline' | 'stream_timeout' | 'unknown'`
   서버 테이블 위에 6줄 주석으로 "client가 canonical, server는 debug용" 규약 못박음.
5. **classifyMcpError / classifyStreamError (D-11):**
   ENOTFOUND/ECONNREFUSED/fetch failed → mcp_offline, MCPClientError → mcp_offline,
   Error.cause.code 검사, 503/429/Max sessions → mcp_busy, "mcp_timeout" → mcp_timeout, AbortError/timeout → stream_timeout.
6. **makeErrorResponse(code, status):** pre-stream 에러용 표준 Response builder.
7. **raceWithTimeout (D-01):** Promise.race로 5초 enforce. race loser는 queueMicrotask로 best-effort close.
8. **connectMcpOnce / connectMcpWithRetry (D-08):** tools() 실패 시 client.close()로 책임 정리. mcp_busy 감지 시 1초 대기 후 1회 retry. retry 시 `[route.ts] mcp retry after 1s` 로그.
9. **getOrCreateMcp (D-02 + D-04):** TTL 체크 → hit/miss를 `[mcp-cache]` 로 임시 로깅. 실패 시 캐시 즉시 clear.
10. **POST handler 재작성:**
    - 기존 try { createMCPClient → tools() } 블록 삭제 → `getOrCreateMcp()` 1줄로 치환.
    - 기존 closeMcp 헬퍼 + onFinish/onError 안의 await closeMcp() 전부 삭제.
    - pre-stream 에러는 5-code 분류 후 makeErrorResponse(503/504/500).
    - streamText onError에서 cachedClientPromise/cachedAt 0으로 clear (stream 오염 보수적 cleanup).
    - toUIMessageStreamResponse onError는 classifyStreamError 후 `JSON.stringify({ error: { code, message }})` 반환 + LAW_API_KEY redaction 유지.

## How It Works (architectural rationale)

### Why pending-promise cache (RESEARCH §2.2)

Vercel Fluid Compute 하에서 같은 워커 프로세스가 여러 요청을 동시 처리할 수 있다. 단순 `let cachedTools: ToolSet | null` 패턴은 cold cache 동시 miss 시 N개의 `createMCPClient`가 동시 발사되어 MCP 서버를 503으로 떨어뜨린다 (cache stampede). pending Promise 자체를 캐싱하면 모든 동시 요청이 동일한 in-flight Promise를 await하므로 connect는 정확히 1번만 발생한다.

### Why mcpClient + tools 함께 캐싱 (RESEARCH §2.2 옵션 1)

`mcpClient.tools()`가 반환하는 ToolSet은 내부적으로 `tool.execute` closure가 mcpClient 인스턴스에 bind되어 있다. tools만 캐싱하고 mcpClient는 요청 스코프에서 close하면, 다음 요청이 cached tools를 사용할 때 stale closure가 이미 close된 client를 호출해 깨진다. 옵션 1(둘 다 캐싱)이 옵션 2(매 요청마다 새 client + cached schema 재사용)보다 단순하고 안전하다.

### Why 요청별 closeMcp 제거

캐시 소유 모델에서 요청별 close는 다른 동시 요청의 tool.execute를 부순다. close는 TTL 만료(자연 만료) 또는 stream onError(오염 가능성)에서만 발생한다. dangling client는 Vercel 워커 재시작 + MCP 서버 idle timeout(30~60s)에 의존 — RESEARCH §1.3가 허용한 best-effort 모델.

### Why HTTP status는 관측용

RESEARCH §3.1: AI SDK 6 `HttpChatTransport`는 non-2xx response의 body 전체를 `new Error(await response.text())`로 throw한다. 클라이언트는 body의 `code` 필드로만 분기하므로 status는 의미 매핑(503/504/500) 정도면 충분하고, 정확한 분류는 body가 담당한다.

### Why mid-stream JSON-stringified error

RESEARCH §3.2: `toUIMessageStreamResponse({ onError: (error) => string })`이 반환한 문자열이 SSE error chunk → 클라이언트 `useChat.error.message`로 전달된다. pre-stream(Response body)과 mid-stream(SSE error chunk) 두 경로가 동일한 JSON 형태(`{"error":{"code","message"}}`)를 사용하면 client 측 `parseChatError()` 한 함수로 양쪽을 다 처리할 수 있다 → Plan 02-02가 의존하는 contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Record<string, unknown>` → `ToolSet` 타입 교체**

- **Found during:** Task 02 첫 tsc --noEmit 실행
- **Issue:** PLAN action text는 캐시 시그니처와 tools 변수에 `Record<string, unknown>`을 사용하라고 지시했으나, AI SDK 6 `streamText({ tools })`는 정확히 `ToolSet = Record<string, Tool>` 타입을 요구한다. `Record<string, unknown>`은 string index signature가 `unknown`이어서 `Tool` 객체로 좁혀지지 않아 TS2345 발생.
- **Fix:** `import type { ToolSet } from "ai"` 추가. `cachedClientPromise`, `connectMcpOnce`, `connectMcpWithRetry`, `getOrCreateMcp` 반환 타입과 POST 핸들러의 `let tools` 모두 `ToolSet`으로 통일. `await client.tools()` 결과는 `as ToolSet` 캐스팅(McpToolSet은 자동 호환).
- **Files modified:** frontend/src/app/api/chat/route.ts (단일 파일, 같은 commit 내)
- **Commit:** 50610a1 (Task 02 commit에 포함)
- **Why scope-internal:** PLAN의 의도("MCP tools 캐시")는 동일하고, 더 정확한 타입을 사용했을 뿐. 외부 파일 변경 없음. PLAN action text의 `Record<string, unknown>` 표기는 AI SDK 6 ToolSet 시그니처에 대한 minor 부정확함이었고, ToolSet으로 교체해도 모든 acceptance criteria grep은 동일하게 통과한다.

이외 deviations 없음.

## Authentication Gates

없음. MCP 서버는 LAW_API_KEY를 query string으로 전달하므로 별도 auth gate 없이 진행됨. `frontend/.env.local`에 LAW_API_KEY가 이미 존재. 본 plan은 로컬 실행/MCP 호출 자체를 하지 않고 정적 코드 변경 + 빌드 검증만 수행.

## Verification Run

```text
cd frontend && npx tsc --noEmit
→ exit 0 (Task 01 후 / Task 02 후 모두)

cd frontend && npm run build
→ ✓ Compiled successfully in 2.5s
→ Finished TypeScript in 2.1s
→ ✓ Generating static pages 6/6
→ Route ƒ /api/chat 정상 빌드

cd frontend && npm run lint
→ 2 errors / 4 warnings (모두 pre-existing, route.ts와 무관)
→ src/app/page.tsx (handleNew immutability — Phase 1 이전부터 존재)
→ src/components/chat/chat-input.tsx (ImageIcon unused, img element)
→ src/components/chat/model-selector.tsx (ModelInfo unused)
→ src/components/layout/theme-toggle.tsx (set-state-in-effect)
→ route.ts에서 새 lint 경고/에러 0개 도입
```

### must_haves grep evidence

| Truth                                            | Evidence                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Promise.race 5초                                  | `setTimeout(() => reject(new Error("mcp_timeout")), 5000)` (route.ts:136)                             |
| TTL 5분 module-scope cache + hit/miss log        | `cachedClientPromise` 7회 occurrence, `[mcp-cache]` 2회                                                |
| mcpClient도 tools와 함께 캐싱                       | `Promise<{ client: MCPClient; tools: ToolSet }>` 4개 시그니처                                            |
| 503/Max sessions 1초 retry                        | `await new Promise((r) => setTimeout(r, 1000))` + `[route.ts] mcp retry after 1s` log                 |
| pre-stream JSON body + status                    | `makeErrorResponse(code, status)` 5회, status 503/504/500 모두 case                                     |
| 5개 ErrorCode                                     | mcp_timeout(7), mcp_busy(8), mcp_offline(8), stream_timeout(6), unknown(13)                           |
| toUIMessageStreamResponse onError JSON 반환       | line 264 `JSON.stringify({ error: { code, message: ... }})` + oc=REDACTED 유지                          |
| SYSTEM_PROMPT 절대 규칙 보존 + 인사 예외 병기         | `━━━ 절대 규칙 (위반 금지) ━━━` 1회, "도구 검색 결과에 없는 내용을 추가하거나 꾸며내지 마세요" 1회, "안녕하세요" 1회, "법률 내용 질문" 1회 |
| maxDuration=60 + 한국어 주석                       | `export const maxDuration = 60` 1회, `D-12` 1회                                                       |
| Phase 1 자산 보존                                  | `stopWhen: stepCountIs(8)` 1, `consumeSseStream` 1, `oc=REDACTED` 1, `const closeMcp` 0               |

## Stub / Threat Flags

### Known Stubs

**1. `[mcp-cache]` PoC log (D-04 — 의도된 임시)**
- File: frontend/src/app/api/chat/route.ts:179, 182
- Reason: D-04 warm-container PoC 절차에 명시. Vercel 프로덕션에서 연속 2개 질문 후 cache hit log를 관찰해 PROJECT.md Key Decisions 표에 결과 1줄 기록. **Plan 02-03 Task 01에서 제거 예정** — 02-03이 grep으로 0개임을 검증.

**2. `[route.ts] mcp retry after 1s` PoC log (D-08 관측용)**
- File: frontend/src/app/api/chat/route.ts:168
- Reason: 503 retry 발동 빈도 관측. Plan 02-03이 "remove or keep"을 운영 데이터로 결정.

이 두 로그는 plan 의도상 stub이 아니라 PoC 인스트루먼트이며, plan 02-03이 명시적으로 제거 hook을 verify합니다.

### Threat Flags

없음. `<threat_model>` T-02-01-01..07이 모두 mitigate/accept로 처리됨:
- **T-02-01-01 (mid-stream onError leak):** mitigate — `JSON.stringify({error:{code, message}})`만 반환, raw error.message는 console.error로만, oc=REDACTED 보존.
- **T-02-01-02 (pre-stream body leak):** mitigate — makeErrorResponse가 KOREAN_ERROR_MESSAGES enum lookup만 사용, err.message/stack 절대 미포함.
- **T-02-01-03 (PoC log):** accept — `{hit, age}` 만 로깅, URL/key 미포함, 02-03 제거.
- **T-02-01-04 (cache stampede):** mitigate — pending-promise pattern.
- **T-02-01-05 (race loser TCP 점유):** accept — queueMicrotask best-effort close + MCP idle timeout 의존.
- **T-02-01-06 (SYSTEM_PROMPT 약화):** mitigate — 절대 규칙 5 bullet 완전 보존, 예외는 "일상 인사", "메타 질문(이름, 기능)"에 한정.
- **T-02-01-07 (closeMcp 누수):** mitigate — closeMcp 자체가 제거됨. 캐시 close는 TTL/onError 시점만, async close는 .catch(() => {})로 swallow.

새로운 trust boundary나 endpoint를 도입하지 않음.

## Self-Check: PASSED

**Files referenced in this summary:**
- `frontend/src/app/api/chat/route.ts` — exists, 271 lines

**Commits referenced:**
- `63e9e76` — `feat(02-01): SYSTEM_PROMPT 일상 인사 예외 문장 추가 (D-14)` — found in git log
- `50610a1` — `feat(02-01): MCP 타임아웃+캐시+재시도+구조화 에러 (D-01,02,04,05,08,11,12)` — found in git log

**Acceptance criteria evidence collected:** 모든 grep 통과 (`cachedClientPromise`≥4 → 7, `CACHE_TTL_MS`≥2 → 2, `getOrCreateMcp`≥2 → 2, `classifyMcpError`≥2 → 3, `classifyStreamError`≥2 → 2, `makeErrorResponse`≥4 → 5, ErrorCode≥2 → 5, `setTimeout 5000`=1, `setTimeout 1000`=1, `[mcp-cache]`≥2 → 2, `mcp retry after 1s`=1, `maxDuration=60`=1, `D-12`=1, `oc=REDACTED`=1, `const closeMcp`=0, `stopWhen: stepCountIs(8)`=1, `consumeSseStream`=1, 안녕하세요=1, 법률 내용 질문=1, 절대 규칙 블록=1).

**No client files touched:** `chat-container.tsx` / `chat-message.tsx` / `message-part-renderer.tsx` / `error-messages.ts` / `ui-message-parts.ts` / `lib/conversations.ts` 모두 무손상 (Plan 02-02 스코프 보존).
