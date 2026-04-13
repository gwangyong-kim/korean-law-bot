# Pitfalls Research

**Domain:** AI streaming chat with tool calls — Next.js 16 App Router + AI SDK 6 + `@ai-sdk/google` (Gemini 2.5 Flash) + `@ai-sdk/mcp` over remote HTTP MCP, deployed to Vercel serverless (60s).
**Researched:** 2026-04-13
**Confidence:** HIGH on items 1-4 (direct source code + multiple corroborating community/issue hits). MEDIUM on items 5-9. LOW where flagged inline.

> **TL;DR for the bug team.** The "empty card" bug almost certainly is **not** in `getMessageText()`. It is in the route handler. There are two server-side root causes that compound, and `route.ts` exhibits BOTH:
>
> 1. `streamText({...})` is called WITHOUT `stopWhen`. In AI SDK 6 the default is `stepCountIs(1)`. After Gemini emits a tool call as step 1, the run terminates. There is no second LLM call to write the answer. The assistant message ends up containing only `tool-*` parts, zero `text` parts. The client correctly extracts text → empty string → empty card.
> 2. `mcpClient.close()` is in a `finally` block immediately after `return result.toUIMessageStreamResponse()`. Because `streamText` is *lazy* and the stream is consumed *after* the handler function returns, `finally` fires while the stream is still active. The transport is killed mid-stream → tool-result chunks may never arrive, the loop (if you fix #1) cannot continue, and you get `NS_BASE_STREAM_CLOSED` / hung streams in the wild.
>
> Both bugs are independently sufficient to cause "empty card." Both must be fixed. Skip the client-side `getMessageText` rewrite that the previous 4 commits chased — it was the wrong layer.

---

## Critical Pitfalls

### Pitfall 1: `streamText` default is `stopWhen: stepCountIs(1)` — model never speaks after a tool call

**What goes wrong:**
You pass `tools` to `streamText`, the model decides to call a tool, the tool runs, the chunk stream emits `tool-input-available` → `tool-output-available` → `finish-step` → `finish`. The assistant `UIMessage.parts` array contains a `tool-*` part with `state: 'output-available'` and **zero** `TextUIPart` entries. On the client, `m.parts.filter(p => p.type === 'text')` is empty. `getMessageText()` returns `""`. `<ChatMessage content="" />` renders as an empty card. The user sees nothing.

This is exactly the production symptom and exactly what `route.ts` will produce on every query that hits a law tool — which, given the system prompt's "절대 도구 호출 없이 답변 금지" rule, is **every meaningful query**.

**Why it happens:**
AI SDK 6 changed (or kept ambiguous from v5) the default. In `node_modules/ai/dist/index.d.ts:2829` the JSDoc on `streamText` reads literally:

```ts
/**
 * Condition for stopping the generation when there are tool results in the last step.
 * When the condition is an array, any of the conditions can be met to stop the generation.
 *
 * @default stepCountIs(1)
 */
stopWhen?: StopCondition<NoInfer<TOOLS>> | Array<StopCondition<NoInfer<TOOLS>>>;
```

`stepCountIs(1)` means: after the first LLM step completes — even if that step's only output was a tool call — stop. Do not feed the tool result back. Do not generate a final natural-language answer. By contrast, `Agent` / `ToolLoopAgent` defaults to `stepCountIs(20)` (line 3275) which is what gives those agent classes the "just works" feel that misleads developers.

The previous v4 contract used `maxSteps`/`maxToolRoundtrips`. Code (and Claude's training data) ported from v4 by replacing function names but not adding `stopWhen` will silently degrade to single-step.

**Evidence:**
- AI SDK 6 source: `frontend/node_modules/ai/dist/index.d.ts` line 2829 (`@default stepCountIs(1)`).
- Vercel community thread "Vercel AI SDK returns empty text after MCP tool call resolution" — Jacob Paris (Vercel) confirms: "Tool calls store their output in the tool result and won't usually have a `.text` field, unless you've explicitly requested it." See [community.vercel.com/t/14333](https://community.vercel.com/t/vercel-ai-sdk-returns-empty-text-after-mcp-tool-call-resolution/14333).
- Vercel community thread "streamText terminates after tool call when using MCP tools with toUIMessageStreamResponse" — same symptom, same stack. See [community.vercel.com/t/34622](https://community.vercel.com/t/streamtext-terminates-after-tool-call-when-using-mcp-tools-with-touimessagestreamresponse/34622).
- AI SDK reference docs: [ai-sdk.dev streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), [Multi-Step & Generative UI](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui), [Next.js: Call Tools in Multiple Steps](https://ai-sdk.dev/cookbook/next/call-tools-multiple-steps).
- AI SDK 6 launch blog confirms `ToolLoopAgent` defaults to `stepCountIs(20)`: [vercel.com/blog/ai-sdk-6](https://vercel.com/blog/ai-sdk-6).

**How to avoid (concrete fix for `frontend/src/app/api/chat/route.ts`):**

```ts
import { streamText, stepCountIs, convertToModelMessages } from "ai";

const result = streamText({
  model: google(selectedModel),
  system: SYSTEM_PROMPT,
  messages,
  tools,                          // empty {} is fine; falsy spread fine too
  stopWhen: stepCountIs(8),       // <-- THIS IS THE FIX
  // 8 is conservative for legal queries: typically 1 search → 1 fetch → answer.
  // Cap at 8 so we never exceed Vercel's 60s budget on pathological loops.
  onError: ({ error }) => console.error("[chat] streamText error:", error),
});
```

Notes:
- `stepCountIs` is imported from `"ai"` (top-level). Do not try `from "ai/core"`.
- Do **not** use `experimental_continueSteps` or `maxSteps` — those are v4-era and either gone or moved.
- 8 is a deliberate budget. Each round-trip = LLM round-trip latency × 2 + MCP latency. With Gemini 2.5 Flash + Fly.io MCP + 60s ceiling, ~8 is the safe upper bound. Start at 5 if you want headroom.

**Warning signs:**
- `messages[i].parts` contains `type: "tool-*"` parts with `state: "output-available"` but **zero** `type: "text"` parts after the tool ones.
- Network tab shows `tool-output-available` chunk followed immediately by `finish-step` then `finish` (no `text-start` in between).
- Server log shows `finishReason: "tool-calls"` instead of `finishReason: "stop"`.
- The chat works *only* for "안녕" / non-legal small talk where the model doesn't call a tool.

**Phase to address:** **Phase 1 — Empty Message Bug Fix.** This is the primary blocker. Ship this first, before any other work in the milestone.

---

### Pitfall 2: `mcpClient.close()` in `finally` block fires before the stream consumes — kills the transport mid-stream

**What goes wrong:**
The current code:

```ts
try {
  const result = streamText({ ... });
  return result.toUIMessageStreamResponse();
} finally {
  if (mcpClient) await mcpClient.close();
}
```

`streamText` is **lazy**. It returns a `StreamTextResult` whose internal `ReadableStream` only begins producing chunks when something pulls on it. The thing that pulls on it is the Response body that Next.js / Vercel reads after the handler returns. But `finally` runs **before** the function actually returns to Next.js — JavaScript executes `finally` synchronously after `return` is evaluated and *before* the return value is propagated. So:

1. `streamText({...})` executes (synchronous setup, no LLM call yet).
2. `result.toUIMessageStreamResponse()` constructs the Response (still no LLM call).
3. `return` evaluates the Response object.
4. `finally` runs → `mcpClient.close()` → transport disconnected.
5. Next.js starts streaming the Response body → tries to pull chunks → first LLM call goes out → model calls tool → tool execution function tries to invoke the MCP tool **but the transport is dead** → tool errors out → stream emits `tool-output-error` or just terminates → `finishReason: "error"` or `NS_BASE_STREAM_CLOSED` browser-side.

This is **independently** sufficient to produce empty cards even after fixing Pitfall 1. Fixing only `stopWhen` and leaving the `finally` will still break.

**Why it happens:**
- Developers reach for `try`/`finally` for cleanup. It's correct for `generateText` (non-streaming). It is **wrong** for `streamText`.
- The migration from `experimental_createMCPClient` to `createMCPClient` changed transport lifetime semantics: the old experimental client held the transport in module-scope; the new one ties it to the client instance, which becomes GC-eligible the moment the handler returns. The community thread [#34622](https://community.vercel.com/t/streamtext-terminates-after-tool-call-when-using-mcp-tools-with-touimessagestreamresponse/34622) is exactly this regression.
- Documentation is unclear: the [MCP cookbook](https://ai-sdk.dev/cookbook/next/mcp-tools) and [reference](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) show the `onFinish` pattern but the older `try`/`finally` pattern still appears in older blog posts that AI assistants quote.

**How to avoid (concrete fix):**

```ts
const result = streamText({
  model: google(selectedModel),
  system: SYSTEM_PROMPT,
  messages,
  tools,
  stopWhen: stepCountIs(8),
  onFinish: async () => {
    try { await mcpClient?.close(); } catch (e) { console.error("mcp close:", e); }
  },
  onError: async ({ error }) => {
    console.error("[chat] streamText error:", error);
    try { await mcpClient?.close(); } catch {}
  },
});

// Critical: also close on client-disconnect/abort. onFinish is NOT called
// when the user clicks stop or navigates away; you need consumeSseStream:
return result.toUIMessageStreamResponse({
  consumeSseStream: async ({ stream }) => {
    // forces stream to drain even on abort, so onFinish runs
    for await (const _ of stream) { /* drain */ }
  },
});

// DO NOT WRAP THE RETURN IN try/finally THAT CALLS close().
```

Better yet — to keep MCP setup outside the streaming path entirely — initialize the client and tools **before** `streamText`, and pass a closure to `onFinish` that captures `mcpClient`. That is what the snippet above already does. Just delete the surrounding `try { ... } finally { mcpClient.close() }`.

The `consumeSseStream` piece comes from the official troubleshooting note: see [ai-sdk.dev troubleshooting/stream-abort-handling](https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling) and GitHub [vercel/ai#6699](https://github.com/vercel/ai/issues/6699). Without it, hitting "stop" in the UI orphans the MCP connection and leaks Fly.io sessions, which then triggers the 503 "Max sessions" error you already special-case.

**Warning signs:**
- Production logs show `MCPClientError`, `transport closed`, `NS_BASE_STREAM_CLOSED`, or `ERR_HTTP2_PROTOCOL_ERROR` between tool-call and tool-result.
- MCP server (`glluga-law-mcp.fly.dev`) reports many short-lived sessions or "Max sessions" 503s.
- `onFinish` callback never fires (add a `console.log` to verify) → you're leaking clients.
- `result.usage` shows zero output tokens despite Gemini being called.

**Phase to address:** **Phase 1 — Empty Message Bug Fix.** Same fix commit as Pitfall 1. Do not split.

---

### Pitfall 3: Message-part type-guard uses `"text" in p` — survives stale parts but masks the real failure

**What goes wrong:**
The current `getMessageText` (lines 158-167) is:

```ts
function getMessageText(m): string {
  if (!m.parts || m.parts.length === 0) return "";
  const texts: string[] = [];
  for (const p of m.parts) {
    if ("text" in p && typeof (p as any).text === "string") {
      texts.push((p as any).text);
    }
  }
  return texts.join("");
}
```

This is *not actually wrong* for the empty-card bug. It correctly extracts text from `TextUIPart` (which has `type: 'text'` + `text: string`, see `index.d.ts:1688`) and is robust against `ReasoningUIPart` (also has `text` — accidentally captured!) and tool parts (no `text` field).

But it has **two** real problems that contributed to the "4 fix commits, none worked" pattern:

1. **It picks up reasoning text.** `ReasoningUIPart` (line 1706) also has `text: string`. If a model ever streams reasoning, you'll concatenate the model's chain-of-thought into the visible answer. Gemini 2.5 Flash with thinking enabled WILL do this. Today this appears to "help" (you get *some* text back) but it's wrong content and will look bizarre once Pitfall 1 is fixed and real text parts arrive.
2. **No assertion that `m.role === "assistant"`.** Tool-result parts only attach to assistant messages; `m.parts` on user messages contains text + file parts. Mixing them in the same extractor masks bugs.

The reason 4 fixes failed is not that this function is broken — it's that **there are no text parts to extract**. The fix is server-side (Pitfalls 1 + 2). After that, this function still needs hardening.

**Why it happens:**
- AI SDK 6's `UIMessagePart` is a discriminated union with 9 variants (`TextUIPart | ReasoningUIPart | ToolUIPart | DynamicToolUIPart | SourceUrlUIPart | SourceDocumentUIPart | FileUIPart | DataUIPart | StepStartUIPart` — see `index.d.ts:1684`). `"text" in p` is a structural check, not a type narrowing on `type === 'text'`.
- The SDK already exports `isTextUIPart`, `isReasoningUIPart`, `isToolUIPart` (lines 1970-1992). Use those.

**How to avoid:**

```ts
import { isTextUIPart } from "ai";

function getAssistantText(m: UIMessage): string {
  if (m.role !== "assistant") return "";
  return m.parts.filter(isTextUIPart).map(p => p.text).join("");
}
```

For user messages (export feature, line 143), use a separate extractor that knows about `FileUIPart`.

Also: stop duplicating this function. There are two copies — `chat-container.tsx:158` and `test-sidebar/page.tsx:10`. Move to `frontend/src/lib/message-utils.ts` and import. (Already flagged in CONCERNS.md.)

**Warning signs:**
- Reasoning text leaking into displayed answer ("Let me think about this... 사용자가 묻고 있는 것은...").
- Different display behavior between `/chat` and `/test-sidebar`.
- Type errors disappearing only after `as any` casts — sign of weak narrowing.

**Phase to address:** **Phase 1 — Empty Message Bug Fix** (do it in the same commit so client and server are consistent), with the dedup/extract-utility cleanup deferrable to a later phase if time-boxed.

---

### Pitfall 4: Storing `getMessageText(m)` flat strings in localStorage loses tool-call structure forever

**What goes wrong:**
At `chat-container.tsx:72-76`:

```ts
const mapped: Message[] = messages.map((m) => ({
  id: m.id,
  role: m.role,
  content: getMessageText(m),  // <-- collapses parts to a string
}));
```

This is the persistence path → `localStorage` → `Message` interface in `lib/conversations.ts`. After save/restore:
- Tool calls are gone. The next render of a restored conversation has `content: "..."` only.
- Reasoning is gone (good).
- File attachments are gone.
- Source URLs/citations are gone.

This is a **silent data loss**, and it's permanent — there is no way to reconstruct the tool-call trace. For a *legal* assistant where the entire value proposition is "trustable citations from law.go.kr", losing the source/tool-result trail is unacceptable for any future feature like "click to expand sources" or audit logging.

It also creates a **conversion impedance** when restoring: `initialMessages` (flat `Message[]`) vs `useChat`'s `messages` (`UIMessage[]` with `parts`) are different shapes, so you can't seed `useChat` from history without another transformation. Today the code papers over this by keeping `useChat`'s `messages` separate from `initialMessages` and only displaying the live ones — meaning **restored conversations literally do not display past assistant turns through `<ChatMessage>` properly**. (Verify: cold-load a conversation from sidebar, observe whether tool-call UIs are present. Likely they aren't — and post-fix, that gap will become visible.)

**Why it happens:**
- Convenience. A flat `string` is easy to render with markdown.
- Backward-compat with the pre-AI-SDK-6 message shape.
- The `Message` type in `lib/conversations.ts` was designed before the `parts`-based model existed.

**How to avoid:**
Two options, in order of correctness:

1. **Persist the full `UIMessage` array** (preferred). Replace the `Message` interface with `Pick<UIMessage, 'id' | 'role' | 'parts' | 'metadata'>`. Use AI SDK's own JSON-safe serialization. This preserves tool calls, sources, and is forward-compatible.

2. **Keep flat `content` for display, persist `parts` separately** as a sibling field. More surface area but easier to ship.

Either way, write a **migration** for existing localStorage data — read old `{role, content}` records, wrap them into a single `TextUIPart`. A one-shot read-time migration is fine since the data is per-browser.

⚠️ Heads up: the `convertToModelMessages` known issues (#8061 `providerExecuted: null`, #9731 `providerMetadata` leak) bite if you JSON-serialize and reparse `UIMessage[]`. Strip transient/provider metadata before saving:

```ts
const sanitize = (parts) => parts.map(({ providerMetadata, providerExecuted, ...rest }) => rest);
```

See [vercel/ai#8061](https://github.com/vercel/ai/issues/8061), [vercel/ai#9731](https://github.com/vercel/ai/issues/9731), [vercel/ai#9968](https://github.com/vercel/ai/issues/9968), [vercel/ai#8431](https://github.com/vercel/ai/issues/8431).

**Warning signs:**
- After `/gsd` Phase 1 ships, restored conversations look "normal" but have no tool-call trace.
- A bug report comes in: "I exported a chat and the citations are missing."
- Type error: `Type 'Message' is not assignable to UIMessage`.
- localStorage size grows quickly (UIMessages have larger payloads) — also a concern given the 5-10MB limit flagged in CONCERNS.md.

**Phase to address:** **Phase 4 — Conversation Persistence Stabilization.** Don't block Phase 1 on this; ship the bug fix first. But Phase 4 must include a localStorage schema migration plan. If Phase 4 gets dropped per the milestone's "if scope tight, drop #4" rule, **at minimum** add a TODO-marker so future work sees the data loss.

---

### Pitfall 5: `convertToModelMessages` round-trips lose `providerMetadata` / `thought_signature` → Gemini 400 on multi-turn

**What goes wrong:**
Gemini 2.5 Flash with function calling attaches `thought_signature` to the first tool-call part of every parallel batch. The AI SDK stores this in `providerMetadata` on the `ToolUIPart`. When you round-trip through your client (and especially through localStorage with the flat-content lossy save in Pitfall 4), or through `convertToModelMessages`, the signature can be dropped or — per `convertToModelMessages` bug #9731 — wrongly converted to `providerOptions` for text parts.

Result: on the **next** user turn in the same conversation, you POST a history that contains tool-call/tool-result parts without the signature. Gemini's API rejects with HTTP 400: *"Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly."* Single-turn works. Multi-turn breaks.

This is documented: [Gemini API thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures), and confirmed in [vercel/ai#11413](https://github.com/vercel/ai/issues/11413) (Gemini 3 manifests it the worst, but 2.5 Flash with thinking is also affected).

**Why it happens:**
- Gemini's stateful chain-of-thought signing requires that the exact serialized signature be returned to Google in the same position on subsequent requests.
- AI SDK developers (and Claude's training) treat `providerMetadata` as opaque/ignorable. It is NOT for Gemini.
- `convertToModelMessages` issue #9731 actively corrupts it on text parts.

**How to avoid:**
1. **Do not strip `providerMetadata` from tool parts** when persisting/restoring. (You may strip from text parts to dodge #9731.)
2. **Pin `@ai-sdk/google` and `ai`** to known-good minor versions. Both have caret ranges in `package.json` (`^3.0.62`, `^6.0.158`). At a minimum, run `npm ls ai @ai-sdk/google` after any dep update and re-test multi-turn tool calls.
3. **Smoke test multi-turn**: send 3 sequential tool-using questions in the same conversation. If turn 2 or 3 errors with `400 thought_signature`, you've regressed.
4. **Alternative**: add `providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } }` to disable Gemini thinking, which sidesteps signatures entirely. Trade-off: lower answer quality on hard legal reasoning. For an MVP shipped to internal users this is acceptable; revisit later.

**Warning signs:**
- First turn works, second turn errors with 400 from Google.
- Error text contains "thought_signature".
- Test page (`/test-sidebar`) — which uses fresh `useChat()` per session — works, but real conversations restored from sidebar fail.

**Phase to address:** **Phase 2 — Streaming Stability.** Add the smoke test to manual QA. Decide on `thinkingBudget: 0` opt-out vs preserving signatures. Also add to **Phase 4** when designing localStorage schema.

---

### Pitfall 6: MCP `tools()` is fetched on every request — cold-start latency, session leaks, and 60s-clock burn

**What goes wrong:**
Every POST to `/api/chat` does:
1. `createMCPClient({ transport: { type: "http", url: ... } })` — TCP/TLS + initialize handshake to Fly.io.
2. `await mcpClient.tools()` — list-tools RPC.
3. ... only then does `streamText` start.
4. After response, `mcpClient.close()`.

On Vercel serverless cold start that's 200-800ms of pure setup before the first token. With `icn1` (Seoul) → Fly.io (region depends on deploy) it can be much worse. That setup time eats the 60s budget. And every POST = a new MCP session, which is exactly why the team is hitting "Max sessions" 503s on the Fly.io free tier.

There is **no** caching of the tool schema and **no** connection reuse.

**Why it happens:**
- The "stateless serverless" mental model says reinitialize everything per request. But `tools()` returns static schemas — it does not need to be refetched per call.
- Vercel Functions DO support module-scope persistence across warm invocations (the lambda container can be reused). The pattern is to lazy-init at module scope and let it survive between requests.

**How to avoid:**
1. **Cache the tool schema** at module scope:

   ```ts
   let toolsCache: Awaited<ReturnType<MCPClient['tools']>> | null = null;
   let toolsCacheAt = 0;
   const TOOLS_TTL_MS = 5 * 60 * 1000;

   async function getToolsAndClient() {
     const fresh = Date.now() - toolsCacheAt < TOOLS_TTL_MS;
     const client = await createMCPClient({ transport: { type: "http", url: getMcpUrl() } });
     if (!fresh) {
       toolsCache = await client.tools();
       toolsCacheAt = Date.now();
     }
     return { client, tools: toolsCache! };
   }
   ```

   You still create a new client per request (HTTP transport sessions are short-lived by Fly.io's design), but you skip the `tools()` round-trip on warm invocations.

2. **Add explicit timeout** on `createMCPClient` so a Fly.io brown-out doesn't burn the entire 60s budget:

   ```ts
   const mcpClient = await Promise.race([
     createMCPClient({ transport: { type: "http", url: getMcpUrl() } }),
     new Promise((_, rej) => setTimeout(() => rej(new Error("MCP connect timeout")), 5000)),
   ]);
   ```

3. **Document Fly.io session limits** somewhere visible. The 503 path in `route.ts` already catches "Max sessions" — extend the message to tell the user "잠시 후 다시" with an actual retry-after delay.

4. **Long-term**: deploy MCP as a sidecar / on Vercel itself, or at minimum pin Fly to Tokyo (`nrt`) for shortest hop from `icn1`.

**Warning signs:**
- Time-to-first-token > 2 seconds even on warm requests.
- Spikes of `503 Max sessions` errors when a single user sends two messages in a row.
- 60s timeout hits on legitimate queries.
- `console.error("MCP 연결 실패")` in logs.

**Phase to address:** **Phase 2 — Streaming Stability.** Items 1-3 are quick wins for this milestone. Item 4 (MCP migration) is post-MVP / v2.

Confidence: MEDIUM. Module-scope caching of `tools()` is sound but I have not personally verified Vercel Functions warm-container behavior on the free plan with current Next 16 + Fluid Compute defaults. Worth a 10-line proof.

---

### Pitfall 7: `consumeSseStream` not configured → user-cancelled streams leak MCP sessions and skip `onFinish`

**What goes wrong:**
The user clicks "stop" (or navigates away) mid-stream. The browser closes the response body. Vercel cancels the function. AI SDK sees an abort, but the `onFinish` callback **does not fire** unless the stream was being actively pulled. The MCP client never gets `close()`d. The Fly.io server sees a hung session that times out only after its own internal idle window.

Repeat 4-5 times in quick succession → "Max sessions" 503 → entire chat is broken until Fly cleans up.

This is documented at [ai-sdk.dev troubleshooting/stream-abort-handling](https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling) and tracked at [vercel/ai#6699](https://github.com/vercel/ai/issues/6699). Fix is to pass `consumeSseStream` to `toUIMessageStreamResponse` so the stream drains on abort and `onFinish` runs.

**Why it happens:**
- The `onFinish`/`onError` lifecycle was designed assuming the stream is *consumed*. In serverless, abort = "consumer goes away," and there's no consumer to drain the stream.
- Most tutorials don't show abort-safe patterns.

**How to avoid:**
Already shown in Pitfall 2 fix. Use:

```ts
return result.toUIMessageStreamResponse({
  consumeSseStream: async ({ stream }) => {
    for await (const _ of stream) { /* drain */ }
  },
});
```

And in `onFinish`/`onError`, always close the MCP client.

**Warning signs:**
- "Max sessions" 503 errors clustered immediately after a user clicked stop.
- MCP server logs show many sessions stuck in "open" state.
- `onFinish` console log never appears for cancelled requests.

**Phase to address:** **Phase 1 — Empty Message Bug Fix** (same commit as Pitfalls 1 + 2; trivial to add).

---

### Pitfall 8: `useChat({ id })` keeps state per `conversationId` but doesn't reseed from `initialMessages`

**What goes wrong:**
`chat-container.tsx:34`:

```ts
const { messages, sendMessage, status, error } = useChat({ id: conversationId });
```

`useChat` is keyed by `id`, which means state is per conversation — good. But `initialMessages` from `props` is **not** passed to `useChat`. When you switch sidebars to a saved conversation, `messages` is `[]` (until the next send), and the render at line 183-186:

```tsx
{messages.length === 0 && initialMessages.length === 0 ? (
  <EmptyState />
) : (
  <div className="mx-auto max-w-3xl py-4">
    {messages.map((m) => <ChatMessage ... />)}
    ...
```

…shows neither — because the ternary's truthy branch is taken (initialMessages has data), but the inner `messages.map` is empty. **Past assistant turns from the saved conversation never render.** The user sees a "non-empty" chat container that's actually empty inside.

This may be invisible today because the bug from Pitfalls 1 + 2 prevents anything useful from reaching localStorage anyway. After the fix lands, this will become user-visible.

**Why it happens:**
- AI SDK 6 split UIMessage state ownership: `useChat` owns it client-side. There is no `initialMessages` prop on `useChat` (was removed/renamed in v5/v6). To seed history you must use the `messages` setter or a custom transport.
- The current code conflates "live" and "history" states.

**How to avoid:**
Either:
1. Use `useChat({ id, messages: initialUIMessages })` if/when the API supports it. Verify in `node_modules/ai/dist/index.d.ts` `ChatInit` (line 3714) — `messages` may be acceptable as part of `state`. (LOW confidence on exact API; verify before coding.)
2. Render a unified list `[...initialMessagesAsUI, ...messages]` with dedup by id.
3. Persist in `UIMessage` shape (Pitfall 4 fix) and seed via the `state` parameter.

**Warning signs:**
- Switch sidebars from a saved conversation → assistant messages disappear.
- Sending a new message in a restored conversation works, but the prior assistant turn is missing visually.
- React DevTools shows `useChat` returning `messages: []` even when the conversation has history.

**Phase to address:** **Phase 4 — Conversation Persistence Stabilization.** Pair with the schema migration from Pitfall 4.

---

### Pitfall 9: Next.js 16 Route Handler caching/dynamic defaults differ from training data

**What goes wrong:**
Next.js 16 changed the caching model: "Dynamic is the default. Caching is explicit." Previously developers needed `export const dynamic = 'force-dynamic'` to opt out of caching for POST routes; now it's the default. For *most* code this is fine — `/api/chat` is POST so was never cached anyway — BUT if anyone copy-pastes patterns from training data or older blog posts, they may add wrong directives:

- `export const runtime = "edge"` — this used to be the default recommendation for streaming. On Next.js 16 + Vercel, edge runtime has stricter limits (no Node APIs, smaller bundle). `@ai-sdk/mcp` HTTP transport may rely on Node `fetch` semantics that differ. **Don't use edge unless verified.** The current code (no runtime export) defaults to Node serverless, which is correct for this stack.
- `export const dynamic = "force-static"` — would 500 the route. Don't add it.
- `revalidate = 0` — meaningless on POST, but harmless.

The bigger Next.js 16 gotcha: **`AGENTS.md` literally warns "This is NOT the Next.js you know."** Read `node_modules/next/dist/docs/` before changing the route handler's signature, request body parsing, or streaming response. In particular:
- Request body parsing: do NOT use `req.body` (Pages Router pattern). Use `await req.json()` (already done correctly).
- `Response` constructor: use `new Response(...)` or the AI SDK's `toUIMessageStreamResponse()`. Do NOT use `NextResponse.json()` for streamed bodies.
- `headers()` and `cookies()` from `next/headers` may be async in Next 16 — verify before adding auth checks inside the route.

**Why it happens:**
- LLM-assisted code tends to hallucinate Next 13/14 patterns into Next 16 routes.
- Vercel's deployment shows generic "Function timeout" / 500 errors that don't surface the runtime mismatch.

**How to avoid:**
- Keep the route minimal and Node-runtime (current state). Don't add runtime exports.
- `export const maxDuration = 60;` — this is correct and necessary; keep it.
- When debugging, check `vercel logs` for `Module not found` or `Edge runtime does not support` errors — those are the tell.

**Warning signs:**
- Build error: `Edge runtime does not support Node.js 'http' module`.
- Production 500 with no helpful log line.
- Streaming works locally but fails in production.

**Phase to address:** **Phase 1 — Empty Message Bug Fix** (be careful not to introduce these while making the main fix). Also **Phase 5 — Chainlit Removal** (when ripping out legacy code, don't accidentally pull in Pages Router patterns).

Confidence: MEDIUM. The "don't use edge runtime" advice is solid; the Next 16 specific async-headers caveat I'm less sure about — verify against `node_modules/next/dist/docs/` per `AGENTS.md`.

---

### Pitfall 10: System prompt forces tool use, but model can refuse / hallucinate signatures

**What goes wrong:**
The system prompt has hard-line "도구 호출 없이 답변 금지". With `stopWhen: stepCountIs(1)` (current state), this guarantees the empty-card bug 100% of the time on legal queries. But even after fixing `stopWhen`, the prompt creates two follow-on issues:

1. **Forced tool calls on small talk.** "안녕하세요" → model feels obligated to call `search_law` → empty/garbage results → confused answer or empty card. Mitigate by softening the prompt: "법령 관련 질문에 대해서만 도구를 호출하세요. 일반 인사나 비법령 질문은 도구 없이 답하세요."
2. **Tool-call repair loops.** When Gemini's parallel function calls have malformed `thought_signature` or schema (Pitfall 5), the model can re-attempt repeatedly. With `stopWhen: stepCountIs(8)`, that's 8 wasted LLM round-trips and a 60s timeout. Add `experimental_repairToolCall` or just trust the cap.

**Why it happens:**
- The prompt was written defensively to prevent hallucination, before the empty-card bug was understood.
- Gemini 2.5 Flash is more eager to call tools than GPT-4o, and follows imperative instructions literally.

**How to avoid:**
- Soften the absolute "금지" to "법령 관련 질문에서는 반드시" (qualified prohibition).
- Add explicit examples in the prompt of when NOT to call tools.
- Lower `stopWhen` to `stepCountIs(5)` if you're worried about runaway loops; raise to 8-10 only if you observe that legitimate queries need it.

**Warning signs:**
- Greeting messages trigger MCP calls.
- Loop patterns in logs: same tool called 3+ times with similar args.
- `finishReason: "length"` (hit step cap, not actually finished).

**Phase to address:** **Phase 1** for the stopWhen value, **Phase 2** for prompt softening (also touches the tool-feedback work item from PROJECT.md).

---

## Why 4 Fix Commits Failed: The Pattern Diagnosis

The pattern of "4 sequential fixes targeting the same surface symptom, none working" almost always means **the fixer is debugging the wrong layer**. In this case:

| Commit | What it changed | Why it didn't help |
|--------|----------------|-------------------|
| `b618abe` convert UIMessage parts → ModelMessage content | Manual transformation logic | Wrong direction — the bug is on the response path, not request |
| `3d6ff04` resolve message type mismatch | More transformation tweaking | Same — wrong layer |
| `45e73f7` use `convertToModelMessages` | Switched to official function | Correct API, but bug is downstream of this entirely |
| `fd4ba9c` safer text extraction | Hardened `getMessageText` | Adds defensive checks against missing `text` field — but the field is missing because **no text part exists at all**, not because extraction is buggy |

**The diagnostic mistake:** all four commits assumed "the assistant message has text in it but we're failing to read it." The reality is "the assistant message has no text in it." A 30-second `console.log(JSON.stringify(messages[messages.length - 1].parts, null, 2))` in the `useEffect` at line 67 would have shown an array of `tool-*` parts with zero text parts, immediately pointing at server-side step termination instead of client-side extraction.

**Lessons for the next attempt:**
1. **Look at the raw shape, not the extracted value.** Before "fixing" extraction, log what's being extracted *from*.
2. **Verify with the source-of-truth library types**, not blog posts. `node_modules/ai/dist/index.d.ts` told the whole story in 30 seconds (`@default stepCountIs(1)` on line 2829).
3. **Test the server in isolation.** A `curl` to `/api/chat` and `cat`-ing the SSE stream would have shown `finishReason: "tool-calls"` instead of `"stop"` — undeniable evidence of step termination.
4. **Don't trust LLM-suggested fixes for cutting-edge SDK versions.** Both Next.js 16 and AI SDK 6 are post-cutoff for most models. Read the actual source.

**Phase to address:** **Phase 1.** Adopt these as the bug-fix workflow before writing code:
- Step 1: Add a single `console.log(JSON.stringify(messages, null, 2))` to confirm part shape.
- Step 2: Read `node_modules/ai/dist/index.d.ts` for `streamText` defaults.
- Step 3: Apply the fix to `route.ts` (Pitfalls 1 + 2 + 7).
- Step 4: Verify locally with a real legal query.
- Step 5: Then deploy.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Flat `content: string` in localStorage | Easy to render | Loses tool-call/citation trace forever | Never for this domain — citations ARE the product |
| `try`/`finally` with `mcpClient.close()` around `streamText` return | Looks like clean cleanup | Kills stream mid-flight, breaks tool calls | Never; use `onFinish`/`onError` |
| Inline message extraction with `as any` casts | Avoids learning `isTextUIPart` | Catches reasoning text by accident, breaks on next SDK update | Never; use SDK type guards |
| Recreating MCPClient + tools() on every request | "Stateless" mental model | Cold-start latency, Fly session limits | Only for first MVP; cache tools at module scope ASAP |
| Caret-ranged AI SDK deps (`^6.0.158`, `^3.0.62`) | Auto-receive bug fixes | Auto-receive breaking changes (already happened 4x) | Acceptable in dev; pin minor in production after Phase 1 |
| Single MCP server (Fly.io single instance) | Simple deploy | Single point of failure, session limit | MVP only; v2 needs HA or sidecar |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `streamText` + tools | Forget `stopWhen`, get `stepCountIs(1)` default | Always pass `stopWhen: stepCountIs(N)` explicitly when `tools` is non-empty |
| `createMCPClient` + streaming | `try`/`finally` close around the return | Close in `onFinish` AND `onError` callbacks; use `consumeSseStream` for abort safety |
| Gemini 2.5 Flash + multi-turn tools | Strip `providerMetadata` on persistence | Preserve `providerMetadata` on tool parts; consider `thinkingBudget: 0` to sidestep |
| `convertToModelMessages` + persisted history | Round-trip through JSON without sanitization | Strip `providerExecuted: null` (issue #8061) and stale `providerMetadata` from text parts (issue #9731) |
| `useChat` + sidebar conversations | Pass `initialMessages` as prop, expect render | Seed `useChat` state directly OR render unified list |
| `@ai-sdk/mcp` HTTP transport + Vercel | Reuse client across requests | New client per request, but cache the `tools()` schema at module scope |
| Vercel serverless + 60s timeout | Block on MCP connect indefinitely | Wrap `createMCPClient` in `Promise.race` with explicit timeout |
| Next.js 16 route handler | `runtime = "edge"` for streaming | Default Node runtime; only edge if MCP transport verified |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Refetch MCP `tools()` per request | Slow first-token, "Max sessions" 503s | Cache schema at module scope, 5-min TTL | Immediately (single user already hits it) |
| No `consumeSseStream` for aborts | Leaked MCP sessions, climbing 503 rate | Configure on `toUIMessageStreamResponse` | Within 10-20 user-aborts |
| `getMessageText` called on every render | Unnecessary CPU on long convos | Memoize at message storage level (CONCERNS.md noted) | Conversations > 50 messages |
| localStorage full-write per change | UI jank on save | Debounce writes, partial updates | Conversations > ~1MB total |
| Cold-start MCP connect on every cold lambda | First request after idle is slow (>3s) | Provisioned/Fluid keep-warm, or accept | Vercel free-tier idle timeout (currently aggressive) |
| Step cap too high with tool repair loops | 60s timeout on pathological queries | `stopWhen: stepCountIs(8)` is the cap | When Gemini gets stuck retrying malformed schemas |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| MCP API key in URL query string | Logged in browser dev tools, server logs, error msgs | Pass via header (already in CONCERNS.md) — punt to v2 if not Phase 1 |
| `/test-sidebar` route with no auth | Unauthenticated chat API access | Delete the route OR add `auth()` check OR move to `(dev)` segment |
| Plaintext legal conversations in localStorage | XSS = full conversation theft, sensitive data | Out of scope for this milestone; document as v2 |
| Verbose error messages exposing MCP infrastructure | Reveals `glluga-law-mcp.fly.dev` to users | Map known errors to generic Korean messages (already partially done) |
| No CSRF on POST /api/chat | Unverified — Next.js may have default | Verify in Phase 2; rely on same-site cookies if NextAuth handles it |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Empty card on tool-using queries | User thinks bot is broken, abandons | Phase 1 fix (Pitfalls 1+2) |
| "검색 중..." static text during 5-30s tool execution | User can't tell if anything is happening | Stream `tool-input-start` / `tool-output-available` to UI; show "법령 검색 중: 근로기준법..." |
| Restored conversations show no past assistant turns | User loses faith in saved chats | Phase 4 (Pitfall 8) |
| 503 "법령 서버 혼잡" with no retry guidance | User mashes Send button, makes it worse | Show countdown + auto-retry once with backoff |
| Tool-result sources not clickable | Citations are inert text | After Phase 4, render `tool-output-available` parts as expandable cards |
| Streaming aborts when user navigates between conversations | User loses in-flight answer | Either persist mid-stream state or warn before nav |

---

## "Looks Done But Isn't" Checklist

- [ ] **Empty-message fix:** Often missing `stopWhen: stepCountIs(N)` — verify by sending a "근로기준법 제60조 알려줘" query and confirming text appears in `messages[i].parts.find(p => p.type === 'text').text`.
- [ ] **MCP cleanup:** Often missing `onFinish` close + `consumeSseStream` — verify by `console.log` in `onFinish` AND by clicking stop mid-stream and confirming MCP server log shows session closed.
- [ ] **Multi-turn Gemini:** Often broken by stripped `providerMetadata` — verify by sending 3 sequential tool-using questions in one conversation, no 400 errors.
- [ ] **Restored conversations:** Often missing seed of `useChat` state — verify by switching sidebar to a saved conversation and confirming past `<ChatMessage>` cards render.
- [ ] **Greetings:** Often forced into tool calls — verify "안녕" returns text without calling MCP.
- [ ] **60s timeout:** Often blocks on MCP connect — verify cold-start request completes in < 5s for first token.
- [ ] **Test page security:** `/test-sidebar` accessible in production — verify either deleted or auth-gated.
- [ ] **Type-safe extraction:** Uses `isTextUIPart` from `ai`, not `"text" in p` — verify import line exists.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `stopWhen` missing in production | LOW | Add `stopWhen: stepCountIs(5)`, deploy. ~5 min change. |
| MCP closed mid-stream | LOW | Move close to `onFinish`/`onError`, delete `try`/`finally`. ~10 min. |
| Lossy localStorage schema | MEDIUM | Write `parts`-preserving schema + read-time migration for old records. ~2-4h. |
| Gemini multi-turn 400s | MEDIUM | Either preserve `providerMetadata` (tracking) OR set `thinkingBudget: 0` (escape hatch). 1-2h to verify either path. |
| MCP "Max sessions" 503 outbreak | LOW (escape) / HIGH (root) | Escape: restart Fly app. Root: implement session tracking, request queueing, possibly self-host. |
| Restored conversation rendering | MEDIUM | Refactor `ChatContainer` to seed/merge state. 2-4h. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. `stopWhen` default | **Phase 1: Empty Message Bug Fix** | Network tab shows `text-delta` chunks after `tool-output-available`; `finishReason: "stop"` |
| 2. MCP `finally` premature close | **Phase 1** | `onFinish` console log fires; no `NS_BASE_STREAM_CLOSED` errors; MCP server logs show graceful close |
| 3. `getMessageText` weak typing | **Phase 1** (paired with #1) | Imports `isTextUIPart`; reasoning text not leaking; deduped to `lib/message-utils.ts` |
| 4. Lossy localStorage schema | **Phase 4: Persistence Stabilization** (defer-eligible) | Saved + restored conversations preserve tool-call parts |
| 5. Gemini `thought_signature` | **Phase 2: Streaming Stability** | 3-turn manual smoke test passes |
| 6. MCP per-request init | **Phase 2** | Warm-request first-token < 1s; tools schema cached |
| 7. `consumeSseStream` for aborts | **Phase 1** | Click-stop test: `onFinish` runs, MCP closed |
| 8. `useChat` initialMessages seed | **Phase 4** | Restored conversation renders past assistant cards |
| 9. Next.js 16 runtime defaults | **Phase 1** (defensive) + **Phase 5** | No `runtime = "edge"` export; production logs clean |
| 10. Forced-tool system prompt | **Phase 1** (`stopWhen` value) + **Phase 2** (prompt softening) | "안녕" doesn't trigger MCP; no runaway loops |

---

## Sources

**Authoritative (HIGH confidence):**
- AI SDK 6 source: `frontend/node_modules/ai/dist/index.d.ts` lines 1684-1996, 2812-2872, 2159-2275, 3855-3859. Direct read.
- [AI SDK Core: streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [AI SDK Core: Tool Calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK Core: stepCountIs reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/step-count-is)
- [AI SDK Core: Model Context Protocol (MCP)](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- [AI SDK Cookbook: Next.js MCP Tools](https://ai-sdk.dev/cookbook/next/mcp-tools)
- [AI SDK Cookbook: Next.js Call Tools in Multiple Steps](https://ai-sdk.dev/cookbook/next/call-tools-multiple-steps)
- [AI SDK UI: convertToModelMessages reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages)
- [AI SDK UI: Reading UIMessage Streams](https://ai-sdk.dev/docs/ai-sdk-ui/reading-ui-message-streams)
- [AI SDK Troubleshooting: Stream Abort Handling](https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling)
- [AI SDK 6 launch blog](https://vercel.com/blog/ai-sdk-6)
- [Vercel Academy: Multi-Step & Generative UI](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui)
- [Gemini API: Thought Signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [Gemini API: Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)

**Bug-corroborating (MEDIUM-HIGH confidence):**
- [community.vercel.com t/14333: "Vercel AI SDK returns empty text after MCP tool call resolution"](https://community.vercel.com/t/vercel-ai-sdk-returns-empty-text-after-mcp-tool-call-resolution/14333) — direct match for this bug.
- [community.vercel.com t/34622: "streamText terminates after tool call when using MCP tools with toUIMessageStreamResponse"](https://community.vercel.com/t/streamtext-terminates-after-tool-call-when-using-mcp-tools-with-touimessagestreamresponse/34622) — direct match for the MCP `finally` premature-close bug.
- [vercel/ai issue #6699: onFinish not called on client stop](https://github.com/vercel/ai/issues/6699)
- [vercel/ai issue #8061: convertToModelMessages providerExecuted: null](https://github.com/vercel/ai/issues/8061)
- [vercel/ai issue #9731: convertToModelMessages providerMetadata leak](https://github.com/vercel/ai/issues/9731)
- [vercel/ai issue #9968: convertToModelMessages "no tool invocation found"](https://github.com/vercel/ai/issues/9968)
- [vercel/ai issue #11413: Gemini 3 thought_signature error](https://github.com/vercel/ai/issues/11413)
- [vercel/ai issue #4412: Tool calling broken with Google Gemini](https://github.com/vercel/ai/issues/4412)
- [vercel/ai issue #6589: @ai-sdk/google function calling stopped working](https://github.com/vercel/ai/issues/6589)
- [vercel/ai issue #8431: streamText + convertToModelMessages JSON clone issue](https://github.com/vercel/ai/issues/8431)
- [vercel/ai issue #7502: stopWhen and useChat maxSteps](https://github.com/vercel/ai/issues/7502)
- [vercel/ai discussion #8514: tool calling loop confusion](https://github.com/vercel/ai/discussions/8514)

**Next.js / Vercel infrastructure (MEDIUM confidence):**
- [Next.js: Route Handlers getting started](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js: route.js file conventions](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [Vercel: Streaming for Serverless Node.js and Edge](https://vercel.com/blog/streaming-for-serverless-node-js-and-edge-runtimes-with-vercel-functions)
- [Vercel: How can I improve cold start performance?](https://vercel.com/kb/guide/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel)
- [Vercel: Functions Concepts](https://vercel.com/docs/functions/concepts)
- [Vercel: Scale to one — how Fluid solves cold starts](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts)

**Local repo files consulted:**
- `frontend/src/app/api/chat/route.ts` (current handler — has both critical bugs)
- `frontend/src/components/chat/chat-container.tsx` (`getMessageText` lines 158-167; `useChat` line 34; persistence effect lines 67-81)
- `frontend/src/lib/conversations.ts` (lossy `Message` type)
- `frontend/AGENTS.md` ("This is NOT the Next.js you know" warning)
- `.planning/PROJECT.md`
- `.planning/codebase/CONCERNS.md`
- `frontend/package.json` (caret-ranged deps)
- `frontend/node_modules/ai/dist/index.d.ts` (ground truth for AI SDK 6 types and defaults)

---

*Pitfalls research for: Next.js 16 + AI SDK 6 + Gemini + MCP + Vercel serverless streaming chat*
*Researched: 2026-04-13*
