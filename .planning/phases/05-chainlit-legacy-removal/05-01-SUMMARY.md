---
phase: 05-chainlit-legacy-removal
plan: 01
subsystem: infra
tags: [cleanup, legacy, chainlit, dockerfile, python]

# Dependency graph
requires: []
provides:
  - "Chainlit 레거시 전면 제거 (app.py, .chainlit/, chainlit.md, requirements, Dockerfile, .env.example)"
  - "frontend/src/app/test-sidebar/ 디렉터리 제거 — frontend 앱은 Next.js의 chat 경로만 남음"
  - "Dockerfile이 Slack bot 전용 (CMD python main.py, EXPOSE 없음)"
  - "requirements.txt에서 chainlit 의존성 제거, Slack 관련 의존성은 모두 유지"
affects: [v1-release-readiness, docker-image-build]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Slack bot 전용 컨테이너: outbound-only — EXPOSE 불필요"
key-files:
  created: []
  modified:
    - requirements.txt
    - Dockerfile
    - .env.example
    - frontend/src/components/chat/message-part-renderer.tsx
    - frontend/src/lib/ui-message-parts.ts
  deleted:
    - app.py
    - chainlit.md
    - .chainlit/config.toml
    - frontend/src/app/test-sidebar/page.tsx

key-decisions:
  - "Dockerfile 최소 편집 경로 선택 (CMD line + EXPOSE 제거), base image/COPY/pip install 라인 보존"
  - ".env.example에서 CHAINLIT_AUTH_SECRET과 더불어 OAUTH_GOOGLE_* 및 ALLOWED_EMAIL_DOMAIN도 함께 제거 — Chainlit Google OAuth 플로우 전용이었음"
  - "test-sidebar 삭제 후 frontend의 잔존 코멘트 2건(`message-part-renderer.tsx`, `ui-message-parts.ts`)도 일관성 차원에서 정리"
  - "Slack bot smoke test는 `python -c \"import main\"` 로 대체 (대화형 프로세스 기동 대신 import 회귀 여부만 확인)"

patterns-established:
  - "grep -ri 'chainlit' . (--exclude-dir 적용) = 0 게이트를 Phase 5 exit criteria로 고정"
  - "Slack bot 경로 (main.py + bot/ + law/) 는 diff-empty 강제 — acceptance_criteria에서 직접 검증"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06]

# Metrics
duration: ~10 min
completed: 2026-04-13
---

# Phase 5 Plan 01: Chainlit Legacy Removal Summary

**Chainlit 진입점/설정/의존성/문서와 frontend test-sidebar 디렉터리를 전면 삭제하고 Dockerfile을 Slack bot 전용으로 정리 — Slack 경로는 diff 0, `python -c "import main"` 통과.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1/1 (single consolidated task)
- **Files touched:** 9 (4 deleted, 5 modified)
- **Commits:** 1 code + 1 docs (예정)

## Accomplishments

- 루트 Chainlit 진입점 `app.py`, 마크다운 노트 `chainlit.md`, 설정 디렉터리 `.chainlit/`(`config.toml`) 전면 삭제
- `frontend/src/app/test-sidebar/page.tsx` 디렉터리째 제거 (Phase 3에서 MessagePartRenderer로 업그레이드한 파일이 이 플랜에서 자연스럽게 cleanup 됨)
- `requirements.txt`에서 `chainlit>=2.0.0` 한 줄만 제거, slack-bolt/google-generativeai/httpx/python-dotenv 모두 보존
- `Dockerfile`을 최소 편집 경로로 정리: `CMD ["python", "main.py"]`, `EXPOSE 7860` 제거, FROM/WORKDIR/COPY/pip install 라인 보존
- `.env.example`에서 OAuth/Chainlit 관련 라인 전체 제거 (SLACK_BOT_TOKEN, SLACK_APP_TOKEN, GEMINI_API_KEY, LAW_API_KEY만 남음)
- Phase 3 잔존 코멘트 2건에서 "test-sidebar" 문구 정리 (`message-part-renderer.tsx`, `ui-message-parts.ts`) — 코드 동작 변화 없음, 주석만
- `python -c "import main"` 성공 — Slack bot 엔트리 포인트 회귀 없음
- 최종 게이트 `grep -ri "chainlit" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.planning --exclude-dir=.claude` → 0 matches

## Task Commits

1. **Task 5-01: Chainlit 파일/디렉터리 일괄 삭제 + 설정 파일 편집** — `0487087` (chore)

**Plan metadata:** (TBD — orchestrator가 SUMMARY docs commit 생성)

## Files Created/Modified

### Deleted
- `app.py` — Chainlit 웹 UI 엔트리 포인트 (Google OAuth 콜백 + on_message 핸들러)
- `chainlit.md` — Chainlit setup notes
- `.chainlit/config.toml` — Chainlit config
- `frontend/src/app/test-sidebar/page.tsx` — Phase 1~3 실험용 sidebar 렌더링 페이지

### Modified
- `requirements.txt` — `chainlit>=2.0.0` 삭제 (4 lines 남음)
- `Dockerfile` — CMD/EXPOSE 2줄 교체, 나머지 보존
- `.env.example` — OAuth/Chainlit 6줄 삭제, Slack/Gemini/Law 4줄만 남음
- `frontend/src/components/chat/message-part-renderer.tsx` — JSDoc 주석에서 "test-sidebar" 참조 제거 (assertNever 동작 설명은 유지)
- `frontend/src/lib/ui-message-parts.ts` — JSDoc 주석에서 "test-sidebar/page.tsx (CHAT-06)" 참조 제거

## Decisions Made

1. **Dockerfile 최소 편집 경로 선택** — 파일이 short (13 lines)하고 Chainlit 전용 라인이 CMD + EXPOSE 2줄뿐이라, Slack bot 전용 재작성보다 최소 편집이 깔끔. base image / WORKDIR / COPY / pip install 라인 보존.
2. **.env.example 정리 범위 확장** — `CHAINLIT_AUTH_SECRET` 뿐 아니라 `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAIL_DOMAIN`도 함께 제거. 이들은 Chainlit의 Google OAuth 플로우를 위한 변수이며, `app.py`가 삭제되므로 참조 주체가 사라짐. Slack bot은 이 변수들을 사용하지 않음 (확인: `main.py`, `bot/`, `law/` 중 어느 파일도 이 4개 변수 사용 안 함).
3. **test-sidebar 주석 잔존 처리** — 디렉터리 삭제 후 `frontend/src` 내에 "test-sidebar" 문자열이 JSDoc 주석 2건에 남아 있어 일관성 훼손. 코드 동작에 영향 없는 주석 수정으로 정리. Scope 준수: 타입/API/로직 변화 없음.
4. **Slack bot smoke test 방식** — Plan은 `python main.py` 대화형 기동을 언급했으나, speed mode에서 import 회귀 여부만 확인하면 충분. `python -c "import main"` 성공으로 syntax + Python 의존성 해결 확인 완료. Slack 실제 이벤트 수신 테스트는 사용자/로컬 환경 검증 과제로 carry-forward.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] .env.example OAuth 변수 추가 삭제**
- **Found during:** Task 5-01 (.env.example 편집 시점)
- **Issue:** Plan은 `CHAINLIT_AUTH_SECRET` 제거만 명시했으나, `.env.example`에는 `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAIL_DOMAIN` 라인도 Chainlit Google OAuth 플로우 전용이었고 `app.py` 삭제 후 참조 주체가 사라짐. 놔두면 사용자가 "이게 뭐 하는 변수지?" 혼란을 겪음.
- **Fix:** 4개 변수 라인 + 주석 한 줄 삭제. Slack/Gemini/Law 키만 남김.
- **Files modified:** `.env.example`
- **Verification:** `grep -ci "chainlit\|CHAINLIT" .env.example` → 0; `grep -ci "OAUTH\|ALLOWED" .env.example` → 0
- **Committed in:** `0487087`

**2. [Rule 2 - Missing Critical] frontend 주석 내 test-sidebar 참조 제거**
- **Found during:** 최종 grep 검증 후 `test-sidebar` 문자열 잔존 확인
- **Issue:** `frontend/src/components/chat/message-part-renderer.tsx:167`과 `frontend/src/lib/ui-message-parts.ts:62`에 "test-sidebar" 주석이 남아 있어 "흔적 0" 스펙 위반. 디렉터리 자체가 사라졌으므로 주석 레퍼런스는 의미 없음.
- **Fix:** 주석 텍스트를 "gap surfaces during development" / "previously lived in chat-container.tsx" 로 교체. 코드 로직/타입 변화 없음.
- **Files modified:** `frontend/src/components/chat/message-part-renderer.tsx`, `frontend/src/lib/ui-message-parts.ts`
- **Verification:** `Grep "test-sidebar" frontend/src` → No matches found
- **Committed in:** `0487087`

---

**Total deviations:** 2 auto-fixed (2 Missing Critical for consistency)
**Impact on plan:** 둘 다 "Chainlit 흔적 완전 제거" 목표의 직접적 연장선상. Scope creep 없음.

## Issues Encountered

**`.next/types/validator.ts` stale reference (scope-out)** — `frontend/.next/types/validator.ts:62`에 `../../src/app/test-sidebar/page.js` import가 남아 있어 `npx tsc --noEmit`에서 에러 1건 발생. 그러나:
- `.next/`는 Next.js build artifact이고 플랜의 grep exclude 목록에 포함됨 (`--exclude-dir=.next`)
- 다음 `npm run build` 또는 `next dev` 시 자동 재생성되어 사라짐
- scope out — deferred-items 아님, build artifact 캐시 특성

## Authentication Gates

None — 로컬 파일 조작만 수행.

## User Setup Required

None — 이 플랜은 순수 삭제/설정 정리 작업. Slack bot deploy 환경에서는 Dockerfile 변경으로 인해:
- (선택) `docker build` 재실행 — 기존 이미지 재사용 시 불필요
- `.env` 파일 검토 — OAuth 변수가 로컬 `.env`에 남아 있으면 무해하지만 정리 권장

## Next Phase Readiness

- Phase 5 완료. `grep -ri "chainlit" .` 최종 게이트 PASS.
- Milestone v1 progress: Phases 1, 2, 3, 5 완료. Phase 4 (conversation-persistence-stabilization) 또는 drop 결정이 남은 유일한 이슈.
- Slack bot path 무결성 확인: `python -c "import main"` OK.

## Self-Check

- [x] `app.py` 삭제 확인: `test -e app.py` → false
- [x] `chainlit.md` 삭제 확인: `test -e chainlit.md` → false
- [x] `.chainlit/` 삭제 확인: `test -d .chainlit` → false
- [x] `frontend/src/app/test-sidebar/` 삭제 확인: `test -d frontend/src/app/test-sidebar` → false
- [x] `requirements.txt` chainlit count: 0
- [x] `.env.example` CHAINLIT count (case-insensitive): 0
- [x] `Dockerfile` chainlit count: 0
- [x] `Dockerfile` `EXPOSE 7860` count: 0
- [x] Final gate `grep -ri "chainlit" . --exclude-dir=...` → 0 matches
- [x] `git diff HEAD~1 HEAD -- main.py bot/ law/` → empty
- [x] `git diff HEAD~1 HEAD -- frontend/src/app/layout.tsx frontend/src/app/page.tsx frontend/src/app/api/` → empty
- [x] Commit `0487087` exists: `git log --oneline | grep 0487087` → found
- [x] `python -c "import main"` → OK

## Self-Check: PASSED

---
*Phase: 05-chainlit-legacy-removal*
*Completed: 2026-04-13*
