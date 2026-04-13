# Architecture Research

**Domain:** AI SDK 6 streaming chat UI (Next.js 16 App Router, brownfield)
**Researched:** 2026-04-13
**Confidence:** HIGH (verified against `node_modules/ai/dist/index.d.ts` source + official ai-sdk.dev docs)

## Scope

Map the correct end-to-end data flow from `streamText()` on the server through the SSE wire to `useChat()` parts on the client, so the renderer can be rebuilt on a verified contract instead of guesses.

This is a **brownfield architecture pin-down**, not a greenfield design. The current bug is `frontend/src/components/chat/chat-container.tsx:158-167` `getMessageText()` doing `"text" in p` instead of inspecting `p.type` — but that surface symptom hides a deeper issue: **the codebase has no model of what a `UIMessage.part` actually is in v6**. This document fixes that.

## Verified Contract (the missing piece)

### `UIMessage` shape

Source: `frontend/node_modules/ai/dist/index.d.ts` lines 1659-1683.

```typescript
interface UIMessage<METADATA = unknown, DATA_PARTS extends UIDataTypes = UIDataTypes, TOOLS extends UITools = UITools> {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: METADATA;
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

There is **no `content` field** on `UIMessage` in AI SDK 6. The only place text lives is inside `parts`. Anything that walks `m.content` is wrong.

### `UIMessagePart` discriminated union

Source: `frontend/node_modules/ai/dist/index.d.ts` line 1684.

```typescript
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>          // type: `tool-${name}`
  | DynamicToolUIPart           // type: 'dynamic-tool'
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | FileUIPart
  | DataUIPart<DATA_TYPES>      // type: `data-${name}`
  | StepStartUIPart;
```

**Every part has a `type` field.** The discriminator is `part.type`, not the presence of arbitrary keys like `text`. Several distinct part types contain a `text` field (`TextUIPart` and `ReasoningUIPart`), so a `"text" in p` check is wrong — it conflates assistant output with model reasoning.

### Every `part.type` value (enumerated, with field shape)

Source lines all from `node_modules/ai/dist/index.d.ts`.

| `part.type` | Source line | Carries | Notes |
|---|---|---|---|
| `'text'` | 1688 | `text: string`, `state?: 'streaming' \| 'done'`, `providerMetadata?` | Assistant visible text. **The thing to render in chat bubbles.** |
| `'reasoning'` | 1706 | `text: string`, `state?`, `providerMetadata?` | Model thinking tokens (Claude, DeepSeek, sometimes Gemini). **Render in a collapsible block, not inline with text.** |
| `'source-url'` | 1724 | `sourceId`, `url`, `title?`, `providerMetadata?` | Web citation. |
| `'source-document'` | 1734 | `sourceId`, `mediaType`, `title`, `filename?`, `providerMetadata?` | Document citation. |
| `'file'` | 1745 | `mediaType`, `filename?`, `url`, `providerMetadata?` | Attached or generated file (e.g., images). `url` may be a Data URL. |
| `'step-start'` | 1770 | (no extra fields) | Marks the start of a multi-step run. Used as a visual divider. |
| `` `tool-${NAME}` `` | 1874 | `toolCallId`, `title?`, `providerExecuted?` + state-specific fields | **Static** tool invocation (compile-time-known tools). State machine below. |
| `'dynamic-tool'` | 1879 | `toolName`, `toolCallId`, `title?`, `providerExecuted?` + state-specific fields | **Dynamic** tool invocation (runtime-discovered tools). **MCP tools always land here.** See "MCP-specific" below. |
| `` `data-${NAME}` `` | 1773 | `id?`, `data: T` | App-defined data parts streamed via `writer.write()`. Not used in this project. |

### Tool part state machine

Source: `node_modules/ai/dist/index.d.ts` lines 1790-1873 (`UIToolInvocation` discriminated union by `state`).

A tool part (static OR dynamic) progresses through these states. The shape of the part object **changes per state**:

| `state` | `input` | `output` | `errorText` | What it means |
|---|---|---|---|---|
| `'input-streaming'` | `DeepPartial<I>` or `undefined` | — | — | Model is generating tool args. Render "preparing call to X". |
| `'input-available'` | `I` (full) | — | — | Args complete, execution about to start (or in flight). Render "calling X with {args}". |
| `'approval-requested'` | `I` | — | — | Human-in-the-loop approval pending. Not used in this project. |
| `'approval-responded'` | `I` | — | — | Approval submitted. Not used. |
| `'output-available'` | `I` | `O` | — | Tool returned successfully. Render result inline or in a collapsible block. |
| `'output-error'` | `I` or `undefined` | — | `string` | Tool threw / model produced invalid args. Render error. |
| `'output-denied'` | `I` | — | — | Approval denied. Not used. |

### MCP-specific: tools come through as `dynamic-tool`

Verified at `frontend/node_modules/@ai-sdk/mcp/dist/index.js:1985` — `mcpClient.tools()` with the default `schemas: 'automatic'` mode wraps every MCP tool in `dynamicTool({...})`. Walking back through `node_modules/ai/dist/index.js:3834` (`tool2.type === "dynamic"`), this routes the resulting tool calls through the `dynamic-tool` branch in `processUIMessageStream` at line 5611.

**Practical consequence:** in this project, every law tool call (`search_law`, `get_law_text`, etc.) arrives in the UI as `part.type === 'dynamic-tool'` with `part.toolName` carrying the actual name, **not** as `tool-search_law`. The renderer must handle `dynamic-tool` first-class. A switch on `tool-${name}` literals will silently miss every MCP call.

## Server → Client Wire Protocol

### What `streamText().toUIMessageStreamResponse()` actually produces

Verified in `frontend/node_modules/ai/dist/index.js`:

- **Headers** (line 5098-5105):
  ```
  content-type: text/event-stream
  cache-control: no-cache
  connection: keep-alive
  x-vercel-ai-ui-message-stream: v1
  x-accel-buffering: no
  ```
- **Body framing** (line 5082-5095, `JsonToSseTransformStream`): each `UIMessageChunk` is encoded as `data: ${JSON.stringify(chunk)}\n\n`, terminated by `data: [DONE]\n\n`.
- **Protocol name:** "UI Message Stream v1" (per the header). This is **not** the legacy "data stream" / `0:`-prefixed protocol from AI SDK 3/4. Anyone debugging by `curl`-ing the endpoint should expect SSE frames.

### `UIMessageChunk` (the wire events)

Source: `node_modules/ai/dist/index.d.ts` lines 2159-2277. Every event the SSE stream can carry, with the fields each carries:

| `chunk.type` | Fields | Reduces into |
|---|---|---|
| `'start'` | `messageId?`, `messageMetadata?` | New assistant message scaffold. |
| `'start-step'` | — | (No part written; marks step boundary internally.) |
| `'text-start'` | `id`, `providerMetadata?` | Pushes empty `TextUIPart` with `state: 'streaming'`. |
| `'text-delta'` | `id`, `delta`, `providerMetadata?` | Appends `delta` to the active text part (matched by `id`). |
| `'text-end'` | `id`, `providerMetadata?` | Sets that text part's `state: 'done'`. |
| `'reasoning-start'` | `id`, `providerMetadata?` | Pushes empty `ReasoningUIPart` (`state: 'streaming'`). |
| `'reasoning-delta'` | `id`, `delta`, `providerMetadata?` | Appends to reasoning part. |
| `'reasoning-end'` | `id`, `providerMetadata?` | Marks reasoning `state: 'done'`. |
| `'tool-input-start'` | `toolCallId`, `toolName`, `dynamic?`, `providerExecuted?`, `title?`, `providerMetadata?` | Creates tool part in `state: 'input-streaming'`. **`dynamic: true` for MCP tools.** |
| `'tool-input-delta'` | `toolCallId`, `inputTextDelta` | Updates partial input via `parsePartialJson`. |
| `'tool-input-available'` | `toolCallId`, `toolName`, `input`, `dynamic?`, `providerExecuted?`, `title?` | Tool transitions to `state: 'input-available'`. |
| `'tool-input-error'` | `toolCallId`, `toolName`, `input`, `errorText`, `dynamic?` | Tool transitions to `state: 'output-error'` (with `errorText`). |
| `'tool-output-available'` | `toolCallId`, `output`, `dynamic?`, `providerExecuted?`, `preliminary?` | Tool → `state: 'output-available'` carrying `output`. |
| `'tool-output-error'` | `toolCallId`, `errorText`, `dynamic?` | Tool → `state: 'output-error'`. |
| `'tool-approval-request'` | `approvalId`, `toolCallId` | (Unused here.) |
| `'tool-output-denied'` | `toolCallId` | (Unused here.) |
| `'source-url'` | `sourceId`, `url`, `title?`, `providerMetadata?` | Pushes `SourceUrlUIPart`. |
| `'source-document'` | `sourceId`, `mediaType`, `title`, `filename?`, `providerMetadata?` | Pushes `SourceDocumentUIPart`. |
| `'file'` | `url`, `mediaType`, `providerMetadata?` | Pushes `FileUIPart`. |
| `` `data-${NAME}` `` | `id?`, `data`, `transient?` | Pushes `DataUIPart`. (Unused here.) |
| `'message-metadata'` | `messageMetadata` | Merges into `message.metadata`. |
| `'finish-step'` | — | Closes current step. |
| `'finish'` | `finishReason?`, `messageMetadata?` | Closes the message. |
| `'error'` | `errorText` | Surfaces a stream error. |
| `'abort'` | `reason?` | Stream was aborted. |

### Where chunks become parts (client-side reducer)

Source: `frontend/node_modules/ai/dist/index.js:5362` (`processUIMessageStream`) and the switch statement at line 5495+. `useChat` consumes the SSE stream, decodes each `data:` line as a `UIMessageChunk`, and runs this reducer to mutate `state.message.parts`. **By the time the React component sees `messages`, the chunks have already been collapsed into typed `UIMessagePart` objects** — the component never sees `text-delta` directly. It only sees `TextUIPart` with a growing `text` string and a `state` of `'streaming'` or `'done'`.

This means: **the renderer's job is to walk `parts`, dispatch on `part.type`, and present each.** It is not to re-implement the chunk reducer.

### No built-in text extraction helper exists

Verified by grep: there is no `getTextFromMessage`, `messageToText`, or equivalent export in either `ai` or `@ai-sdk/react`. The official documentation pattern (`https://ai-sdk.dev/docs/ai-sdk-ui/chatbot`) shows manual iteration:

```typescript
{message.parts.map((part, index) => {
  if (part.type === 'text') return <span key={index}>{part.text}</span>;
  // ... handle other types
})}
```

The exported helpers from `ai` for this task are the type guards at lines 1970-1992:

- `isTextUIPart(part)`
- `isReasoningUIPart(part)`
- `isFileUIPart(part)`
- `isStaticToolUIPart(part)` — narrows to `ToolUIPart<TOOLS>`
- `isToolUIPart(part)` — narrows to `ToolUIPart<TOOLS> | DynamicToolUIPart` (use this when MCP is in play)
- `isDataUIPart(part)`
- `getToolName(part)` — works for static **and** dynamic
- `getStaticToolName(part)` — only static

The renderer should prefer these over hand-rolled `"text" in p` checks. **A check like `"text" in p` is wrong because both `TextUIPart` and `ReasoningUIPart` have a `text` field — using it leaks reasoning tokens into the rendered answer.**

## Standard Architecture (target for this milestone)

### System Overview

```
+-------------------------------------------------------------------+
|                            BROWSER                                 |
|                                                                    |
|  +----------------+      +------------------+   +---------------+ |
|  |  ChatContainer | ---> | useChat() (v6)   |-->| MessageList   | |
|  |  (input form)  |      |  - status        |   |  (.map msgs)  | |
|  +----------------+      |  - sendMessage   |   +-------+-------+ |
|         |                |  - messages      |           |         |
|         |                |    : UIMessage[] |           v         |
|         |                +--------+---------+   +---------------+ |
|         |                         |             | MessagePart-  | |
|         |                         |             | Renderer      | |
|         |                         |             | (switch type) | |
|         |                         |             +---+---+---+---+ |
|         v                         |                 |   |   |     |
|  POST /api/chat                   |                 v   v   v     |
|         |                         |          +-----+ +-+ +-+     |
|         |                         |          |Text | |R| |Tool|  |
|         |                         |          |Part | |sn| |Inv |  |
|         |                         |          +-----+ +--+ +----+  |
+---------|-------------------------|--------------------------------+
          |                         | SSE: text/event-stream
          |                         |     x-vercel-ai-ui-message-stream: v1
          |                         |     data: {UIMessageChunk}\n\n
          |                         |
          v                         |
+-------------------------------------------------------------------+
|                       NEXT.JS API ROUTE                            |
|  app/api/chat/route.ts                                             |
|                                                                    |
|  +-------------------------+    +--------------------------+      |
|  | convertToModelMessages  |--->| streamText({             |      |
|  |  (UIMessage -> Model)   |    |   model: google(...),    |      |
|  +-------------------------+    |   messages,              |      |
|                                 |   tools: mcpClient       |      |
|  +-------------------------+    |          .tools(),       |      |
|  | createMCPClient (HTTP)  |--->|   system,                |      |
|  |  glluga-law-mcp.fly.dev |    | })                       |      |
|  +-------------------------+    | .toUIMessageStream-      |      |
|                                 |  Response()              |      |
|                                 +--------------------------+      |
+-------------------------------------------------------------------+
                                       |
                                       v
                            +----------------------+
                            | glluga-law-mcp       |
                            | (Fly.io)             |
                            +----------+-----------+
                                       |
                                       v
                            +----------------------+
                            | law.go.kr Open API   |
                            +----------------------+
```

### Component Responsibilities (target split)

| Component | Responsibility | Implementation |
|---|---|---|
| `ChatContainer` | Owns `useChat({id})`, model selection, file attachment, error UI, localStorage sync. **Does not render parts directly.** | Slim coordinator; no `getMessageText`. |
| `MessageList` | Maps `messages: UIMessage[]` to `<MessageBubble>` per item, handles auto-scroll, empty state. | Pure list; receives `messages` from container. |
| `MessageBubble` | Per-message shell (avatar, role, timestamp, favorite button). Delegates body rendering to `MessagePartRenderer`. | Owns layout, not content semantics. |
| `MessagePartRenderer` | **The contract enforcer.** Takes one `UIMessagePart`, switches on `part.type`, dispatches to a child component. Exhaustive (TS `never` check at end). | Single switch statement, well-tested. |
| `TextPartView` | Renders `TextUIPart` via `react-markdown` + `remark-gfm`. Shows blinking cursor when `state === 'streaming'`. | Reuses existing markdown setup. |
| `ReasoningPartView` | Renders `ReasoningUIPart` in a collapsed `<details>` block, prefixed "사고 과정". **Never inlined with text.** | New component. |
| `ToolInvocationView` | Renders both `ToolUIPart` and `DynamicToolUIPart`. Switches on `state` (input-streaming → input-available → output-available/error). Shows tool name (`getToolName(part)`), title if present, args summary, result. | New component. Critical for "툴 호출 UI 피드백" requirement. |
| `FilePartView` | Renders `FileUIPart`; image preview if `mediaType.startsWith('image/')`, otherwise download link. | New component. |
| `SourcePartView` | Renders `SourceUrlUIPart` / `SourceDocumentUIPart` as a citation chip. | Optional in this milestone — Gemini + MCP rarely emits these. |
| `localStorage sync` | Serializes `UIMessage[]` to the legacy `Message{role, content}` shape **only at finish** (when `status === 'ready'`). The `content` string is computed by walking `parts` and joining `TextUIPart.text` only (no reasoning, no tool args). | Lives in `ChatContainer`'s `useEffect`. Backward-compat with existing localStorage entries. |

### Build Order (this is the load-bearing decision)

The current bug is "no model of parts contract." Fixing it requires building the contract first, then everything else flows. **Do not start at the symptom (chat-container.tsx getMessageText).**

1. **Phase A — Parts contract module.** Create `frontend/src/lib/ui-message-parts.ts` exporting:
   - Re-exported type guards (`isTextUIPart`, `isToolUIPart`, etc.) so the rest of the app has a single import surface.
   - `extractAssistantText(message: UIMessage): string` — walks parts, joins only `TextUIPart.text` for `parts` where `state === 'done'` (or any state if you want to show in-progress text). Used by localStorage sync and by export-to-txt.
   - Unit tests against fixture `UIMessage` objects covering: text-only, reasoning+text, tool-call+text, dynamic-tool+text, empty parts, streaming-state text.
   - This is the contract; everything downstream depends on it.
2. **Phase B — `MessagePartRenderer` switch.** Build the exhaustive switch on `part.type`. Use a `never`-default branch so future part types fail TS compile rather than silently disappear. Render text and reasoning first; stub the tool/file/source views.
3. **Phase C — `ToolInvocationView`.** Implement the state machine for `dynamic-tool` (the MCP path). This is the core of the "툴 호출 UI 피드백" Active requirement. Use `getToolName(part)` to display, switch on `part.state`. Map known law tool names (`search_law`, `get_law_text`, `search_decisions`, `get_decision_text`) to friendly Korean labels.
4. **Phase D — Wire `ChatContainer` to use `MessagePartRenderer`.** Delete `getMessageText` inline. Replace with `extractAssistantText` from the contract module for the localStorage sync and export paths only.
5. **Phase E — Streaming UX polish.** Show streaming cursor on `TextUIPart.state === 'streaming'`. Replace the "검색 중..." stub with a real placeholder driven by tool-input-streaming state if any tool part is active.
6. **Phase F — Reasoning + sources.** Add `ReasoningPartView` (collapsed by default). Decide whether to enable `sendSources: true` on `toUIMessageStreamResponse({ sendSources: true })` — Gemini grounding can emit `source-url` parts which are valuable for "신뢰할 수 있는 근거 있는 텍스트" (Core Value).

This order ensures every later piece rests on a verified contract instead of reasonable-looking guesses.

### Recommended File Layout

```
frontend/src/
├── app/
│   └── api/chat/route.ts              # unchanged shape; possibly add sendSources
├── components/chat/
│   ├── chat-container.tsx             # slim: useChat + form + localStorage sync
│   ├── message-list.tsx               # NEW: maps messages -> MessageBubble
│   ├── message-bubble.tsx             # was chat-message.tsx, now part-aware
│   ├── parts/
│   │   ├── message-part-renderer.tsx  # NEW: the switch (entry point)
│   │   ├── text-part-view.tsx         # NEW: markdown + streaming cursor
│   │   ├── reasoning-part-view.tsx    # NEW: collapsible
│   │   ├── tool-invocation-view.tsx   # NEW: state machine UI
│   │   ├── file-part-view.tsx         # NEW: image / download
│   │   └── source-part-view.tsx       # NEW (optional this milestone)
│   ├── tool-labels.ts                 # NEW: tool name -> 한글 label map
│   ├── chat-input.tsx                 # unchanged
│   └── model-selector.tsx             # unchanged
└── lib/
    ├── ui-message-parts.ts            # NEW: type guards, extractAssistantText
    ├── conversations.ts               # unchanged interface; sync uses extractAssistantText
    └── ...
```

### Structure Rationale

- `parts/` subfolder: every part renderer is small and isolated, so the switch in `MessagePartRenderer` stays under 50 lines and exhaustiveness is enforced by TS.
- `ui-message-parts.ts` in `lib/`: pure functions, framework-free, unit-testable. The contract has zero React.
- `tool-labels.ts` separate: easy to add new MCP tools later without touching renderer.
- `chat-container.tsx` shrinks: it owns transport (`useChat`), not presentation. The fact it currently owns both is why the bug was hard to fix.

## Architectural Patterns

### Pattern 1: Discriminated Union + Exhaustive Switch

**What:** Every part has a literal `type` discriminator. Render via a `switch (part.type)` with a `never`-default.

**When:** Always — this is the contract.

**Trade-offs:** More boilerplate than `if ('text' in p)`; in exchange, **adding a new part type in a future SDK upgrade becomes a TS compile error instead of a silent regression**. Given this codebase has already had four failed surface fixes for this exact bug class, the boilerplate is the point.

```typescript
import type { UIMessagePart } from "ai";

function MessagePartRenderer({ part }: { part: UIMessagePart<never, UITools> }) {
  switch (part.type) {
    case "text":          return <TextPartView part={part} />;
    case "reasoning":     return <ReasoningPartView part={part} />;
    case "dynamic-tool":  return <ToolInvocationView part={part} />;
    case "file":          return <FilePartView part={part} />;
    case "source-url":    return <SourcePartView part={part} />;
    case "source-document": return <SourcePartView part={part} />;
    case "step-start":    return null;
    default:
      // Static tool parts have type `tool-${name}`; catch them generically:
      if (part.type.startsWith("tool-")) return <ToolInvocationView part={part} />;
      if (part.type.startsWith("data-")) return null; // unused in this project
      const _exhaustive: never = part as never;
      return null;
  }
}
```

### Pattern 2: Tool Part State Machine UI

**What:** Tool parts carry a `state` that progresses; the UI renders a different sub-view per state.

**When:** Whenever a tool can be visible to the user (always, for this app).

```typescript
function ToolInvocationView({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;

  switch (part.state) {
    case "input-streaming":
      return <ToolBadge label={label} status="준비 중" />;
    case "input-available":
      return <ToolBadge label={label} status="검색 중" args={part.input} />;
    case "output-available":
      return <ToolResult label={label} args={part.input} output={part.output} />;
    case "output-error":
      return <ToolError label={label} message={part.errorText} />;
    default:
      return null; // approval-* states unused
  }
}
```

**Trade-offs:** Adds a tool-aware UI surface to maintain. But it directly fulfills the "툴 호출 UI 피드백" Active requirement and makes the tool-driven nature of the product visible to users (currently invisible).

### Pattern 3: Pure Extraction Function for Persistence

**What:** Persistence (localStorage) and export-to-txt should NOT use React. They should call a pure `extractAssistantText(message)` that walks `parts` and returns a string.

**When:** Any place that needs "the text content" outside of rendering.

```typescript
// frontend/src/lib/ui-message-parts.ts
import type { UIMessage } from "ai";
import { isTextUIPart } from "ai";

export function extractAssistantText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((p) => p.text)
    .join("");
}
```

**Trade-offs:** Two sources of truth (renderer vs extractor), but they share the same contract module so they cannot drift.

## Data Flow

### Request Flow (text-only happy path)

```
User types "근로기준법 연차휴가 알려줘"
        │
        ▼
ChatContainer.handleSubmit
        │
        ▼
useChat.sendMessage({ text }, { body: { modelId } })
        │
        ▼  POST /api/chat   body: { messages: UIMessage[], modelId }
        │
        ▼
route.ts: convertToModelMessages(uiMessages)
        │
        ▼
route.ts: createMCPClient + mcpClient.tools()  // returns dynamicTool wrappers
        │
        ▼
streamText({ model, system, messages, tools })
        │
        ▼  result.toUIMessageStreamResponse()
        │  Headers: text/event-stream + x-vercel-ai-ui-message-stream: v1
        │
        ▼  SSE frames: data: { type: "start" }
        │              data: { type: "start-step" }
        │              data: { type: "text-start", id: "t1" }
        │              data: { type: "text-delta", id: "t1", delta: "근로" }
        │              data: { type: "text-delta", id: "t1", delta: "기준법..." }
        │              data: { type: "text-end", id: "t1" }
        │              data: { type: "finish-step" }
        │              data: { type: "finish", finishReason: "stop" }
        │              data: [DONE]
        │
        ▼
useChat (client) processUIMessageStream reducer:
  - "start" -> create empty UIMessage
  - "text-start" -> push TextUIPart{ text: "", state: "streaming" }
  - "text-delta" -> append delta to text part
  - "text-end" -> mark text part state: "done"
  - "finish" -> finalize message
        │
        ▼
React re-renders messages on each chunk
        │
        ▼
MessageList -> MessageBubble -> MessagePartRenderer
        │                              │
        │                              ▼
        │                       switch (part.type)
        │                              │
        │                              ▼
        │                       case "text": TextPartView
        │                              │
        │                              ▼
        │                       react-markdown(part.text)
        │
        ▼ (after status === "ready")
ChatContainer effect:
  mapped = messages.map(m => ({ id, role, content: extractAssistantText(m) }))
  onMessagesChange(mapped) -> localStorage
```

### Request Flow (with tool call)

```
... (same up through streamText) ...
        │
        ▼  SSE frames:
        │  data: { type: "start" }
        │  data: { type: "start-step" }
        │  data: { type: "tool-input-start", toolCallId: "tc1",
        │          toolName: "search_law", dynamic: true }
        │  data: { type: "tool-input-delta", toolCallId: "tc1",
        │          inputTextDelta: "{\"query\":\"" }
        │  data: { type: "tool-input-delta", toolCallId: "tc1",
        │          inputTextDelta: "근로기준법\"}" }
        │  data: { type: "tool-input-available", toolCallId: "tc1",
        │          toolName: "search_law", input: {query:"근로기준법"}, dynamic: true }
        │  ── (tool executes server-side via MCP) ──
        │  data: { type: "tool-output-available", toolCallId: "tc1",
        │          output: { laws: [...] }, dynamic: true }
        │  data: { type: "finish-step" }
        │  data: { type: "start-step" }
        │  data: { type: "text-start", id: "t1" }
        │  data: { type: "text-delta", id: "t1", delta: "근로기준법..." }
        │  ... (text continues) ...
        │  data: { type: "finish" }
        │
        ▼
useChat reducer mutates:
  message.parts = [
    { type: "dynamic-tool", toolName: "search_law", state: "input-streaming", input: undefined },
    { type: "dynamic-tool", toolName: "search_law", state: "input-streaming", input: { query: "근..." } },
    { type: "dynamic-tool", toolName: "search_law", state: "input-available", input: { query: "근로기준법" } },
    { type: "dynamic-tool", toolName: "search_law", state: "output-available", input: ..., output: { laws: [...] } },
    { type: "text", text: "근로기준법...", state: "streaming" },
    ...
  ]
        │
        ▼
MessagePartRenderer switches per part:
  - dynamic-tool, state=input-streaming  -> "준비 중: 법령 검색"
  - dynamic-tool, state=input-available  -> "검색 중: 근로기준법"
  - dynamic-tool, state=output-available -> "✓ 검색 완료" (collapsed result)
  - text                                  -> markdown render of answer
```

The tool part is **not separate** from the assistant message — it lives **in the same message's parts array**, ordered before the text part. This is the in-line tool feedback the Active requirements ask for; the ordering comes for free.

### State Management

```
useChat() (client-side state, in-memory)
        │
        │ subscribes
        ▼
ChatContainer renders
        │
        │ on status === 'ready'
        ▼
extractAssistantText(message) -> string
        │
        ▼
onMessagesChange(mappedMessages) -> page.tsx -> updateConversation()
        │
        ▼
localStorage (Conversation { id, title, messages: { id, role, content }, ... })
```

`useChat` is the source of truth during streaming. localStorage is a snapshot taken on transition to `ready`. The legacy `Message` shape (`{role, content: string}`) is kept for backward-compat — old saved conversations still render — but the bridge is `extractAssistantText`, not a parts-array dump.

### Key Data Flows

1. **Live streaming flow:** SSE chunks → `processUIMessageStream` reducer → `useChat.messages` mutation → React re-render of `MessagePartRenderer`. The renderer never sees raw chunks; only typed parts.
2. **Persistence flow:** `useChat.messages` → `extractAssistantText` (text-only) → legacy `Message[]` → `localStorage`. Lossy by design (drops tool calls, reasoning, files) — these are not needed for re-rendering historical conversations as text.
3. **Replay flow (load from localStorage):** `localStorage` → `Conversation.messages: Message[]` → `initialMessages` prop on `ChatContainer`. **Currently broken-by-design**: `useChat` does not accept legacy `Message[]`; it expects `UIMessage[]`. This needs investigation in the milestone — either a one-time migration shim that wraps `{role, content}` into `{role, parts: [{type: 'text', text: content}]}`, or pass `initialMessages` to `useChat({messages: ...})` in the right shape.

## Scaling Considerations

This is an internal tool for ~10s of users. Scaling is not the issue. However:

| Scale | Architecture Adjustments |
|---|---|
| 0-50 internal users (now) | Current architecture is fine. Focus on correctness. |
| 50-500 users | Move conversation storage off localStorage to server DB (out of scope this milestone — already in PROJECT.md Out of Scope). Add SSE keepalive monitoring. |
| 500+ users | Replace Vercel free tier (60s timeout) with persistent worker. Add a job queue for long MCP calls. Consider edge runtime. |

### Scaling Priorities

1. **First bottleneck: 60s Vercel timeout.** When a Gemini call needs multiple tool rounds against a slow law.go.kr, total wall time exceeds 60s and the connection drops mid-stream. Manifests as truncated assistant message. Mitigation in this milestone: error UX + retry. Real fix: paid Vercel tier or self-hosted runtime.
2. **Second bottleneck: MCP server cold starts on Fly.io.** First request after idle takes 5-10s. Mitigation: keep the MCP server warm with a periodic ping, OR show a "법령 검색 서버 깨우는 중" spinner instead of just "검색 중".

## Anti-Patterns

### Anti-Pattern 1: `"text" in p` / `"key" in p` checks on union types

**What people do:** `if ("text" in p) texts.push(p.text)` — relying on duck-typing instead of the discriminator.

**Why it's wrong:** Both `TextUIPart` and `ReasoningUIPart` have a `text` field. This check leaks reasoning tokens into the rendered answer, **and worse**, when AI SDK adds a new part type in a future minor version that also happens to have a `text` field, the bug surface grows silently. This is the existing bug.

**Do this instead:** Always switch on `part.type`. Use `isTextUIPart(part)` from `ai` if you need a single-purpose extraction. Make the renderer's switch statement exhaustive with a `never` default so adding new part types becomes a TS compile error.

### Anti-Pattern 2: Treating `UIMessage` as if it had a `content` field

**What people do:** `message.content`, `message.text`, etc.

**Why it's wrong:** AI SDK 6's `UIMessage` (verified at `node_modules/ai/dist/index.d.ts:1659`) **only** has `id`, `role`, `metadata?`, and `parts`. There is no `content`. Code that reads `m.content` is reading `undefined`.

**Do this instead:** Always go through `parts`. Use `extractAssistantText(message)` from the contract module when you need a string.

### Anti-Pattern 3: Listening for `tool-${name}` only, ignoring `dynamic-tool`

**What people do:** `if (part.type === "tool-search_law") { ... }`.

**Why it's wrong:** `mcpClient.tools()` returns `dynamicTool(...)` wrappers (verified at `@ai-sdk/mcp/dist/index.js:1985`), so MCP-sourced tool calls always come through as `part.type === "dynamic-tool"` with `part.toolName === "search_law"` — never as `tool-search_law`. A renderer that only matches static `tool-` literals will silently miss every tool invocation in this app.

**Do this instead:** Use `isToolUIPart(part)` (which matches both static and dynamic) and `getToolName(part)` to read the name, regardless of static/dynamic origin. Or: pass an explicit `tools` argument to `useChat<UIMessage<unknown, UIDataTypes, MyTools>>()` AND switch MCP to `schemas: 'manual'` mode so they become static — but that's a bigger refactor and not necessary for this milestone.

### Anti-Pattern 4: Persisting parts as JSON to localStorage

**What people do:** `localStorage.setItem(..., JSON.stringify(messages))` directly with the parts array.

**Why it's wrong:** AI SDK part shapes can change between minor versions. The localStorage entry becomes a versioned binary that future SDK upgrades may not understand. Also, the legacy app already has a `{role, content}` schema in `Message` — breaking it would lose backward compat for users' existing saved conversations.

**Do this instead:** Project parts down to `{role, content: extractAssistantText(message)}` on save. Lossy by design. Reload-render goes through the same path so the experience is consistent.

### Anti-Pattern 5: Doing localStorage save inside the streaming `useEffect`

**What people do:** `useEffect(() => { onMessagesChange(messages) }, [messages])` — fires on every chunk.

**Why it's wrong:** Causes re-renders, write amplification, and (in the current code) a check `if (status !== "streaming") onMessagesChange(mapped)` that is fragile to status transitions. Also, the current code's `prevLenRef` short-circuit is brittle — when status changes from `streaming` to `ready` without `messages.length` changing, the save can be skipped.

**Do this instead:** Save on the explicit transition `status === "ready" && hadInProgress`, or use the `onFinish` callback exposed by `useChat`'s underlying `Chat` class. Move localStorage out of the render path entirely.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| `glluga-law-mcp.fly.dev` | HTTP MCP via `createMCPClient({ transport: { type: "http", url } })`, then `await mcpClient.tools()` — returns `dynamicTool(...)` wrappers automatically. | Lazy init, graceful degradation if connection fails. **Always emits `dynamic-tool` parts to the UI.** Cold-start delay is the first user-facing pain. |
| Gemini via `@ai-sdk/google` | `google("gemini-2.5-flash")` passed as `model` to `streamText`. | Provider may emit reasoning tokens depending on model. Default `sendReasoning: true` means they reach the client; the renderer must handle `reasoning` parts deliberately. |
| Vercel SSE delivery | `result.toUIMessageStreamResponse()` returns a `Response` with the SSE headers. Vercel runtime streams it natively. | 60s ceiling on free tier; `maxDuration = 60` set in route. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `route.ts` ↔ `chat-container.tsx` | HTTP POST + SSE. Body shape `{ messages: UIMessage[], modelId }`. Response is the AI SDK 6 UI Message Stream v1. | Don't add custom fields to the SSE — use `data-*` parts if needed. |
| `chat-container.tsx` ↔ `MessagePartRenderer` | Pass `messages: UIMessage[]` down. Container is transport, renderer is presentation. | This split is the missing structural change. |
| `MessagePartRenderer` ↔ `lib/ui-message-parts.ts` | Type-only import (`UIMessagePart`) + helper imports (`isTextUIPart` re-exports). | Contract module has zero React deps. |
| `chat-container.tsx` ↔ `lib/conversations.ts` | Calls `extractAssistantText` to convert parts → legacy `Message[]` for save/load. | Backward-compat boundary. |
| Old saved `Message[]` ↔ `useChat.messages` (UIMessage[]) | One-way migration: wrap `{role, content}` into `{role, parts: [{type: "text", text: content}]}` when loading. | Needs to be implemented this milestone if conversation replay is in scope. |

## Sources

**Primary (HIGH confidence — verified against actual installed source):**

- `frontend/node_modules/ai/dist/index.d.ts` lines 1637-1684 — `UIMessage`, `UIMessagePart` union, `UIDataTypes`, `UITools`
- `frontend/node_modules/ai/dist/index.d.ts` lines 1688-1772 — `TextUIPart`, `ReasoningUIPart`, `SourceUrlUIPart`, `SourceDocumentUIPart`, `FileUIPart`, `StepStartUIPart` shapes
- `frontend/node_modules/ai/dist/index.d.ts` lines 1773-1879 — `DataUIPart`, `UIToolInvocation` state machine, `ToolUIPart`, `DynamicToolUIPart`
- `frontend/node_modules/ai/dist/index.d.ts` lines 1970-2009 — type guards `isTextUIPart`, `isReasoningUIPart`, `isFileUIPart`, `isStaticToolUIPart`, `isToolUIPart`, `isDataUIPart`, `getToolName`, `getStaticToolName`
- `frontend/node_modules/ai/dist/index.d.ts` lines 2159-2277 — `UIMessageChunk` discriminated union (every wire event)
- `frontend/node_modules/ai/dist/index.d.ts` lines 2592, 2305-2380 — `toUIMessageStreamResponse` signature + `UIMessageStreamOptions` (sendReasoning, sendSources, sendFinish, sendStart)
- `frontend/node_modules/ai/dist/index.js` lines 5082-5105 — `JsonToSseTransformStream` and `UI_MESSAGE_STREAM_HEADERS` (proves SSE wire format and headers)
- `frontend/node_modules/ai/dist/index.js` lines 5362, 5495-5800 — `processUIMessageStream` reducer (proves how chunks become parts client-side)
- `frontend/node_modules/ai/dist/index.js` lines 3810-3852 — `doParseToolCall` (`tool2.type === "dynamic"` routing)
- `frontend/node_modules/@ai-sdk/mcp/dist/index.js` lines 1985-2003 — `mcpClient.tools()` returns `dynamicTool({...})` for every MCP tool
- `frontend/node_modules/@ai-sdk/react/dist/index.d.ts` lines 13-39 — `useChat`, `UseChatHelpers` (returns `UIMessage[]`, no built-in text helper)

**Secondary (MEDIUM confidence — official docs):**

- `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot` — Recommended `parts.map((part, index) => ...)` rendering pattern with explicit `part.type === 'text'` switching
- `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage` — Tool part naming convention `tool-${toolName}` for static, `dynamic-tool` for dynamic; state machine `input-streaming` → `input-available` → `output-available` / `output-error`

**Existing project context:**

- `.planning/PROJECT.md` — Active requirement: rebuild `getMessageText` against verified `UIMessage.parts` shape; tool call UI feedback requirement; backward-compat constraint for localStorage
- `.planning/codebase/ARCHITECTURE.md` — Existing brownfield architecture analysis (this document refines the AI SDK layer)
- `frontend/src/app/api/chat/route.ts` — Current server implementation (correct: uses `convertToModelMessages`, `streamText`, `toUIMessageStreamResponse`)
- `frontend/src/components/chat/chat-container.tsx:158-167` — The buggy `getMessageText` (uses `"text" in p`, no discriminator check, no part-type model)

---
*Architecture research for: AI SDK 6 streaming chat with MCP dynamic tools (Korean Law Bot, Next.js 16 / React 19 / `ai@6.0.158` / `@ai-sdk/react@3.0.160` / `@ai-sdk/mcp@1.0.36`)*
*Researched: 2026-04-13*
