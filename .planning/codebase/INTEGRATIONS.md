# External Integrations

**Analysis Date:** 2026-04-13

## APIs & External Services

**Large Language Models:**
- Google Gemini API - Core AI for law question answering
  - Python SDK: google-generativeai (bot)
  - JavaScript SDK: @ai-sdk/google (frontend)
  - Models: `gemini-2.5-flash` (default in `frontend/src/app/api/chat/route.ts`), `gemma-4-27b-it` (bot Slack integration)
  - Auth: `GEMINI_API_KEY` environment variable
  - Integration: Used in `bot/gemini_client.py` (Slack bot) and `frontend/src/app/api/chat/route.ts` (web UI)

**Korean Law Information:**
- National Law Information Center (law.go.kr) - Official law & precedent database
  - Base URL: `https://www.law.go.kr/DRF`
  - Endpoints: `lawSearch.do` (search laws/precedents), `lawService.do` (fetch full text)
  - Auth: `LAW_API_KEY` (OC parameter)
  - Client: `httpx` library in `law/api.py`
  - Integration: Function calling via Gemini in both bot and frontend
  - Access modes: Direct HTTP calls in backend, Model Context Protocol (MCP) in frontend

**Slack Platform:**
- Slack Bot API - Bot integration with Socket Mode
  - SDK: slack-bolt 1.21.0+
  - Auth: SLACK_BOT_TOKEN (xoxb-), SLACK_APP_TOKEN (xapp-)
  - Connection: Socket Mode (no webhook, firewall-friendly)
  - Handler: `bot/slack_handler.py` - listens to @app_mention events
  - Features: Thread history for context, reaction indicators, async message handling

**MCP (Model Context Protocol) Server:**
- glluga-law-mcp (custom deployment)
  - URL: `https://glluga-law-mcp.fly.dev/mcp?oc={LAW_API_KEY}`
  - Hosting: Fly.io
  - Purpose: Wraps Korean law API as MCP tools for AI SDK
  - Integration: `frontend/src/app/api/chat/route.ts` connects via `@ai-sdk/mcp`
  - Provides tool definitions for law search and precedent lookup

## Data Storage

**Databases:**
- None - Stateless architecture
- All conversation history stored in user session (frontend: user browser storage, Slack: thread context)
- No persistent backend database

**File Storage:**
- Local filesystem only - No cloud storage (S3, GCS, etc.)
- Static assets: `frontend/public/` served by Next.js

**Caching:**
- In-memory session storage (frontend: browser, backend: Slack thread context)
- No dedicated caching layer (Redis, Memcached, etc.)

## Authentication & Identity

**Primary Auth Provider:**
- Google OAuth 2.0
  - Frontend: NextAuth.js 5.0.0-beta.30 with Google provider
  - Backend (Chainlit): Native Google OAuth support
  - Slack Bot: No OAuth (uses bot/app tokens for Slack authentication)

**Implementation:**
- Frontend OAuth: `frontend/src/lib/auth.ts` - NextAuth handlers with optional domain restriction
  - Env vars: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
  - Callback: Validates Google Workspace domain (optional ALLOWED_EMAIL_DOMAIN)
  - Returns: User identifier (email) and metadata

- Chainlit OAuth: `app.py` - Native Chainlit OAuth callback
  - Validates Google Workspace `hd` (hosted domain) against ALLOWED_EMAIL_DOMAIN
  - Optional: If ALLOWED_EMAIL_DOMAIN not set, all Google accounts allowed

- Slack Bot: Token-based
  - No user authentication (bot operates at workspace level)
  - Uses SLACK_BOT_TOKEN and SLACK_APP_TOKEN

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, Bugsnag, or similar integration

**Logs:**
- Python: Standard Python logging (e.g., `logging.getLogger(__name__)` in `bot/slack_handler.py`)
- Frontend: Browser console logs (no centralized logging)
- Slack Bot: Logs to stdout (captured in Docker container logs or process output)
- Chainlit: Built-in chat UI logging

**Performance Monitoring:**
- Frontend: Vercel Web Analytics (implied by Vercel deployment)
- Slack Bot: No explicit monitoring

## CI/CD & Deployment

**Hosting:**
- Frontend: Vercel (serverless Next.js)
  - Project ID: prj_m4qrMwonQaSkzmTpYUQ6CwTFhZwy
  - Org ID: team_WGM7jh3jVeS0BaL93YHhfnLI
  - Serverless function timeout: 60 seconds (free tier max)
  - Environment: Development (as per .vercel metadata)

- Slack Bot + Chainlit UI: Docker container (self-hosted or cloud platform)
  - Dockerfile: Python 3.12-slim base, port 7860
  - Deployment platform: Not specified (could be Heroku, DigitalOcean, AWS ECS, Google Cloud Run, etc.)
  - Command: `chainlit run app.py --host 0.0.0.0 --port 7860`

- MCP Server: Fly.io
  - Service: glluga-law-mcp
  - Accessed via: https://glluga-law-mcp.fly.dev

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or similar workflow files

## Environment Configuration

**Required env vars:**

Frontend (`frontend/.env.local`):
- AUTH_SECRET - NextAuth session encryption key (generate: `openssl rand -base64 32`)
- AUTH_GOOGLE_ID - Google OAuth client ID
- AUTH_GOOGLE_SECRET - Google OAuth client secret
- GEMINI_API_KEY - Google Gemini API key
- LAW_API_KEY - Korean law API key (OC parameter)
- ALLOWED_EMAIL_DOMAIN (optional) - Restrict login to single domain

Root/Slack Bot (`.env`):
- SLACK_BOT_TOKEN - Slack bot user token (starts with xoxb-)
- SLACK_APP_TOKEN - Slack app-level token (starts with xapp-)
- GEMINI_API_KEY - Google Gemini API key
- LAW_API_KEY - Korean law API key
- OAUTH_GOOGLE_CLIENT_ID - Google OAuth client ID
- OAUTH_GOOGLE_CLIENT_SECRET - Google OAuth client secret
- CHAINLIT_AUTH_SECRET - Chainlit session key (random string)
- ALLOWED_EMAIL_DOMAIN (optional) - Restrict to organization domain

**Secrets location:**
- Development: Local `.env.local` (frontend) and `.env` (root) files
- Production: Vercel environment variables (frontend), Docker/K8s secrets (backend), process environment (Slack bot)
- Source control: `.env.example` files are committed; actual `.env` files are in `.gitignore`

## Webhooks & Callbacks

**Incoming:**
- Slack: @mention events via Socket Mode (not webhook-based)
  - Handler: `bot/slack_handler.py` - `handle_mention()` function
  - Event: `app_mention` when bot is @mentioned
  - Response: Async message in thread via `say()`

- Frontend API: `frontend/src/app/api/chat/route.ts`
  - POST /api/chat - Receives chat messages, streams response
  - Input: { messages: UIMessage[], modelId: string }
  - Output: Server-sent event stream (text)

- NextAuth: Google OAuth callback
  - Handler: `frontend/src/lib/auth.ts` - `signIn` callback
  - Validates domain before allowing login

**Outgoing:**
- Google Gemini API - Function calls for law search
  - Called from: `bot/gemini_client.py` (Slack), `frontend/src/app/api/chat/route.ts` (web)
  - Tool handlers: `law/api.py` functions (search_law, get_law_text, search_decisions, get_decision_text)

- National Law API (law.go.kr)
  - Called from: `law/api.py` via httpx
  - Endpoints: lawSearch.do, lawService.do
  - Format: XML responses, parsed to dict in `_parse_xml()`

## API Routes (Frontend)

**Authentication:**
- `frontend/src/app/api/auth/[...nextauth]/route.ts` - NextAuth endpoint (sign-in, sign-out, session)

**Chat:**
- `frontend/src/app/api/chat/route.ts` - POST to get AI response
  - Receives: { messages, modelId }
  - Returns: Server-sent event stream
  - Uses: Gemini model + MCP law tools
  - Timeout: 60 seconds

---

*Integration audit: 2026-04-13*
