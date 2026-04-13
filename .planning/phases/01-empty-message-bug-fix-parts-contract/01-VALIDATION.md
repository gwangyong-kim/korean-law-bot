---
phase: 1
slug: empty-message-bug-fix-parts-contract
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no unit/integration test harness exists). Validation is type-check + build + manual UAT. |
| **Config file** | `frontend/tsconfig.json`, `frontend/eslint.config.mjs` |
| **Quick run command** | `cd frontend && npx tsc --noEmit` |
| **Full suite command** | `cd frontend && npm run build && npm run lint` |
| **Estimated runtime** | ~45 seconds (build dominated) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npx tsc --noEmit` (fast type-check only)
- **After every plan wave:** Run `cd frontend && npm run build && npm run lint` (full build + lint)
- **Before `/gsd-verify-work`:** Full build must succeed; manual UAT gate per D-11 must pass
- **Max feedback latency:** ~45 seconds (one full build)

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement        | Secure Behavior                                        | Test Type       | Automated Command                              | Status     |
|-----------|------|------|--------------------|--------------------------------------------------------|-----------------|------------------------------------------------|------------|
| 1-01-01   | 01   | 1    | CHAT-02            | `stopWhen: stepCountIs(8)` imported from `"ai"`        | type-check      | `cd frontend && npx tsc --noEmit`              | ⬜ pending |
| 1-01-02   | 01   | 1    | CHAT-03            | `mcpClient.close()` in `onFinish`/`onError`, not `finally` | grep assertion  | `grep -n "finally" frontend/src/app/api/chat/route.ts` (must return NO line with `close`) | ⬜ pending |
| 1-01-03   | 01   | 1    | CHAT-04            | `consumeSseStream` + `onError` on response             | grep assertion  | `grep -c "consumeSseStream\\|onError" frontend/src/app/api/chat/route.ts` (must be ≥2) | ⬜ pending |
| 1-01-04   | 01   | 1    | CHAT-02/03/04      | full build passes after commit 1                       | build           | `cd frontend && npm run build`                 | ⬜ pending |
| 1-02-01   | 02   | 2    | CHAT-05            | `lib/ui-message-parts.ts` exports `extractAssistantText`, `isTextUIPart`, `isToolUIPart`, `getToolName` | grep assertion  | `grep -c "export" frontend/src/lib/ui-message-parts.ts` (must be ≥4) | ⬜ pending |
| 1-02-02   | 02   | 2    | CHAT-07            | `MessagePartRenderer` has exhaustive `switch (part.type)` with `never`-default | type-check | `cd frontend && npx tsc --noEmit`              | ⬜ pending |
| 1-02-03   | 02   | 2    | CHAT-07 (D-06)     | dynamic-tool branch handles 4 states                   | grep assertion  | `grep -c "input-streaming\\|input-available\\|output-available\\|output-error" frontend/src/components/chat/message-part-renderer.tsx` (must be ≥4) | ⬜ pending |
| 1-02-04   | 02   | 2    | CHAT-05/07         | full build passes after commit 2                       | build           | `cd frontend && npm run build`                 | ⬜ pending |
| 1-03-01   | 03   | 3    | CHAT-06            | `chat-container.tsx` has NO inline `getMessageText`    | grep assertion  | `grep -c "function getMessageText\\|const getMessageText" frontend/src/components/chat/chat-container.tsx` (must be 0) | ⬜ pending |
| 1-03-02   | 03   | 3    | CHAT-06            | `test-sidebar/page.tsx` has NO inline `getMessageText` | grep assertion  | `grep -c "function getMessageText" frontend/src/app/test-sidebar/page.tsx` (must be 0) | ⬜ pending |
| 1-03-03   | 03   | 3    | CHAT-08            | `chat-container.tsx` imports `MessagePartRenderer`     | grep assertion  | `grep -c "MessagePartRenderer" frontend/src/components/chat/chat-container.tsx` (must be ≥1) | ⬜ pending |
| 1-03-04   | 03   | 3    | COMPAT-01/02       | `extractAssistantText` handles legacy `{content: string}` | code review  | manual review of `lib/ui-message-parts.ts` legacy branch | ⬜ pending |
| 1-03-05   | 03   | 3    | CHAT-09            | commit message body contains Before/After parts JSON  | git log grep    | `git log -1 --format=%B \| grep -E 'Before:\|After:'` | ⬜ pending |
| 1-03-06   | 03   | 3    | CHAT-06/08/09, COMPAT-01/02/03 | full build + lint passes after commit 3    | build           | `cd frontend && npm run build && npm run lint` | ⬜ pending |
| 1-GATE-01 | 03   | 3    | CHAT-01            | production URL manual UAT: "근로기준법 제60조 연차휴가" renders text | manual UAT  | Open `frontend-phi-six-16.vercel.app`, send the question, confirm non-empty text card | ⬜ pending |
| 1-GATE-02 | 03   | 3    | COMPAT-03          | after deploy, sidebar shows existing conversation titles | manual UAT  | Open production, verify sidebar list loads, click a conversation, verify no crash | ⬜ pending |
| 1-GATE-03 | 03   | 3    | CHAT-01, success #8 | `finishReason: "stop"` observed                       | server log      | Vercel logs: `finishReason` field in `onFinish` console.log (added in commit 1) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None. No test framework exists — see §3/§4/§6 of RESEARCH.md. The repo uses type-check + build + manual UAT as its validation substrate, which is already installed (`tsc`, `next build`, `eslint`).

*Existing infrastructure (tsc + next build + eslint) covers all phase requirements. Manual UAT gates 1-GATE-01/02/03 are non-automatable without a full test harness, which is explicitly out-of-scope for Phase 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production URL renders text card for "근로기준법 제60조 연차휴가" | CHAT-01 | No E2E harness; production URL is the ground truth per D-11 | 1. Open `frontend-phi-six-16.vercel.app` in incognito. 2. Log in. 3. Type "근로기준법 제60조 연차휴가 알려줘". 4. Wait for response. 5. Confirm answer text is visible (not empty card). 6. Confirm no error banner. |
| Before/After parts JSON captured in commit message body | CHAT-09, D-10 | Evidence is git history, not code | 1. Before fix: browser devtools console shows `[diag] messages[i].parts: [{type:"tool-...",...}]` — copy JSON. 2. After fix: shows `[{type:"text", text:"..."},{type:"tool-...",...}]` — copy JSON. 3. Paste both JSON snippets labeled `Before:` / `After:` into the final commit 3 message HEREDOC body. |
| Sidebar loads existing localStorage conversations without crash | COMPAT-01/03 | Requires pre-existing user localStorage data | 1. Prior to deploy, ensure current production user has ≥1 conversation in localStorage. 2. Deploy Phase 1. 3. Hard-reload `frontend-phi-six-16.vercel.app`. 4. Confirm sidebar list renders all past conversations with titles. 5. Click each — confirm no JavaScript error in console. |
| `finishReason: "stop"` verified in server logs | Success criterion #8 | Vercel log stream is external evidence | 1. Send a law question in production. 2. Check Vercel project dashboard → Functions → `/api/chat` logs. 3. Search for the `onFinish` console.log line (added in commit 1). 4. Confirm `finishReason` field is `"stop"`, not `"tool-calls"`. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or manual UAT gate documented
- [x] Sampling continuity: tsc runs after every task commit (no gaps)
- [x] Wave 0 requirements met (existing infra, no installs needed)
- [x] No watch-mode flags (all commands are one-shot)
- [x] Feedback latency ~45s (single full build)
- [x] `nyquist_compliant: true` — compile-time exhaustiveness via `never`-default is the Dimension 8 strategy

**Approval:** pending (user UAT at gate 1-GATE-01/02/03)
