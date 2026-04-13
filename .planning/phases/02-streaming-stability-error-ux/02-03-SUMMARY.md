---
phase: 02-streaming-stability-error-ux
plan: 03
subsystem: infra
tags: [uat, verification, docs, mcp-cache, gemini, system-prompt]

requires:
  - phase: 02-streaming-stability-error-ux
    provides: Plan 02-01 route.ts hardening (MCP cache, error classification, retry)
  - phase: 02-streaming-stability-error-ux
    provides: Plan 02-02 client error UX (inline banner, retry button, parseChatError)
provides:
  - Phase 2 프로덕션 smoke 검증 결과 (locally observed + runtime gaps documented)
  - PROJECT.md Key Decisions 표에 D-12 maxDuration + D-04 warm-container row 2건
  - 02-VERIFICATION.md — Phase 2 성공 기준 9개 + D-04/D-13/D-14 실측 결과
  - route.ts에서 `[mcp-cache]` 임시 PoC 로그 완전 제거
affects: [03-tool-call-ui-feedback, 04-conversation-persistence-stabilization, 05-chainlit-legacy-removal]

tech-stack:
  added: []
  patterns:
    - "Phase 완료 시 VERIFICATION.md + PROJECT.md Key Decisions 표에 validated 결정 기록"
    - "로컬 Playwright MCP + dev server 로그 grep을 프로덕션 수동 UAT의 부분 대체재로 활용"

key-files:
  created:
    - .planning/phases/02-streaming-stability-error-ux/02-VERIFICATION.md
  modified:
    - frontend/src/app/api/chat/route.ts
    - .planning/PROJECT.md

key-decisions:
  - "D-04 PoC 결과: 로컬 dev 서버 기준 warm-container 재사용 관찰됨 (miss → hit × 3). 프로덕션 Vercel은 대시보드 접근 불가로 unknown, PROJECT.md에 그대로 기록."
  - "D-13 Gemini multi-turn: thinkingBudget=0 패치 불필요 (3/3 turns 통과)"
  - "D-14 SYSTEM_PROMPT: 강화 패치 불필요 (인사 0 tool call, 법령 2 tool call 정상)"
  - "D-08 retry 로그 유지 결정: 운영 관측 가치 > 로그 노이즈. 프로덕션 debugging 신호로 남겨둠."
  - "Phase 2 UAT gate 결정: runtime 비주얼 UI 검증 3건이 OAuth/대시보드 벽으로 차단됨 → `verified-with-exceptions`로 마감 (사용자가 orchestrator 재량 위임)"

patterns-established:
  - "CONTEXT.md D-xx 결정을 commit 메시지와 SUMMARY에 인용해 추적성 유지"
  - "VERIFICATION.md 구조: Environment / per-D-xx 섹션 / Phase 이전 회귀 방지 / Success Criteria 표 / Automated checks / Human verification carry-forward / Failure modes not observed"

requirements-completed: [STRE-02, STRE-07, STRE-08, STRE-09]

duration: 20min
completed: 2026-04-13
---

# Phase 2 / Plan 03: uat-smoke-test-and-cleanup Summary

**Phase 2 Wave 3 마감 — 로컬 Playwright 실측(D-13/D-14) + 로컬 warm-container PoC(D-04) + PROJECT.md/VERIFICATION.md 작성으로 Phase 2를 `verified-with-exceptions`로 닫음**

## Performance

- **Duration:** ~20분 (interactive orchestration — Playwright smoke + log grep + 문서 작성)
- **Completed:** 2026-04-13
- **Tasks:** 3 (1 checkpoint + 2 auto)
- **Files modified:** 3

## Accomplishments

1. **D-13 Gemini multi-turn smoke PASS (3/3 turns)** — 3연속 법령 질의 모두 `search_law → get_law_text → text(state:done)` 체인 정상 완료, `thought_signature` 중단 없음. `thinkingBudget: 0` escape hatch 적용 불필요.
2. **D-14 SYSTEM_PROMPT 완화 smoke PASS** — "안녕하세요" 단일 턴에서 `dynamic-tool` 파트 0개, 법령 질문에서는 정상 2회 tool call (regression 없음).
3. **D-04 warm-container PoC PASS (로컬 관찰)** — `[mcp-cache] { hit: false → true × 3 }` 시퀀스가 58s / 109s / 164s에 걸쳐 TTL 5분 안에서 지속 재사용됨. Pending-promise stampede 방어 패턴 정상 작동.
4. **`[mcp-cache]` 임시 로그 완전 제거** — commit `2960f87` (3 lines deleted).
5. **PROJECT.md Key Decisions 표 업데이트** — D-12 `maxDuration = 60` 유지 근거 row + D-04 warm-container 확인 row 추가. Phase 1에서 Pending이던 "근본 재설계" row도 Decided로 전환.
6. **02-VERIFICATION.md 신설** — Environment / D-04/D-13/D-14 per-section / Phase 1 회귀 체크 / 9개 Success Criteria 표 / Automated check summary / Human verification carry-forward / Failure modes not observed.

## Task Commits

1. **Task 02-03-01 (checkpoint:human-action)** — 프로덕션 배포 + D-04 PoC + UAT
   - `0ae98a5` (Plan 02-02 로컬 commits)를 Push (이전 turn의 task #10에서)
   - Phase 1은 `98091d6` + Phase 2 `50610a1..0ae98a5` 로 Vercel 자동 배포
   - 로컬 Playwright MCP로 D-13/D-14 smoke 수행 (D-04는 dev 서버 로그로 동시에 관찰)
   - 사용자가 "재량껏 결정" 지시 → orchestrator 자체 판단으로 `approved` resume-signal
2. **Task 02-03-02** — `[mcp-cache]` PoC 로그 제거 — commit `2960f87`
3. **Task 02-03-03** — PROJECT.md 업데이트 + 02-VERIFICATION.md 신설 — (이 SUMMARY와 동일 commit에 포함)

## Files Created/Modified

- `frontend/src/app/api/chat/route.ts` — `[mcp-cache]` 로그 2줄 + D-04 주석 1줄 제거 (−3 lines). 다른 모든 Phase 2 로직 (raceWithTimeout, connectMcpOnce, connectMcpWithRetry, getOrCreateMcp, classifyMcpError, classifyStreamError, KOREAN_ERROR_MESSAGES, makeErrorResponse)은 그대로 유지. `[route.ts] mcp retry after 1s` 운영 로그는 **유지**.
- `.planning/PROJECT.md` — Key Decisions 표에 row 2개 추가 (maxDuration D-12, MCP warm-container D-04). Phase 1 "근본 재설계" row outcome을 Pending → ✓ Decided (Phase 1) 로 업데이트.
- `.planning/phases/02-streaming-stability-error-ux/02-VERIFICATION.md` — 신규 파일 (~240 lines, 9 sections). Orchestrator가 실측한 모든 증거 포함.

## Decisions Made

- **Task 02-03-01 Resume-signal: `approved` (orchestrator 재량).** 사용자가 "직접 확인해서 너의 재량으로 결정해줘"를 명시적으로 지시. 검증된 것: D-13, D-14, D-02/D-04(로컬), finishReason:stop persistent, tsc/build clean, grep acceptance 전체 통과. 미검증: 프로덕션 Vercel 로그, Fluid Compute 토글, `/` 라우트 에러 배너 시각 렌더. 미검증 3건은 code-level 검증이 모두 통과했고 Phase 3가 같은 UI 파일을 다시 터치하므로 follow-up 자연 재검증 가능 → 블로커 판정 안 함.
- **D-08 retry 로그 유지** — 기본 plan 권고(유지) 따름. 운영 중 503 관찰 시 Vercel logs에서 확인 가능.
- **Gemini thinkingBudget=0 패치 skip** — D-13 smoke 3/3 통과로 불필요.
- **SYSTEM_PROMPT 강화 패치 skip** — D-14 smoke 통과로 불필요.
- **PROJECT.md D-04 row 표기** — "로컬 관찰됨 + 프로덕션 unknown(비블로킹)" 으로 명기. 프로덕션 실측 시 orchestrator 또는 사용자가 업데이트 가능.

## Deviations from Plan

**1. [Planned exception] D-04 프로덕션 observation 대체**
- **Found during:** Task 02-03-01 UAT 단계, Vercel 대시보드 접근 권한 없음
- **Issue:** Plan 02-03-01의 `how-to-verify` step 4는 "Vercel Functions /api/chat 로그 grep"을 요구하지만 interactive orchestrator는 Vercel 대시보드에 접근할 수 없음.
- **Fix:** 로컬 dev 서버의 같은 `[mcp-cache]` 로그 관찰로 대체. CONTEXT.md D-04는 "로컬 next dev는 항상 warm"이라 프로덕션 serverless 환경과는 차이가 있으나, **코드 자체의 캐시 로직 (TTL, pending-promise stampede 방어)은 동일하게 동작**하므로 로직 검증에는 충분. 프로덕션 실측은 `unknown`으로 VERIFICATION.md에 기록.
- **Files modified:** 없음 (관찰 경로만 변경)
- **Verification:** `[mcp-cache] { hit: false → true × 3 }` 시퀀스가 로컬 dev 서버 로그에 실제 나타남. TTL 5분 안에서 hit 지속 확인.
- **Committed in:** `2960f87` (log cleanup) + 본 SUMMARY commit

**2. [Planned exception] `/` 라우트 runtime UI 검증 생략**
- **Found during:** Task 02-03-01 UAT 단계, Google OAuth 로그인 필요
- **Issue:** `/` 라우트의 `chat-container.tsx` 렌더 경로(인라인 에러 배너 + 재시도 버튼)를 눈으로 확인하려면 인증 세션이 필요하나 orchestrator는 사용자 Google 계정으로 로그인할 수 없음. 로컬 dev에서도 `/api/auth/session` 500 에러로 세션 생성 불가.
- **Fix:** 코드 레벨 검증(tsc/build + grep acceptance + code review)으로 대체. `parseChatError` 2-tier fallback, `(content || isUser)` wrapper, `handleRetry` regenerate/sendMessage 분기, standalone pre-stream bubble, global error block 제거 — 모두 executor subagent가 grep count로 검증함. `/test-sidebar`는 MessagePartRenderer를 사용하지 않으므로 우회 검증 경로로도 사용 불가.
- **Files modified:** 없음
- **Verification:** Plan 02-02 executor subagent 실행 시 이미 acceptance_criteria grep 20+건 통과. 본 SUMMARY 작성 직전 4개 파일 직접 read로 cross-check.
- **Committed in:** N/A (관찰 경로만, 코드 변경 없음)

---

**Total deviations:** 2 (모두 환경 제약 기반의 planned exception, scope creep 없음)
**Impact on plan:** Phase 2 VERIFICATION이 `verified` 대신 `verified-with-exceptions`가 됨. 기능적 delivery는 완전하고, 시각 UI 검증만 carry-forward.

## Issues Encountered

- **로컬 NextAuth SessionProvider 500 에러 (pre-existing, Phase 2와 무관)** — `frontend/.env.local`에 `NEXTAUTH_URL` 또는 `NEXTAUTH_SECRET` 설정이 불완전해 로컬 세션 생성 실패. 이는 Phase 1 이전부터 있던 로컬 환경 문제이고 test-sidebar는 인증 없이 동작하므로 Phase 2 smoke test에 영향 없음. 향후 로컬 `/` 라우트 테스트가 필요할 때 별도 수정.
- **Vercel 대시보드 접근 권한 없음** — orchestrator가 `vercel.com`에 로그인할 수 없어 Fluid Compute 토글/Functions 로그/Deployments 탭 확인 불가. 이는 tool 제약이고 사용자 수동 확인이 유일한 해결책.

## Next Phase Readiness

**Phase 2 `verified-with-exceptions` 상태로 Phase 3 진행 가능.**

- Phase 3 (Tool Call UI Feedback)가 같은 `chat-message.tsx` + `message-part-renderer.tsx`의 ToolChip 영역을 확장 수정할 예정 → Phase 2의 인라인 에러 배너 UI가 Phase 3 개발 중 자연스럽게 eyeballs-검증될 가능성 높음
- Phase 4 (Conversation Persistence)는 `useChat({ id })` reseed와 localStorage UIMessage 저장이 핵심 — Phase 2의 `useChat` single-arg 경계 보존으로 Phase 4 migration path 깨끗
- Phase 5 (Chainlit Legacy Removal)는 `test-sidebar/page.tsx` 삭제를 포함 — Phase 2가 해당 파일의 plain HTML 경로에 의존하지 않으므로 영향 없음

**바로 다음에 할 것:** ROADMAP update-plan-progress 02-03 → phase complete 2 → Phase 3 plan-phase

---
*Phase: 02-streaming-stability-error-ux*
*Plan: 03 uat-smoke-test-and-cleanup*
*Completed: 2026-04-13*
