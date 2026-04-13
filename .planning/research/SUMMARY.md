# Project Research Summary

**Project:** Korean Law Bot (한국 법령 봇) — Next.js web frontend stabilization
**Domain:** AI streaming chat with MCP tool calls (Next.js 16 + AI SDK 6 + Gemini 2.5 Flash + remote MCP)
**Researched:** 2026-04-13
**Confidence:** HIGH (all root-cause findings verified against the exact `node_modules` source on disk)

---

## Executive Summary

This is a **brownfield stabilization milestone**, not a greenfield build. The Korean Law Bot is an internal Gemini-powered chat that queries `law.go.kr` via a self-hosted MCP server. The Slack bot path works. The Next.js web path is broken in production: every legal query renders as an empty card. The Core Value of this milestone is one sentence — **the answer must render as trustworthy text instead of an empty card** — and four prior fix commits (`fd4ba9c`, `45e73f7`, `3d6ff04`, `b618abe`) all targeted the wrong layer.

**The PITFALLS research found the real root cause, and it is not where anyone has been looking.** The bug is in `frontend/src/app/api/chat/route.ts`, not in `chat-container.tsx`. There are **two independent server-side defects**, either of which is sufficient to produce empty cards: (1) `streamText` is called without `stopWhen`, so it defaults to `stepCountIs(1)` and terminates the moment Gemini emits a tool call — there is no second LLM step to write the answer; and (2) `mcpClient.close()` is in a `finally` block that fires *before* the lazy stream is consumed, killing the MCP transport mid-stream. The previous four commits all rewrote `getMessageText()` on the client. The client extraction was correct — there was simply no text to extract because the server never produced any. This finding alone should reorder the entire roadmap.

The recommended approach is brutally simple: **fix the server first** (Phase 1, both pitfalls in one commit), then layer in the tool-call UI feedback that becomes possible once parts contain real `dynamic-tool` data, then harden persistence and error UX, then delete Chainlit. The frozen stack (Next.js 16, React 19, AI SDK 6.0.158, `@ai-sdk/google` 3.0.62, `@ai-sdk/mcp` 1.0.36) is correct and verified — no version changes are needed or wanted. The biggest risk in the 1-week window is scope creep: deferring tool-call polish, conversation search, reasoning panels, and server-side persistence is mandatory.

---

## Key Findings

### The Empty-Card Bug — Real Root Cause Is Server-Side (HIGH confidence)

**This finding overrides everything else in this document.** Both root causes live in `frontend/src/app/api/chat/route.ts`. Both must be fixed in the same commit. Skip the client-side `getMessageText` rewrite that the previous 4 commits chased — it was the wrong layer.

**Root cause #1 — `streamText` defaults to `stopWhen: stepCountIs(1)`**

Verified at `frontend/node_modules/ai/dist/index.d.ts:2829`:

```ts
/**
 * Condition for stopping the generation when there are tool results in the last step.
 * @default stepCountIs(1)
 */
stopWhen?: StopCondition<NoInfer<TOOLS>> | Array<StopCondition<NoInfer<TOOLS>>>;
```

With tools attached and no explicit `stopWhen`, the model emits a tool call as step 1, the tool runs, and the run terminates. There is **no second LLM step** to feed the tool result back and synthesize a text answer. The assistant `UIMessage.parts` array contains only `tool-*` parts, zero `TextUIPart` entries. Every meaningful query (anything that triggers the system prompt's "절대 도구 호출 없이 답변 금지" rule) hits this. Fix: pass `stopWhen: stepCountIs(8)` (or 5 for safety) explicitly.

**Root cause #2 — `mcpClient.close()` in `finally` kills the transport mid-stream**

`streamText` is **lazy**. `result.toUIMessageStreamResponse()` constructs the Response object, but no LLM call has happened yet. JavaScript runs `finally` synchronously after `return` is evaluated and *before* the Response body is consumed by Next.js. The sequence is: build Response → finally closes MCP → Next.js starts pulling chunks → first LLM call goes out → model wants to call a tool → MCP transport is dead → `tool-output-error` or `NS_BASE_STREAM_CLOSED` → empty card. This is independently sufficient: even after fixing #1, the finally still breaks the stream.

Fix: delete the `try`/`finally` around the return. Close the client in `streamText`'s `onFinish` (and `onError`) callbacks, and add `consumeSseStream` to `toUIMessageStreamResponse` so user-cancelled streams still drain and `onFinish` still fires.

**Why 4 previous commits failed:** they all assumed "the assistant message has text but we're failing to read it." The truth is "the assistant message has no text because the server never produced any." A 30-second `console.log(JSON.stringify(messages[i].parts))` would have shown an array of `tool-*` parts with zero text parts, immediately pointing at server-side step termination. **For Phase 1, the very first step before writing code is to log raw `parts` shape locally and confirm the diagnosis.** See PITFALLS.md "Why 4 Fix Commits Failed" section.

### Recommended Stack (Frozen — Verified Against `node_modules`)

The stack is the stack already installed and is correct. Every version was confirmed by reading `frontend/node_modules/{ai,@ai-sdk/*}/package.json` and bundled `dist/index.d.ts`. No upgrades needed — and per PROJECT.md, no upgrades allowed this milestone.

**Core technologies:**
- `next` **16.2.3** — App Router + Route Handlers; **must** stay on `runtime: 'nodejs'` (do NOT use edge — `@ai-sdk/mcp` HTTP transport relies on Node-runtime APIs)
- `react` / `react-dom` **19.2.4** — peer of Next 16
- `ai` **6.0.158** — `streamText`, `convertToModelMessages` (now async), `toUIMessageStreamResponse`, typed `UIMessagePart` discriminated union with 9 variants. **There is no `content` field on `UIMessage` in v6** — text only lives inside `parts`.
- `@ai-sdk/react` **3.0.160** — `useChat()` hook; defaults to `DefaultChatTransport` with `api: '/api/chat'`
- `@ai-sdk/google` **3.0.62** — Gemini 2.5 Flash via `google('gemini-2.5-flash')`; supports tool calling
- `@ai-sdk/mcp` **1.0.36** — `createMCPClient`, HTTP transport. **Critical:** `mcpClient.tools()` with default `schemas: 'automatic'` wraps every tool in `dynamicTool(...)`, so MCP tools arrive on the client as `type: 'dynamic-tool'`, **not** `tool-search_law`. Verified at `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts:611-631`. Any switch on `tool-${name}` literals will silently miss every MCP call.
- `next-auth` **5.0.0-beta.30** — unchanged
- `react-markdown` + `remark-gfm` — already in use for assistant text rendering
- TypeScript 5 strict mode — **mandatory** for the parts-rendering switch to narrow correctly

**Critical version note for PROJECT.md update:** PROJECT.md says "Vercel serverless 60초 타임아웃." STACK.md research confirms that as of late 2025, Vercel Hobby tier max is **300s** (was 60s historically) — see https://vercel.com/docs/functions/limitations#max-duration. The current `route.ts` likely still has `export const maxDuration = 60` (per commit `fea0d7a`). This is a discrepancy that needs reconciliation during Phase 1 or 2: either bump `maxDuration` to 300 to give Gemini + tool loops headroom, or document explicitly why the lower cap is being kept. **Flag this for resolution during execution.**

### Expected Features (Sized for 1-Week Window)

**Must have (P1, table stakes — sprint exit criteria):**
- Render `parts` array correctly — walk all parts, dispatch on `part.type`, handle `text`, `dynamic-tool` (4 states), preserve order. **Falls out of fixing the server.**
- Verb-tense status chip per tool call ("법령 검색 중: 근로기준법" → "검색 완료: 근로기준법") with the actual query argument visible
- Korean labels for the 4 MCP tools (`search_law` → 법령 검색, `get_law_text` → 법령 본문, `search_decisions` → 판례 검색, `get_decision_text` → 판례 본문)
- Collapsible tool block (default collapsed; one-line `<details>` element)
- Skeleton/structured loading bubble to replace the bare `"검색 중..."` string
- Inline error banner moved into the failed assistant bubble (not the orphaned banner currently floating below the scroll area)
- Distinct error messages for the three real failure modes: 60s/300s timeout, MCP 503/"Max sessions", MCP unreachable (degraded mode)
- Retry button wired to `useChat.regenerate()`
- Stop button while streaming (already exposed by `useChat`)
- **Backward-compat for stored conversations** (silent regression killer — see Pitfall section)
- Chainlit removed entirely (`app.py`, `.chainlit/`, deps, Dockerfile lines)

**Should have if there's slack (P2):**
- Per-tool icons (📖, 🔍, ⚖️)
- Tool result count in status chip ("12건 발견")
- Auto-retry once on transient 503 with backoff
- Export-to-Markdown including tool-call summary
- Per-conversation favorite (currently favorites are per-message)
- Elapsed time on running tool calls

**Defer to v2 (P3) — explicit anti-features for this milestone:**
- Live `input-streaming` arg preview (depends on whether Gemini+MCP actually streams tool args)
- Reasoning/"thinking" panel — Gemini Flash doesn't expose reasoning the way ChatGPT does; faking it is theater
- Conversation history search across messages
- "Resume where it failed" partial-answer recovery
- **Server-side conversation storage** — explicitly out of scope per PROJECT.md
- Sentry/structured logging — `console.error` is fine for v1
- Custom thinking/timeline animations
- Multi-device sync, sharing/public links, folders/projects/tagging
- Per-message reactions, conversation analytics
- Onboarding tour, fake typewriter delays, toast notifications for errors
- Editable tool calls, MCP server migration off Fly.io

### Architecture Approach

**Pattern:** AI SDK 6 streaming chat with discriminated-union `UIMessagePart` rendering, end-to-end typed contract from `streamText` on the server through SSE wire (`x-vercel-ai-ui-message-stream: v1`) to `useChat()` `messages: UIMessage[]` on the client. The renderer's job is to walk `parts` and switch on `part.type` — not to re-implement the chunk reducer (`useChat` already collapses `text-delta`/`tool-output-available`/etc. SSE chunks into typed `UIMessagePart` objects before the React component sees them).

**Major components (target for this milestone):**

1. **API Route Handler** (`frontend/src/app/api/chat/route.ts`) — must close MCP in `onFinish`/`onError` not in `finally`; must pass `stopWhen: stepCountIs(8)`; must add `onError` callback to `toUIMessageStreamResponse` to unmask errors instead of returning generic "An error occurred."; must add `consumeSseStream` so aborted streams still close MCP.
2. **Parts Contract Module** (`frontend/src/lib/ui-message-parts.ts`, NEW) — re-exports `isTextUIPart`, `isToolUIPart`, `getToolName` from `ai`; provides `extractAssistantText(message)` for localStorage sync and export. Pure, framework-free, unit-testable. **Build this first — everything else depends on it.**
3. **MessagePartRenderer** (`frontend/src/components/chat/parts/message-part-renderer.tsx`, NEW) — single exhaustive `switch (part.type)` with TS `never`-default so future SDK part types fail at compile rather than silently disappear. Dispatches to `TextPartView`, `ReasoningPartView`, `ToolInvocationView`, `FilePartView`.
4. **ToolInvocationView** (NEW) — handles both `ToolUIPart` (static) and `DynamicToolUIPart` (which is what MCP tools become). State machine across `input-streaming` → `input-available` → `output-available` / `output-error`. Uses `getToolName(part)` and a `tool-labels.ts` map for Korean display names.
5. **ChatContainer** — slimmed to a coordinator: owns `useChat({id})`, model selection, file attach, error UI, localStorage sync. **Does not render parts directly.** Currently it does both, which is why the bug was hard to fix.
6. **localStorage sync** — must serialize at finish (`status === 'ready'`), must back-compat with old `{role, content: string}` records via a one-shot read-time migration that wraps `content` into a single `TextUIPart`. See ARCHITECTURE.md "Build Order" Phases A-F.

### Critical Pitfalls (Top 5)

1. **`streamText` default `stopWhen: stepCountIs(1)` terminates after first tool call** → empty card. Fix: pass `stopWhen: stepCountIs(8)` explicitly. **Server-side. Phase 1.**
2. **`mcpClient.close()` in `try`/`finally` runs before the lazy stream is consumed** → transport killed mid-stream → empty card or `NS_BASE_STREAM_CLOSED`. Fix: close in `onFinish`/`onError` callbacks; add `consumeSseStream` for abort safety. **Server-side. Phase 1, same commit as #1.**
3. **`getMessageText` uses `"text" in p` which captures `ReasoningUIPart` text accidentally** and concatenates Gemini chain-of-thought into the visible answer once thinking is enabled. Also duplicated across `chat-container.tsx:158` and `test-sidebar/page.tsx:10`. Fix: use `isTextUIPart` from `ai`, dedupe to `lib/ui-message-parts.ts`. **Phase 1, same commit (client + server consistent).**
4. **Storing flat `content: string` in localStorage permanently destroys tool-call traces, file attachments, and source citations.** For a *legal* assistant where the value prop is "trustable citations from law.go.kr", this is unacceptable for any future "click to expand sources" feature. Also creates impedance: restored conversations cannot reseed `useChat`, so past assistant turns silently fail to render. Fix: persist `Pick<UIMessage, 'id' | 'role' | 'parts' | 'metadata'>` and write a one-shot read-time migration. **Phase 4. Watch for `convertToModelMessages` known issues #8061 and #9731 when round-tripping JSON.**
5. **Gemini 2.5 Flash `thought_signature` requirement on multi-turn tool calls** — if `providerMetadata` is stripped from tool parts on persistence, the next turn POSTs without the signature and Gemini returns HTTP 400 "Function call is missing a thought_signature in functionCall parts." Single-turn works; multi-turn breaks. Fix: do not strip `providerMetadata` from tool parts; alternatively set `providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } }` to disable Gemini thinking entirely (lower answer quality on hard reasoning, acceptable for MVP). Smoke test: 3 sequential tool-using questions in one conversation. **Phase 2 + Phase 4.**

**Honorable mentions:**
- **`useChat({id})` does not reseed from `initialMessages` prop** — when you switch sidebars to a saved conversation, `messages` is `[]` and past assistant turns silently fail to render. Invisible today because Pitfalls 1+2 prevent anything useful from reaching localStorage; will become user-visible after Phase 1 ships. **Phase 4.**
- **MCP `tools()` refetched on every request** — 200-800ms cold-start + Fly.io session leaks → "Max sessions" 503s. Cache schema at module scope with 5-min TTL; wrap `createMCPClient` in `Promise.race` with 5s timeout. **Phase 2.**
- **Forced tool-use system prompt + small talk** — "안녕하세요" triggers `search_law` → empty/garbage. Soften prompt to "법령 관련 질문에서만 도구를 호출하세요." **Phase 2.**
- **`/test-sidebar` test page is in production** unauthenticated — delete it before deploy. **Phase 5.**
- **Backward-compat for stored conversations** is a silent killer — old `Message.content` strings must still render after the parts refactor lands. PROJECT.md explicitly mandates this: "기존 localStorage에 저장된 대화가 수정 후에도 읽히고 렌더링되어야 함." Easy to forget; will look like a regression bug when shipped. **Phase 1 must include a read-time migration, even if Phase 4 (full UIMessage persistence) is dropped.**

---

## Implications for Roadmap

### Phase 1 — Empty Message Bug Fix (THE BLOCKER)

**Rationale:** Both server-side root causes (`stopWhen` default + `finally` close race) must be fixed in a single commit, alongside the client-side parts contract module that gives the renderer a verified type-safe foundation. Without this, **nothing else in the milestone matters** — Core Value cannot be met.

**START HERE.** No exceptions, no parallel tracks, no "while you're at it" scope additions. The diagnosis-first workflow from PITFALLS.md "Why 4 Fix Commits Failed" must be followed: log raw `parts` shape *before* writing any fix code.

**Delivers:**
- Production legal queries render as actual answer text instead of empty cards
- Diagnosis log evidence (`console.log(JSON.stringify(messages[i].parts))`) confirming pre/post fix
- A typed parts contract module that the rest of the milestone builds on
- Backward-compat for existing localStorage conversations (read-time migration)

**Addresses:** FEATURES.md P1 (render parts in order, stop button, backward-compat, Korean tool labels foundation)
**Avoids:** PITFALLS.md Pitfall 1 (`stopWhen`), 2 (`finally` race), 3 (`"text" in p`), 7 (`consumeSseStream`)

**Concrete server changes in `route.ts`:**
```ts
import { streamText, stepCountIs, convertToModelMessages } from "ai";

const mcpClient = await Promise.race([
  createMCPClient({ transport: { type: "http", url: getMcpUrl() } }),
  new Promise((_, rej) => setTimeout(() => rej(new Error("MCP connect timeout")), 5000)),
]);
const tools = await mcpClient.tools();

const result = streamText({
  model: google(selectedModel),
  system: SYSTEM_PROMPT,
  messages,
  tools,
  stopWhen: stepCountIs(8),                        // <-- FIX #1
  onFinish: async () => {                          // <-- FIX #2
    try { await mcpClient?.close(); } catch (e) { console.error("mcp close:", e); }
  },
  onError: async ({ error }) => {
    console.error("[chat] streamText error:", error);
    try { await mcpClient?.close(); } catch {}
  },
});

return result.toUIMessageStreamResponse({
  consumeSseStream: async ({ stream }) => {        // <-- FIX #3 (abort safety)
    for await (const _ of stream) { /* drain */ }
  },
  onError: (error) => {                            // <-- unmasks real errors
    if (error instanceof Error) return error.message;
    return JSON.stringify(error);
  },
});

// CRITICAL: DELETE the surrounding try { ... } finally { mcpClient.close() }
```

**Concrete client changes:**
- Create `frontend/src/lib/ui-message-parts.ts` with `extractAssistantText(message)` using `isTextUIPart` and `m.role === "assistant"` guard
- Replace inline `getMessageText` in `chat-container.tsx:158` and `test-sidebar/page.tsx:10` with the shared helper
- Add a one-shot localStorage read-time migration: `if (msg.content && !msg.parts) msg.parts = [{ type: 'text', text: msg.content, state: 'done' }]`
- Build the `MessagePartRenderer` switch (text + dynamic-tool minimum; reasoning/file/source can stub)

### Phase 2 — Streaming Stability and Error UX

**Rationale:** Once the bug is fixed, the next failure surface is everything brittle around the stream: cold-start MCP latency, session leaks, generic error messages, the Gemini multi-turn `thought_signature` issue. These compound.

**Delivers:**
- Module-scope `tools()` cache with 5-min TTL
- `Promise.race`-wrapped `createMCPClient` with explicit 5s timeout
- Distinct Korean error banners for the 3 real failure modes (timeout, 503, MCP-down/degraded)
- Inline retry button on failed assistant turns (`useChat.regenerate()`)
- Auto-retry once on transient 503 with backoff
- Multi-turn `thought_signature` smoke test and decision on `thinkingBudget: 0` opt-out
- Soften system prompt to allow non-tool small talk
- Decide and document `maxDuration` value (60s vs 300s) and reconcile PROJECT.md

**Avoids:** Pitfall 5 (Gemini thought_signature), 6 (MCP cold-start/sessions), 10 (forced tool calls on small talk)

### Phase 3 — Tool-Call UI Feedback

**Rationale:** Now that `parts` contain real `dynamic-tool` entries with state, the third PROJECT.md Active requirement becomes tractable. Verb-tense status chips with visible arguments are the table-stakes pattern across every peer product (Claude, Cursor, v0, Perplexity, ChatGPT).

**Delivers:**
- `ToolInvocationView` with full state machine (input-streaming → input-available → output-available / output-error)
- Verb-tense Korean status chips ("법령 검색 중: 근로기준법" → "검색 완료: 근로기준법")
- Korean label map for the 4 MCP tools (`tool-labels.ts`)
- Collapsible tool block (`<details>` element, collapsed by default)
- Skeleton loading bubble replacing the bare `"검색 중..."` string
- Multiple tool calls stack as a vertical checklist
- (P2 if time) Per-tool icons, result count, elapsed time

### Phase 4 — Conversation Persistence Stabilization

**Rationale:** Currently flat `content: string` in localStorage destroys tool-call traces. Per PROJECT.md priority order (1 > 2 > 3 > 5 > 4), this is the **first thing dropped if scope tightens**. The Phase 1 read-time migration provides a backward-compat floor.

**Delivers:**
- Persist `UIMessage[]` (with sanitized `parts`) instead of flat strings
- Reseed `useChat({id})` state from saved conversations
- Verify atomic save still gated on `status !== 'streaming'`
- Strip `providerExecuted` and stale `providerMetadata` on text parts before JSON serialize (vercel/ai #8061, #9731)

**Avoids:** Pitfall 4 (data loss), 8 (`useChat` not reseeding), 5 (multi-turn thought_signature, with Phase 2)

**Drop criteria:** If by midweek Phases 1-3 are not solid, drop Phase 4 entirely.

### Phase 5 — Chainlit Removal

**Rationale:** Pure cleanup, independent of all UX work. Listed last so it cannot accidentally break something the legacy code touches. Per PROJECT.md priority order (1 > 2 > 3 > 5 > 4), Phase 5 ships before Phase 4 if scope is tight.

**Delivers:**
- `app.py`, `.chainlit/`, Chainlit-specific dependencies removed
- Dockerfile chainlit lines removed
- `/test-sidebar` route also deleted (no auth, references same buggy `getMessageText`)
- Slack bot path (`bot/`, `main.py`, `law/`) untouched

### Phase Ordering Rationale

- **Phase 1 first** because it's the only blocker for Core Value.
- **Phase 2 follows Phase 1** because they share `route.ts` and benefit from the diagnosis logging.
- **Phase 3 follows Phase 2** because tool UI is meaningless until errors are handled.
- **Phase 4 intentionally late** per priority order; may be dropped if scope tightens.
- **Phase 5 independent and last** so it cannot break anything; ships before Phase 4 if scope tight.

### Research Flags

**Phases likely needing deeper research during planning (`/gsd-research-phase`):**

- **Phase 4** — `useChat` reseeding from `initialMessages` has LOW confidence. `convertToModelMessages` round-trip bugs (#8061, #9731) need verification. Run `/gsd-research-phase` before writing Phase 4 code.
- **Phase 2** — MCP `tools()` module-scope caching has MEDIUM confidence; verify Vercel Functions warm-container behavior with current Next 16 + Fluid Compute defaults. Worth a 10-line PoC.

**Phases with standard patterns (skip research):**

- **Phase 1** — All facts verified against `node_modules` source. Execute directly.
- **Phase 3** — Well-documented across 5+ peer products and AI SDK 6 docs. Build it.
- **Phase 5** — Pure deletion; no research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified by reading installed `package.json` and `dist/index.d.ts` files. |
| Features | MEDIUM-HIGH | AI SDK 6 specifics HIGH; peer-product UX patterns MEDIUM. |
| Architecture | HIGH | Server→client wire protocol mapped chunk-by-chunk against `node_modules/ai`. |
| Pitfalls (1-4) | HIGH | Direct source-code evidence + multiple corroborating Vercel community threads. |
| Pitfalls (5-9) | MEDIUM | Documented bug reports and reasoning, not all observed locally. |
| Pitfalls (10+) | LOW-MEDIUM | Inferred from system prompt and general patterns. |

**Overall confidence:** HIGH — Phase 1 should not require further research and can begin execution immediately upon roadmap approval.

### Gaps to Address

- **PROJECT.md `maxDuration` discrepancy** — PROJECT.md says Vercel 60s; Vercel Hobby max is now 300s. Reconcile during Phase 1 or 2 and update PROJECT.md.
- **`useChat` reseeding API exact shape** — LOW confidence; verify against installed types before Phase 4 code.
- **Vercel free-tier warm-container behavior** — module-scope MCP `tools()` cache assumption; MEDIUM confidence; 10-line PoC during Phase 2.
- **MCP `dynamic-tool` `input-streaming` delta delivery** — Gemini may not stream tool args incrementally; observation during Phase 3 decides feature viability.
- **Restored conversations rendering today** — 30-second manual check during Phase 1 so the failure mode is captured as known regression instead of surprise.
- **`finishReason: "stop"`** (not `"tool-calls"`) smoke test after Phase 1 — undeniable evidence the fix worked.

---

## Sources

### Primary (HIGH confidence — verified against installed `node_modules`)

- `frontend/node_modules/ai/dist/index.d.ts` — `UIMessage`, `UIMessagePart` discriminated union (lines 1659-1966), `streamText` `stopWhen` default (line 2829), `convertToModelMessages` async (lines 3855-3859), `UIMessageStreamOptions` (lines 2305-2380), type guards (lines 1968-2013)
- `frontend/node_modules/ai/dist/index.js` — chunk processor `processUIMessageStream` (line 5362), SSE response builder (lines 5082-5105), dynamic-tool branch (line 5611), `JsonToSseTransformStream`
- `frontend/node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts` — `dynamicTool` wrapping for `schemas: 'automatic'` (lines 611-631)
- `frontend/node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx` — canonical chatbot example
- `frontend/node_modules/ai/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx` — tool rendering switch with `state` machine
- `frontend/node_modules/ai/docs/03-ai-sdk-core/16-mcp-tools.mdx` — MCP cleanup pattern
- `frontend/node_modules/ai/docs/08-migration-guides/24-migration-guide-6-0.mdx` — v5→v6 breaking changes

### Secondary (MEDIUM confidence — official + community)

- AI SDK UI: Chatbot Tool Usage — https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- AI SDK UI: Error Handling — https://ai-sdk.dev/docs/ai-sdk-ui/error-handling
- AI SDK UI: Stream Protocols — https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- AI SDK Troubleshooting: Stream Abort Handling — https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling
- AI SDK 6 Launch — Vercel Blog — https://vercel.com/blog/ai-sdk-6
- Vercel Community #14333 — empty text after MCP tool call resolution — https://community.vercel.com/t/vercel-ai-sdk-returns-empty-text-after-mcp-tool-call-resolution/14333
- Vercel Community #34622 — streamText terminates after tool call with MCP tools — https://community.vercel.com/t/streamtext-terminates-after-tool-call-when-using-mcp-tools-with-touimessagestreamresponse/34622
- vercel/ai#6699 — `consumeSseStream` and abort handling
- vercel/ai#11413 — Gemini `thought_signature` round-trip bug
- vercel/ai#8061 — `providerExecuted: null` round-trip
- vercel/ai#9731 — `providerMetadata` leak on text parts
- Gemini API thought signatures — https://ai.google.dev/gemini-api/docs/thought-signatures
- Vercel Functions Limitations — https://vercel.com/docs/functions/limitations#max-duration

### Tertiary (LOW confidence — inference, needs validation)

- Vercel free-tier warm-container behavior with Fluid Compute defaults — needs local PoC during Phase 2
- `useChat({id, messages: ...})` exact API shape for reseeding — verify against `node_modules/ai/dist/index.d.ts` `ChatInit` before Phase 4
- Whether Gemini 2.5 Flash + MCP actually streams tool args via `tool-input-delta` chunks — observation during Phase 3

---

*Research completed: 2026-04-13*
*Ready for roadmap: yes — Phase 1 may begin immediately upon roadmap approval*
