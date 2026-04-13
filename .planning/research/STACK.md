# Stack Research — Streaming Chat Stabilization

**Domain:** Next.js 16 + AI SDK 6 + MCP streaming chat UI (brownfield)
**Researched:** 2026-04-13
**Confidence:** HIGH (all findings verified against locally installed `node_modules` source/types of the exact versions running in this repo)

> Note: The "Recommended Stack" below is **the stack already installed and frozen for this milestone**. The research focus is API shapes and version-pinned usage patterns within that stack. Versions confirmed by reading `frontend/node_modules/{ai,@ai-sdk/*}/package.json` and the bundled `dist/index.d.ts` files on disk.

---

## Recommended Stack (Frozen)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `next` | **16.2.3** | App Router, route handlers, Vercel integration | Already in repo; v16 introduces breaking changes — `dynamic`/`dynamicParams`/`revalidate`/`fetchCache` removed when Cache Components enabled, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md`. The `frontend/AGENTS.md` warning to read bundled docs is still valid. |
| `react` / `react-dom` | **19.2.4** | UI framework | Required peer of Next 16. |
| `ai` (Vercel AI SDK core) | **6.0.158** | `streamText`, `convertToModelMessages`, UI message stream protocol, `DefaultChatTransport`, `tool` / `dynamicTool` | v6 introduces async `convertToModelMessages`, `ModelMessage` (renamed from `CoreMessage`), default `stopWhen: stepCountIs(20)` in `streamText`, and the typed `parts` system is the **only** correct way to render assistant content. |
| `@ai-sdk/react` | **3.0.160** | `useChat()` hook | Re-exports `Chat`, `useChat`, `UseChatOptions`. `useChat` with no `transport` defaults to `new DefaultChatTransport()` which defaults to `api: '/api/chat'` (verified at `node_modules/ai/dist/index.mjs:12887` and `:12748`). |
| `@ai-sdk/google` | **3.0.62** | Gemini provider — `google('gemini-2.5-flash')` | Already wired; default model `gemini-2.5-flash` works with tool calling. |
| `@ai-sdk/mcp` | **1.0.36** | `createMCPClient`, `MCPClient`, HTTP/SSE transports | Schema `'automatic'` (default) wraps each MCP tool with `dynamicTool(...)` — see `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts:611-623`. **This is the root cause of the empty-card bug** (see Pitfalls section). |
| `next-auth` | **5.0.0-beta.30** | Google OAuth + domain restriction | Existing, unchanged. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-markdown` + `remark-gfm` | 10.1.0 / 4.0.1 | Render assistant text parts as Markdown | Required: system prompt instructs the model to emit Markdown. Already in use. |
| `lucide-react` | 1.8.0 | Icons for tool-state indicators (loading/done/error) | Use for tool-call UI feedback (Active req #3). |
| `sonner` | 2.0.7 | Toast notifications | Use for surfacing 503/timeout/abort errors instead of inline-only display. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript 5 strict mode | Type-narrowing on `UIMessagePart` discriminated union | Strict mode is **mandatory** for the message-parts fix — `switch (part.type)` only narrows correctly under `strict`. |
| ESLint 9 + `eslint-config-next@16.2.3` | Lint | Existing. Do not enable `no-explicit-any` in chat-container until parts handler is rewritten — current code casts via `(p as any)`. |

---

## Sub-Question 1 — Streaming chat: `streamText` + `toUIMessageStreamResponse()` in Next.js 16 App Router

### Verdict (HIGH confidence)

The current `frontend/src/app/api/chat/route.ts` is **structurally correct** for AI SDK 6.0.158 and Next.js 16. The route exports a `POST` handler from a Route Handler, awaits `convertToModelMessages` (correctly async in v6), calls `streamText({...})`, and returns `result.toUIMessageStreamResponse()`. This matches the canonical pattern in the bundled docs.

### Canonical pattern (verified against `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx`)

```ts
// app/api/chat/route.ts
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { google } from '@ai-sdk/google';

// Vercel function duration. As of late 2025, Hobby tier max is 300s
// (was 60s historically). Streaming responses are bounded by this same value.
// See https://vercel.com/docs/functions/limitations#max-duration
export const maxDuration = 300; // seconds; raise from existing 60 if Gemini + tool loops occasionally hit cap
export const runtime = 'nodejs'; // REQUIRED for @ai-sdk/mcp HTTP transport — do NOT use 'edge'

export async function POST(req: Request) {
  const { messages: uiMessages, modelId } = await req.json() as {
    messages: UIMessage[];
    modelId?: string;
  };

  // v6: convertToModelMessages is async (was sync in v5)
  const messages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: google(modelId ?? 'gemini-2.5-flash'),
    system: SYSTEM_PROMPT,
    messages,
    tools, // optional; multi-step tool loop is on by default (stopWhen: stepCountIs(20))
  });

  return result.toUIMessageStreamResponse({
    // CRITICAL for debugging: surface real error messages instead of "An error occurred."
    onError: (error) => {
      console.error('[chat] stream error:', error);
      if (error == null) return 'unknown error';
      if (typeof error === 'string') return error;
      if (error instanceof Error) return error.message;
      return JSON.stringify(error);
    },
  });
}
```

### Things confirmed from local `dist/index.d.ts`

- `convertToModelMessages` is **async** (line 3855): `Promise<ModelMessage[]>`. The current route already `await`s it correctly.
- `streamText` defaults `stopWhen: stepCountIs(20)` (line 3275). Multi-step tool calling is **enabled by default**; the existing route does not need to pass `stopWhen` explicitly. Tool-loop runaway is bounded by 20 steps unless overridden.
- `toUIMessageStreamResponse(options)` accepts `onError`, `originalMessages`, `generateMessageId`, `sendReasoning`, `sendSources`, `sendFinish`, `sendStart`, `messageMetadata`, `consumeSseStream`, plus standard `ResponseInit` (lines 2305-2380). The current route passes **none** of these — adding `onError` is the highest-leverage change for the stabilization milestone because it unmasks errors that currently render as the generic "An error occurred." string.
- `streamText` returns a `StreamTextResult` with `.toUIMessageStreamResponse()`, `.toUIMessageStream()`, `.toTextStreamResponse()`, `.pipeUIMessageStreamToResponse()` (lines 2573-2592). Use `.toUIMessageStreamResponse()` — the others are for non-`useChat` clients or Node `ServerResponse`.

### Don't use

- ❌ `result.toAIStreamResponse()` / `result.toDataStreamResponse()` — both removed in v6 (replaced by `toUIMessageStreamResponse`).
- ❌ `convertToCoreMessages` — removed in v6 (renamed `convertToModelMessages`, now async). Codemod: `npx @ai-sdk/codemod v6/rename-converttocoremessages-to-converttomodelmessages`.
- ❌ Calling `convertToModelMessages` synchronously — was sync in v5, async in v6. TypeScript catches this; runtime symptom is `messages` being a `Promise<ModelMessage[]>` and the model receiving garbage.
- ❌ `Experimental_Agent` — replaced by `ToolLoopAgent`. Not used in this repo, but don't add.
- ❌ `runtime = 'edge'` for this route — `@ai-sdk/mcp` HTTP transport relies on Node-runtime APIs; the MCP SDK pulls in modules that don't run cleanly on edge runtime, and Next 16's edge runtime doesn't support Cache Components anyway.

**Sources:**
- `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx` (canonical chatbot example, v6)
- `node_modules/ai/docs/08-migration-guides/24-migration-guide-6-0.mdx` (v5→v6 breaking changes)
- `node_modules/ai/dist/index.d.ts` lines 2305-2380 (`UIMessageStreamOptions`), 3270-3280 (`stopWhen` default), 3855-3859 (`convertToModelMessages`)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/{maxDuration,runtime}.md`

---

## Sub-Question 2 — Parsing `UIMessage.parts` on the client (THE BLOCKER)

### Verdict (HIGH confidence — ROOT CAUSE IDENTIFIED)

The empty-card bug in `frontend/src/components/chat/chat-container.tsx:158-167` is **not** in the text extraction itself — `if ("text" in p) { texts.push(p.text) }` is technically correct for `TextUIPart`. The bug is more subtle: the **assistant message has no `text` part at all** during/after a tool round, because the model's only output for that step was `dynamic-tool` parts (the MCP tools come through as `type: 'dynamic-tool'`, NOT `type: 'tool-search_law'`). Combined with how `useChat` updates `messages` incrementally, the snapshot the UI renders can be a message that **only contains** `step-start` + `dynamic-tool` parts and no text — producing a literally empty card.

This is provable from the source.

### Ground truth: the full `UIMessagePart` discriminated union

From `node_modules/ai/dist/index.d.ts:1684`:

```ts
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart            // { type: 'text', text: string, state?: 'streaming' | 'done' }
  | ReasoningUIPart       // { type: 'reasoning', text: string, state?: 'streaming' | 'done' }
  | ToolUIPart<TOOLS>     // { type: `tool-${name}`, ...UIToolInvocation }  ← STATIC tools only
  | DynamicToolUIPart     // { type: 'dynamic-tool', toolName, toolCallId, state, input, output, ... }
  | SourceUrlUIPart       // { type: 'source-url', url, ... }
  | SourceDocumentUIPart  // { type: 'source-document', mediaType, title, ... }
  | FileUIPart            // { type: 'file', mediaType, url, ... }
  | DataUIPart<DATA_TYPES>// { type: `data-${name}`, data: ... }
  | StepStartUIPart;      // { type: 'step-start' }
```

### Why MCP tools are `dynamic-tool`, not `tool-search_law`

From `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts:611-631`:

```ts
const toolWithExecute =
  schemas === 'automatic'              // ← default when calling mcpClient.tools() with no args
    ? dynamicTool({ description, title, inputSchema, execute, toModelOutput })
    : tool({ description, ... });      // only when caller passes explicit { schemas: { ... } }
```

The current route calls `mcpClient.tools()` with no schemas argument → `schemas === 'automatic'` → every MCP tool is wrapped in `dynamicTool(...)` → on the client, every tool invocation arrives as `{ type: 'dynamic-tool', toolName: 'search_law', ... }`. **There is no `tool-search_law` part type unless you explicitly pass schemas to `mcpClient.tools({ schemas: { ... } })`.**

Therefore the existing rendering switch in `chat-container.tsx` (`if ("text" in p)`) silently drops every dynamic-tool part **and produces empty output for any assistant message that has not yet emitted a text part**.

### `DynamicToolUIPart` state machine (from `dist/index.d.ts:1879-1966`)

```ts
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & (
  | { state: 'input-streaming';   input: unknown | undefined }
  | { state: 'input-available';   input: unknown }
  | { state: 'approval-requested'; input: unknown; approval: { id: string } }
  | { state: 'approval-responded'; input: unknown; approval: { id, approved, reason? } }
  | { state: 'output-available';  input: unknown; output: unknown; preliminary?: boolean }
  | { state: 'output-error';      input: unknown; errorText: string }
  | { state: 'output-denied';     input: unknown; approval: { id, approved: false } }
);
```

For this milestone (Active req #1 + #3 in PROJECT.md) you only need to handle `'input-streaming' | 'input-available' | 'output-available' | 'output-error'`.

### Canonical recommended pattern

```tsx
// chat-container.tsx — replace getMessageText() and the message render loop
import {
  isTextUIPart,
  isReasoningUIPart,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from 'ai';

// 1) Plain-text extraction for export / localStorage persistence
function extractText(message: UIMessage): string {
  if (!message.parts) return '';
  return message.parts
    .filter(isTextUIPart)            // exported helper, type-guards to TextUIPart
    .map((p) => p.text)
    .join('');
}

// 2) Rich rendering inside the message bubble
function MessageBody({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            // text part has its own .state ('streaming' | 'done') — render either
            return <Markdown key={i}>{part.text}</Markdown>;

          case 'reasoning':
            // optional: collapse-by-default for Gemini "thinking"
            return <ReasoningBlock key={i} text={part.text} state={part.state} />;

          case 'dynamic-tool': {
            // ALL MCP tools land here when using mcpClient.tools() default mode
            const name = part.toolName; // e.g. 'search_law'
            const callId = part.toolCallId;
            switch (part.state) {
              case 'input-streaming':
              case 'input-available':
                return <ToolPending key={callId} name={name} input={part.input} />;
              case 'output-available':
                return <ToolDone key={callId} name={name} input={part.input} output={part.output} />;
              case 'output-error':
                return <ToolError key={callId} name={name} message={part.errorText} />;
              default:
                return null;
            }
          }

          case 'step-start':
            // shows boundary between tool-call rounds; render <hr/> only between steps
            return i > 0 ? <hr key={i} className="my-2 opacity-40" /> : null;

          case 'file':
            // user-attached images come back here on user messages; for assistant
            // messages this is rare (Gemini doesn't return images) but handle it.
            if (part.mediaType.startsWith('image/')) {
              return <img key={i} src={part.url} alt={part.filename ?? ''} />;
            }
            return null;

          // source-url / source-document / data-* — not used by Gemini-MCP path; ignore
          default:
            return null;
        }
      })}
    </>
  );
}
```

### Two non-obvious correctness rules

1. **Text parts can have `state: 'streaming'` with empty `text`.** The bundled docs explicitly note this in the streaming gotcha. Render text parts unconditionally (don't filter empty strings) so the bubble is non-empty as soon as the first delta arrives.
2. **An assistant message can be a tool-only message.** When the model decides to call a tool first and emits no text in that step, the assistant message will have only `step-start` + `dynamic-tool` parts. If your UI logic skips those parts, the bubble renders empty until the next round adds a `text` part. This is exactly what happens in production now.

### Type guards exported by `ai` (use these instead of `"text" in p` casts)

From `dist/index.d.ts:1968-2013`:

- `isTextUIPart(part)` → `part is TextUIPart`
- `isReasoningUIPart(part)` → `part is ReasoningUIPart`
- `isFileUIPart(part)` → `part is FileUIPart`
- `isToolUIPart(part)` → `part is ToolUIPart<TOOLS> | DynamicToolUIPart` (covers BOTH static and dynamic)
- `isStaticToolUIPart(part)` → `part is ToolUIPart<TOOLS>` (static only)
- `isDataUIPart(part)` → data-* parts
- `getToolName(part)` → string (works for both static and dynamic)
- `getStaticToolName(part)` → keyof TOOLS (static only)

`isToolOrDynamicToolUIPart` and `getToolOrDynamicToolName` exist but are `@deprecated` — use `isToolUIPart` / `getToolName`.

### Don't use

- ❌ `if ("text" in p)` casts — they work for `TextUIPart` and `ReasoningUIPart` but not for tool parts; combined with the empty-streaming-text case, they hide bugs. Use `isTextUIPart`.
- ❌ `(p as any).text` — eliminate `any` here; the discriminated union narrows correctly under `strict: true`.
- ❌ Reading `message.content` — does not exist on `UIMessage` in v6; the docs note explicitly: "We recommend rendering the messages using the `parts` property instead of the `content` property." There is no `content` field. The current code's `getMessageText()` is the only string-extraction path needed (for localStorage persistence and export).
- ❌ Filtering parts by `part.type === 'tool-invocation'` or `'tool-result'` — those types **do not exist** in v6. Tool calls and results are merged into a single `dynamic-tool` (or `tool-${name}`) part with a `state` discriminator.

**Sources:**
- `node_modules/ai/dist/index.d.ts` lines 1684-1966 (full `UIMessagePart` union, `DynamicToolUIPart`, `ToolUIPart`, all states)
- `node_modules/ai/dist/index.d.ts` lines 1968-2013 (type-guard helpers and `getToolName`)
- `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts` lines 611-631 (proof that MCP `tools()` defaults to `dynamicTool`)
- `node_modules/ai/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx` (canonical rendering switch with `state` machine and the explicit `dynamic-tool` example)
- `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx` (recommendation to render via `parts`, not `content`)

---

## Sub-Question 3 — `@ai-sdk/mcp` 1.0.36: `createMCPClient` + `mcpClient.tools()` + error modes

### Verdict (HIGH confidence)

The current code is correct in shape and matches the bundled doc pattern exactly. The two improvements are: (a) close the client via `streamText`'s `onFinish` callback rather than a `try/finally` that fires before the stream finishes, and (b) accept the dynamic-tool fact (you don't need to pass `schemas` — but if you do, the client UI gets `tool-${name}` parts instead of `dynamic-tool`).

### Canonical pattern (from `node_modules/ai/docs/03-ai-sdk-core/16-mcp-tools.mdx`)

```ts
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { streamText } from 'ai';

const mcpClient: MCPClient | undefined = await createMCPClient({
  transport: {
    type: 'http',                       // 'http' is the recommended transport for production
    url: getMcpUrl(),                   // 'https://glluga-law-mcp.fly.dev/mcp?oc=...'
    // optional: headers, authProvider, redirect: 'error'
  },
});

const tools = await mcpClient.tools(); // schemas: 'automatic' (default) → dynamicTool wrappers

const result = streamText({
  model: google('gemini-2.5-flash'),
  system: SYSTEM_PROMPT,
  messages,
  tools,
  // CRITICAL: close MCP client when stream finishes, not in `finally`.
  // The `finally` runs BEFORE the stream is consumed by the client, so
  // closing the MCP client there can race with in-flight tool calls.
  onFinish: async () => {
    await mcpClient.close();
  },
});

return result.toUIMessageStreamResponse({ onError: (e) => /* see Q1 */ });
```

### Important — the current `try/finally` close pattern is racy

`frontend/src/app/api/chat/route.ts:92-94`:

```ts
} finally {
  if (mcpClient) await mcpClient.close();
}
```

The `try` block returns the streaming `Response` synchronously, then `finally` fires immediately — **before** the model has consumed any tools. The bundled MCP doc explicitly warns about this and prescribes `onFinish` for streaming usage:

> "When streaming responses, you can close the client when the LLM response has finished. For example, when using `streamText`, you should use the `onFinish` callback"

Symptoms of the race: tool calls intermittently fail with "MCP client closed" or `TransportClosed`, especially under load or when Gemini takes >1 round.

### Schema mode tradeoff

| Mode | Client UI part type | TS safety | When to use |
|------|---------------------|-----------|-------------|
| `mcpClient.tools()` (default `'automatic'`) | `'dynamic-tool'` | None on inputs/outputs | MVP / prototype / when MCP server is the source of truth |
| `mcpClient.tools({ schemas: { search_law: { inputSchema: z.object({...}) } } })` | `'tool-search_law'` etc. | Full TS narrowing | Production UIs that want per-tool custom rendering by name |

For this milestone (1-week stabilization), **stay with default `'automatic'` mode** and handle `dynamic-tool` parts in the client. Adding explicit schemas duplicates the law-mcp server's schema and is a Phase-2 polish.

### Error modes (verified in 1.0.36 source)

| Failure mode | What `createMCPClient` / `tools()` throws | Recommended handling |
|--------------|-------------------------------------------|----------------------|
| MCP server unreachable (DNS, network) | `Error` from underlying fetch | Already handled in current route. Continue without tools (graceful degradation). |
| MCP server returns 503 / "Max sessions" / 429 | `Error` with the upstream response body in message | Already handled — return JSON 503 to client. Add Retry-After header in the response and surface in UI. |
| MCP `tools()` returns a tool whose `outputSchema` validation fails | Caught inside the client; `result.isError = true` is forwarded as a tool error part | New in 1.0.35: `isError` results bypass `outputSchema` validation. No client work needed beyond rendering `output-error` state. |
| MCP client closed mid-stream (the race above) | `TransportClosed` / "MCP client is closed" | Move close to `onFinish`. |
| OAuth state-param tampering | `Error` from MCP OAuth flow | Not relevant — repo uses `?oc=` query param auth, not OAuth. |
| Redirect SSRF | `Error` if `redirect: 'error'` | Not currently set; consider setting `redirect: 'error'` since the URL is hard-coded. |

### Known relevant 1.0.x changes (from `node_modules/@ai-sdk/mcp/CHANGELOG.md`)

- 1.0.36 (current): expose `serverInfo` from MCP server
- 1.0.35: bypass `outputSchema` validation when tool returns `isError` (relevant — means tool errors round-trip cleanly to UI)
- 1.0.34: allow custom `fetch` for HTTP/SSE transports (useful for adding timeouts/retries — see Stabilization rec below)
- 1.0.32: strip trailing slash from OAuth resource parameter (irrelevant)
- 1.0.29: add `redirect` option to `MCPTransportConfig`
- 1.0.27: add MCP protocol version `2025-11-25` to supported versions

### Stabilization recommendation (medium confidence — derived from 1.0.34 + Active req #2)

Wrap the HTTP transport's fetch with a 15-second per-request timeout to prevent the MCP server hanging the entire 60-300s budget on a single dead request:

```ts
mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: getMcpUrl(),
    redirect: 'error',
    fetch: async (input, init) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      try {
        return await fetch(input, { ...init, signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }
    },
  },
});
```

### Don't use

- ❌ `transport: 'stdio'` — only for local dev; explicitly warned against in production by the bundled docs.
- ❌ `Experimental_StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio` in a Vercel route — won't work in serverless.
- ❌ Closing the MCP client in a `try/finally` around `streamText` — race condition. Use `onFinish`.
- ❌ Holding a single long-lived `MCPClient` across requests in a Vercel function — instances are not guaranteed to be reused, and the MCP doc says: "For short-lived usage (e.g., single requests), close the client when the response is finished."

**Sources:**
- `node_modules/ai/docs/03-ai-sdk-core/16-mcp-tools.mdx` (transport, schemas, lifetime patterns)
- `node_modules/@ai-sdk/mcp/dist/index.d.mts` lines 480-531 (`MCPClient` interface, `MCPClientConfig`, `tools<TOOL_SCHEMAS>` signature)
- `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts` lines 611-631 (`dynamicTool` vs `tool` selection)
- `node_modules/@ai-sdk/mcp/CHANGELOG.md` 1.0.20 → 1.0.36

---

## Sub-Question 4 — Vercel deployment constraints (timeout, streaming, edge vs node)

### Verdict (HIGH confidence — important update vs. project assumptions)

**The Vercel Hobby tier max function duration is now 300 seconds (5 minutes), not 60 seconds.** The project documentation (`PROJECT.md` line 71, `route.ts` line 6) still says 60s, which was the historical Hobby cap but is **outdated as of 2025**. With fluid compute enabled (default for new Hobby projects), Hobby and Pro both default to 300s and Hobby's max is 300s.

This is a free upgrade to the stabilization milestone — bumping `maxDuration` from 60 → 300 gives Gemini-2.5-Flash room for multi-round MCP tool loops without hitting `FUNCTION_INVOCATION_TIMEOUT` (504).

### Constraints summary (verified at https://vercel.com/docs/functions/limitations as of April 2026)

| Constraint | Hobby | Notes |
|------------|-------|-------|
| Max function duration (Node.js) | **300s** (default & max, fluid compute) | Was 60s in older docs and in the current repo. |
| Max function duration (Edge) | 300s streaming, but **must begin streaming within 25s** | Edge has a strict 25s "first byte" requirement. |
| Memory | 2 GB / 1 vCPU | Plenty for streaming chat. |
| Concurrency | Auto-scales to 30,000 | Not a constraint at our scale. |
| Request body | 4.5 MB | The repo already sets `serverActions.bodySizeLimit: 4MB` in `next.config.ts`; this is fine. Pasted contracts and image attachments must fit in 4.5 MB. |
| Streaming | Fully supported on both Node and Edge runtimes | `toUIMessageStreamResponse()` is the correct API. |

### Runtime recommendation: **`'nodejs'` (default) — do NOT use `'edge'`**

Reasons:

1. `@ai-sdk/mcp` HTTP transport pulls in `@modelcontextprotocol/sdk` which uses Node-only modules (stream APIs, etc.). The bundled MCP doc warns stdio is local-only but does not explicitly endorse edge for HTTP transport, and there are no examples of `runtime = 'edge'` with `@ai-sdk/mcp` in the bundled or upstream docs.
2. Next.js 16 explicitly notes: "Using `runtime: 'edge'` is **not supported** for Cache Components." (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` line 23). If/when Cache Components is enabled, edge breaks.
3. The repo already has `serverExternalPackages: ['@ai-sdk/mcp']` configured in `frontend/next.config.ts` — this directive only matters on the Node runtime; on edge it's ignored, and the package may fail to resolve.
4. Edge has the 25s "must begin response" deadline; with a slow MCP server cold-start, this can trip even when the rest of the stream would have worked.

### Recommended route segment config

```ts
// frontend/src/app/api/chat/route.ts
export const runtime = 'nodejs';   // explicit; the default is also nodejs
export const maxDuration = 300;    // up from current 60 — Hobby allows this now
```

### Streaming caveats

- `toUIMessageStreamResponse()` returns SSE chunks. Vercel handles SSE on both runtimes. No `Content-Type: text/event-stream` header needed — the helper sets it.
- Aborting from the client (`useChat().stop()`) causes the underlying fetch to abort. AI SDK 6 propagates the abort signal into `streamText`, which terminates Gemini cleanly. No special handling required in the route.
- The `onFinish` callback (used for closing MCP client) fires on both successful completion AND aborts. The doc note: "Indicates whether the stream was aborted" is exposed via `isAborted` in the callback's event object.

### Don't use

- ❌ `runtime = 'edge'` for any route that uses `@ai-sdk/mcp` HTTP transport in this project. Period.
- ❌ Hard-coded `maxDuration = 60`. It's working today only because Gemini-2.5-Flash + 1-2 MCP rounds usually fits under 60s; the moment a tool call is slow or a multi-step loop kicks in, you hit a 504.
- ❌ Relying on Vercel `vercel.json` `functions.maxDuration` — for App Router, prefer the per-route `export const maxDuration` segment config (Next 16 recommends this; see `route-segment-config/maxDuration.md`).
- ❌ `experimental-edge` runtime — deprecated in 15.0.0-RC, removed in 16. Codemod available.

**Sources:**
- https://vercel.com/docs/functions/limitations (Hobby = 300s as of late 2025; verified live, April 2026)
- https://vercel.com/docs/functions/streaming-functions (AI SDK + streaming pattern)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`
- `frontend/next.config.ts` (`serverExternalPackages: ['@ai-sdk/mcp']`)

---

## Installation

No new installs required — milestone is bug-fix on the frozen stack. If you need the type-guard helpers and they're not exported in your local barrel, they come from the `ai` package directly:

```ts
import {
  isTextUIPart, isReasoningUIPart, isToolUIPart, isStaticToolUIPart,
  isFileUIPart, isDataUIPart, getToolName, getStaticToolName,
  type UIMessage, type UIMessagePart, type DynamicToolUIPart,
} from 'ai';
```

(All exported from `ai@6.0.158`; verified in `node_modules/ai/dist/index.d.ts`.)

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `mcpClient.tools()` default `'automatic'` (dynamic) | `mcpClient.tools({ schemas: { search_law: { inputSchema: z.object({...}) } } })` | After the empty-card bug is fixed, if you want per-tool custom UI components keyed on `tool-search_law` etc. instead of one generic `dynamic-tool` renderer. **Out of scope this milestone.** |
| `runtime = 'nodejs'` | `runtime = 'edge'` | If you fully drop `@ai-sdk/mcp` and call MCP via raw `fetch` to a JSON-RPC HTTP wrapper. Not worth it for 1-week scope. |
| `maxDuration = 300` | Lower (e.g., 120) | If you want stricter cost control on Vercel and accept occasional 504s on multi-step loops. Not recommended pre-launch. |
| `toUIMessageStreamResponse()` (SSE) | `toTextStreamResponse()` (raw text) | If you want to ditch `useChat`/parts entirely and render plain text. Loses tool-state UI and is a regression vs. current architecture. |
| Close MCP client in `streamText({ onFinish })` | Close in route-level `try/finally` | Only if you're not streaming (e.g., `generateText`). For `streamText`, `onFinish` is mandatory per the bundled docs. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `if ("text" in p)` cast in part rendering | Drops dynamic-tool parts → empty cards when assistant turn is tool-only | `isTextUIPart(p)` type guard + explicit `switch (part.type)` covering `dynamic-tool` |
| `(p as any).text` | Defeats the discriminated union; hides the bug | Type guards from `ai` |
| `convertToCoreMessages` | Removed in v6 | `await convertToModelMessages(...)` |
| `result.toAIStreamResponse()` / `toDataStreamResponse()` | Removed in v6 | `result.toUIMessageStreamResponse({ onError })` |
| `Experimental_Agent` | Replaced in v6 | `ToolLoopAgent` (not needed here — `streamText` is enough) |
| `runtime = 'edge'` | Breaks `@ai-sdk/mcp`; incompatible with Cache Components; 25s first-byte deadline | `runtime = 'nodejs'` (default) |
| `runtime = 'experimental-edge'` | Deprecated in 15-RC, removed in 16 | n/a |
| `maxDuration = 60` (hard-coded) | Outdated Hobby cap; modern Hobby allows 300s | `maxDuration = 300` |
| Closing MCP client in `try/finally` around `streamText()` | Race: `finally` fires before stream is consumed | `streamText({ onFinish: async () => mcpClient.close() })` |
| Reading `message.content` | Field does not exist on `UIMessage` in v6 | Iterate `message.parts` and use `isTextUIPart` for text |
| Filtering `part.type === 'tool-invocation' \|\| 'tool-result'` | Those types do not exist in v6; tool calls and results are unified into one part with `state` | `part.type === 'dynamic-tool'` (or `'tool-${name}'` for static tools) and switch on `part.state` |
| `mcpClient.tools({ schemas: {} })` (empty schemas) | Loads zero tools — not the same as `'automatic'` | Either omit options entirely, or pass full per-tool schemas |

---

## Stack Patterns by Variant

**If MCP server is healthy and Gemini answer requires no tool call:**
- Assistant message has parts like `[{ type: 'text', state: 'streaming', text: '...' }]` → text-part rendering path covers it. Current code works for this path, which is why some answers render fine and others come up empty.

**If MCP server is healthy and Gemini calls one or more tools:**
- Assistant message parts evolve through: `[step-start, dynamic-tool(input-streaming), dynamic-tool(input-available), dynamic-tool(output-available), step-start, text(streaming), text(done)]`
- The bug appears in the window between the first `dynamic-tool` and the eventual `text` part — the bubble has nothing to render under the current `"text" in p` filter.

**If MCP server is unavailable:**
- Route returns 503 JSON → `useChat`'s `error` is set → render the existing error card. Already works; no changes needed beyond preserving the JSON response shape.

**If Gemini hits the function timeout (504):**
- `useChat`'s `error` is set with a `FetchError`-like message. Add an explicit branch in the error UI for "took too long" so the user knows to retry with a simpler query. Bumping `maxDuration` to 300 makes this nearly disappear in practice.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `ai@6.0.158` | `@ai-sdk/react@3.0.160`, `@ai-sdk/google@3.0.62`, `@ai-sdk/mcp@1.0.36` | All four are in the v6 family; CHANGELOGs show coordinated `055cd68: fix: publish v6 to latest npm dist tag`. |
| `next@16.2.3` | `react@19.2.4`, `react-dom@19.2.4` | Required pairing. Next 16 mandates React 19. |
| `@ai-sdk/mcp@1.0.36` | MCP protocol versions including `2025-11-25` | Added in 1.0.27. Confirms compatibility with current `glluga-law-mcp.fly.dev` (assuming it runs a current MCP server SDK). |
| `runtime = 'nodejs'` | `@ai-sdk/mcp` HTTP transport | Required pairing — do not use edge. |
| `runtime = 'nodejs'` | `serverExternalPackages: ['@ai-sdk/mcp']` in `next.config.ts` | Already configured. Keeps MCP SDK out of the bundled output and runs it via Node's native `require`. |
| `eslint-config-next@16.2.3` | `eslint@9` | Already pinned. |

---

## Summary of Concrete Recommendations for the Roadmap

| # | Change | File | Confidence | Source |
|---|--------|------|------------|--------|
| 1 | Replace `getMessageText()` and the message render loop with `isTextUIPart` filter + explicit `switch (part.type)` covering `dynamic-tool` states | `frontend/src/components/chat/chat-container.tsx`, new `chat-message.tsx` body component | HIGH | `node_modules/ai/dist/index.d.ts:1684-2013`, `node_modules/@ai-sdk/mcp/src/tool/mcp-client.ts:611-631` |
| 2 | Add `onError: (e) => /* unmask */` to `result.toUIMessageStreamResponse({...})` | `frontend/src/app/api/chat/route.ts:91` | HIGH | `node_modules/ai/dist/index.d.ts:2378`, `04-ai-sdk-ui/21-error-handling.mdx` |
| 3 | Move `mcpClient.close()` from route `finally` into `streamText({ onFinish: async () => mcpClient.close() })` | `frontend/src/app/api/chat/route.ts:84-94` | HIGH | `03-ai-sdk-core/16-mcp-tools.mdx` (explicit guidance) |
| 4 | Bump `export const maxDuration = 60` → `300` | `frontend/src/app/api/chat/route.ts:6` | HIGH | https://vercel.com/docs/functions/limitations (Hobby = 300s) |
| 5 | Add explicit `export const runtime = 'nodejs'` | `frontend/src/app/api/chat/route.ts` | HIGH | `route-segment-config/runtime.md` + Cache Components incompat |
| 6 | Wrap MCP transport `fetch` with 15s `AbortController` timeout | `frontend/src/app/api/chat/route.ts:60-66` | MEDIUM | `@ai-sdk/mcp@1.0.34` CHANGELOG (added custom fetch support); pattern is standard JS |
| 7 | Render `step-start` boundaries between tool rounds for Active req #3 (tool UI feedback) | new component | HIGH | `04-ai-sdk-ui/03-chatbot-tool-usage.mdx` "Step start parts" section |
| 8 | Set `redirect: 'error'` on MCP HTTP transport for SSRF defense | `frontend/src/app/api/chat/route.ts:60-66` | MEDIUM | `@ai-sdk/mcp@1.0.29` CHANGELOG |

Items 1-5 are required to ship the milestone. Items 6-8 are stretch / nice-to-have for the same code path.

---

## Sources

- `frontend/node_modules/ai@6.0.158/docs/04-ai-sdk-ui/02-chatbot.mdx` — canonical `useChat` + `streamText` + `toUIMessageStreamResponse` example (HIGH)
- `frontend/node_modules/ai@6.0.158/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx` — canonical tool/dynamic-tool rendering with state machine (HIGH)
- `frontend/node_modules/ai@6.0.158/docs/04-ai-sdk-ui/21-error-handling.mdx` — `onError` patterns (HIGH)
- `frontend/node_modules/ai@6.0.158/docs/03-ai-sdk-core/16-mcp-tools.mdx` — MCP transport + `onFinish` close pattern (HIGH)
- `frontend/node_modules/ai@6.0.158/docs/08-migration-guides/24-migration-guide-6-0.mdx` — v5→v6 breaking changes (HIGH)
- `frontend/node_modules/ai@6.0.158/dist/index.d.ts` lines 1684-2013 — full `UIMessagePart` discriminated union, `DynamicToolUIPart` state machine, type-guard helpers (HIGH — direct type definitions, not docs)
- `frontend/node_modules/ai@6.0.158/dist/index.d.ts` lines 2305-2380 — `UIMessageStreamOptions` / `toUIMessageStreamResponse` shape (HIGH)
- `frontend/node_modules/ai@6.0.158/dist/index.d.ts` lines 3270-3280, 3855-3859 — `streamText` `stopWhen` default and `convertToModelMessages` async signature (HIGH)
- `frontend/node_modules/ai@6.0.158/dist/index.mjs` lines 12748, 12887 — `DefaultChatTransport` default `api: '/api/chat'` and `AbstractChat` default transport (HIGH — runtime source)
- `frontend/node_modules/@ai-sdk/mcp@1.0.36/src/tool/mcp-client.ts` lines 611-631 — proof that `mcpClient.tools()` default mode wraps in `dynamicTool` (HIGH — direct source)
- `frontend/node_modules/@ai-sdk/mcp@1.0.36/dist/index.d.mts` lines 480-531 — `MCPClient` interface, `tools<TOOL_SCHEMAS>` signature, `MCPClientConfig` (HIGH)
- `frontend/node_modules/@ai-sdk/mcp@1.0.36/CHANGELOG.md` — 1.0.20 → 1.0.36 patch history (HIGH)
- `frontend/node_modules/next@16.2.3/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/index.md` — Next 16 route segment config (HIGH)
- `frontend/node_modules/next@16.2.3/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` (HIGH)
- `frontend/node_modules/next@16.2.3/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md` (HIGH)
- https://vercel.com/docs/functions/limitations — Hobby max duration 300s, fetched April 2026 (HIGH)
- https://vercel.com/docs/functions/streaming-functions — Vercel streaming guidance, fetched April 2026 (HIGH)
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot — official AI SDK chatbot docs, fetched April 2026 (MEDIUM — used for cross-check; primary truth is the bundled `node_modules/ai/docs/`)
- https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools — official AI SDK MCP docs, fetched April 2026 (MEDIUM — cross-check)

---
*Stack research for: Next.js 16 + AI SDK 6 + MCP streaming chat stabilization*
*Researched: 2026-04-13*
