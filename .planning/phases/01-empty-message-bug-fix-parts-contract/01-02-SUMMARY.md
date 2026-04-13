---
phase: 01-empty-message-bug-fix-parts-contract
plan: 02
subsystem: ui
tags: [ai-sdk-6, ui-message, parts-contract, react, typescript, type-guards]

# Dependency graph
requires:
  - phase: 01-01-fix-api-route
    provides: server-side fix that now emits multi-step assistant messages with text parts — creating the need for a proper parts renderer
provides:
  - "frontend/src/lib/ui-message-parts.ts — single-import module for isTextUIPart/isToolUIPart/getToolName + extractAssistantText helper"
  - "ExtractableMessage union (UIMessage | LegacyMessage) enabling read-time migration of localStorage conversations"
  - "frontend/src/components/chat/message-part-renderer.tsx — React client component that dispatches m.parts with exhaustive never-default"
  - "ToolChip sub-component rendering 4 D-06 dynamic-tool states + neutral fallback for approval states"
affects: [01-03-chat-container-wire-up, 03-tool-call-ui-feedback, 04-conversation-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-file re-export pattern for AI SDK type guards (project owns the import surface)"
    - "Union-type extractor with legacy fallback (ExtractableMessage) — read-time migration without storage rewrite"
    - "Exhaustive switch on UIMessagePart.type with never-default guarded by NODE_ENV (dev-throw / prod-log)"
    - "isToolUIPart narrowing before switch — tool-*, dynamic-tool handled uniformly via ToolChip"

key-files:
  created:
    - frontend/src/lib/ui-message-parts.ts
    - frontend/src/components/chat/message-part-renderer.tsx
  modified: []

key-decisions:
  - "extractAssistantText concatenates all text parts with empty join — matches how streaming UIs typically present multi-part responses"
  - "Unknown-shape fallback returns empty string + console.warn (D-03): conservative, doesn't crash the render tree on stale localStorage"
  - "isToolUIPart check comes BEFORE the switch to collapse static + dynamic tool handling into a single ToolChip path"
  - "assertNever signature takes UIMessagePart (not never) because data-* and approval states are type-valid but runtime-absorbed earlier — the assertNever branch is reached only if AI SDK 6 adds a new variant"
  - "ToolChip switch dispatches the 4 D-06 states explicitly; 3 remaining states (approval-requested/responded, output-denied) hit a neutral fallback since their UX is Phase 3 scope"

patterns-established:
  - "Parts-contract module: project imports AI SDK type guards from one place (@/lib/ui-message-parts) — future SDK upgrades touch only this file"
  - "Legacy-aware extractor: single function handles both stored shape and live shape — no call site branches"

requirements-completed: [CHAT-05, CHAT-07]

# Metrics
duration: ~10 min
completed: 2026-04-13
---

# Phase 01 Plan 02: parts-module-and-renderer Summary

**AI SDK 6 parts-contract foundation: `@/lib/ui-message-parts` re-exports the official type guards + `extractAssistantText` (legacy-aware), and `MessagePartRenderer` dispatches UIMessage.parts through an exhaustive `never`-default switch with a state-aware `ToolChip` subcomponent.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-13
- **Tasks:** 4 (all acceptance criteria green)
- **Files modified:** 0 (2 files created)

## Accomplishments

- **CHAT-05 closed:** `frontend/src/lib/ui-message-parts.ts` is the single re-export point for `isTextUIPart`, `isToolUIPart`, `getToolName`, and the `UIMessage` type. Downstream code (Plan 01-03 will be the first consumer) imports the type guards from `@/lib/ui-message-parts`, not from `"ai"` directly. One-place-to-patch for future SDK upgrades.
- **COMPAT-01/02 foundation laid:** `extractAssistantText(msg: ExtractableMessage)` handles both new (`UIMessage`) and legacy (`{id, role, content: string}`) shapes uniformly. The legacy branch preserves localStorage-backward compatibility — existing v0 conversations will still render after Plan 01-03 wires this in. Phase 4 will migrate the storage shape; Phase 1 only migrates the read path.
- **CHAT-07 closed:** `frontend/src/components/chat/message-part-renderer.tsx` is a React client component that takes `ExtractableMessage` and renders:
  - **Legacy path:** straight to `ChatMessage` with `content`
  - **User messages:** concatenated text parts → single `ChatMessage` bubble
  - **Assistant messages:** iterates `m.parts`, collects text chunks into one bubble, and pushes tool parts to a `ToolChip` row
  - **Stubs (D-05):** `reasoning`, `file`, `source-url`, `source-document`, `step-start`, and `data-*` all return `null`
  - **Never-default (D-07):** calls `assertNever` which throws in dev (so test-sidebar immediately surfaces the gap) and logs in prod (so production never crashes on an unknown part variant)
- **Tool chip state dispatch (D-06):** `ToolChip` explicitly handles the 4 D-06 states (`input-streaming`, `input-available`, `output-available`, `output-error`) with Korean labels. The 3 approval/denial states (`approval-requested`, `approval-responded`, `output-denied`) hit a neutral fallback since their UX is Phase 3 scope.
- **Scope boundary held:** `chat-container.tsx`, `test-sidebar/page.tsx`, and `route.ts` are untouched. D-12 (each commit independently bisectable) honored.

## Task Commits

1. **Task 1-02-01: Create lib/ui-message-parts.ts** — covered by `1a4ac72`
2. **Task 1-02-02: Create components/chat/message-part-renderer.tsx** — covered by `1a4ac72`
3. **Task 1-02-03: Verify build and type-check pass with new files** — no commit (verification only); both `npx tsc --noEmit` and `npm run build` exited 0
4. **Task 1-02-04: Commit the parts module and renderer** — `1a4ac72` (feat)

Single atomic commit `1a4ac72` per the plan's `commit_subject` frontmatter.

## Files Created/Modified

- `frontend/src/lib/ui-message-parts.ts` — 83 lines. Re-exports `isTextUIPart`, `isToolUIPart`, `getToolName` and `UIMessage` type. Defines `LegacyMessage`, `ExtractableMessage`, `isLegacyMessage` (internal), and `extractAssistantText`. Pure TypeScript, no React, no `"use client"`.
- `frontend/src/components/chat/message-part-renderer.tsx` — 193 lines. Exports `MessagePartRenderer` React component. Internal helpers: `ToolChip` (tool state dispatch) and `assertNever` (exhaustive safety net). Imports `ChatMessage` from `./chat-message` and all type guards from `@/lib/ui-message-parts`.

## Decisions Made

- **Single-file re-export pattern:** Plan 01-03 and beyond import AI SDK type guards from `@/lib/ui-message-parts`, not `"ai"`. Future breaking changes in AI SDK only touch this one file.
- **Legacy detection via duck-typing:** `isLegacyMessage` checks `parts undefined AND content is string`. False-positive free because `UIMessage` always has `parts: UIMessagePart[]`. Matches D-02 contract.
- **Text concatenation without separator:** `texts.join("")` — empty separator. The streamed text parts are naturally contiguous (the SDK fragments them during streaming), so a space/newline would introduce artifacts.
- **`isToolUIPart` narrowing before the switch:** Tool-* parts have `type: "tool-${NAME}"` (template literal), so a `case "tool-*":` isn't expressible. Using the type guard upfront collapses static+dynamic tool handling into one `ToolChip` render.
- **`assertNever` signature:** Takes `UIMessagePart<UIDataTypes, UITools>`, not `never`. The design intent is runtime safety (catch a new SDK variant we forgot to handle), not strict compile-time exhaustiveness — data-* parts are absorbed earlier by `startsWith("data-")`, so a compile-time `never` signature would conflict with runtime reachability.

## Deviations from Plan

None — plan executed exactly as written. Both files created verbatim from the plan's action text.

## Issues Encountered

None. Build + type-check both clean on first run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 01-03 (Wave 3, non-autonomous) is unblocked.** Both new files are in `HEAD` and ready to be imported:
- `chat-container.tsx` will replace its inline `getMessageText` with `extractAssistantText` and switch its `.map()` render to `<MessagePartRenderer message={m} />`
- `test-sidebar/page.tsx` will do the same
- `conversations.ts` will use `extractAssistantText` for its title derivation (first-user-message preview) via read-time migration

**Manual production UAT (task 1-03-07) remains the only gate** before Phase 1 can be declared complete — that is expected and by design.

---
*Phase: 01-empty-message-bug-fix-parts-contract*
*Completed: 2026-04-13*

## Self-Check: PASSED

- [x] `frontend/src/lib/ui-message-parts.ts` exists on disk
- [x] `frontend/src/components/chat/message-part-renderer.tsx` exists on disk
- [x] `git log --oneline --all --grep="01-02\|parts:"` returns `1a4ac72`
- [x] No "Issues Encountered" items; no deviations
