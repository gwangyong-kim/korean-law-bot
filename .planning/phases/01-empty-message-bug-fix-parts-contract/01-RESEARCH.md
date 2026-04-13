# Phase 1: Empty Message Bug Fix + Parts Contract - Research

**Researched:** 2026-04-13
**Researcher:** orchestrator (inline — Task tool unavailable in subagent context)
**Phase goal:** 프로덕션에서 법령 질문이 실제 답변 텍스트로 렌더링되고, AI SDK 6 `UIMessage.parts` 계약 위에 재사용 가능한 parts 모듈이 마련된다.

All API shapes below were verified directly against `frontend/node_modules/ai@6.0.158/dist/index.d.ts` and `frontend/node_modules/@ai-sdk/mcp@1.0.36/dist/index.d.ts`, per `frontend/AGENTS.md` directive ("read the relevant guide in `node_modules/next/dist/docs/` before writing any code").

---

## 1. AI SDK 6 API Contract Verification

### 1.1 `streamText` options — `stopWhen` and callbacks

From `ai/dist/index.d.ts:838-843`:

```ts
type StopCondition<TOOLS extends ToolSet> = (options: {
  steps: Array<StepResult<TOOLS>>;
}) => PromiseLike<boolean> | boolean;

declare function stepCountIs(stepCount: number): StopCondition<any>;
declare function hasToolCall(toolName: string): StopCondition<any>;
```

From `ai/dist/index.d.ts:2905-2914`:

```ts
// Callback that is invoked when an error occurs during streaming.
// You can use it to log errors.
onError?: StreamTextOnErrorCallback;

// Callback that is called when the LLM response and all request tool executions
// (for tools that have an execute function) are finished.
onFinish?: StreamTextOnFinishCallback<TOOLS>;
onAbort?: StreamTextOnAbortCallback<TOOLS>;
```

**`StreamTextOnFinishCallback` signature** (`index.d.ts:2724-2726`):
```ts
type StreamTextOnFinishCallback<TOOLS extends ToolSet> =
  (event: OnFinishEvent<TOOLS>) => PromiseLike<void> | void;
```

**`OnFinishEvent`** (`index.d.ts:1064-1066`):
```ts
type OnFinishEvent<TOOLS extends ToolSet = ToolSet> = StepResult<TOOLS> & {
  readonly steps: StepResult<TOOLS>[];
};
```

**`StreamTextOnErrorCallback`** — callback receives `{ error: unknown }`.

**Implication for route.ts:**

```ts
const result = streamText({
  model: google(selectedModel),
  system: SYSTEM_PROMPT,
  messages,
  stopWhen: stepCountIs(8),                // required — default is stepCountIs(1)
  ...(hasTools ? { tools } : {}),
  onFinish: async () => {
    if (mcpClient) await mcpClient.close();  // closes AFTER loop finishes
  },
  onError: async ({ error }) => {
    console.error("streamText error:", error);
    if (mcpClient) await mcpClient.close();  // also closes on error path
  },
});
```

**Critical:** `stepCountIs` must be **imported from `"ai"`** alongside `streamText` and `convertToModelMessages`.

### 1.2 `toUIMessageStreamResponse` — `consumeSseStream` and `onError`

These are **two separate options on a single options object** merged from two types:

From `ai/dist/index.d.ts:2306-2318`:
```ts
type UIMessageStreamResponseInit = ResponseInit & {
  // Optional callback to consume a copy of the SSE stream independently.
  // The callback receives a tee'd copy of the stream and does not block the response.
  consumeSseStream?: (options: {
    stream: ReadableStream<string>;
  }) => PromiseLike<void> | void;
};
```

From `ai/dist/index.d.ts:2328-2380`:
```ts
type UIMessageStreamOptions<UI_MESSAGE extends UIMessage> = {
  originalMessages?: UI_MESSAGE[];
  generateMessageId?: IdGenerator;
  onFinish?: UIMessageStreamOnFinishCallback<UI_MESSAGE>;
  messageMetadata?: (...) => ...;
  sendReasoning?: boolean;      // default true
  sendSources?: boolean;        // default false
  sendFinish?: boolean;         // default true
  sendStart?: boolean;          // default true
  // Process an error, e.g. to log it. Default to () => 'An error occurred.'.
  // @returns error message to include in the data stream.
  onError?: (error: unknown) => string;
};
```

From `ai/dist/index.d.ts:2592`:
```ts
toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>(
  options?: UIMessageStreamResponseInit & UIMessageStreamOptions<UI_MESSAGE>
): Response;
```

**Key finding:** The `onError` on `toUIMessageStreamResponse` is **different** from the `onError` on `streamText`:
- `streamText({ onError })` — receives `{ error }`, returns `void`, used for **server-side logging**. Fires on any streaming error.
- `toUIMessageStreamResponse({ onError })` — receives `error`, returns `string`, used to **unmask errors sent to the client**. Default hides errors as `'An error occurred.'` (security-by-default).

Both are needed for CHAT-04. Pattern:

```ts
return result.toUIMessageStreamResponse({
  consumeSseStream: async ({ stream }) => {
    // Drain the tee'd copy so abort/disconnect doesn't deadlock the response.
    // The callback MUST consume the stream; otherwise backpressure can block.
    const reader = stream.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  },
  onError: (error) => {
    console.error("toUIMessageStreamResponse error:", error);
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "알 수 없는 오류가 발생했습니다.";
  },
});
```

### 1.3 MCP client close signature

From `@ai-sdk/mcp/dist/index.d.ts:486-530`:

```ts
declare function createMCPClient(config: MCPClientConfig): Promise<MCPClient>;

interface MCPClient {
  // ...
  close: () => Promise<void>;
}
```

**`mcpClient.close()` returns `Promise<void>` and is async** — must be awaited.

### 1.4 Root cause in current `route.ts` (lines 83-94)

```ts
try {
  const result = streamText({
    model: google(selectedModel),
    system: SYSTEM_PROMPT,
    messages,
    ...(Object.keys(tools).length > 0 ? { tools } : {}),
    // [X] no stopWhen → defaults to stepCountIs(1) → stops after first tool call
  });

  return result.toUIMessageStreamResponse();
  // [X] no consumeSseStream → client abort can deadlock
  // [X] no onError → errors masked as "An error occurred"
} finally {
  if (mcpClient) await mcpClient.close();
  // [X] mcpClient closes SYNCHRONOUSLY in the finally block, but
  //     streamText returns a lazy stream — the tools are still in use
  //     when the function returns. close() races the stream → tool result
  //     can be discarded mid-flight, leaving a `tool-calls` turn without text.
}
```

This matches CONTEXT.md root-cause analysis exactly.

### 1.5 `finishReason` enum

From `ai/dist/index.d.ts:2142`:
```ts
finishReason?: "length" | "error" | "stop" | "content-filter" | "tool-calls" | "other" | undefined;
```

Success criterion #8 (`finishReason: "stop"` not `"tool-calls"`) is verifiable via `onFinish` in route.ts or via server logs.

---

## 2. `UIMessage.parts` Type Catalog

### 2.1 The 9 part types in AI SDK 6

From `ai/dist/index.d.ts:1684`:

```ts
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>         // static tool, type is `tool-${NAME}`
  | DynamicToolUIPart          // dynamic tool, type is literal 'dynamic-tool'
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | DataUIPart<DATA_TYPES>
  | StepStartUIPart;
```

**Required 9-way switch** (from `isTextUIPart`, `isReasoningUIPart`, etc. + type literals):

| Part type              | `part.type` literal       | Phase 1 render                                      |
|------------------------|---------------------------|-----------------------------------------------------|
| `TextUIPart`           | `'text'`                  | Full render via `ChatMessage` (ReactMarkdown)       |
| `DynamicToolUIPart`    | `'dynamic-tool'`          | Minimal chip per state (4 common states, see below) |
| `ToolUIPart<TOOLS>`    | `` `tool-${string}` ``    | Minimal chip (treat like dynamic-tool for Phase 1)  |
| `ReasoningUIPart`      | `'reasoning'`             | **stub: `null`** (D-05)                             |
| `FileUIPart`           | `'file'`                  | **stub: `null`** (D-05)                             |
| `SourceUrlUIPart`      | `'source-url'`            | **stub: `null`** (D-05)                             |
| `SourceDocumentUIPart` | `'source-document'`       | **stub: `null`** (D-05, implied)                    |
| `StepStartUIPart`      | `'step-start'`            | **stub: `null`** (D-05)                             |
| `DataUIPart<DATA>`     | `` `data-${string}` ``    | **stub: `null`** (D-05, implied)                    |

**Note:** CONTEXT.md D-05 lists 4 stub parts (`reasoning`, `file`, `source-url`, `step-start`). For exhaustive `never`-default type safety, `source-document` and `data-*` must also be handled as stubs. This is a minor extension of D-05 — still all stubs, no behavior change, just type exhaustiveness.

### 2.2 Official type guards to re-export (CHAT-05)

From `ai/dist/index.d.ts:1970-2009`:

```ts
declare function isTextUIPart(part: UIMessagePart<UIDataTypes, UITools>): part is TextUIPart;
declare function isReasoningUIPart(part: UIMessagePart<UIDataTypes, UITools>): part is ReasoningUIPart;
declare function isFileUIPart(part: UIMessagePart<UIDataTypes, UITools>): part is FileUIPart;
declare function isToolUIPart<TOOLS extends UITools>(part: UIMessagePart<UIDataTypes, TOOLS>): part is ToolUIPart<TOOLS> | DynamicToolUIPart;
declare function isStaticToolUIPart<TOOLS extends UITools>(part: ...): part is ToolUIPart<TOOLS>;
declare function isDataUIPart<DATA_TYPES>(part: ...): part is DataUIPart<DATA_TYPES>;
declare function getToolName(part: ToolUIPart<UITools> | DynamicToolUIPart): string;
declare function getStaticToolName<TOOLS extends UITools>(part: ToolUIPart<TOOLS>): keyof TOOLS;
```

**Exports required by CONTEXT.md + CHAT-05:**
- `isTextUIPart` — for `extractAssistantText`
- `isToolUIPart` — for renderer tool branch
- `getToolName` — for dynamic tool chip label

**Import path:** `import { isTextUIPart, isToolUIPart, getToolName } from "ai"` (verified from `index.d.ts` public declarations).

### 2.3 `DynamicToolUIPart` states

From `ai/dist/index.d.ts:1879-1966`:

```ts
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & (
  | { state: 'input-streaming';    input: unknown | undefined;  output?: never; errorText?: never; approval?: never }
  | { state: 'input-available';    input: unknown;              output?: never; errorText?: never; approval?: never }
  | { state: 'approval-requested'; input: unknown;              output?: never; errorText?: never; approval: {...} }
  | { state: 'approval-responded'; input: unknown;              output?: never; errorText?: never; approval: {...} }
  | { state: 'output-available';   input: unknown;              output: unknown; errorText?: never; approval?: {...} }
  | { state: 'output-error';       input: unknown | undefined;  output?: never; errorText: string;  approval?: {...} }
  | { state: 'output-denied';      input: unknown;              output?: never; errorText?: never; approval: {...} }
);
```

**Actual state count:** 7, not 4. CONTEXT.md D-06 explicitly names 4 (`input-streaming` / `input-available` / `output-available` / `output-error`) as the "minimal chip" set. The 3 approval states are **not** reached by this project's tools (no `approval` field on MCP tools) and can be handled with a **fallthrough default case** that produces a generic chip — not a `never`-default throw, because approval states are type-valid.

**Resolution:** In `MessagePartRenderer`, the dynamic-tool branch uses an **inner switch on `part.state`** with the 4 D-06 states as explicit cases and a **default case that renders a neutral chip** ("도구 상태: {state}"). This satisfies D-06 ("4가지 상태를 모두 minimal chip 문자열로 분기 처리") while keeping type exhaustiveness without throwing on approval states.

---

## 3. Legacy Message Migration (COMPAT)

### 3.1 Current `Message` interface (legacy)

From `frontend/src/lib/conversations.ts:5-9`:

```ts
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}
```

This is **flat** — no `parts` field. Every existing localStorage conversation has this shape.

### 3.2 AI SDK 6 `UIMessage` shape

From `ai/dist/index.d.ts:1670-1683`:

```ts
interface UIMessage<METADATA, DATA_PARTS, TOOLS> {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: METADATA;
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

### 3.3 Detection and conversion (D-01, D-02, D-03)

```ts
// Detection: msg.parts undefined AND msg.content is string
function isLegacyMessage(msg: unknown): msg is { id: string; role: string; content: string } {
  return (
    typeof msg === "object" && msg !== null &&
    !("parts" in msg) &&
    "content" in msg && typeof (msg as any).content === "string"
  );
}
```

### 3.4 Where migration happens

CONTEXT.md D-01 + COMPAT-02 are in subtle tension:
- **D-01:** "변환은 `extractAssistantText` 내부에서 수행. single source of truth 원칙 유지 — `conversations.ts`는 AI SDK parts 타입을 몰라도 됨."
- **COMPAT-02:** "마이그레이션 로직은 한 곳 — `lib/conversations.ts` 또는 `extractAssistantText` — 에만 존재"

**Resolution:** The conversion is in **`extractAssistantText`** (D-01 wins, COMPAT-02 allows it). `conversations.ts` remains parts-agnostic and keeps its legacy `Message` shape for storage. Phase 4 (PERS-01) will migrate the storage shape.

`extractAssistantText` accepts a union:

```ts
type ExtractableMessage =
  | UIMessage                                    // new shape
  | { id: string; role: string; content: string }; // legacy shape

function extractAssistantText(msg: ExtractableMessage): string {
  // Legacy path: D-02 detection
  if (!("parts" in msg) || msg.parts === undefined) {
    if ("content" in msg && typeof msg.content === "string") return msg.content;
    console.warn("extractAssistantText: unknown legacy shape", msg);
    return ""; // D-03 fallback
  }
  // New path: iterate parts, grab text parts only
  return msg.parts.filter(isTextUIPart).map((p) => p.text).join("");
}
```

### 3.5 The `chat-container.tsx` render path

Currently at `chat-container.tsx:187-196`:

```tsx
{messages.map((m) => (
  <ChatMessage
    key={m.id}
    id={m.id}
    role={m.role as "user" | "assistant"}
    content={getMessageText(m)}   // inline, being removed
    isFavorite={favorites.has(m.id)}
    onToggleFavorite={handleToggleFavorite}
  />
))}
```

**New path (CHAT-07 + CHAT-08):**

```tsx
{messages.map((m) => (
  <MessagePartRenderer
    key={m.id}
    message={m}
    isFavorite={favorites.has(m.id)}
    onToggleFavorite={handleToggleFavorite}
  />
))}
```

`MessagePartRenderer` internally:
1. For user messages → single text render via `ChatMessage` with `content={extractAssistantText(m)}`.
2. For assistant messages → map over `m.parts`:
   - text parts → concatenate and render via `ChatMessage`
   - tool/dynamic-tool parts → render minimal chip (title from `getToolName`, state from switch)
   - stubs → return `null`

**localStorage save path** at `chat-container.tsx:72-76` uses the same `getMessageText` to flatten to `content: string`. It will be updated to use `extractAssistantText` — the legacy `Message` storage shape stays (Phase 4 migrates it to parts).

### 3.6 `initialMessages` is unused by `useChat`

At `chat-container.tsx:34-36`:

```ts
const { messages, sendMessage, status, error } = useChat({
  id: conversationId,
  // NOTE: initialMessages prop is defined but NOT passed to useChat
});
```

The component prop `initialMessages` is used only in the empty-state render check (`messages.length === 0 && initialMessages.length === 0`). It's **not seeded into the chat hook**. This is the Phase 4 reseed issue — out of scope for Phase 1. CONTEXT.md Deferred explicitly confirms.

**Phase 1 implication:** the COMPAT render path only affects the empty-state check and the localStorage save path. Because `useChat` doesn't read `initialMessages`, old messages never reach `MessagePartRenderer` in the current session — only new messages do. The COMPAT-01/02/03 acceptance is verified by reloading the page and **reading the sidebar** (which reads `conversations.ts` directly, not through `useChat`). The sidebar display path must also use `extractAssistantText` for title/preview rendering if it does any.

---

## 4. Sidebar Read Path (COMPAT-03 verification surface)

`chat-sidebar.tsx` (planner must read first) uses `conversations.ts` CRUD directly. Titles are set at save time (`updateConversation` line 72 uses `firstUserMsg.content`). So **no render-time extraction is needed in the sidebar** as long as the storage shape is unchanged — which it is (Phase 4 migrates storage).

**COMPAT-03 actual failure mode:** if the user reloads the page, clicks an existing conversation, the `ChatContainer` re-mounts with `initialMessages=restored`. Because `useChat` ignores `initialMessages`, `messages` starts empty. The UI shows empty state. **This is the Phase 4 issue, NOT a COMPAT-01 issue.** Phase 1's COMPAT scope is narrower:

- **What COMPAT-01 requires:** after a fresh page load with messages already in localStorage, clicking a conversation does **not crash** and the **sidebar list still shows titles**. Messages area will be empty (Phase 4 fixes that).
- **COMPAT-02:** Migration logic must exist in one place. It does — inside `extractAssistantText`. The localStorage save path now reads back through `extractAssistantText` if it ever encounters a legacy shape.
- **COMPAT-03:** sidebar titles display correctly.

The planner must be careful not to silently escalate Phase 1 into Phase 4. The Phase 1 commit must **not** pass `initialMessages` to `useChat`.

---

## 5. Diagnostic Logging (CHAT-09)

### 5.1 Placement (D-08)

CONTEXT.md D-08 locks: "클라이언트 `onMessagesChange` 직전. `chat-container.tsx`의 useEffect 안에서 `messages.forEach(m => console.log(JSON.stringify(m.parts)))`".

Placement: inside the existing `useEffect([messages, status, onMessagesChange])` at `chat-container.tsx:67-81`, **before** the `onMessagesChange(mapped)` call.

```ts
useEffect(() => {
  if (messages.length === 0) return;
  if (messages.length === prevLenRef.current && status === "streaming") return;
  prevLenRef.current = messages.length;

  // [DIAGNOSTIC - CHAT-09 - REMOVE BEFORE COMMIT]
  messages.forEach((m, i) => {
    console.log(`[diag] messages[${i}].parts:`, JSON.stringify(m.parts));
  });

  const mapped: Message[] = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: extractAssistantText(m),
  }));

  if (status !== "streaming") {
    onMessagesChange(mapped);
  }
}, [messages, status, onMessagesChange]);
```

### 5.2 Lifecycle (D-09, D-10)

D-09 lock: logs are temporary. Workflow:
1. **Before fix 커밋:** insert diagnostic log, reproduce bug in production URL, capture `tool-*`-only parts JSON from browser devtools, save raw JSON to a scratch file (not committed).
2. **After fix 커밋:** rerun same question, capture `text`+`tool-*` parts JSON.
3. **Remove diagnostic log** before final commit.
4. **Commit message body (D-10):** HEREDOC containing both JSON snippets labeled Before/After.

The diagnostic log is added **inside** the refactor commit (feat(parts) or refactor(chat)), captured, then removed inside the **same commit**. Git working tree at the time of commit has no diagnostic log — the evidence lives in the commit message body, not in the code.

### 5.3 Manual production gate (D-11)

Before merging: user hits `frontend-phi-six-16.vercel.app` with "근로기준법 제60조 연차휴가" and confirms text renders. This is a **manual UAT gate**, not automated. Planner should include a task that **blocks `VERIFICATION.md passed`** until user confirms.

---

## 6. Commit Strategy (D-12)

### 6.1 Three-commit sequence

| # | Subject                                                                       | Scope                                       | CHAT / COMPAT IDs        |
|---|-------------------------------------------------------------------------------|---------------------------------------------|--------------------------|
| 1 | `fix(api): stopWhen + MCP close 이동 + consumeSseStream/onError`              | `route.ts` only                             | CHAT-02, CHAT-03, CHAT-04 |
| 2 | `feat(parts): lib/ui-message-parts.ts + MessagePartRenderer`                  | `lib/ui-message-parts.ts` + renderer file   | CHAT-05, CHAT-07          |
| 3 | `refactor(chat): inline getMessageText 제거 + COMPAT 마이그레이션`            | `chat-container.tsx`, `test-sidebar/page.tsx` | CHAT-06, CHAT-08, CHAT-09, COMPAT-01~03 |

Each commit **must independently type-check and build**. Verification: `npm run build` passes after each commit.

### 6.2 Independent buildability

**Commit 1 (fix(api)):** route.ts only. Client still uses inline `getMessageText`. Build passes trivially.

**Commit 2 (feat(parts)):** adds new files. Nothing imports them yet. `tsc --noEmit` passes (orphan files are legal). `next build` passes.

**Commit 3 (refactor(chat)):** replaces inline `getMessageText` in chat-container.tsx with import from `lib/ui-message-parts.ts` + replaces `ChatMessage` map with `MessagePartRenderer`. Replaces test-sidebar inline copy. COMPAT migration lives in `extractAssistantText`. Diagnostic log added inside the working tree, captured before/after (D-10 HEREDOC in commit message), then removed before finalizing the commit.

### 6.3 `maxDuration` and unrelated files (D-14)

`maxDuration = 60` at `route.ts:6` is NOT touched. System prompt at `route.ts:8-40` is NOT touched (STRE-07 scope). MCP connection fallback at `route.ts:60-81` is NOT touched (STRE-01 scope).

---

## 7. Next.js 16 + React 19 Notes

### 7.1 Route handler signature

`frontend/src/app/api/chat/route.ts` exports `POST(req: Request)`. This is the canonical Next.js 16 App Router route handler signature — verified against existing code. No change needed.

### 7.2 `"use client"` directive

`chat-container.tsx` and `test-sidebar/page.tsx` already have `"use client"`. New `MessagePartRenderer` needs `"use client"` because it renders interactive child components (`ChatMessage` with `useState`).

`lib/ui-message-parts.ts` does NOT need `"use client"` — it's a pure utility module.

### 7.3 React 19 compatibility

No React 19-specific hooks used. `useEffect`, `useCallback`, `useState`, `useRef` are stable. No `use()` hook needed. No Server Components touched.

### 7.4 Turbopack compatibility

`next dev` uses Turbopack by default in Next 16. All changes are standard TypeScript + React — no special bundler config required.

---

## 8. Vercel Serverless Constraints

From `.planning/PROJECT.md` and CONTEXT.md:
- Vercel serverless free tier: 60s timeout (`maxDuration = 60`).
- `stopWhen: stepCountIs(8)` allows up to 8 model steps. Each MCP tool call ~500-2000ms, model generation ~1-5s. Worst case: 8 * (2s tool + 3s gen) = 40s. Within budget, but tight.
- `consumeSseStream` callback MUST drain the tee'd stream (even if just `while (!done) read()`). Not draining can cause backpressure and block the main response stream. This is the key risk CONTEXT.md flags from the "consumeSseStream 위치" warning.

---

## 9. `test-sidebar` Scope (D-13)

`frontend/src/app/test-sidebar/page.tsx` is a dev/test page currently exposed publicly. Phase 5 (CLEAN-04) deletes the directory entirely. Phase 1 replaces its inline `getMessageText` (lines 10-15) with an import of `extractAssistantText`.

CONTEXT.md D-13 is explicit: "Phase 1에서 `extractAssistantText`로 교체". This is cleanup touching a single function, NOT a deletion — consistent with CHAT-06 ("chat-container.tsx / test-sidebar/page.tsx 양쪽의 inline getMessageText 제거").

---

## 10. Threat Model Notes

### 10.1 Security posture (L1 per config)

- **No new auth surface.** Route already behind NextAuth middleware.
- **No new untrusted input.** `route.ts` continues consuming already-validated `messages` from `useChat`.
- **New client code surface** (`MessagePartRenderer`): renders strings via `ReactMarkdown` (already safe in `ChatMessage`). No raw-HTML injection. No XSS risk.
- **MCP close error path change:** if `mcpClient.close()` rejects in `onFinish`/`onError`, the rejection must be caught — otherwise it becomes an unhandled promise rejection in the serverless worker. Wrap with `try/catch` inside the callbacks.
- **Error unmasking (CHAT-04):** `toUIMessageStreamResponse({ onError })` exposes error messages to the client. Must sanitize — do not leak `LAW_API_KEY`, stack traces, or internal paths. Strategy: only pass `error.message` (not stack), and redact known secret keys. For Phase 1 scope, since there's no user-specific data in errors and the only secret (`LAW_API_KEY`) is injected via env at top of `getMcpUrl`, a simple `error.message` passthrough is acceptable. **No new threat introduced.**

### 10.2 Threats to block

| Severity | Threat                                                                            | Mitigation                                                          |
|----------|-----------------------------------------------------------------------------------|---------------------------------------------------------------------|
| low      | `mcpClient.close()` rejection in `onFinish` crashes worker                        | Wrap in `try/catch`, log via `console.error`                        |
| low      | Error unmasking leaks `LAW_API_KEY` if it appears in an Error message             | Sanitizer in `onError`: strip any `oc=` substring from error strings |
| low      | Tool `input`/`output` rendering of untrusted-looking content in minimal chip      | Use `{JSON.stringify(input).slice(0, 80)}` inside normal JSX text nodes — React auto-escapes. No raw-HTML APIs used. |

Highest severity: **low**. Config `workflow.security_block_on = "high"` (default) — **no blockers**.

---

## 11. Validation Architecture (Nyquist Dimension 8)

| Dimension | Strategy                                                                                          |
|-----------|---------------------------------------------------------------------------------------------------|
| 1. Build/type-check | `npm run build` and `tsc --noEmit` after each of 3 commits                              |
| 2. Lint | `npm run lint` (eslint) — existing config, no new rules                                               |
| 3. Unit test | **None.** No test harness exists in the repo. Verification is manual + type-check only.         |
| 4. Integration test | **None.** Same reason. Manual production UAT per D-11.                                    |
| 5. Contract test | **Inline TypeScript** — `extractAssistantText` signature typed as `(msg: UIMessage \| LegacyMessage) => string`. Type system prevents regression. |
| 6. E2E test | **None.** Manual UAT in production URL covers the user journey.                                  |
| 7. Smoke test | Manual: (a) load sidebar with existing conversations — no crash (COMPAT-03). (b) "근로기준법 제60조 연차휴가" → text renders (CHAT-01). (c) Console has no errors. |
| 8. Never-default exhaustiveness | `MessagePartRenderer` `switch (part.type)` default case asserts `part: never`. TypeScript refuses to compile if a new UIMessage part type is added in a future AI SDK version without explicit handling. This **is** the validation architecture for CHAT-07. |

**Dimension 8 acceptance:** compile-time exhaustiveness via `never`-default. This is the strongest validation available without a test harness and matches CONTEXT.md D-07 exactly.

---

## 12. Open Questions

None. All 14 decisions in CONTEXT.md are locked and consistent with the installed API surface. The only minor extension is noted in §2.1 (source-document and data-* stubs for type exhaustiveness — consistent with D-05 spirit).

---

## RESEARCH COMPLETE

**Summary:**
- AI SDK 6 `stopWhen`, `onFinish`, `onError` (both variants), `consumeSseStream` signatures verified in node_modules.
- 9 `UIMessage.parts` types enumerated; 2 rendered (`text`, `dynamic-tool`/`tool-*`), 7 stubbed.
- Type guards `isTextUIPart`, `isToolUIPart`, `getToolName` confirmed as public exports of `"ai"` package.
- `DynamicToolUIPart` has 7 states (not 4); planner uses explicit cases for D-06's 4 states + neutral default for approval states.
- Legacy migration lives in `extractAssistantText` (D-01 + COMPAT-02 reconciled).
- Diagnostic log lifecycle: add-in-working-tree → capture → remove-before-commit → evidence in commit message body.
- `useChat` ignores `initialMessages` is a Phase 4 issue and must NOT be fixed in Phase 1.
- All security threats are **low** severity. No blockers.
- Validation architecture is compile-time exhaustiveness (Dimension 8) + manual UAT (Dimensions 3/4/6/7).

**Ready for planning.**
