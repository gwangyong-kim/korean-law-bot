# Phase 2: Streaming Stability & Error UX - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-13
**Phase:** 02-streaming-stability-error-ux
**Mode:** Interactive discuss (autonomous --interactive)
**User instruction:** "claude 너 재량껏 진행해줘" (all gray areas deferred to Claude's discretion)

## Areas presented

| # | Area | User selection |
|---|------|----------------|
| A | MCP 캐싱 + degraded mode | Deferred (claude discretion) |
| B | 에러 분류 및 라우팅 | Deferred (claude discretion) |
| C | 재시도 정책 | Deferred (claude discretion) |
| D | maxDuration + Gemini + 시스템 프롬프트 | Deferred (claude discretion) |

## Claude's auto-resolved decisions

Because the user explicitly delegated all areas, Claude selected the recommended option for each gray area based on:
1. REQUIREMENTS.md constraints (STRE-01~09)
2. Project constraints (Vercel free tier, AI SDK 6, single developer, 1-week timeline)
3. Codebase patterns (module-scope caching, JSON error bodies, existing ChatMessage component)
4. Minimum deviation from STRE-* specifications

See `02-CONTEXT.md` `<decisions>` section for D-01 through D-14.

### Key judgment calls

- **Caching store:** Module scope simple TTL (5min) instead of LRU/Redis — sufficient for single-endpoint, single-user deployment
- **Error transport:** Structured JSON body with `code` field — enables client-side message lookup without coupling to HTTP status
- **Retry site:** Server-side 1s delay for MCP 503, client-side regenerate() for user-initiated retry — separates transient infra failures from user intent
- **maxDuration:** Keep at 60s — Vercel free tier, Fluid Compute is separate infra decision, stopWhen(8) should typically complete < 30s
- **Gemini smoke test:** Manual (3 consecutive tool queries in production) — automation cost exceeds value for single developer

### Anti-decisions (explicitly rejected)

- AbortController-based timeout (D-01) — too MCP SDK-dependent, Promise.race is simpler
- Global error banner (D-07) — STRE-03 explicitly requires inline in bubble
- SYSTEM_PROMPT strict rule removal (D-14) — Out of Scope for legal accuracy; only *add* exception clause
- Automated thought_signature regression test (D-13) — manual verification is more realistic for this phase

## Deferred ideas (not folded)

- Server-side error logging / Sentry — Out of Scope (v2 V2-OBS)
- Multi-MCP failover — v2
- Error metric dashboards — v2
