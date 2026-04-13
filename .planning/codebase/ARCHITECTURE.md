# Architecture

**Analysis Date:** 2026-04-13

## Pattern Overview

**Overall:** Multi-layer AI chat application with dual frontend implementations (Next.js web + Chainlit legacy) and Python backend, utilizing function calling pattern for tool-based AI reasoning.

**Key Characteristics:**
- Tool-driven architecture: AI models make function calls to query external law APIs
- Stateless API layer: Frontend communicates with serverless backend endpoints
- Client-side state management: Conversations stored in browser localStorage
- Provider agnostic: Support for multiple AI models (Gemini, with extensibility for OpenAI, Anthropic)
- External service integration: National Law Information Center API as primary data source

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface for chat interactions, conversation management, and authentication
- Location: `frontend/src/` (Next.js) and `app.py` (Chainlit legacy)
- Contains: React components, page layouts, UI utilities, theme/auth providers
- Depends on: Authentication providers (NextAuth), AI SDK (@ai-sdk/react, @ai-sdk/google), MCP client
- Used by: End users accessing web interface

**API Gateway Layer (Next.js Server):**
- Purpose: Stream-based chat endpoint bridging frontend messages to AI models and external tools
- Location: `frontend/src/app/api/chat/route.ts`
- Contains: Message conversion, MCP client initialization, streaming response handling
- Depends on: AI SDK core (streamText), MCP protocol, Gemini model, law API via MCP
- Used by: Frontend chat container via HTTP POST requests

**Business Logic Layer (Backend - Python):**
- Purpose: Core AI reasoning and tool invocation for Slack and legacy Chainlit interfaces
- Location: `bot/gemini_client.py`, `bot/slack_handler.py`
- Contains: Function calling loops, message history management, tool orchestration
- Depends on: Google Generative AI SDK, Slack Bolt framework, law API client
- Used by: Slack bot entry point and Chainlit app

**Integration Layer (Data & Tools):**
- Purpose: External API abstraction and tool definitions for AI model consumption
- Location: `law/api.py` (API client), `law/tools.py` (Gemini function declarations)
- Contains: HTTP requests to National Law Information Center, XML/JSON parsing, function schemas
- Depends on: httpx (async HTTP), Google Generative AI types, law.go.kr service
- Used by: Gemini model as callable tools, streamText in Next.js API route

**State Management Layer:**
- Purpose: Conversation persistence and retrieval
- Location: `frontend/src/lib/conversations.ts` (browser) and Slack thread context
- Contains: localStorage wrapper, CRUD operations, conversation metadata
- Depends on: Browser localStorage API, conversation interface types
- Used by: ChatContainer component, page.tsx main state coordinator

**Authentication Layer:**
- Purpose: User identity verification and authorization
- Location: `frontend/src/lib/auth.ts` (NextAuth), `app.py` (OAuth callback)
- Contains: OAuth provider setup, domain-based access control, session handling
- Depends on: NextAuth v5, Google OAuth provider, Slack user context
- Used by: Layout providers, middleware authentication guards

## Data Flow

**Web Chat Flow (Next.js):**

1. User types message in `ChatInput` component
2. `ChatContainer.handleSubmit()` sends POST to `/api/chat` with text/files and modelId
3. `frontend/src/app/api/chat/route.ts` receives request:
   - Converts UIMessages to ModelMessages via `convertToModelMessages()`
   - Creates MCP client connection to `glluga-law-mcp` server
   - Loads tools from MCP server
   - Calls `streamText()` with Gemini model, system prompt, messages, and tools
4. Gemini model streams response back to client
5. When Gemini calls a tool (via MCP), the tool is executed on law-mcp server
6. Tool results stream back in response
7. `ChatContainer` receives streamed message and calls `onMessagesChange()` to save to localStorage
8. UI updates with received assistant response

**Slack Chat Flow:**

1. User mentions `@法令봇` in Slack with question
2. `slack_handler.py:handle_mention()` receives event, extracts clean message
3. Retrieves thread history via Slack API → converts to Gemini history format
4. Calls `gemini_client.ask(user_message, history=history)`
5. `ask()` in `bot/gemini_client.py`:
   - Initializes Gemini model with law_tools
   - Sends user message to model
   - Enters function calling loop (max 6 rounds):
     - Checks response for `function_call` parts
     - If found, extracts function name and args
     - Maps function name to handler in `TOOL_HANDLERS` dict
     - Executes handler (e.g., `api.search_law()`)
     - Truncates result to 3000 chars (token optimization)
     - Sends function_response back to model
   - Breaks when no more function calls or max rounds reached
   - Extracts text from response.candidates, truncates to 3900 chars
6. `handle_mention()` posts answer to Slack thread via `say()`
7. Removes "processing" reaction indicator

**Tool Invocation Flow:**

1. Gemini/AI model determines a tool is needed based on user query
2. Model generates `function_call` with:
   - `name`: "search_law", "get_law_text", "search_decisions", or "get_decision_text"
   - `args`: dict with parameters (query, target, mst, id, etc.)
3. Tool handler executes:
   - `search_law()`: queries law.go.kr/lawSearch.do, returns XML, parsed to JSON with total count
   - `get_law_text()`: queries law.go.kr/lawService.do with MST code, returns law text and sections
   - `search_decisions()`: delegates to `search_law()` with different target
   - `get_decision_text()`: queries law.go.kr/lawService.do for court decision text
4. Result converted to string via JSON serialization
5. Result sent back to AI model for reasoning/response generation

**State Management Flow:**

Frontend:
- `page.tsx` loads all conversations from localStorage on mount
- Sets activeId to first conversation or creates new one
- `ChatContainer` receives initialMessages from active conversation
- As messages update, triggers `onMessagesChange()` callback
- `page.tsx` calls `updateConversation()` to save to localStorage
- localStorage fires no events; polling via useEffect message tracking

Slack/Chainlit:
- Conversation history pulled from Slack thread on each message (stateless per request)
- Last 6 turns kept in history to manage token usage
- No persistent storage in backend (Slack is source of truth)

## Key Abstractions

**Tool Handler Pattern:**

Purpose: Decouple AI model requests from law API implementation

Location: `law/tools.py` (FunctionDeclaration schemas), `law/api.py` (implementations), `bot/gemini_client.py` (routing)

Pattern:
```python
# Tools are declared with JSON schemas for AI model
law_tools = Tool(function_declarations=[
    FunctionDeclaration(name="search_law", parameters={...}),
    ...
])

# Handler mapping for execution
TOOL_HANDLERS = {
    "search_law": api.search_law,
    "get_law_text": api.get_law_text,
    ...
}

# Execution in function calling loop
handler = TOOL_HANDLERS.get(func_name)
result = await handler(**func_args)
```

**Conversation Model:**

Purpose: Unified interface for managing multi-turn chat history

Location: `frontend/src/lib/conversations.ts`

Structure:
```typescript
interface Conversation {
  id: string;              // Unique identifier
  title: string;           // Derived from first user message
  messages: Message[];     // Array of user/assistant turns
  createdAt: number;       // Timestamp in ms
  updatedAt: number;       // Timestamp in ms
}

interface Message {
  id: string;              // Message-level ID
  role: "user" | "assistant";
  content: string;         // Plain text content
}
```

**MCP (Model Context Protocol) Integration:**

Purpose: Bridge Next.js API to external law-mcp server for tool access

Location: `frontend/src/app/api/chat/route.ts`

Pattern:
- HTTP transport to `glluga-law-mcp.fly.dev/mcp?oc={LAW_API_KEY}`
- Lazy initialization; skips tools if connection fails (graceful degradation)
- Tools fetched at request time; passed to `streamText()`
- Connection closed in finally block

**Message Conversion:**

Purpose: Normalize between UI messages and AI SDK model messages

Location: `frontend/src/app/api/chat/route.ts`

Pattern:
```typescript
const messages = await convertToModelMessages(uiMessages);
// Converts Message[] to internal AI SDK format with proper role/content structure
```

## Entry Points

**Web Application Entry Point:**

Location: `frontend/src/app/layout.tsx` (root layout) → `frontend/src/app/page.tsx` (home page)

Triggers: User navigates to web URL

Responsibilities:
- Load SessionProvider, ThemeProvider wrappers
- Check authentication status
- Render LoginPage (if not authenticated) or ChatApp (if authenticated)
- Manage app-level state: conversations, activeId, sidebar, view modes
- Route between chat view, guide view, updates view

**API Chat Route:**

Location: `frontend/src/app/api/chat/route.ts`

Triggers: POST request from ChatContainer with messages array

Responsibilities:
- Parse request body for messages and modelId
- Convert UI messages to model messages
- Initialize MCP client (with fallback if unavailable)
- Call streamText with Gemini model and tools
- Stream response back as UIMessageStreamResponse

**Slack Bot Entry Point:**

Location: `main.py` (entry) → `bot/slack_handler.py:start()`

Triggers: Script execution via `python main.py`

Responsibilities:
- Check required environment variables
- Initialize Slack app with token
- Create socket mode handler
- Listen for app_mention events
- Orchestrate mention → Gemini → response flow

**Chainlit App Entry Point:**

Location: `app.py`

Triggers: `chainlit run app.py` command

Responsibilities:
- OAuth callback handling for Google authentication
- Session initialization
- Message event routing to `bot.gemini_client.ask()`
- Render Chainlit UI with custom styling

## Error Handling

**Strategy:** Layered error handling with user-friendly fallbacks and detailed logging.

**Patterns:**

Frontend API:
```typescript
// MCP connection failures → graceful degradation
try {
  mcpClient = await createMCPClient({...});
  tools = await mcpClient.tools();
} catch (e) {
  // Log error, continue without tools
  console.error("MCP 연결 실패", errMsg);
}

// 503/429 errors → specific user message
if (errMsg.includes("503") || errMsg.includes("Max sessions")) {
  return new Response(
    JSON.stringify({error: "법령 검색 서버가 현재 혼잡합니다..."}),
    { status: 503 }
  );
}
```

Slack Bot:
```python
# Function execution errors → wrapped in tool result
try:
  result = await handler(**func_args)
except Exception as e:
  result = {"error": f"도구 실행 실패: {e}"}

# Mention handler errors → user message in thread
try:
  answer = await gemini_client.ask(...)
except Exception as e:
  await say(text=f":warning: 답변 생성 중 오류가 발생했습니다.\n`{type(e).__name__}: {e}`")
```

Law API:
```python
# XML/JSON parse errors → return empty list
try:
  root = ET.fromstring(text)
except ET.ParseError:
  return []

# Network errors → httpx raises_for_status() propagated to caller
async with httpx.AsyncClient(timeout=15) as client:
  resp = await client.get(url, params=params)
  resp.raise_for_status()
```

## Cross-Cutting Concerns

**Logging:**
- Slack bot: Python logging module (`logger = logging.getLogger(__name__)`)
- Next.js API: Console logs for errors, MCP issues
- Frontend: Console errors only (no production logging library)
- No structured logging or centralized log aggregation detected

**Validation:**
- Input validation: User query text length checks (4000 char limit for answers)
- Schema validation: Gemini/MCP enforces function parameter types
- API response validation: XML/JSON parsing with try-catch; empty return on parse error

**Authentication:**
- NextAuth v5 with Google OAuth provider
- Domain restriction via `ALLOWED_EMAIL_DOMAIN` env var (checks Slack `hd` field or NextAuth `profile.hd`)
- Session stored in browser (NextAuth default)
- Slack: No explicit auth layer; assumes workspace-level access control

**Rate Limiting:**
- Law API: No client-side rate limiting; relies on API key quota
- Serverless function timeout: 60 seconds (Vercel free tier max)
- Gemini function calling: Max 6 rounds to prevent loops
- Slack message processing: One request per mention (no queue/throttling)

**Token Optimization:**
- Law API text truncation: 3000 chars max (function result)
- Slack answer truncation: 3900 chars max (message char limit)
- History management: Last 6 turns in Slack threads, all in localStorage
- JSON truncation: Results serialized as compact JSON strings

**Markdown Rendering:**
- Frontend: `react-markdown` with `remark-gfm` for GitHub-flavored markdown
- Slack: Native markdown via `chat:write` permission
- Chainlit: Built-in markdown rendering

---

*Architecture analysis: 2026-04-13*
