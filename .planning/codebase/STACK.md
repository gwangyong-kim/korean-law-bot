# Technology Stack

**Analysis Date:** 2026-04-13

## Languages

**Primary:**
- TypeScript 5.x - Web frontend (`frontend/src`)
- Python 3.12 - Slack bot and Chainlit web UI (`bot/`, `law/`, `app.py`, `main.py`)

**Secondary:**
- JavaScript (ESM) - Build config files (`*.config.mjs`)
- JSX/TSX - React components (`frontend/src/components/`, `frontend/src/app/`)

## Runtime

**Environment:**
- Node.js (version not specified in package.json, inferred v18+)
- Python 3.12 (from `Dockerfile`)

**Package Manager:**
- npm (JavaScript/Node.js)
- pip (Python)
- Lockfile: `package-lock.json` presence not confirmed, assumed standard npm lockfile

## Frameworks

**Core Frontend:**
- Next.js 16.2.3 - Full-stack React framework with API routes (`frontend/`)
- React 19.2.4 - UI library
- React DOM 19.2.4 - DOM rendering

**Authentication:**
- NextAuth.js 5.0.0-beta.30 - Session management and OAuth (`frontend/src/lib/auth.ts`)

**AI/LLM:**
- AI SDK (Vercel) 6.0.158 - Unified LLM interface (`@ai-sdk/react`, `@ai-sdk/google`)
- Google AI SDK (@ai-sdk/google) 3.0.62 - Gemini API integration

**Backend/Bot:**
- Slack Bolt 1.21.0+ - Slack app framework (from `requirements.txt`)
- Chainlit 2.0.0+ - Chat UI framework (from `requirements.txt`)
- google-generativeai 0.8.0+ - Google Gemini API Python client

**Styling:**
- Tailwind CSS 4.x - Utility-first CSS framework
- PostCSS 4.x (via @tailwindcss/postcss) - CSS transformation
- Base UI 1.3.0 - Headless UI components
- Lucide React 1.8.0 - Icon library
- Sonner 2.0.7 - Toast notifications

**Markdown & Content:**
- React Markdown 10.1.0 - Markdown rendering
- Remark GFM 4.0.1 - GitHub Flavored Markdown support
- fast-xml-parser 5.5.11 - XML parsing for API responses

**Utilities:**
- class-variance-authority 0.7.1 - CSS utility generation
- clsx 2.1.1 - Conditional CSS class joining
- tailwind-merge 3.5.0 - Tailwind class merging
- next-themes 0.4.6 - Theme switching
- shadcn - UI component library

**Testing/Build:**
- ESLint 9.x - Linting
- eslint-config-next 16.2.3 - Next.js ESLint config
- Prettier (implied) - Code formatting
- TypeScript Compiler (tsc) - Type checking

## Key Dependencies

**Critical:**
- ai 6.0.158 - Enables streaming text, message conversion, and MCP client integration (`frontend/src/app/api/chat/route.ts`)
- @ai-sdk/google 3.0.62 - Gemini model access (default: `gemini-2.5-flash`)
- @ai-sdk/mcp 1.0.36 - Model Context Protocol for tool access (law API integration)
- google.generativeai 0.8.0+ (Python) - Gemini API with function calling for Slack bot

**Infrastructure:**
- httpx 0.27.0+ - HTTP client for law API calls (`law/api.py`)
- slack-bolt 1.21.0+ - Slack event handling and Socket Mode
- python-dotenv 1.0.0+ - Environment variable loading
- chainlit 2.0.0+ - Chat application framework with OAuth support

## Configuration

**Environment:**
- Frontend environment: `frontend/.env.local.example`
  - AUTH_SECRET (generated)
  - AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (Google OAuth credentials)
  - GEMINI_API_KEY (Google Gemini API key)
  - LAW_API_KEY (Korean National Law Information Center API key)
  - ALLOWED_EMAIL_DOMAIN (optional, restricts login to organization domain)

- Root environment: `.env.example`
  - SLACK_BOT_TOKEN (xoxb-...)
  - SLACK_APP_TOKEN (xapp-...)
  - GEMINI_API_KEY
  - LAW_API_KEY
  - OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET
  - CHAINLIT_AUTH_SECRET
  - ALLOWED_EMAIL_DOMAIN

**Build:**
- `frontend/tsconfig.json` - TypeScript compiler options (target: ES2017, strict mode, path alias `@/*`)
- `frontend/next.config.ts - Server external packages: `@ai-sdk/mcp`, serverAction body size limit: 4MB
- `frontend/eslint.config.mjs` - ESLint flat config (Next.js core-web-vitals and TypeScript)
- `frontend/postcss.config.mjs` - PostCSS with Tailwind CSS v4 plugin

## Platform Requirements

**Development:**
- Node.js 18+ (inferred from TypeScript 5.x and Next.js 16.x compatibility)
- Python 3.12+
- npm or yarn
- Git

**Production:**

**Frontend/Next.js:**
- Vercel (primary deployment platform, `.vercel/project.json` present in `frontend/`)
- Serverless function timeout: 60 seconds (max for free tier, set via `maxDuration = 60`)
- Environment variables must be set in Vercel dashboard

**Backend/Slack Bot:**
- Docker container (Dockerfile builds Python 3.12-slim image, exposes port 7860)
- Chainlit web UI runs on port 7860
- Can run on any platform supporting Docker or Python 3.12+

**Law API:**
- External: National Law Information Center (www.law.go.kr/DRF)
- Requires API key (LAW_API_KEY) from law.go.kr

---

*Stack analysis: 2026-04-13*
