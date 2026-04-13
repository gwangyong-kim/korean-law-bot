---
phase: 02
slug: streaming-stability-error-ux
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 02 — Validation Strategy

> Phase 2는 Phase 1과 동일하게 **자동화된 유닛 테스트를 추가하지 않습니다.** 실패 모드가 Vercel serverless + 원격 MCP 서버 + Gemini provider라는 **외부 환경**에 의존하기 때문에 mocking이 현실적이지 않고, 잘못된 mock은 "테스트는 green, 프로덕션은 red"를 만드는 가장 흔한 원인이 됨 (Phase 1에서 PROJECT.md에 명시된 anti-pattern). 대신 **Vercel 로그 grep + 로컬 Playwright MCP + 프로덕션 수동 UAT** 조합으로 validation을 수행합니다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 (Phase 1과 동일) |
| **Config file** | 없음 |
| **Quick run command** | `cd frontend && npx tsc --noEmit && npm run build` |
| **Full suite command** | `cd frontend && npx tsc --noEmit && npm run build && npm run lint` |
| **Estimated runtime** | ~30-60초 (build dominant) |

---

## Sampling Rate

- **After every task commit:** `cd frontend && npx tsc --noEmit` (3s) — TypeScript contract check
- **After every plan wave:** `cd frontend && npm run build` (10-15s) — 통합 빌드
- **Before `/gsd-verify-work`:** Full suite + 로컬 Playwright MCP로 `/test-sidebar` smoke test
- **Max feedback latency:** 30초 (tsc loop)

---

## Per-Requirement Validation Map

| Req | Decision | Validation Signal | How Validated | Automatable? |
|-----|----------|-------------------|---------------|--------------|
| STRE-01 | D-01 Promise.race 5s timeout | `createMCPClient`가 5s 초과 시 reject, `mcp_offline` 반환 | (a) tsc: 타입 체크 — Promise.race 반환 타입이 catch 경로로 연결 (b) manual: `LAW_API_KEY` 잘못 설정 → 로컬 dev에서 /test-sidebar 질의 → degraded 응답 + Vercel log `[route.ts] mcp init failed: mcp_timeout` 관찰 | 타입만 자동, 실행은 수동 |
| STRE-02 | D-02 모듈 스코프 tools 캐시 TTL 5분 | 첫 요청 cache miss, 후속 warm 요청 cache hit | (a) D-04 PoC: `[route.ts] tools cache: hit/miss` 임시 로그 → 프로덕션 2연속 질의 → Vercel logs에서 miss → hit 순서 관찰 → 로그 제거 → PROJECT.md Key Decisions에 "Vercel warm-container 캐시 재사용: 확인됨" 기록 | 수동 |
| STRE-03 | D-07 인라인 에러 배너 + "다시 시도" | 실패한 assistant bubble 내부에 rounded border + bg-destructive/5 + 재시도 버튼 렌더 | (a) 로컬 Playwright MCP: LAW_API_KEY 비우고 /test-sidebar 질의 → degraded 응답에 `[⚠️ 미확인 답변]` 프리픽스 관찰 (b) chat-message.tsx에 error prop 전달 smoke test | 반자동 (Playwright) |
| STRE-04 | D-06 code → 한국어 메시지 테이블 | 4가지 코드 (mcp_offline/mcp_busy/stream_timeout/unknown)에 대해 각 한국어 메시지가 UI에 정확히 렌더 | (a) 타입: `error-messages.ts` 테이블이 4 entry 완비, client parser 분기 커버 (b) 수동: 각 실패 모드를 1회씩 유도 → 메시지 확인 (mcp_timeout 메시지 추가 필요 — Open Q #4) | 타입만 자동 |
| STRE-05 | D-09 useChat.regenerate() | "다시 시도" 클릭 → 실패 턴 제거 + 이전 user 메시지로 재호출 | 로컬 Playwright: 실패 시뮬레이션 → 버튼 클릭 → 새 assistant bubble 생성 관찰. regenerate() 가 pre-stream error 케이스에 작동하지 않으면 sendMessage fallback (Open Q #3) | 반자동 |
| STRE-06 | D-08 1초 대기 + 1회 서버 재시도 (503/"Max sessions") | Vercel log에서 한 요청당 MCP tools() 최대 2회 호출 관찰 | 로그 grep: `[route.ts] mcp retry after 1s` 임시 로그 → 프로덕션에서 503 트리거 어려움 → 스테이징 또는 LAW_API_KEY rate-limit 강제로 재현 (not guaranteed, manual attempt) | 수동 + best-effort |
| STRE-07 | D-14 SYSTEM_PROMPT 일상 인사 예외 | "안녕하세요" 단일 턴 → tool call 0회 | 로컬 Playwright `/test-sidebar`에서 "안녕하세요" 전송 → messages[1].parts 덤프에 `dynamic-tool` 파트 없고 `text` 파트만 있음 확인 | 반자동 (Playwright assertion) |
| STRE-08 | D-13 Gemini multi-turn smoke | 3연속 질의에 모두 text part 포함 | 수동 UAT: 프로덕션에서 "근로기준법 제60조" → "제59조는?" → "제58조는?" → 세 assistant 턴 모두 텍스트 렌더. 실패 시 `thinkingBudget: 0` patch | 수동 |
| STRE-09 | D-12 maxDuration=60 유지 근거 | PROJECT.md Key Decisions 표에 D-12 근거 1줄 기록 | 파일 grep: `grep "maxDuration" .planning/PROJECT.md` | 자동 (grep) |

---

## Wave 0 Requirements

- [x] Phase 1 인프라 그대로 재사용 (tsc, build, lint, Playwright MCP). 추가 설치 없음.
- [x] 로컬 dev 서버가 `.env.local`로 구동 가능 (Phase 1에서 검증됨).

*Existing infrastructure (Phase 1) covers all Phase 2 validation needs. No framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel warm-container 캐시 재사용 | STRE-02 / D-04 PoC | 프로덕션 serverless 환경에서만 관찰 가능. 로컬 `next dev`는 항상 warm. | D-04 PoC 절차: 임시 console.log 삽입 → `git push` → ~2분 Vercel 빌드 대기 → 프로덕션 질의 2회 연속 → Vercel dashboard Functions → `/api/chat` 로그에서 `cache miss` → `cache hit` 시퀀스 관찰 → 임시 로그 제거 후 재푸시 |
| MCP 503 재시도 경로 | STRE-06 / D-08 | 503 유도가 재현 불가능. MCP 서버가 과부하 상태여야 함. | Best-effort: 로컬에서 MCP URL을 의도적으로 잘못된 경로로 바꿔 한 번만 재시도가 일어나는지 로그 관찰. 또는 코드 경로에 breakpoint-style 로그로 검증. |
| Gemini multi-turn thought_signature | STRE-08 / D-13 | Provider 내부 동작. 모킹 불가. | 프로덕션에서 3연속 법령 질의 수동 수행. Phase 2 VERIFICATION.md에 각 턴의 text part 길이/존재 기록. |
| "안녕하세요" 강제 툴 호출 방지 | STRE-07 / D-14 | System prompt 변경의 downstream 영향은 실제 모델 호출에서만 검증됨. | 로컬 dev + `/test-sidebar`에서 "안녕하세요" → 응답의 `messages[1].parts`에 tool 파트가 없음을 Playwright assertion으로 확인. 또는 수동으로 JSON 덤프 확인. |
| 인라인 에러 배너 + 재시도 버튼 렌더 | STRE-03 / STRE-05 | React 상태 + AI SDK 스트림 생명주기가 얽혀 있어 유닛 테스트보다 Playwright E2E가 신뢰도 높음. | 로컬 Playwright로 LAW_API_KEY 비우거나 MCP URL 파괴 → 실패 턴 관찰 → "다시 시도" 버튼 클릭 → 재생성 확인. |

---

## Nyquist Compliance Note

Phase 2는 "manual-heavy" phase이지만 **nyquist_compliant: true**로 선언합니다. 이유:

1. 모든 must_haves가 최소 한 개의 **명시적 validation signal**에 매핑됨 (위 Per-Requirement 표).
2. 자동 가능한 부분(tsc, build, grep, PROJECT.md 파일 존재)은 빠짐없이 자동화됨.
3. 자동화 불가한 부분은 Manual-Only 표에 근거와 절차가 명기됨.
4. 외부 의존(Vercel serverless, remote MCP, Gemini provider)에 대한 mocking 회피는 Phase 1에서 확립된 프로젝트 원칙 (PROJECT.md "테스트는 green, 프로덕션은 red" anti-pattern 배제).

Dimension 8 판정을 위한 증거: 각 requirement가 `validation signal`을 가지며, `automatable` 컬럼이 "수동"인 항목들은 Manual-Only 표에 설명이 있음.

---

*Phase: 02-streaming-stability-error-ux*
*Validation strategy drafted: 2026-04-13*
*Will be updated during Phase 2 execution as PoC results come in (D-04 warm-container check, D-13 Gemini smoke)*
