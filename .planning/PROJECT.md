# Korean Law Bot

## What This Is

한국 법령 봇. 국가법령정보센터(law.go.kr) Open API를 Gemini 함수 호출(MCP 경유)로 질의해서, 사내 직원이 법령·판례·행정규칙을 자연어로 물어볼 수 있게 해주는 사내용 Chat Assistant. 웹(Next.js 16)과 Slack 봇(Python) 두 가지 경로로 제공한다. 이번 사이클은 **Next.js 웹을 사내 배포 가능한 수준으로 정비**하는 데 집중한다.

## Core Value

사내 직원이 웹 브라우저에서 한국 법령·판례를 자연어로 물어봤을 때, **답이 빈 카드가 아니라 신뢰할 수 있는 근거 있는 텍스트로 화면에 정상 렌더링된다.** 이 한 가지가 안 되면 다른 건 의미가 없다.

## Requirements

### Validated

<!-- 기존 코드베이스에서 이미 구현되어 돌아가는 것들. 건드리지 않는다. -->

- ✓ Slack 봇 `@法令봇` 멘션 → Gemini 함수 호출 → law.go.kr API 조회 → 스레드 답변 — existing (`bot/slack_handler.py`, `bot/gemini_client.py`)
- ✓ Python 측 law API 클라이언트 (`law/api.py`): `search_law`, `get_law_text`, `search_decisions`, `get_decision_text` — existing
- ✓ Next.js 16 + AI SDK 6 기반 채팅 UI 구조 — existing (`frontend/src/app/`, `frontend/src/components/chat/`)
- ✓ NextAuth v5 Google OAuth + `ALLOWED_EMAIL_DOMAIN` 도메인 제한 — existing (`frontend/src/lib/auth.ts`)
- ✓ 자체 호스팅 MCP 서버(`glluga-law-mcp.fly.dev`) 연동 — existing (`frontend/src/app/api/chat/route.ts`)
- ✓ Gemini 2.5 Flash 기본 모델 + 모델 셀렉터 UI — existing (`frontend/src/components/chat/model-selector.tsx`)
- ✓ localStorage 기반 대화 저장 / 즐겨찾기 / 내보내기 — existing (`frontend/src/lib/conversations.ts`)
- ✓ Vercel 프로덕션 배포 (serverless 60초 타임아웃) — existing (`frontend-phi-six-16.vercel.app`)

### Active

<!-- 이번 사이클 스코프. 사내 배포 준비 = 이 목록이 모두 ✓가 되는 것. -->

- [ ] **채팅 빈 메시지 버그 수정** — 프로덕션에서 AI 답변이 빈 카드로 렌더링되는 현상을 근본 원인까지 파고들어 고친다. `chat-container.tsx:158-167`의 `getMessageText()`가 AI SDK 6 `UIMessage.parts`의 실제 구조(`type: "text" | "tool-call" | "tool-result" | ...`)를 제대로 처리하도록 재작성.
- [ ] **스트리밍 안정성 정비** — 60초 타임아웃, MCP 연결 실패, 503/429 상황에서 사용자가 뭐가 잘못됐는지 명확히 알 수 있도록 에러 경로 정비. 재시도 전략 포함 검토.
- [ ] **툴 호출 UI 피드백** — 지금은 `"검색 중..."` 텍스트만 보여주는데, "어떤 법령을 찾는 중" 수준의 진행 상태를 실시간으로 노출. AI SDK의 `tool-call` / `tool-result` 파트를 UI에서 활용.
- [ ] **대화 관리/저장 안정화** — localStorage 구조는 유지하되, 저장 경합·손실·부분 업데이트 버그 점검. 내보내기/즐겨찾기 동작 재검증.
- [ ] **Chainlit 레거시 완전 삭제** — `app.py`, Chainlit 관련 의존성, Dockerfile의 chainlit 부분, `.chainlit/` 등. Slack 봇 경로(`main.py`, `bot/`)는 건드리지 않는다.

### Out of Scope

- **Slack 봇 수정·리팩터링** — 이번 사이클 아님. 이미 돌아가고 있고, 웹 정비에 집중하기 위해 의도적으로 제외.
- **대화 저장을 서버 DB로 이전** — 아키텍처 변경은 이번 주 스코프 밖. localStorage 그대로 가져간다. v2 이후 재평가.
- **Next.js / AI SDK 메이저 버전 업그레이드** — Next.js 16, AI SDK 6 현행 유지. 버그는 현재 버전에서 수정.
- **법령 검색 결과 품질 개선 / 프롬프트 튜닝** — 현재 system prompt 유지. 툴 호출이 실제로 도는 것 자체가 먼저.
- **모니터링/로그 인프라 구축 (Sentry, Datadog 등)** — 이번 주 안에 할 일 아님. `console.error` 수준 유지.
- **모바일 전용 UI** — 반응형 기본 수준은 유지, 모바일 최적화는 제외.

## Context

**기술 스택 (프론트 중심):**
- Next.js 16.2.3 + React 19.2.4 + TypeScript 5
- AI SDK 6.0.158 (`ai`, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/mcp`)
- Gemini 2.5 Flash 기본, 다른 모델 선택 가능
- NextAuth v5 + Google OAuth
- Tailwind CSS 4, Base UI, shadcn 스타일
- Vercel 배포 (serverless 60초 타임아웃, 무료 티어)

**중요 경고:**  
`frontend/AGENTS.md`에 "This is NOT the Next.js you know"라는 경고가 있다. Next.js 16과 AI SDK 6는 최신 버전이라 과거 API 지식에 의존하면 안 된다. `node_modules/next/dist/docs/`와 AI SDK 공식 소스를 직접 확인하면서 작업할 것.

**현재 사용 현황:**  
아직 사내 정식 공개 전. 본인(개발자)만 사용/검증 중. 이번 사이클의 출구가 곧 사내 배포.

**버그 이력 (커밋 로그 상):**  
메시지 파트 변환 버그에 대해 이미 4차례 fix 시도 (`fd4ba9c`, `45e73f7`, `3d6ff04`, `b618abe`)했지만 아직 프로덕션에서 빈 카드로 나타남 → 표면적 패치가 아니라 원인부터 다시 봐야 한다는 시그널.

**기타:**  
`.planning/codebase/CONCERNS.md`에 기술 부채가 정리되어 있음. 필요 시 이번 스코프 밖의 항목은 v2 백로그로 이동.

## Constraints

- **Timeline**: ~1주 (사내 배포 준비 완료 데드라인) — 우선순위 1 > 2 > 3 > 5 > 4 순. 빡빡하면 4번(대화 저장 안정화)부터 잘린다.
- **Tech stack (frozen)**: Next.js 16 / React 19 / AI SDK 6 / Gemini / MCP — 이번 사이클에선 메이저 버전 변경 금지. 버그는 이 스택 위에서 해결.
- **Deployment**: Vercel 무료 티어, serverless 함수 최대 60초. 이 한계 안에서 동작해야 함.
- **Auth**: NextAuth v5 + Google OAuth + 사내 도메인 제한 (`ALLOWED_EMAIL_DOMAIN`). 이 구조 유지.
- **Backward-compat**: 기존 localStorage에 저장된 대화가 수정 후에도 읽히고 렌더링되어야 함 (사용자 본인의 검증 기록 보존).
- **Slack bot untouched**: `bot/`, `main.py`, `law/` Python 코드 및 Slack 관련 설정은 수정 금지 (스코프 격리).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 스코프를 Next.js 웹 정비로 한정, Slack 봇 제외 | 1주 타임라인 안에 끝내기 위해 경로 하나에 집중 | — Pending |
| Chainlit 레거시 완전 삭제 | 두 개의 웹 프런트엔드를 유지할 필요 없음, 혼란만 증가 | — Pending |
| 대화 저장은 localStorage 유지 | 서버 DB 전환은 아키텍처 변경이라 이번 주 스코프 밖 | — Pending |
| 우선순위: 빈 메시지 버그가 최상단 | 프로덕션 블로커. 이게 안 고쳐지면 다른 작업이 의미 없음 | — Pending |
| Next.js 16 / AI SDK 6 현행 유지 | 버전 업그레이드는 별도 사이클. 지금은 버그 수정에 집중 | — Pending |
| 메시지 파트 추출 로직을 **근본 재설계** (패치가 아닌) | 이미 4차례 표면 패치 실패. 원인부터 다시 봐야 함 | ✓ Decided (Phase 1) — `lib/ui-message-parts.ts` + `MessagePartRenderer` 단일 경로 |
| `maxDuration = 60` 유지 (STRE-09 / D-12) | Vercel Hobby 플랜 제약. 평균 Gemini Flash 스트림은 30초 내 완료되고, 타임아웃 시 `stream_timeout` 인라인 에러 UX로 사용자 피드백 확보. 상향(300s)은 Fluid Compute / 유료 플랜 전환 등 별도 인프라 결정. | ✓ Decided (Phase 2) |
| MCP warm-container 캐시 재사용 (STRE-02 / D-04) | 모듈 스코프 pending-promise 캐시 + TTL 5분. Phase 2 PoC(로컬 dev): `[mcp-cache]` miss → hit × 3 시퀀스가 ~58s / 109s / 164s에 걸쳐 관찰됨 (pending-promise stampede 방어 정상). Vercel 프로덕션 Fluid Compute 토글 확인은 대시보드 접근 불가로 `unknown`. 로컬 warm 재사용은 CONTEXT D-04의 "next dev는 항상 warm" 전제와 일치. | ✓ Decided (Phase 2) — 로컬 관찰됨, 프로덕션 미관찰(비블로킹) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-13 after initialization*
