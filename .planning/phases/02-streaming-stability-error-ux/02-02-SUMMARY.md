---
phase: 02-streaming-stability-error-ux
plan: 02
name: client-error-ux-inline-retry
subsystem: components/chat + lib
tags: [error-ux, retry, useChat, inline-banner, parse-chat-error, d-03, d-06, d-07, d-09, d-10]
status: complete
completed: "2026-04-13"
duration_minutes: 9
task_commits:
  - hash: d62442f
    subject: "feat(02-02): error-messages.ts 신설 — parseChatError + KOREAN_MESSAGES (D-06)"
  - hash: 0bab01f
    subject: "feat(02-02): ChatMessage 인라인 에러 배너 + 다시 시도 버튼 (D-07)"
  - hash: 72344ec
    subject: "feat(02-02): MessagePartRenderer pass-through + chat-container 에러 라우팅 (D-07/D-09/D-10)"
dependency_graph:
  requires:
    - 02-01-route-ts-server-hardening (서버가 반환하는 {error:{code,message}} JSON 계약 — pre-stream + mid-stream 동일)
    - 01-02-parts-module-and-renderer (extractAssistantText, MessagePartRenderer, ExtractableMessage)
    - 01-01-fix-api-route (useChat 단일 인수 호출 전제 + 검색 중... 플레이스홀더)
  provides:
    - "Phase 2 에러 UX의 client 측 완성형: 5-code → 한국어 매핑 + 인라인 배너 + 재시도 버튼 + standalone pre-stream bubble"
    - "Plan 02-03 UAT가 Playwright로 5가지 실패 모드를 검증할 수 있는 DOM hook (parseChatError, attachedError, lastIsAssistant)"
  affects:
    - "frontend/src/lib/error-messages.ts (신규)"
    - "frontend/src/components/chat/chat-message.tsx"
    - "frontend/src/components/chat/message-part-renderer.tsx"
    - "frontend/src/components/chat/chat-container.tsx"
tech_stack:
  added:
    - "import type { ParsedError } from '@/lib/error-messages' (chat-message + message-part-renderer + chat-container)"
    - "lucide-react RotateCcw icon (chat-message)"
  patterns:
    - "Code-based error parsing (서버 message 무시, code → 클라이언트 KOREAN_MESSAGES lookup)"
    - "Last-assistant attachment pattern (parsedError && isLast && role==='assistant' → attachedError prop)"
    - "Pre-stream standalone bubble (parsedError && !lastIsAssistant → empty-content ChatMessage with error)"
    - "regenerate / sendMessage 분기 retry (RESEARCH §5.2 Q3 fallback)"
    - "Bubble wrapper 조건부 렌더 (content || isUser) — 빈 말풍선 방지"
    - "useChat destructure 단일 인수 호출 보존 (Phase 4 PERS-03 경계)"
key_files:
  created:
    - path: "frontend/src/lib/error-messages.ts"
      lines: 106
      provides: "ErrorCode union, ParsedError interface, KOREAN_MESSAGES, parseChatError"
  modified:
    - path: "frontend/src/components/chat/chat-message.tsx"
      change: "82 → 129 lines (+47). 3개 prop 추가 + bubble wrapper 조건부 렌더 + 인라인 에러 배너 + RotateCcw 다시 시도 버튼."
    - path: "frontend/src/components/chat/message-part-renderer.tsx"
      change: "193 → 211 lines (+18). Props 3개 추가 + Legacy/assistant pass-through + (textChunks > 0 || error) 가드."
    - path: "frontend/src/components/chat/chat-container.tsx"
      change: "318 → 352 lines (+34). useChat regenerate/clearError, parseChatError, handleRetry, parsedError/lastIsAssistant 파생값, attachedError 주입, standalone pre-stream bubble. Global error block (~190-203) 완전 삭제."
decisions:
  - "KOREAN_MESSAGES (client) = canonical, 서버 KOREAN_ERROR_MESSAGES와 drift 허용. parseChatError는 server body의 code 필드만 읽고 message 필드는 완전 무시. 6줄 주석으로 규약 명시."
  - "user 경로의 ChatMessage 호출에는 error prop을 의도적으로 pass-through 하지 않음. user bubble에 에러 배너가 뜨면 안 되므로. chat-container가 isLastAssistant 체크로 standalone bubble을 별도 라우팅."
  - "(content || isUser) 조건부 bubble wrapper — '검색 중...' placeholder는 truthy이므로 보존, content==='' assistant는 wrapper 미렌더 → 인라인 배너만 노출. Part D 필수 acceptance 통과."
  - "handleRetry 분기 시 clearError() → role 체크 → regenerate or sendMessage. clearError를 먼저 호출해 React state lingering 방지. assistant role이면 regenerate({body:{modelId}}), user role이면 sendMessage({text}, {body:{modelId}}) — pre-stream 케이스 RESEARCH Q3 대응."
  - "isRetryDisabled = isLoading (status === 'streaming' || 'submitted'). D-10 중복 클릭 방지 + DoS 방어. 요구사항: useChat의 status가 변할 때마다 재계산되도록 React 의존성으로 자동 처리."
  - "(textChunks.length > 0 || error) 가드 — message-part-renderer가 텍스트 없는 partial-fail assistant에서도 ChatMessage를 렌더해 인라인 배너 통로를 열어둠. 기존 textChunks > 0 only 조건은 mid-stream 에러로 text part가 0개일 때 배너가 사라지는 hazard."
metrics:
  duration_minutes: 9
  task_count: 3
  files_changed: 4
  lines_added: 205
  lines_removed: 24
---

# Phase 02 Plan 02: client-error-ux-inline-retry Summary

**One-liner:** Plan 02-01의 5-code JSON 에러 계약을 client에서 parseChatError로 분기 — chat-message에 인라인 배너 + 다시 시도 버튼을 추가하고 chat-container의 global error block을 standalone bubble + last-assistant attachment 라우팅으로 교체.

## What Changed

### Task 02-02-01: error-messages.ts 신설 (D-06) — `d62442f`

`frontend/src/lib/error-messages.ts` (new, 106 lines). 4개 export:

1. `type ErrorCode = "mcp_timeout" | "mcp_busy" | "mcp_offline" | "stream_timeout" | "unknown"` — Plan 02-01 server contract와 정확히 동일한 5-code union.
2. `interface ParsedError { code: ErrorCode; message: string }` — UI에 즉시 렌더 가능한 한국어 message.
3. `const KOREAN_MESSAGES: Record<ErrorCode, string>` — D-03 degraded mode 프리픽스 `[⚠️ 미확인 답변]`이 mcp_timeout / mcp_offline 에 적용. 나머지 3개는 일반 한국어 메시지.
4. `function parseChatError(err: Error | undefined): ParsedError` — 2-tier 파싱:
   - **Primary:** `JSON.parse(err.message)` 성공 → `parsed.error.code`로 KOREAN_MESSAGES lookup. server body의 `message` 필드는 완전 무시.
   - **Legacy fallback:** raw 문자열에 `503 / 429 / Max sessions / ECONNREFUSED / ENOTFOUND / fetch failed / aborted / timeout` 키워드가 있으면 적절한 code로 매핑. raw 문자열을 UI에 절대 노출하지 않음.
   - 매칭 실패 → `unknown`.

상단 11줄 주석에 **source-of-truth 규약** 명시: 서버 route.ts의 KOREAN_ERROR_MESSAGES와 drift 허용, client가 항상 canonical. 두 테이블을 동기화하지 말 것.

### Task 02-02-02: ChatMessage 인라인 에러 배너 + 다시 시도 버튼 (D-07) — `0bab01f`

`frontend/src/components/chat/chat-message.tsx` (82 → 129 lines, +47 / -18).

**(A) Imports.** `import type { ParsedError } from "@/lib/error-messages"`, lucide-react `RotateCcw` 추가.

**(B) Props 확장.** 3개 optional prop 추가:
```typescript
error?: ParsedError;
onRetry?: () => void;
isRetryDisabled?: boolean;
```
함수 destructuring도 동일하게 확장.

**(C) Part D — bubble wrapper 조건부 렌더 (필수).** 기존 무조건 `<div className="rounded-2xl ...">` 블록을 `{(content || isUser) && (...)}` 로 감쌌다. 효과:
- 사용자 메시지(`isUser`): truthy → 항상 렌더
- 봇 메시지 + content 있음: truthy → 렌더 (정상 답변)
- 봇 메시지 + content === "": falsy → 미렌더, 인라인 배너만 단독 표시 (pre-stream 에러 case)
- `content === "검색 중..."`: truthy → 보존 (로딩 플레이스홀더 정상 동작)

이 가드가 없으면 빈 rounded-2xl 말풍선 + 그 아래 에러 배너가 나란히 나타나 D-07이 정의한 UX가 깨진다.

**(D) 인라인 에러 배너.** 기존 message bubble 블록 직후, "액션 버튼" 블록 직전에 새 블록 추가:
```typescript
{!isUser && error && (
  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2">
    <p className="text-[length:var(--text-sm)] text-destructive font-medium">{error.message}</p>
    {onRetry && (
      <button onClick={onRetry} disabled={isRetryDisabled} className="...RotateCcw + 다시 시도">
        <RotateCcw className="h-3 w-3" /> 다시 시도
      </button>
    )}
  </div>
)}
```
RotateCcw + "다시 시도" + disabled state 처리. `isRetryDisabled`는 React `disabled:opacity-50 disabled:cursor-not-allowed` 클래스로 시각화.

**(E) 액션 버튼 가드 보존.** `{!isUser && content && content !== "검색 중..." && (...)}` 그대로. content가 빈 에러 케이스에서는 복사/즐겨찾기 버튼이 자동으로 숨겨짐 — 정합.

### Task 02-02-03: MessagePartRenderer pass-through + ChatContainer 에러 라우팅 — `72344ec`

#### PART A — `frontend/src/components/chat/message-part-renderer.tsx` (193 → 211, +18)

**Props 확장.** `error?`, `onRetry?`, `isRetryDisabled?` 추가.

**Pass-through 패턴 (3 경로 중 2):**
- **Legacy path** (`!("parts" in message)`): 3개 prop 모두 forward.
- **User path** (`uiMessage.role === "user"`): error prop을 **의도적으로 pass-through 하지 않음**. user bubble에 에러 배너가 뜨면 안 됨. chat-container가 isLastAssistant 체크로 별도 routing.
- **Assistant path** (text/tool 분리 후 ChatMessage 렌더): 3개 prop 모두 forward.

**(textChunks.length > 0 || error) 가드.** 기존 `{textChunks.length > 0 && <ChatMessage ...>}` 가드는 mid-stream 에러로 text part가 0개일 때 ChatMessage를 렌더하지 않아 인라인 배너 통로가 막힌다. `|| error`를 추가해 partial-fail assistant도 빈 content로 ChatMessage를 렌더하고 거기에 인라인 배너가 표시되도록 보장.

#### PART B — `frontend/src/components/chat/chat-container.tsx` (318 → 352, +34)

**B-1. import 보강.** `import { parseChatError, type ParsedError } from "@/lib/error-messages"`.

**B-2. useChat destructure 확장.** `regenerate, clearError` 2개 추가. **단일 인수 호출 `useChat({ id: conversationId })`는 절대 건드리지 않음** (Phase 4 PERS-03 경계).

**B-3. handleRetry useCallback.** handleToggleFavorite 직후, handleExport 직전에 추가:
```typescript
const handleRetry = useCallback(async () => {
  clearError();
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    await regenerate({ body: { modelId } });
    return;
  }
  if (last?.role === "user") {
    const text = extractAssistantText(last);
    if (!text) return;
    sendMessage({ text }, { body: { modelId } });
  }
}, [clearError, messages, regenerate, sendMessage, modelId]);
```
- `clearError()` 우선 호출 — error state lingering 방지.
- last.role === "assistant" → mid-stream 에러 → `regenerate({body:{modelId}})` (AI SDK 6 공식, RESEARCH §5.1 VERIFIED).
- last.role === "user" → pre-stream 에러 (assistant turn 미생성) → `sendMessage({text}, {body:{modelId}})` fallback (RESEARCH §5.2 Q3 — pre-stream에서 regenerate 동작 불확실).
- `extractAssistantText(last)` 사용 — Phase 1 single-source.

**B-4. 파생값.** return 직전에 1회 계산:
```typescript
const parsedError: ParsedError | undefined = error ? parseChatError(error) : undefined;
const lastMessage = messages[messages.length - 1];
const lastIsAssistant = lastMessage?.role === "assistant";
```

**B-5. messages.map 재구성.** 마지막 assistant에만 attachedError 주입:
```typescript
{messages.map((m, idx) => {
  const isLast = idx === messages.length - 1;
  const attachedError =
    parsedError && isLast && m.role === "assistant" ? parsedError : undefined;
  return (
    <MessagePartRenderer
      key={m.id}
      message={m}
      isFavorite={favorites.has(m.id)}
      onToggleFavorite={handleToggleFavorite}
      error={attachedError}
      onRetry={attachedError ? handleRetry : undefined}
      isRetryDisabled={isLoading}
    />
  );
})}
```

**B-6. Pre-stream standalone bubble.** "검색 중..." 플레이스홀더 블록 바로 아래에 추가 (RESEARCH Q5 옵션 A):
```typescript
{parsedError && !lastIsAssistant && (
  <ChatMessage
    role="assistant"
    content=""
    error={parsedError}
    onRetry={handleRetry}
    isRetryDisabled={isLoading}
  />
)}
```
content=""이므로 Part D 가드 `(content || isUser)` 가 false → bubble wrapper 미렌더 → 에러 배너만 단독 노출.

**B-7. Global error block 완전 삭제.** 기존 `{error && (<div className="mx-auto max-w-3xl px-4 pb-4">... 오류가 발생했습니다 ... 혼잡 ... 429 ...)}` 블록 (~L190-203) 전체 제거. grep 검증:
- `오류가 발생했습니다` → 0
- `error.message?.includes` → 0
- `혼잡` → 0
- `429` → 0

**B-8. Phase 1 / Phase 4 경계 보존.**
- `useChat({ id: conversationId })` 단일 인수 호출 그대로 (1회만 등장)
- `lib/conversations.ts` 미수정 (`git diff HEAD -- frontend/src/lib/conversations.ts | wc -l` = 0)
- `extractAssistantText` 4회 등장 (Phase 1 single-source)
- "검색 중..." 플레이스홀더 1회 (보존)

## How It Works (architectural rationale)

### Why client KOREAN_MESSAGES = canonical (drift 허용)

Plan 02-01 SUMMARY가 이미 명문화한 규약: 서버 route.ts의 KOREAN_ERROR_MESSAGES는 debug log 용도이고, client error-messages.ts의 KOREAN_MESSAGES가 사용자에게 렌더되는 한국어 문자열의 유일한 소스. parseChatError는 서버 body의 `code` 필드만 읽고 `message` 필드는 무시한다. 이렇게 하면:

1. **XSS surface 제거** — 서버가 보낸 message를 절대 렌더하지 않으므로 T-02-02-02 위협이 원천 차단.
2. **i18n 단일 위치** — 한국어 문구 변경 시 client 한 파일만 수정.
3. **버전 drift 내성** — 서버/client 배포 시점이 어긋나도 UI는 항상 일관.

### Why bubble wrapper 조건부 렌더 (Part D)

3가지 케이스를 동시에 만족해야 한다:
- 정상 답변: content 있음 → bubble 렌더
- 로딩 placeholder: `content="검색 중..."` → bubble 렌더 (truthy)
- pre-stream 에러: `content=""` + `error` 존재 → bubble 미렌더, 인라인 배너만 노출

`(content || isUser)`는 이 3가지 경우 모두 정확히 처리한다:
- "검색 중..." → truthy ✓
- 빈 content + assistant → falsy → 빈 말풍선 방지 ✓
- 빈 content + user → 거의 발생 안 하지만 truthy로 강제 (사용자 입력은 항상 보임 보장)

이 가드가 없으면 D-07이 정의한 "에러 배너가 깨끗하게 단독 표시" UX가 깨져 빈 rounded-2xl 말풍선 + 에러 배너가 어색하게 나란히 나타난다.

### Why standalone pre-stream bubble (Q5 옵션 A)

createMCPClient 실패는 streamText가 호출되기 전에 발생하므로 useChat의 messages 배열에는 마지막 user 메시지만 존재한다. 이 상태에서 mid-stream 라우팅(`attachedError on last assistant`)은 attach할 assistant가 없어 에러를 표시할 곳이 없다. 옵션 A는 user 메시지 바로 아래에 standalone assistant bubble을 렌더해 채팅 대화 흐름을 유지한다 — `<user> → <assistant 에러 배너> → <retry>`. 옵션 B(global toast)는 D-07 "assistant bubble 내부" 규칙과 충돌하므로 거부.

### Why handleRetry의 regenerate / sendMessage 분기 (RESEARCH Q3)

AI SDK 6 `regenerate()`는 마지막 assistant 메시지를 타겟으로 한다. pre-stream 에러로 마지막 메시지가 user인 상태에서 regenerate를 호출하면:
1. regenerate가 no-op이 될 수 있음
2. 또는 user 메시지를 잘못 manipulate할 수 있음
3. 또는 어떤 동작을 할지 RESEARCH §5.2가 명시적으로 "VERIFIED 불확실"로 표시함

UAT에서 실측해야 하지만, fallback 패턴(role 분기)을 미리 구현하면 UAT 결과와 무관하게 안전하게 동작한다. last.role === "user"이면 그 user message text를 추출해 sendMessage로 새 turn을 시작 — 사용자 입장에서는 동일한 "다시 시도" 경험.

### Why isRetryDisabled = isLoading (D-10)

`status === "streaming" || status === "submitted"`인 상태에서 retry 버튼이 활성화되면:
1. 중복 regenerate → MCP 서버 동시 다중 connect → 503 cascade
2. T-02-02-03 DoS 위협
3. UI race condition

`isLoading`을 그대로 prop으로 전달해 React 자동 재계산으로 처리. 자동 재시도 1회는 server-side(Plan 02-01 D-08)에서 처리하므로 client는 수동 retry만 책임진다.

## Deviations from Plan

### Auto-fixed Issues

없음. 3개 task 모두 PLAN의 action 텍스트를 그대로 적용했고 grep + tsc + build 모두 1회 시도에 통과. PLAN이 2회 revision warning(Part D 필수, message source-of-truth)을 포함하고 있어 추가 deviation 발생 여지가 사전 차단된 상태.

### 미세 조정 (Claude 재량 영역, scope 내)

1. **chat-message.tsx Part D 주석 4줄 추가** — PLAN action 텍스트에는 주석이 명시되지 않았으나, "검색 중..." truthy 보존 이유와 빈 말풍선 방지 의도를 코드 옆에 명시해 미래 수정자가 이 가드를 함부로 제거하지 않도록 가드. acceptance criteria 통과 (검색 중... 카운트 = 2 — 1개는 코드 가드, 1개는 주석 보존 설명).

2. **chat-container.tsx parsedError 파생값 위치** — PLAN은 "messages.map 블록 위"라고 했으나 return 직전이 React 렌더 흐름상 가장 자연스러움. 동일 효과.

3. **chat-container.tsx standalone bubble 위치** — PLAN은 "검색 중... 블록 바로 아래"로 명시. 정확히 그 위치에 배치. 다만 `<div className="mx-auto max-w-3xl py-4">` 내부에 위치시켜 max-w-3xl 컨테이너 정렬을 자연스럽게 상속.

이 3개는 PLAN이 명시적으로 Claude 재량으로 허용한 영역(`Claude's Discretion` CONTEXT.md, 변수 위치/주석/Tailwind 클래스)이며 deviation으로 분류하지 않음.

## Authentication Gates

없음. 본 plan은 정적 코드 변경 + tsc/build 검증만 수행. MCP 서버 호출이나 환경 변수 의존성 없음.

## Verification Run

```text
cd frontend && npx tsc --noEmit
→ exit 0 (Task 01 / Task 02 / Task 03 후 모두)

cd frontend && npm run build
→ Compiled successfully in 2.3s
→ Finished TypeScript in 2.1s
→ Generating static pages 6/6
→ Route ƒ /api/chat 정상 빌드
→ exit 0

cd frontend && npm run lint
→ 6 problems (2 errors, 4 warnings) — 모두 pre-existing, Plan 02-01 SUMMARY와 동일
→ src/app/page.tsx (handleNew immutability)
→ src/components/chat/chat-input.tsx (ImageIcon unused, img element)
→ src/components/chat/model-selector.tsx (ModelInfo unused)
→ src/components/layout/theme-toggle.tsx (set-state-in-effect)
→ 본 plan이 수정한 4개 파일에서 새 lint 경고/에러 0개 도입
```

### must_haves grep evidence

| Truth                                                                                       | Evidence                                                                                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| error-messages.ts new file + exports                                                        | export type ErrorCode(1) export interface ParsedError(1) export const KOREAN_MESSAGES(1) export function parseChatError(1) |
| 5개 ErrorCode in KOREAN_MESSAGES                                                            | mcp_timeout(3) mcp_busy(3) mcp_offline(4) stream_timeout(3) unknown(7) — 모두 ≥1 키-값 등장                     |
| D-03 미확인 답변 프리픽스 (mcp_timeout + mcp_offline)                                          | "미확인 답변" 3회 (2 메시지 + 1 주석)                                                                          |
| parseChatError JSON parse + legacy fallback                                                 | JSON.parse(2) ECONNREFUSED(2) Max sessions(2)                                                              |
| chat-message.tsx 3개 prop                                                                   | error?:(1) onRetry?:(1) isRetryDisabled(3) import type ParsedError(1) RotateCcw(2)                          |
| chat-message.tsx 인라인 배너 UI                                                              | "다시 시도"(1) bg-destructive/5(1) border-destructive/30(1)                                                  |
| chat-message.tsx Part D bubble wrapper (필수)                                                | (content \|\| isUser) ≥ 1 — grep -Ec 통과                                                                  |
| chat-message.tsx 검색 중... 플레이스홀더 보존                                                  | "검색 중..." 2회 (1 코드 가드 L106, 1 주석 L60)                                                                |
| message-part-renderer.tsx pass-through                                                      | import type ParsedError(1) error?: ParsedError(1) onRetry?:(1) isRetryDisabled(4) error={error}(2)         |
| message-part-renderer.tsx user 경로에 error 미전달                                           | grep -A 8 'role="user"' 섹션에 error= 부재 (수동 검증)                                                         |
| message-part-renderer.tsx (textChunks > 0 \|\| error) 가드                                  | textChunks.length > 0 \|\| error(1)                                                                       |
| chat-container.tsx parseChatError + 라우팅                                                   | parseChatError(2) regenerate(6) clearError(3) handleRetry(3) parsedError(4) attachedError(3) lastIsAssistant(2) |
| chat-container.tsx Global error block 완전 제거                                              | 오류가 발생했습니다(0) error.message?.includes(0) 혼잡(0) 429(0)                                                |
| chat-container.tsx Phase 4 경계 보존 (useChat 단일 인수)                                      | useChat({(1)                                                                                                |
| chat-container.tsx Phase 1 자산 보존                                                         | "검색 중..."(1) extractAssistantText(4)                                                                      |
| lib/conversations.ts 미수정                                                                  | git diff HEAD -- frontend/src/lib/conversations.ts \| wc -l = 0                                            |

## Stub / Threat Flags

### Known Stubs

없음. 본 plan에서 도입한 모든 prop과 분기는 실제 동작 경로로 wiring 완료. 하드코딩된 placeholder/empty state/TODO 마커 없음. Plan 02-01의 PoC 로그 2개(`[mcp-cache]`, `[route.ts] mcp retry after 1s`)는 server-side에 있으며 이 plan과 무관.

### Threat Flags

없음. PLAN의 `<threat_model>` T-02-02-01..05가 모두 mitigate / accept로 처리됨:

- **T-02-02-01 (legacy fallback raw 렌더):** mitigate — parseChatError의 legacy branch도 모두 KOREAN_MESSAGES 상수만 반환. raw 문자열을 ParsedError.message에 절대 포함하지 않음.
- **T-02-02-02 (XSS via message string):** mitigate — message는 KOREAN_MESSAGES 미리 정의된 한국어 상수에서만 나옴. 서버가 보낸 message 필드는 parseChatError가 무시. React 기본 escape 유지 (innerHTML / unsafe HTML injection API 미사용).
- **T-02-02-03 (retry 연타 DoS):** mitigate — `isRetryDisabled = isLoading = (status === 'streaming' || 'submitted')`. clearError → regenerate 순서로 React state 일관성 유지.
- **T-02-02-04 (devtools console raw error):** accept — 브라우저 client 로그, NextAuth 인증된 본인. server LAW_API_KEY는 route.ts redaction으로 1차 방어, devtools는 2차 위협 모델 밖.
- **T-02-02-05 (sendMessage fallback 중복 user 작성):** mitigate — handleRetry는 `last?.role === "user"` 분기 안에서만 sendMessage 호출. messages[messages.length - 1]로 명시적 last 취득.

새로운 trust boundary 도입 없음. error-messages.ts는 client-only 모듈로 server 통신 없음.

## Self-Check: PASSED

**Files referenced in this summary:**
- `frontend/src/lib/error-messages.ts` — exists, 106 lines (FOUND)
- `frontend/src/components/chat/chat-message.tsx` — exists, 129 lines (FOUND)
- `frontend/src/components/chat/message-part-renderer.tsx` — exists, 211 lines (FOUND)
- `frontend/src/components/chat/chat-container.tsx` — exists, 352 lines (FOUND)

**Commits referenced:**
- `d62442f` — `feat(02-02): error-messages.ts 신설 — parseChatError + KOREAN_MESSAGES (D-06)` — found in git log
- `0bab01f` — `feat(02-02): ChatMessage 인라인 에러 배너 + 다시 시도 버튼 (D-07)` — found in git log
- `72344ec` — `feat(02-02): MessagePartRenderer pass-through + chat-container 에러 라우팅 (D-07/D-09/D-10)` — found in git log

**Acceptance criteria evidence collected:** 모든 grep 통과. 5개 ErrorCode 키-값 ≥1, parseChatError exports 모두 1, 미확인 답변 ≥2, ParsedError import 3개 파일에서 모두 1, RotateCcw 2(import + JSX), 다시 시도 1, bg-destructive/5 1, border-destructive/30 1, Part D `(content || isUser)` 1, 검색 중... 플레이스홀더 보존, message-part-renderer pass-through 모두 OK, chat-container 라우팅 변수 모두 ≥기준, global error block 제거 grep 4개 모두 0, useChat 단일 인수 1, conversations.ts diff 0, extractAssistantText 4 (Phase 1 single-source 보존).

**No out-of-scope files touched:** `frontend/src/lib/conversations.ts` (Phase 4), `frontend/src/app/api/chat/route.ts` (Plan 02-01 완료, 이 plan 미수정), `frontend/src/lib/ui-message-parts.ts` (Phase 1 완료, 이 plan은 import만 함) 모두 무손상.
