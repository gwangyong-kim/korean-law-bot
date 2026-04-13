# Phase 3 Verification

**Status:** verified-with-exceptions
**Completed:** 2026-04-13
**Executor:** Plan 03-04 orchestrator (speed mode)

## Summary

Phase 3 (Tool Call UI Feedback) ships with all 6 TOOL requirements closed at the code + static-check level. Runtime visual UAT is deferred to the same `verified-with-exceptions` pattern established by Phase 2 Plan 02-03 — production `/` remains OAuth-gated, and speed-mode execution skipped the manual `/test-sidebar` browser walkthrough. The `/test-sidebar` route was upgraded in Plan 03-03 to use `MessagePartRenderer`, so the local UAT path now exists and can be exercised at any time without blocking this phase close-out.

All automated grep + tsc + build checks are green. Option C (chat-message.tsx 0-diff across Phase 3) is strictly preserved. T-03-01 credential redaction is wired end-to-end. D-04 phantom argKey mapping has been corrected against the live MCP schema.

## Environment

| Property | Value |
|----------|-------|
| Framework | Next.js 16.2.3 + React 19.2.4 + TypeScript 5 |
| AI SDK | ai 6.0.158 + @ai-sdk/react 3.0.160 |
| Icons | lucide-react 1.8.0 (Loader2 / Check / AlertCircle all verified present) |
| Tailwind | 4.x with --success + --destructive CSS variables (globals.css L117, L166 light + L162, L166 dark) |
| Build | `npx tsc --noEmit` exit 0; `npm run build` exit 0 (Turbopack, 2.4-2.7s compile) |
| Lint | pre-existing 6 problems (Phase 2 carry-forward in page.tsx / chat-input.tsx / model-selector.tsx / theme-toggle.tsx), 0 new from Plans 03-01/02/03 |
| Phase 3 commits | `cec4efc` (03-01) `ddf89e4` (03-02) `0c43613` (03-03) + this `docs(03-04)` doc commit |

## Per-Requirement Validation

| Req ID | Decision | Evidence Command | Expected | Observed | Status |
|--------|----------|------------------|----------|----------|--------|
| TOOL-01 | D-01..03 4-state chip | `grep -c 'input-streaming\|input-available\|output-available\|output-error' frontend/src/components/chat/tool-invocation-view.tsx` | >= 4 | 13 | pass |
| TOOL-02 | D-04 Korean labels | `grep -c '법령 검색\|법령 본문\|판례 검색\|판례 본문' frontend/src/lib/tool-labels.ts` | >= 4 | 4 | pass |
| TOOL-03 | D-03 tense | `grep -Ec '"중"\|"완료"\|"실패"' frontend/src/components/chat/tool-invocation-view.tsx` | >= 3 | 3 | pass |
| TOOL-04 | D-05/06 details | `grep -c '<details' tool-invocation-view.tsx` + `grep -c ' open' tool-invocation-view.tsx` | >= 1 and 0 | 5 (details + comment) and 0 | pass |
| TOOL-05 | D-07/08/09 vertical stack | `grep -c 'flex flex-col gap-1 pl-11 pt-2' frontend/src/components/chat/message-part-renderer.tsx` | 1 | 1 | pass |
| TOOL-06 | D-10/11 skeleton | `grep -c '검색 중' chat-container.tsx` + `grep -c 'StreamingSkeletonBubble' chat-container.tsx` | 0 and >= 2 | 0 and 2 | pass |

## D-04 Phantom Eradication (critical — RESEARCH §3)

CONTEXT D-04 originally specified `lawName`, `keyword`, and `caseId` as the chip arg source for `get_law_text`, `search_decisions`, and `get_decision_text`. A live MCP probe on 2026-04-13 (RESEARCH §3) confirmed these fields are PHANTOM — they do not exist in the real MCP input schemas and would have rendered `undefined` in the chip text. Plan 03-01 corrects the mapping to use the real schema fields:

- `get_law_text` → `["jo", "lawId", "mst"]` (verified required + optional fields)
- `search_decisions` → `["query", "domain"]` (verified required=[domain], properties include query)
- `get_decision_text` → `["id", "domain"]` (verified required=[domain, id])

Grep evidence that phantom names are not anywhere under `frontend/src/`:

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| No `lawName` anywhere in frontend source | `grep -rc 'lawName' frontend/src/` | 0 total | 0 |
| No `caseId` anywhere in frontend source | `grep -rc 'caseId' frontend/src/` | 0 total | 0 |
| `PHANTOM` provenance comment present | `grep -c 'PHANTOM' frontend/src/lib/tool-labels.ts` | >= 1 | 4 |
| Live probe date recorded | `grep -c '2026-04-13' frontend/src/lib/tool-labels.ts` | >= 1 | 1 |

`keyword` intentionally not greppped repo-wide (may legitimately appear as unrelated variable names). Within `tool-labels.ts` specifically: `grep -c 'keyword' frontend/src/lib/tool-labels.ts` returns 0.

## T-03-01 Credential Redaction Evidence

MCP input schemas expose an `apiKey` field on every tool. Although Gemini should never pass it, defense-in-depth redaction happens in `serializeInput` before any request JSON is rendered inside the `<details>` block.

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| Redact pattern covers 7 key families | `grep -Ec 'apiKey\|api_key\|auth\|token\|secret\|password\|credential' frontend/src/lib/tool-labels.ts` | >= 7 | 9 |
| Redact marker present | `grep -c '\[REDACTED\]' frontend/src/lib/tool-labels.ts` | >= 1 | 2 |
| serializeInput called by consumer | `grep -c 'serializeInput' frontend/src/components/chat/tool-invocation-view.tsx` | >= 2 | 4 |
| No raw JSON.stringify on part.input | `grep -c 'JSON.stringify(part.input' frontend/src/components/chat/tool-invocation-view.tsx` | 0 | 0 |
| Recursive redaction helper | `grep -c 'redactDeep' frontend/src/lib/tool-labels.ts` | >= 2 | 3 |

`redactDeep` recursively walks nested objects and arrays, replacing any property whose key matches `/^(apiKey|api_key|auth|token|secret|password|credential)$/i` with the literal string `[REDACTED]`. `getToolArgPreview` also skips any key matching the same pattern, so even a typo that added a credential field to a tool's `argKeys` priority list could not surface the secret in the chip label itself (T-03-02 defense in depth).

## Option C (chat-message.tsx 0 diff) — RESEARCH §4

The Phase 3 planner explicitly chose Option C: rearrange the assistant JSX return in `MessagePartRenderer` (chip block above ChatMessage with `flex-col gap-1 pt-2`) rather than threading a new `parts` prop through `ChatMessage`. This keeps Phase 2's `error / onRetry / isRetryDisabled` signature and the `(content || isUser)` bubble wrapper guard completely untouched.

```bash
git diff HEAD~3 HEAD -- frontend/src/components/chat/chat-message.tsx | wc -l
```

**Expected:** 0
**Observed:** 0

The last three `feat(03-XX)` commits (`cec4efc` → `ddf89e4` → `0c43613`) modify exactly zero lines of `chat-message.tsx`. The dead-code guard `content !== "검색 중..."` at L106 remains intact and is now unreachable (since `chat-container.tsx` no longer renders that literal into content); cleanup is deferred to Phase 5 CLEAN-04 which deletes `test-sidebar/page.tsx` and may also collapse the dead guard.

## Phase 1/2 Regression Check

| Asset | Check | Expected | Observed |
|-------|-------|----------|----------|
| Phase 1 `extractAssistantText` usage | `grep -c 'extractAssistantText' frontend/src/components/chat/chat-container.tsx` | >= 3 | 3 |
| Phase 2 error/retry pipeline | `grep -c 'parsedError\|handleRetry\|attachedError\|parseChatError\|lastIsAssistant\|regenerate\|clearError' frontend/src/components/chat/chat-container.tsx` | >= 20 | 22 |
| Phase 2 `(textChunks.length > 0 \|\| error)` guard | `grep -c '(textChunks.length > 0 \|\| error)' frontend/src/components/chat/message-part-renderer.tsx` | 1 | 1 |
| Phase 2 standalone error bubble | `grep -c 'parsedError && !lastIsAssistant' frontend/src/components/chat/chat-container.tsx` | 1 | 1 |
| Phase 4 `useChat` single-arg (PERS-03 boundary) | `grep -c 'useChat({ id: conversationId })' frontend/src/components/chat/chat-container.tsx` | 1 | 1 |
| Phase 1 `assertNever` preserved | `grep -c 'function assertNever' frontend/src/components/chat/message-part-renderer.tsx` | 1 | 1 |
| Phase 2 `route.ts` untouched | `git diff HEAD~3 HEAD -- frontend/src/app/api/chat/route.ts \| wc -l` | 0 | 0 |
| Phase 4 `conversations.ts` untouched | `git diff HEAD~3 HEAD -- frontend/src/lib/conversations.ts \| wc -l` | 0 | 0 |

No regression detected across Phase 1 parts contract or Phase 2 error UX.

## Manual UAT Results

**Speed-mode deferral:** The orchestrator spawned Plan 03-04 in speed mode with pre-authorized `approved` signal. Manual browser UAT on `/test-sidebar` was skipped in this execution pass in favor of atomic phase close-out. All static grep + tsc + build checks passed; all code-level acceptance criteria for D-01..D-11 are green.

**What CAN be exercised locally at any time (no OAuth):**

Thanks to Plan 03-03's test-sidebar upgrade, a future UAT pass on `http://localhost:3000/test-sidebar` can verify:

- [ ] Skeleton bubble visible on first turn, disappears when chips arrive
- [ ] Chip icons: Loader2 spinning / Check / AlertCircle (4-state visual transition)
- [ ] Chip color transitions visually distinct (gray → green / red)
- [ ] Tense text: `법령 검색 중` → `법령 검색 완료` with correct Korean label + real-schema arg preview
- [ ] `<details>` default-collapsed, expands on click, collapses on click
- [ ] Request JSON shows no `apiKey` field (or shows `"apiKey": "[REDACTED]"`)
- [ ] Multiple tool calls stack vertically (flex-col, no bullet/number/border)
- [ ] Chip block renders above text answer
- [ ] Phase 2 regression: blocking network throttling still produces inline error banner + 다시 시도 button on the failed assistant bubble

**What remains `unknown` (same as Phase 2 Plan 02-03):**

- [ ] Production Vercel `/` route visual confirmation (OAuth wall — orchestrator lacks credentials to exercise)
- [ ] Large-scale 5+ tool call vertical stacking (specific query required)
- [ ] `output-error` state (requires MCP 503 reproduction)
- [ ] Live `input-streaming` arg preview behavior (Gemini chunking timing dependent)

## Failure Modes Not Observed

| Failure Mode | Plausibility | Reason Not Observed |
|--------------|--------------|---------------------|
| Chip shows `undefined` (D-04 regression) | Low | Plan 03-01 replaced phantom argKeys with real-schema priority lists, verified via `grep -rc 'lawName\|caseId' frontend/src/ = 0` |
| `<details>` leaks `apiKey` in request JSON | Low | Plan 03-01 recursive `redactDeep` redaction; Plan 03-02 calls `serializeInput(part.input)` exclusively (0 raw `JSON.stringify(part.input)` occurrences) |
| Regression of Phase 2 error banner | Low | Option C preserved ChatMessage signature; Phase 2 grep counts intact (see Phase 1/2 Regression Check table) |
| Layout shift when skeleton → real message | Unknown — requires runtime measurement | StreamingSkeletonBubble mirrors ChatMessage's avatar + bubble classes verbatim (`h-8 w-8 rounded-full bg-muted`, `max-w-[75%] rounded-2xl px-4 py-3`); CLS expected to be minimal |
| tsc `never` exhaustion mismatch | Low | Plan 03-02 removed unused `DynamicToolUIPart` / `ToolUIPart` / `getToolName` imports; `npx tsc --noEmit` exit 0 confirmed twice (post-03-02 and post-03-03) |
| Build break from Tailwind opacity modifier on `--success` | Low | globals.css L23-24 defines `--color-success: var(--success)` for Tailwind 4 compatibility; L117 (light) + L166 (dark) define `--success`; `bg-success/10` and `text-success` both compile cleanly |

## Carry-Forward

Items deferred to Phase 4 / Phase 5 / v2:

- **Production UAT on OAuth-gated `/` route** — `unknown`, same rationale as Phase 2 Plan 02-03. Orchestrator can resolve any time with browser access to `frontend-phi-six-16.vercel.app`.
- **Local `/test-sidebar` manual walkthrough** — deferred from this speed-mode execution. The route is ready; any future session can `npm run dev` and exercise the 8 checklist items above without OAuth.
- **`chat-message.tsx` L106 dead-code guard** (`content !== "검색 중..."`) — unreachable but not yet deleted. Cleanup pending Phase 5 CLEAN-04 which deletes `test-sidebar/page.tsx` at file level; collapsing the dead guard can happen at the same time or earlier as a trivial cleanup commit.
- **v2 ideas (CONTEXT deferred_ideas + REQUIREMENTS V2-TOOL-01..04)** — live `input-streaming` arg preview, result-count chip, elapsed-time indicator, tool emojis, reduced-motion support, details filter/search. Explicitly out of Phase 3 scope.
- **T-03-07/08/10 `/test-sidebar` route exposure** — `/api/chat` middleware gating accepted as the trust boundary. Phase 5 CLEAN-04 closes this entirely.

## Sign-off

- **Executor:** Plan 03-04 orchestrator (speed mode, `approved` signal pre-authorized by user)
- **Evidence commits:**
  - `cec4efc` — `feat(03-01): lib/tool-labels.ts — 실측 MCP argKey + apiKey redaction`
  - `ddf89e4` — `feat(03-02): ToolInvocationView + MessagePartRenderer 세로 체크리스트 (D-01..D-09)`
  - `0c43613` — `feat(03-03): skeleton bubble + 검색중 제거 + test-sidebar MessagePartRenderer`
  - `docs(03-04)` — Phase 3 close-out (this commit, includes VERIFICATION.md + PROJECT.md row)
- **Status:** `verified-with-exceptions` (static verification complete; runtime UAT carried forward per speed mode)
- **Phase 3 formal closure:** All 6 TOOL requirements (TOOL-01..06) satisfied at code + static-check level. Distribution:
  - Plan 03-01: TOOL-02 (Korean label map foundation)
  - Plan 03-02: TOOL-01, TOOL-03, TOOL-04, TOOL-05 (+ consumes TOOL-02)
  - Plan 03-03: TOOL-06 (skeleton bubble + placeholder removal)
  - Plan 03-04: final verification closure
