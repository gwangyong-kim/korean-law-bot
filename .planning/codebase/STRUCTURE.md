# Codebase Structure

**Analysis Date:** 2026-04-13

## Directory Layout

```
korean-law-bot/
├── frontend/                          # Next.js web application
│   ├── public/                        # Static assets (favicons, images)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── auth/
│   │   │   │   │   └── [...nextauth]/route.ts      # NextAuth route handlers
│   │   │   │   └── chat/
│   │   │   │       └── route.ts                     # Streaming chat endpoint
│   │   │   ├── test-sidebar/
│   │   │   │   └── page.tsx                         # Development sidebar test page
│   │   │   ├── layout.tsx                           # Root layout (providers)
│   │   │   ├── page.tsx                             # Home page (auth + chat app)
│   │   │   └── globals.css                          # Global styles
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chat-container.tsx               # Main chat UI + state
│   │   │   │   ├── chat-input.tsx                   # Message input with file upload
│   │   │   │   ├── chat-message.tsx                 # Individual message display
│   │   │   │   ├── chat-sidebar.tsx                 # Conversation list sidebar
│   │   │   │   ├── guide-view.tsx                   # Usage guide/tips view
│   │   │   │   ├── model-selector.tsx               # Model dropdown selector
│   │   │   │   └── updates-view.tsx                 # Release notes view
│   │   │   ├── layout/
│   │   │   │   └── theme-toggle.tsx                 # Dark/light mode button
│   │   │   └── ui/
│   │   │       ├── avatar.tsx                       # Avatar component (shadcn)
│   │   │       ├── button.tsx                       # Button component (shadcn)
│   │   │       ├── input.tsx                        # Input component (shadcn)
│   │   │       ├── scroll-area.tsx                  # Scroll area (shadcn)
│   │   │       ├── separator.tsx                    # Divider (shadcn)
│   │   │       ├── skeleton.tsx                     # Loading skeleton (shadcn)
│   │   │       └── textarea.tsx                     # Textarea component (shadcn)
│   │   ├── lib/
│   │   │   ├── auth.ts                              # NextAuth setup & config
│   │   │   ├── conversations.ts                     # localStorage CRUD for conversations
│   │   │   ├── law-api.ts                           # (Legacy, not in use in current arch)
│   │   │   ├── models.ts                            # Available AI model definitions
│   │   │   └── utils.ts                             # Utility functions (clsx wrapper)
│   │   └── providers/
│   │       ├── session-provider.tsx                 # NextAuth SessionProvider wrapper
│   │       └── theme-provider.tsx                   # Theme context provider
│   ├── .next/                         # Build output (gitignore)
│   ├── node_modules/                  # Dependencies (gitignore)
│   ├── .vercel/                       # Vercel deployment config
│   ├── package.json                   # Frontend dependencies
│   ├── tsconfig.json                  # TypeScript config with path aliases
│   ├── next.config.ts                 # Next.js config
│   ├── postcss.config.mjs              # PostCSS for Tailwind
│   ├── eslint.config.mjs               # ESLint rules
│   └── AGENTS.md                      # Version notes (Next.js 16)
│
├── bot/                               # Python backend (Slack + Chainlit)
│   ├── __init__.py
│   ├── gemini_client.py               # Core AI reasoning with function calling
│   └── slack_handler.py               # Slack event handling (Socket Mode)
│
├── law/                               # Law API integration
│   ├── __init__.py
│   ├── api.py                         # law.go.kr API client (search & details)
│   └── tools.py                       # Gemini function declarations (schemas)
│
├── .chainlit/                         # Chainlit config directory
├── .planning/                         # GSD planning artifacts
│   └── codebase/                      # Generated codebase analysis docs
│
├── main.py                            # Slack bot entry point (python main.py)
├── app.py                             # Chainlit app entry point (chainlit run app.py)
├── requirements.txt                   # Python dependencies
├── .env.example                       # Environment variable template
├── .gitignore                         # Git ignore rules
├── .env                               # Environment config (gitignore)
├── Dockerfile                         # Docker image for deployment
├── chainlit.md                        # Chainlit setup notes
├── README.md                          # Project documentation
└── .git/                              # Git repository
```

## Directory Purposes

**`frontend/`:**
- Purpose: Next.js 16 web application with React 19
- Contains: React components, pages, API routes, utilities, styling
- Key files: `src/app/page.tsx` (main UI), `src/app/api/chat/route.ts` (AI endpoint), `src/lib/conversations.ts` (state)

**`frontend/src/app/`:**
- Purpose: Next.js App Router structure
- Contains: Page components, layout hierarchy, API route handlers
- Key files: `page.tsx` (home), `layout.tsx` (root provider setup), `api/chat/route.ts` (LLM endpoint)

**`frontend/src/components/chat/`:**
- Purpose: Chat-specific React components
- Contains: Message display, input handling, sidebar, model selection, guides
- Key files: `chat-container.tsx` (main state + AI integration), `chat-message.tsx` (message rendering), `chat-input.tsx` (text + file input)

**`frontend/src/components/ui/`:**
- Purpose: Reusable UI components (shadcn/ui)
- Contains: Button, input, scroll area, skeleton, separator, avatar, textarea
- Pattern: Each file exports a single component with Tailwind classes

**`frontend/src/lib/`:**
- Purpose: Shared utilities and state management
- Contains: Authentication setup (NextAuth), conversation persistence (localStorage), model definitions, utility functions
- Key files: `auth.ts` (NextAuth config), `conversations.ts` (CRUD ops), `models.ts` (AI model list)

**`frontend/src/providers/`:**
- Purpose: Context providers for app-wide state
- Contains: NextAuth SessionProvider, theme provider
- Usage: Wrapped in `layout.tsx` root layout

**`bot/`:**
- Purpose: Python backend for Slack and Chainlit interfaces
- Contains: AI client with function calling loop, Slack event handlers
- Key files: `gemini_client.py` (ask function with tool orchestration), `slack_handler.py` (event listener + response sender)

**`law/`:**
- Purpose: National Law Information Center API integration
- Contains: HTTP client for law.go.kr, tool schema definitions
- Key files: `api.py` (search_law, get_law_text, search_decisions, get_decision_text), `tools.py` (Gemini FunctionDeclaration objects)

**`bot/` and `law/` are Python modules:**
- Both are importable packages (have `__init__.py`)
- Imported by `main.py` (Slack), `app.py` (Chainlit), and `frontend/src/app/api/chat/route.ts` (MCP server)

## Key File Locations

**Entry Points:**

- **Web:** `frontend/src/app/layout.tsx` → `frontend/src/app/page.tsx`
  - Renders root layout with SessionProvider, ThemeProvider
  - Renders LoginPage (unauthenticated) or ChatApp (authenticated)
  - ChatApp manages conversation state and renders ChatContainer

- **API:** `frontend/src/app/api/chat/route.ts`
  - POST endpoint receiving { messages, modelId }
  - Streams AI response via `streamText()` with MCP tools
  - Called by ChatContainer via `useChat()` hook

- **Slack Bot:** `main.py`
  - Checks environment variables
  - Imports and calls `bot.slack_handler.start()`
  - Socket Mode listener for Slack events

- **Chainlit:** `app.py`
  - Chainlit event decorators (@cl.on_chat_start, @cl.on_message)
  - OAuth callback for Google authentication
  - Calls `bot.gemini_client.ask()` for responses

**Configuration:**

- `frontend/tsconfig.json`: Path alias `@/*` → `src/*`
- `frontend/next.config.ts`: Next.js build config
- `frontend/postcss.config.mjs`: Tailwind CSS processor
- `frontend/eslint.config.mjs`: Linting rules
- `.env.example`: Template for required API keys
- `requirements.txt`: Python dependencies (slack-bolt, google-generativeai, httpx, python-dotenv, chainlit)

**Core Logic:**

- `bot/gemini_client.py:ask()`: Main AI function, orchestrates function calling loop
- `bot/slack_handler.py:handle_mention()`: Entry for Slack mentions, calls ask() with thread history
- `law/api.py`: 4 async functions (search_law, get_law_text, search_decisions, get_decision_text)
- `frontend/src/app/api/chat/route.ts:POST()`: Streams AI response using AI SDK
- `frontend/src/lib/conversations.ts`: CRUD for conversations in localStorage

**Testing:**

- `frontend/src/app/test-sidebar/page.tsx`: Development-only test page
- No dedicated test files found; no test framework configured

## Naming Conventions

**Files:**

- React components: `PascalCase.tsx` (e.g., `ChatContainer.tsx`, `ChatMessage.tsx`)
- Pages: `PascalCase.tsx` or `page.tsx` (e.g., `page.tsx`, `layout.tsx`)
- Utilities/modules: `kebab-case.ts` (e.g., `chat-container.tsx`, `theme-toggle.tsx`)
- Python modules: `snake_case.py` (e.g., `gemini_client.py`, `slack_handler.py`)
- API routes: Dynamic segments in brackets (e.g., `[...nextauth]`, `route.ts`)

**Directories:**

- Feature directories: `kebab-case` (e.g., `chat/`, `layout/`, `api/auth/`)
- Utility directories: `lib/`, `components/`, `providers/`, `app/`
- Package directories: `snake_case` (e.g., `bot/`, `law/`)

**Functions:**

- React components: `PascalCase` (e.g., `ChatContainer`, `LoginPage`, `EmptyState`)
- Utility functions: `camelCase` (e.g., `handleSubmit`, `getConversations`, `createConversation`)
- Event handlers: `handle*` or `on*` prefix (e.g., `handleSubmit`, `onMessage`, `onSelect`)
- Async functions: Same casing, async keyword (e.g., `async function ask()`, `async function search_law()`)

**Variables:**

- State: `camelCase` (e.g., `activeId`, `sidebarOpen`, `viewMode`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `STORAGE_KEY`, `MAX_TOOL_ROUNDS`, `SYSTEM_INSTRUCTION`)
- Boolean flags: `is*` or `*Open/*Enabled` (e.g., `isLoading`, `sidebarOpen`, `searchOpen`)

**Types:**

- Interfaces: `PascalCase`, `I` prefix optional (e.g., `Conversation`, `Message`, `ChatContainerProps`)
- Enum-like objects: `UPPER_SNAKE_CASE` keys (e.g., `MODELS`, `SEARCH_TARGETS`)

## Where to Add New Code

**New Feature (Law Search Enhancement):**

1. **Frontend logic:**
   - Add hook/utility: `frontend/src/lib/[feature-name].ts`
   - Add component: `frontend/src/components/chat/[feature-component].tsx`
   - Update `frontend/src/app/page.tsx` or `ChatContainer.tsx` to use it

2. **Backend Python logic:**
   - Add function to `law/api.py` (if querying law.go.kr)
   - Add tool definition to `law/tools.py` (if exposing to AI)
   - Reference in `bot/gemini_client.py:TOOL_HANDLERS`

3. **Tests:**
   - Create `frontend/src/components/chat/__tests__/[component].test.tsx` (if test framework added)
   - Create `tests/test_[module].py` (if Python tests added)

**New Component (UI Element):**

1. **Shadcn component:** `frontend/src/components/ui/[component-name].tsx`
   - Copy from shadcn/ui library
   - Adjust imports for project structure

2. **Feature component:** `frontend/src/components/[feature]/[component-name].tsx`
   - Create in appropriate feature directory
   - Import shadcn UI components as needed

3. **Page:** `frontend/src/app/[route]/page.tsx`
   - Create route directory
   - Add `layout.tsx` if shared layout needed

**New API Route:**

1. **Handler:** `frontend/src/app/api/[route]/route.ts`
   - Export GET, POST, etc. as needed
   - Use serverless function timeout export: `export const maxDuration = 60;`
   - Return JSON or stream responses

**Utilities (Shared Helpers):**

- Add to `frontend/src/lib/utils.ts` (frontend) or create new file `frontend/src/lib/[util-name].ts`
- Add to `bot/`, `law/`, or new module if Python
- Keep utilities focused and reusable

**Styling:**

- Use Tailwind classes in JSX (no separate CSS files except global)
- Global styles: `frontend/src/app/globals.css`
- Component-scoped: className prop with cn() utility (clsx wrapper)
- Theme variables: Defined in CSS, consumed via `var()` or CSS variables

## Special Directories

**`frontend/.next/`:**
- Purpose: Next.js build output
- Generated: Yes (by `npm run build`)
- Committed: No (.gitignore)
- Contains: Optimized bundles, pre-rendered pages, server functions

**`frontend/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (.gitignore)

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by `/gsd-map-codebase` command)
- Committed: Yes (tracking documentation)
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, etc.

**`.env`:**
- Purpose: Runtime environment configuration
- Generated: No (developer-created from .env.example)
- Committed: No (.gitignore)
- Contains: API keys, secrets, configuration values
- Required variables: GEMINI_API_KEY, LAW_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, ALLOWED_EMAIL_DOMAIN (optional)

**`.chainlit/`:**
- Purpose: Chainlit application data directory
- Generated: Yes (by Chainlit on first run)
- Committed: No (.gitignore)
- Contains: User data, sessions, file uploads

## Dependency Tree (High-level)

```
frontend/
├── next (App Router, server functions, image optimization)
├── react & react-dom (UI rendering)
├── @ai-sdk/* (AI SDK for streaming, model integration, MCP)
│   ├── @ai-sdk/google (Gemini model provider)
│   ├── @ai-sdk/mcp (MCP client for tool integration)
│   └── @ai-sdk/react (useChat hook)
├── next-auth (OAuth authentication)
├── next-themes (dark mode)
├── tailwindcss (styling)
├── lucide-react (icons)
├── react-markdown + remark-gfm (markdown rendering)
└── shadcn components (button, input, scroll-area, etc.)

backend (bot/, law/):
├── google-generativeai (Gemini API)
├── slack-bolt (Slack event framework)
├── httpx (async HTTP for law API)
├── python-dotenv (env var loading)
└── chainlit (web UI framework, legacy)
```

---

*Structure analysis: 2026-04-13*
