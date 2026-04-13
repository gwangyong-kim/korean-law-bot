# Phase 2: Streaming Stability & Error UX - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Interactive discuss (user deferred all gray areas to Claude's discretion)

<domain>
## Phase Boundary

Phase 1의 route.ts 구조 위에서, 스트림 주변의 모든 실패 모드를 사용자에게 명확하게 드러내고 재시도 가능하게 만든다. 내부 자원(MCP 클라이언트, tools schema 캐시)은 정리되며, 시스템 프롬프트가 일상 인사에 강제로 툴 호출을 일으키지 않도록 완화된다.

**In scope:** MCP 연결 타임아웃 + degraded mode, MCP tools 캐싱, 3가지 실패 모드 구분 한국어 에러 UX, 재시도 버튼 + 자동 재시도 1회, 시스템 프롬프트 완화, Gemini multi-turn thought_signature 검증, maxDuration 결정.

**Out of scope:** localStorage reseed (Phase 4), 툴 호출 UI 라벨/시제/펼침 UI (Phase 3), Chainlit 제거 (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### A. MCP 캐싱 + degraded mode
- **D-01:** `createMCPClient` 5초 타임아웃은 **`Promise.race`** 로 구현. `Promise.race([createMCPClient(...), new Promise((_, reject) => setTimeout(() => reject(new Error('mcp_timeout')), 5000))])`. AbortController 는 MCP client 내부 지원이 불확실 → Promise.race가 가장 단순하고 의존성 없음.
- **D-02:** MCP `tools()` 스키마 캐싱: `frontend/src/app/api/chat/route.ts` **모듈 스코프**에 `let cachedTools: Awaited<ReturnType<typeof mcpClient.tools>> | null = null; let cachedAt: number = 0;` TTL 5분. 호출부에서 `if (cachedTools && Date.now() - cachedAt < 300_000) { tools = cachedTools; }`. 단순 TTL 캐시, Redis/LRU 과도.
- **D-03:** degraded mode(MCP 연결 실패 후 도구 없이 진행) UX는 **assistant bubble 내부 프리픽스**로 `[⚠️ 미확인 답변]` 태그 + STRE-04(c)의 한국어 메시지. 별도 global banner 없음.
- **D-04:** warm-container PoC는 Phase 2 실행 **첫 커밋 전 별도 임시 스크립트**로 실행. `route.ts`에 `console.log(cachedTools ? 'cache hit' : 'cache miss')` 임시 삽입 → 프로덕션 배포 → 연속 2개 질문 던져서 로그 확인 → 로그 제거. 결과는 PROJECT.md Key Decisions 표에 1줄 기록 ("Vercel warm-container 캐시 재사용: 확인됨 / 확인 안 됨").

### B. 에러 분류 및 라우팅
- **D-05:** route.ts는 에러 발생 시 **structured JSON body** 반환: `{ error: { code: "mcp_timeout" | "mcp_busy" | "mcp_offline" | "stream_timeout" | "unknown", message: "<한국어 메시지>" } }`. HTTP status는 의미에 맞게 (503, 504, 500). `code`는 클라이언트 분기용, `message`는 fallback 텍스트.
- **D-06:** 클라이언트 `useChat.error` 수신 시 JSON body 파싱해 `code`로 분기. STRE-04(a/b/c) 한국어 매핑은 **클라이언트 `frontend/src/lib/error-messages.ts`** (신규)에 테이블로:
  - `stream_timeout` → "응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요."
  - `mcp_busy` → "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요."
  - `mcp_offline` → "법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다."
  - `unknown` → "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요."
- **D-07:** 에러 배너는 **실패한 assistant bubble 내부**에 rounded border + `bg-destructive/5` 배경 + 에러 텍스트 + "다시 시도" 버튼 (STRE-03). 기존 `chat-container.tsx:202-215`의 global error block은 제거하고 `chat-message.tsx`에 error prop 추가해 위임.

### C. 재시도 정책
- **D-08:** 서버(`route.ts`) 측 자동 재시도: MCP `createMCPClient` 또는 `mcpClient.tools()` 호출 결과가 503/"Max sessions" 감지 시 **1초 대기 후 1회 재시도**. 재시도 후에도 실패 시 structured error 반환 (`mcp_busy`).
- **D-09:** "다시 시도" 버튼은 AI SDK 6 `useChat.regenerate()` 호출. 실패한 assistant 턴을 제거하고 이전 user 메시지로 재호출. AI SDK 공식 API.
- **D-10:** 재시도 중복 방지: 버튼은 `status === 'streaming' || status === 'submitted'`일 때 disabled. 자동 재시도 동안 클라이언트는 로딩 skeleton만 표시 — 버튼 미노출.
- **D-11:** 503 vs 연결 실패 구분:
  - `createMCPClient` throw (ENOTFOUND, ECONNREFUSED, timeout) → `mcp_offline`
  - `createMCPClient` 성공 + `mcpClient.tools()` 에서 503 / "Max sessions" / 429 → `mcp_busy`
  - `streamText` 중 abort/timeout → `stream_timeout`
  - 그 외 → `unknown`

### D. maxDuration + Gemini 멀티턴 + 시스템 프롬프트
- **D-12:** `maxDuration` = **60 유지** (상향 안 함). 근거:
  1. Vercel 무료 티어 제약
  2. Fluid Compute 활성화는 별도 인프라 결정, 이번 스코프 밖
  3. `stopWhen: stepCountIs(8)` 로 바뀌어도 평균 Gemini Flash 스트림은 30초 이하에서 완료
  4. 타임아웃 케이스는 `stream_timeout` 에러 UX로 드러나므로 UX 방어는 있음
  PROJECT.md Key Decisions 표에 기록.
- **D-13:** Gemini `thought_signature` smoke test는 **수동 실행** (자동화 생략). 프로덕션에서 "근로기준법 제60조", "그럼 제59조는?", "제58조는?" 3연속 질문을 던져 모든 답변에 text 파트 포함 확인. 실패 시 `streamText` 호출에 `providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } }` 적용. 검증 결과는 Phase 2 VERIFICATION에 기록.
- **D-14:** 시스템 프롬프트 완화: `route.ts` `SYSTEM_PROMPT` 상수의 "━━━ 절대 규칙 ━━━" 섹션에 **문장 추가**:
  > "단, '안녕하세요', '고마워요' 같은 일상 인사나 봇 자체에 대한 메타 질문(이름, 기능)에는 도구를 호출하지 않고 자연스럽게 답변하세요. 도구는 법령·시행령·시행규칙·판례·행정규칙 등 **법률 내용 질문**에만 호출합니다."
  기존 "절대 규칙" 문구와 병기 (삭제 금지). "안녕하세요" 단일턴 테스트로 tool call이 발생하지 않는지 확인.

### Claude's Discretion
- User 지시: "claude 너 재량껏 진행해줘" — 모든 영역이 Claude 판단으로 결정됨. 세부 파일 정렬, 변수 이름, Tailwind 클래스, 에러 메시지 문구 미세 조정, 1초 대기 정확한 구현 방식(setTimeout vs Promise delay) 등은 모두 구현 시점에 Claude가 결정.
- 에러 메시지 테이블 위치가 `lib/error-messages.ts` vs 인라인 record인지는 구현 가독성으로 판단.
- Phase 1 완료 후 해당 파일들이 어떻게 생겼는지에 따라 세부 refactoring 경계 조정 허용.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 정의
- `.planning/PROJECT.md` — 제약(Vercel 무료 티어 60s), Key Decisions, Out of Scope (에러 UX theater 금지)
- `.planning/REQUIREMENTS.md` §Streaming Stability — STRE-01~09 전체 요구사항
- `.planning/ROADMAP.md` §Phase 2 — Goal, Success Criteria, Research flag (warm-container PoC), Dependencies (Phase 1)

### Codebase 맥락
- `.planning/codebase/STACK.md` — Next.js 16.2.3 / AI SDK 6.0.158 / Vercel serverless
- `.planning/codebase/CONCERNS.md` §Tech Debt — MCP client lifecycle, error handling
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-CONTEXT.md` — Phase 1 결정 (Phase 2는 Phase 1 완료 후 시작)

### 수정 대상 파일
- `frontend/src/app/api/chat/route.ts` — Phase 1 완료 상태 위에서 MCP 캐싱, 5초 타임아웃, 에러 분류 구조화, 503 재시도, SYSTEM_PROMPT 완화
- `frontend/src/components/chat/chat-container.tsx` — global error block 제거, chat-message에 error prop 위임
- `frontend/src/components/chat/chat-message.tsx` — error prop 추가, "다시 시도" 버튼, inline error banner
- `frontend/src/lib/error-messages.ts` — 신규 error code → 한국어 메시지 매핑 테이블

### 외부 문서 (research 시점)
- AI SDK 6 `useChat.regenerate()` API — 재시도 동작, 실패 턴 제거 정책 (Context7로 최신판)
- Vercel Fluid Compute 문서 — warm-container 동작 확인 (결정은 60 유지이지만 이해를 위해)
- Google AI `thinkingConfig` / `thinkingBudget` — escape hatch 적용 조건 (Context7 google-generative-ai)
- `@ai-sdk/mcp` — `createMCPClient` 타임아웃/에러 전파 동작

### Phase 1 artifacts (read after Phase 1 complete)
- `.planning/phases/01-empty-message-bug-fix-parts-contract/*-SUMMARY.md` — 실제 변경된 route.ts 구조 확인
- `frontend/src/app/api/chat/route.ts` 최신 상태 — Phase 2 변경 전 반드시 재-read

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 완료 후 `lib/ui-message-parts.ts`의 `extractAssistantText`는 그대로 재사용.
- `chat-message.tsx`의 ReactMarkdown 렌더링 + 복사/즐겨찾기 버튼 패턴. error bubble은 같은 레이아웃에 variant만 추가.
- `components/ui/button.tsx` (shadcn) — "다시 시도" 버튼.
- `lib/utils.ts` `cn()` — Tailwind merge.

### Established Patterns
- **모듈 스코프 싱글톤**: Next.js serverless 환경은 warm container에서 모듈 스코프 변수를 재사용. 이 패턴이 `cachedTools`에 유효함 (STRE-02 research flag로 확인).
- **Error propagation via Response body**: 현재 `route.ts` line 73-78에서 이미 JSON body로 에러 전달 중. 동일 패턴을 structured code로 확장.
- **한국어 UX 문구**: `chat-container.tsx` line 207-211에서 503/429 문자열 기반 분기 중 — Phase 2에서 error code 기반으로 교체.

### Integration Points
- `route.ts` POST 핸들러 전체가 수정 대상. Phase 1에서 `stopWhen`, `onFinish`/`onError` 구조가 들어간 상태 기준으로 MCP 캐싱과 timeout wrapping 추가.
- `useChat()` 호출에 `onError` 콜백 추가해 구조화된 에러 수신.
- `chat-message` 컴포넌트에 `error?: { code: string; message: string }` optional prop 추가.

### Known Pitfalls
- `createMCPClient`가 AbortController를 무시할 가능성 — `Promise.race` 우선.
- Vercel serverless cold start — 모듈 스코프 캐시는 첫 요청에서 miss, 후속 warm 요청에서 hit. PoC 필수.
- Gemini 2.5 Flash는 `thought_signature` 관련 known 이슈 있음 — multi-turn tool use에서 `thinkingBudget: 0` 없이 끊기는 케이스 있음. smoke test 후 판단.
- SYSTEM_PROMPT 수정 시 기존 "━━━ 절대 규칙 ━━━" 섹션 삭제 금지 — 법령 정확성 규제가 느슨해지면 안 됨.

</code_context>

<specifics>
## Specific Ideas

- "일상 인사 강제 툴 호출 방지"는 사용자가 실제로 "안녕하세요" 쳤을 때 불필요한 MCP 호출이 발생하는 경험을 막기 위함.
- 에러 메시지는 한국어 + 부드러운 톤. 기술적 원인(503, CORS, socket) 노출 금지.
- 재시도 버튼은 한 번 누르면 동일 사용자 턴을 다시 전송 (regenerate). 사용자가 편집하지 않음.
- Gemini smoke test는 프로덕션에서 실제 연속 질문으로. 유닛 테스트로 대체 불가(내부 provider 동작이라 mocking 어려움).

</specifics>

<deferred>
## Deferred Ideas

- 구조화된 로깅 / Sentry 연동 — Out of Scope (v2 V2-OBS-01)
- 메트릭 대시보드 — v2
- 에러 자동 신고 / 에러 reporting — v2
- MCP 캐시 LRU / 메모리 압력 대응 — 단일 엔드포인트, 단일 서버라 불필요
- 다중 MCP 서버 failover — v2
- Phase 3 (tool call UI) 관련 chip 스타일 / 라벨 — Phase 3 스코프
- 사이드바 에러 표시 / 재시도 이력 — Out of Scope

</deferred>

---

*Phase: 02-streaming-stability-error-ux*
*Context gathered: 2026-04-13*
