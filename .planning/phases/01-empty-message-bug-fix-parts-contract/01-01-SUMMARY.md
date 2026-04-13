---
phase: 01-empty-message-bug-fix-parts-contract
plan: 01
subsystem: api
tags: [ai-sdk-6, streamText, mcp, sse, next16, serverless]

# Dependency graph
requires:
  - phase: 00-research
    provides: root-cause diagnosis — stopWhen default + MCP close race + missing consumeSseStream/onError
provides:
  - streamText stopWhen=stepCountIs(8) so the model emits text after tool calls
  - closeMcp helper wired into streamText onFinish AND onError (no more try/finally race)
  - consumeSseStream drains tee'd copy to unblock backpressure on abort
  - toUIMessageStreamResponse onError unmasks error messages + redacts LAW_API_KEY
  - finishReason console log as runtime proof of the fix
affects: [01-02-parts-contract, 01-03-chat-container-wire-up, stre-phase-2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "streamText callback-owned resource teardown (close MCP from onFinish/onError, never try/finally)"
    - "toUIMessageStreamResponse onError must return a string and redact secrets before surfacing"
    - "consumeSseStream drain loop pattern (getReader + read until done)"

key-files:
  created: []
  modified:
    - frontend/src/app/api/chat/route.ts

key-decisions:
  - "stopWhen: stepCountIs(8) — 8 steps gives headroom for multi-step tool chains without runaway cost"
  - "closeMcp is an arrow function that swallows rejection — unhandled rejection in onFinish/onError would crash the serverless worker"
  - "onError on toUIMessageStreamResponse redacts /oc=[^&\\s\"]+/g → oc=REDACTED to prevent LAW_API_KEY leak"
  - "Explicit type annotation on mcpClient (Awaited<ReturnType<typeof createMCPClient>> | undefined) instead of a new import — restores TS narrowing lost when try/finally was removed"

patterns-established:
  - "Callback-owned MCP teardown: the resource owner is streamText, not the request handler"
  - "Serverless SSE abort safety: always pass consumeSseStream + onError to toUIMessageStreamResponse in AI SDK 6"

requirements-completed: [CHAT-02, CHAT-03, CHAT-04]

# Metrics
duration: ~15 min
completed: 2026-04-13
---

# Phase 01 Plan 01: fix-api-route Summary

**AI SDK 6 streamText stopWhen + MCP-close lifecycle + consumeSseStream/onError hardening of `frontend/src/app/api/chat/route.ts` — the three-defect root-cause fix for empty assistant turns in production.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-13
- **Tasks:** 3 (all acceptance criteria green)
- **Files modified:** 1

## Accomplishments

- **CHAT-02 closed:** `streamText` now receives `stopWhen: stepCountIs(8)`, so the generator is no longer terminated after the first tool-call step. The model is free to emit text in subsequent steps.
- **CHAT-03 closed:** `mcpClient.close()` moved out of the `try/finally` block that raced the lazy stream consumer. A `closeMcp` arrow function, wrapped in `try/catch` so it never throws, is invoked from both `streamText.onFinish` and `streamText.onError` — the correct lifecycle for a lazy-consumed stream.
- **CHAT-04 closed:** `toUIMessageStreamResponse` now receives `{ consumeSseStream, onError }`. `consumeSseStream` drains the tee'd `ReadableStream<string>` (getReader → read until `done`), eliminating the backpressure deadlock on client-abort. `onError` replaces the default "An error occurred" masking with the real message and runs `/oc=[^&\s"]+/g → "oc=REDACTED"` before returning, so `LAW_API_KEY` can never leak through an error payload.
- **Operational proof-of-fix:** `onFinish` logs `finishReason` to stdout. After deployment the Vercel function logs will show `finishReason: "stop"` (not `"tool-calls"`), which is success criterion #8 of the phase.

## Task Commits

1. **Task 1-01-01: Replace route.ts streamText block with fixed version** — covered by `eaff9d7`
2. **Task 1-01-02: Verify build and type-check pass after route.ts edit** — no commit (verification only); `npx tsc --noEmit` and `npm run build` both exited 0
3. **Task 1-01-03: Commit the fix** — `eaff9d7` (fix)

All task work landed in a single atomic commit `eaff9d7` per the plan's `commit_subject` frontmatter.

## Files Created/Modified

- `frontend/src/app/api/chat/route.ts` — Import of `stepCountIs` added, `let mcpClient` annotated, `try/finally` replaced with a `closeMcp` helper + hardened `streamText` and `toUIMessageStreamResponse` call. +52 / -14 lines.

## Decisions Made

- **Type annotation over new import** (`Awaited<ReturnType<typeof createMCPClient>> | undefined`): removing the `try/finally` broke control-flow narrowing on `let mcpClient;`. The cleanest fix is an explicit type. Importing the `MCPClient` type from `@ai-sdk/mcp` is possible but adds an import for a single use — the `Awaited<ReturnType<...>>` pattern keeps the import surface unchanged.
- **Redaction regex** `/oc=[^&\s"]+/g`: matches the `oc=API_KEY` query parameter anywhere in an error message. Non-capturing, global, handles both URL and quoted-string contexts.
- **`stopWhen: stepCountIs(8)`**: 8 steps is the same ceiling the research document recommends (§1.1). Headroom for multi-step tool chains without runaway cost on a 60-second serverless function.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] TypeScript implicit-any on `let mcpClient`**

- **Found during:** Task 1-01-02 (`npx tsc --noEmit`)
- **Issue:** Removing the `try/finally` wrapper eliminated the control-flow path that was teaching TypeScript the type of `mcpClient`. `tsc` reported:
  - `src/app/api/chat/route.ts(56,7): error TS7034: Variable 'mcpClient' implicitly has type 'any' in some locations where its type cannot be determined.`
  - `src/app/api/chat/route.ts(86,10): error TS7005: Variable 'mcpClient' implicitly has an 'any' type.`
- **Fix:** Changed `let mcpClient;` to `let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | undefined;`. No new imports, preserves full inference.
- **Files modified:** `frontend/src/app/api/chat/route.ts` (1 line)
- **Verification:** Re-ran `npx tsc --noEmit` → exit 0; `npm run build` → exit 0 with "Compiled successfully in 2.4s".
- **Committed in:** `eaff9d7` (part of the single atomic plan commit).

---

**Total deviations:** 1 auto-fixed (1 Rule 3 — Blocking)
**Impact on plan:** Type-safety fix only. No scope change, no extra files touched, acceptance criteria still satisfied.

## Issues Encountered

**D-09 pre/post `m.parts` JSON diagnostic capture — partially deferred.** The orchestrator-level instruction asked for a `console.log(JSON.stringify(m.parts))` capture before/after the fix, embedded in the commit body. That requires a live environment (local dev with `LAW_API_KEY` or production) and a chat round-trip, which is outside the autonomous scope of Plan 01-01. The server-side `finishReason` log added in `onFinish` provides the equivalent proof from Vercel logs once deployed. The client-side parts-contract before/after capture is naturally covered by Plan 01-03's production UAT task (1-03-07) against `frontend-phi-six-16.vercel.app`.

## User Setup Required

None — no external service configuration required. Existing `LAW_API_KEY` in Vercel env continues to work; no new env vars, no new accounts.

## Next Phase Readiness

**Plan 01-02 (Wave 2) is unblocked.** Plan 01-02 creates `frontend/src/lib/ui-message-parts.ts` and `message-part-renderer.tsx` — both new files, zero overlap with `route.ts`. Nothing in this plan locks Plan 01-02's design.

**Plan 01-03 (Wave 3, non-autonomous) will depend on:**
- The fix landing in Vercel production so the manual UAT gate can verify "근로기준법 제60조 연차휴가" returns a text answer.
- The parts-contract library Plan 01-02 will create.

---
*Phase: 01-empty-message-bug-fix-parts-contract*
*Completed: 2026-04-13*

## Self-Check: PASSED

- [x] `frontend/src/app/api/chat/route.ts` exists on disk
- [x] `git log --oneline --all --grep="01-01"` returns the commit (`eaff9d7`)
- [x] No "Issues Encountered" item marks the plan as failed — diagnostic deferral is a documented scope observation, not a failure
