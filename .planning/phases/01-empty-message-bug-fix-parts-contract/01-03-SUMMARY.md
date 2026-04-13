---
phase: 01-empty-message-bug-fix-parts-contract
plan: 03
subsystem: ui
tags: [ai-sdk-v6, ui-message, react, next, parts-contract, compat]

requires:
  - phase: 01-empty-message-bug-fix-parts-contract
    provides: Plan 01 route.ts fix (stopWhen + onFinish MCP close + consumeSseStream)
  - phase: 01-empty-message-bug-fix-parts-contract
    provides: Plan 02 lib/ui-message-parts.ts + MessagePartRenderer component
provides:
  - chat-container.tsx 및 test-sidebar/page.tsx의 inline getMessageText 제거
  - extractAssistantText를 localStorage/handleExport 양쪽의 단일 텍스트 추출점으로 통일
  - MessagePartRenderer를 assistant 메시지 단일 렌더링 경로로 연결 (CHAT-08)
  - COMPAT-01..03 경로 확정 — 레거시 localStorage 대화가 refactor 후에도 렌더 가능
affects: [02-streaming-stability-error-ux, 03-tool-call-ui-feedback, 04-conversation-persistence-stabilization]

tech-stack:
  added: []
  patterns:
    - "UIMessage 렌더링은 MessagePartRenderer 단일 경로로만 — 컴포넌트에서 parts를 직접 파싱 금지"
    - "extractAssistantText는 UIMessage ∪ LegacyMessage 유니언을 단일 호출로 처리"

key-files:
  created: []
  modified:
    - frontend/src/components/chat/chat-container.tsx
    - frontend/src/app/test-sidebar/page.tsx

key-decisions:
  - "useChat({ id: conversationId })를 단일 인수로 유지 — initialMessages reseed는 Phase 4 (PERS-03) scope (RESEARCH.md §3.6)"
  - "ChatMessage import는 '검색 중...' 로딩 placeholder에서 계속 사용되므로 dead import 아님 — TOOL-06 skeleton 교체는 Phase 3"
  - "D-10 Before/After JSON은 plan fallback 경로 사용 — 대표 shape 기반 (실측은 D-11 프로덕션 UAT로 대체)"
  - "lib/conversations.ts는 수정하지 않음 — flat string 저장 유지, Phase 4 PERS-01이 UIMessage 저장으로 마이그레이션"

patterns-established:
  - "MessagePartRenderer 단일 dispatch: text/tool/stub 3갈래 분기를 이 컴포넌트에만 가둠"
  - "모든 텍스트 추출은 extractAssistantText 호출로 통일 — 인라인 filter/map 금지"

requirements-completed: [CHAT-01, CHAT-06, CHAT-08, CHAT-09, COMPAT-01, COMPAT-02, COMPAT-03]

duration: 15min
completed: 2026-04-13
---

# Phase 1 / Plan 03: refactor-chat-wiring Summary

**inline getMessageText 두 곳 제거 후 MessagePartRenderer + extractAssistantText로 단일 렌더링 경로 통합 — Phase 1 production blocker 클라이언트 측 마감**

## Performance

- **Duration:** 약 15분 (interactive inline 경로)
- **Completed:** 2026-04-13
- **Tasks:** 7 (1-03-01..07)
- **Files modified:** 2

## Accomplishments

- `chat-container.tsx`에서 inline `getMessageText` 제거, 모든 사용처를 `extractAssistantText`로 전환
- `chat-container.tsx` 메시지 렌더 루프를 `<ChatMessage>`에서 `<MessagePartRenderer>`로 교체 (CHAT-08)
- `test-sidebar/page.tsx`에서도 동일한 inline helper 제거 + `extractAssistantText` 사용
- `useChat({ id: conversationId })` 단일 인수 호출 유지 — Phase 4 PERS-03 reseed 경계 준수
- 3-commit Phase 1 체인 완성: `fix(api)` → `feat(parts)` → `refactor(chat)` (D-12)

## Task Commits

1. **1-03-01 Before 증거 확보** — plan fallback 경로 채택 (대표 shape 재구성, 로컬 worktree 수행 안 함)
2. **1-03-02 chat-container.tsx 리팩터** — `0960404` (refactor)에 포함
3. **1-03-03 test-sidebar/page.tsx 리팩터** — `0960404` (refactor)에 포함
4. **1-03-04 진단 로그 + After 캡처** — fallback 경로 채택 (진단 로그 삽입/제거 없음, After shape 재구성)
5. **1-03-05 tsc/build/lint 검증** — 커밋 전 실행, 아래 `Verification` 섹션 참조
6. **1-03-06 HEREDOC 커밋** — `0960404` `refactor(chat): inline getMessageText 제거 + COMPAT 마이그레이션`
7. **1-03-07 프로덕션 UAT 게이트** — 본 SUMMARY 작성 이후 사용자 수동 검증 단계 (BLOCKING)

> 참고: Plan 03은 "최종 wiring" 플랜이라 코드 변경은 단일 커밋으로 묶임. Task 1-03-02/03이 물리적으로 같은 `0960404` 커밋에 함께 반영됨 (plan의 `commit_subject` 단일 커밋 지시에 부합).

## Files Created/Modified

- `frontend/src/components/chat/chat-container.tsx` — inline helper 제거 (−11줄), `extractAssistantText`/`MessagePartRenderer` import/사용 (+3줄), `<ChatMessage content={getMessageText(m)}>` → `<MessagePartRenderer message={m}>` 치환
- `frontend/src/app/test-sidebar/page.tsx` — inline helper 제거 (−7줄), `extractAssistantText` import/사용

## Decisions Made

- **D-10 evidence: fallback 경로 채택.** 대표 Before/After JSON을 commit body HEREDOC에 사용. 실측 After는 D-11 프로덕션 UAT로 대체. 프로덕션이 며칠간 깨진 상태였기 때문에 로컬 재현을 위한 git worktree 셋업이 과도함 (plan Task 1-03-01 §Fallback 허용).
- **Diagnostic log 미삽입.** Fallback 경로의 직접 귀결 — `chat-container.tsx`에 임시 `console.log`를 넣지 않았으므로 D-09 cleanup도 자동으로 만족.
- **Loading placeholder 유지.** `<ChatMessage role="assistant" content="검색 중..." />`는 plain-text 로딩 인디케이터로 존속 — Phase 3 TOOL-06이 skeleton으로 교체 예정.

## Deviations from Plan

**1. [Planned fallback] D-10 증거를 실측 대신 대표 shape로 기록**
- **Found during:** Task 1-03-01 착수 시점
- **Issue:** 프로덕션이 며칠간 깨진 상태였고 Plan 01 fix가 이미 적용되어 local worktree 재현 비용이 Task 가치를 상회
- **Fix:** Plan 1-03-01 §Fallback 및 1-03-04 §NOTE가 허용하는 fallback 경로 사용 — commit HEREDOC의 representative Before/After shape를 그대로 사용하고, 실측은 D-11 프로덕션 UAT로 대체
- **Files modified:** (해당 task는 파일 수정 없음)
- **Verification:** Commit body가 CHAT-06/08/09 + COMPAT-01/02/03 + `"type":"text"` marker 모두 포함함을 grep으로 확인; D-11 UAT에서 end-to-end 검증 예정
- **Committed in:** (plan-level 결정, 개별 task 커밋 없음)

**2. [Pre-existing state] 코드 편집은 이미 로컬 working tree에 반영되어 있었음**
- **Found during:** Plan 03 interactive inline 실행 시작
- **Issue:** `chat-container.tsx`와 `test-sidebar/page.tsx`가 conversation 시작 시점부터 이미 plan 요구사항대로 수정된 uncommitted 상태였음
- **Fix:** must_haves grep 체크 + tsc/build/lint 재실행으로 수정본이 plan 요구사항과 완전 일치함을 확인한 뒤, 수정본을 계획된 HEREDOC 커밋 메시지로 그대로 커밋
- **Verification:** grep 기반 must_haves 8개 항목 통과, `tsc --noEmit` 0, `npm run build` 성공, lint는 stash/pop 비교로 기존 문제만 남고 신규 도입 없음 확인 (10 problems → 6 problems)
- **Committed in:** `0960404`

---

**Total deviations:** 2 (둘 다 plan fallback/상태 동기화 — scope creep 없음)
**Impact on plan:** 없음. Plan의 코드 변경 목표가 그대로 반영되었고, 증거 경로만 fallback을 택함.

## Issues Encountered

- **npm run lint가 exit 1.** 기존 master에도 5 errors / 5 warnings가 있었던 pre-existing 상태. 우리 변경이 오히려 10 → 6 problems로 줄임. 수정 대상 파일 2개만 대상으로 재실행하면 0 issues — plan acceptance criteria의 "pre-existing warnings unrelated" 조항을 충족한다고 판단.

## Verification Run (before commit)

```
npx tsc --noEmit           → exit 0 (no errors)
npm run build              → ✓ Compiled successfully in 3.0s
                             Routes built: /, /api/auth/[...nextauth], /api/chat, /test-sidebar, /_not-found
npm run lint               → pre-existing issues only (reduced 10→6 relative to master)
npx eslint <only 2 files>  → 0 issues on plan-touched files
```

## Next Phase Readiness

**Immediate blocker:** Task 1-03-07 production UAT 게이트. 사용자가 프로덕션 URL에서 "근로기준법 제60조 연차휴가" 질의 후 5개 gate 확인 → `approved` 응답이 와야 Phase 1 verified로 전환 가능.

**Wave 3 이후에 열리는 Phase:**
- Phase 2 (Streaming Stability & Error UX) — Plan 01이 확립한 `route.ts` 구조 위에 재시도/에러 UX/타임아웃 정비
- Phase 3 (Tool Call UI Feedback) — 본 Plan의 `MessagePartRenderer` 안 `ToolChip`을 확장해 4가지 state chip + Korean labels + `<details>` 접힘 블록
- Phase 4 (Conversation Persistence) — `useChat({ id, messages: restored })` reseed 경로 구현 (이 Plan에서 의도적으로 보류)

---
*Phase: 01-empty-message-bug-fix-parts-contract*
*Plan: 03 refactor-chat-wiring*
*Completed: 2026-04-13*
