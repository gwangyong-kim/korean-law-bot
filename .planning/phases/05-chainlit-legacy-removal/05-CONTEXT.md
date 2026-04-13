# Phase 5: Chainlit Legacy Removal - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Claude's discretion (user delegated Phase 4/5)

<domain>
## Phase Boundary

Chainlit 관련 코드/의존성/설정/테스트 페이지가 레포에서 완전히 사라지고, Slack 봇 경로(`main.py`, `bot/`, `law/`)는 일절 변경 없이 정상 동작한다. 독립 phase로, 다른 phase와 병렬 진행 가능.

**In scope:** CLEAN-01~06 전체. 파일/디렉터리 삭제, `requirements.txt` 편집, `Dockerfile` 정리, `.env.example` 정리, `test-sidebar/` 삭제, 수동 Slack 봇 smoke test.

**Out of scope:** Slack 봇 코드 수정, Python 의존성 추가, 새 프런트엔드 페이지, Chainlit 대체 툴 도입.

</domain>

<decisions>
## Implementation Decisions

### A. Chainlit 코드 삭제 범위 (CLEAN-01, CLEAN-04)
- **D-01:** 삭제 대상 목록 (전체 제거):
  - `app.py` (루트)
  - `.chainlit/` 디렉터리 전체
  - `chainlit.md` (루트)
  - `frontend/src/app/test-sidebar/` 디렉터리 전체 (Phase 1 CHAT-06에서 inline getMessageText 교체 후, Phase 5에서 디렉터리 자체 삭제 — 두 phase가 충돌하지 않음)
- **D-02:** 보존 대상 (절대 건드리지 않음):
  - `main.py`, `bot/`, `law/` — Slack 봇 경로
  - `frontend/` 하위의 chat/auth/test-sidebar 이외 파일 (모두 보존)

### B. requirements.txt 편집 (CLEAN-02)
- **D-03:** `chainlit` 한 줄만 제거. 다른 Python 의존성(`slack-bolt`, `google-generativeai`, `httpx`, `python-dotenv`)은 그대로. 버전 고정 유지. pip install 재실행 스크립트 없음.

### C. Dockerfile 정리 (CLEAN-03)
- **D-04:** 현재 Dockerfile 내용을 먼저 `cat`으로 읽은 뒤 판단:
  - 만약 Chainlit 중심이면 → **Slack 봇 전용으로 재작성**: `CMD ["python", "main.py"]`, `EXPOSE` 라인 제거 (Slack은 outbound), base image + COPY + pip install + CMD 최소 구조.
  - 만약 Chainlit 라인만 몇 개 있으면 → 해당 라인만 삭제 (최소 변경).
- **D-05:** 포트 7860 노출 제거 확정. `EXPOSE 7860` 있으면 삭제.

### D. .env.example 정리 (CLEAN-06)
- **D-06:** 삭제 대상 환경변수: `CHAINLIT_AUTH_SECRET`, `CHAINLIT_AUTH_TOKEN`, `CHAINLIT_*` 패턴 전체. 보존: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `LAW_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ALLOWED_EMAIL_DOMAIN`, 나머지 모두.

### E. Slack 봇 smoke test (CLEAN-05)
- **D-07:** 수동 검증 절차:
  1. 파일 삭제 + requirements.txt/Dockerfile/.env.example 편집 커밋 후
  2. 로컬에서 `pip install -r requirements.txt` 재실행
  3. `python main.py` 기동
  4. 프로세스가 Slack event를 수신하는지 로그 확인 (expected: `Slack Bolt app started` 또는 유사 기동 로그)
  5. 가능하면 Slack에서 `@법령봇 테스트` 멘션 후 응답 확인
  6. 실패 시 rollback (해당 커밋 revert)
- **D-08:** smoke test 결과는 Phase 5 VERIFICATION.md `human_verification` 섹션에 기록. 자동화 없음.

### F. grep 기반 최종 검증
- **D-09:** Phase 5 종료 게이트: `grep -ri "chainlit" .` 결과가 **0건**. `.gitignore`, `.git/`, `node_modules/`, `frontend/.next/` 제외. SUMMARY.md 또는 VERIFICATION.md에 grep 출력 첨부.

### Claude's Discretion
- Dockerfile 재작성 vs 최소 편집은 실제 파일 내용 보고 판단.
- 삭제 커밋 분할 방식 (단일 atomic vs 서버/프런트 분할) — 실행 시점에 결정.
- `test-sidebar/` 내부 다른 파일(page.tsx 외) 발견 시 포함 여부 — 기본은 전체 삭제.

</decisions>

<canonical_refs>
## Canonical References

### 프로젝트 정의
- `.planning/REQUIREMENTS.md` §Legacy Cleanup — CLEAN-01~06 전체
- `.planning/ROADMAP.md` §Phase 5 — Goal, Success Criteria, Dependencies (없음 — 독립)

### Codebase 맥락
- `.planning/codebase/STRUCTURE.md` — 디렉터리 레이아웃 (어떤 디렉터리가 어디 있는지)
- `.planning/codebase/INTEGRATIONS.md` — Slack 봇 연결 구조 (절대 건드리지 않을 경계)
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-CONTEXT.md` §test-sidebar — Phase 1의 CHAT-06에서 inline getMessageText 교체 결정과 Phase 5 디렉터리 삭제 결정이 충돌 없이 연결됨

### 수정/삭제 대상 파일
- `app.py` — 삭제
- `chainlit.md` — 삭제
- `.chainlit/` (디렉터리) — 삭제
- `frontend/src/app/test-sidebar/` (디렉터리) — 삭제
- `requirements.txt` — chainlit 라인 제거
- `Dockerfile` — 재작성 또는 라인 제거
- `.env.example` — CHAINLIT_* 제거

### 보존 (untouched)
- `main.py`, `bot/**`, `law/**` — Slack 봇 경로

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 없음 — 이 phase는 순수 삭제 작업.

### Established Patterns
- **스코프 격리**: PROJECT.md Constraints에 "Slack bot untouched" 명시. `bot/`, `main.py`, `law/` 경로는 수정 금지.
- **grep 검증**: 정리 후 `grep -ri "chainlit"` 으로 흔적 0 확인하는 패턴이 Milestone Exit Criteria에 locked.

### Integration Points
- Slack 봇은 `main.py` 엔트리 포인트에서 `bot/slack_handler.py` import. `requirements.txt`의 `slack-bolt`, `google-generativeai`, `httpx`, `python-dotenv`가 유지되어야 기동.
- frontend는 `test-sidebar/` 제거 후 `app/` 내에 `page.tsx`, `layout.tsx`, `api/` 만 남음.

### Known Pitfalls
- `test-sidebar/page.tsx`는 Phase 1 CHAT-06에서 inline getMessageText를 제거한 상태. Phase 5 삭제 시 충돌 없음 (같은 파일 삭제이므로).
- `.chainlit/` 디렉터리가 git-tracked인지 확인 필요. `.gitignore`에 있다면 이미 추적 안 됨 → 로컬 삭제만.
- Dockerfile 변경 시 `docker build` 실패 위험 — 단, 이번 스코프에서 도커 빌드 실행은 요구되지 않음. Dockerfile 수정은 문법 유지만 확인.
- `chainlit.md`는 루트에 있고 Chainlit setup notes인데, `CLAUDE.md`가 아님 — `frontend/CLAUDE.md @AGENTS.md`와 혼동 금지.

</code_context>

<specifics>
## Specific Ideas

- "Slack 봇이 여전히 기동" 검증이 Phase 5의 가장 중요한 gate — 문서 한 줄이 아니라 실제 `python main.py` 돌려보고 로그 확인.
- Chainlit 삭제는 독립 phase라 Phase 1/2/3 병렬 진행 가능 (dependencies 없음).

</specifics>

<deferred>
## Deferred Ideas

- Dockerfile 최적화 (multi-stage build, distroless 등) — v2
- CI에서 Slack 봇 기동 테스트 자동화 — v2 V2-OBS
- Python 의존성 버전 업그레이드 — v2

</deferred>

---

*Phase: 05-chainlit-legacy-removal*
*Context gathered: 2026-04-13*
