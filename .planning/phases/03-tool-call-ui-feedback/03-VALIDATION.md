---
phase: 03
slug: tool-call-ui-feedback
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 03 — Validation Strategy

Phase 1/2와 동일한 원칙: automated test 추가 안 함. 검증은 **tsc/build 정적 검증 + 로컬 Playwright MCP smoke + 코드 레벨 grep**으로 구성.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | 없음 |
| **Quick command** | `cd frontend && npx tsc --noEmit` (~3s) |
| **Full command** | `cd frontend && npx tsc --noEmit && npm run build` (~15s) |

## Per-Requirement Validation Map

| Req | Decision | Validation Signal | How | Automatable? |
|-----|----------|-------------------|-----|--------------|
| TOOL-01 | D-01..03 4-state color/icon/tense chip | 4개 상태 모두 코드 분기 + live Playwright snapshot에서 색상 class 존재 | grep on `bg-success`, `bg-destructive`, `Loader2`, `Check`, `AlertCircle` + Playwright `/test-sidebar`에서 실제 툴 호출 발생시키고 `chip class` 확인 | 반자동 |
| TOOL-02 | D-04 tool-labels.ts 4 tool map | `lib/tool-labels.ts` 신규 파일이 4 tool (`search_law`/`get_law_text`/`search_decisions`/`get_decision_text`) + **실측 기반** argKey 매핑 포함. RESEARCH §3의 corrected priority list 따름. | grep file existence + required tool names presence | 자동 (grep) |
| TOOL-03 | D-03 verb tense | `'중'`, `'완료'`, `'실패'` 세 접미사 코드 존재 + 한글 자연스러운 라벨 형식 | grep 3 substrings + code review | 자동 |
| TOOL-04 | D-05/D-06 `<details>` 접힘 + JSON dump + response truncate | `<details>` element 렌더, 2000 char truncate 로직, 접힘 default | grep `<details`, `slice(0, 2000)`, `open={false}` or no `open` attr | 자동 (grep) |
| TOOL-05 | D-07/D-08/D-09 세로 체크리스트 + 텍스트 하단 | chip block이 text content 위에, 각 chip 독립 줄, 그룹 상자 없음 | MessagePartRenderer JSX 구조 code review + Playwright snapshot에서 chip 여러 개 세로 stack 확인 | 반자동 |
| TOOL-06 | D-10/D-11/D-12 정적 "검색 중..." 제거 + skeleton bubble | `chat-container.tsx`에서 `검색 중...` literal 0건 + skeleton 컴포넌트 렌더 경로 존재 | grep count → 0, skeleton render condition code review | 자동 |

## Wave 0 Requirements

- [x] Phase 1/2 인프라 그대로 재사용
- [ ] RESEARCH Open Q #1 `--success` CSS variable grep (`frontend/src/app/globals.css`) — Wave 1 첫 task에서 처리

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test |
|---|---|---|---|
| Chip 시각 (색상/아이콘/애니메이션) 실측 | TOOL-01 | CSS class 존재만 tsc로 검증 가능, 시각 렌더는 눈으로 확인 | 로컬 Playwright `/test-sidebar` 질의 → `<pre>` 덤프 + screenshot. 주의: test-sidebar는 MessagePartRenderer를 안 쓰므로 Phase 1의 제약 동일 — `/` 라우트 OAuth 벽. Phase 3는 test-sidebar도 MessagePartRenderer 경로로 업그레이드할지 planner 결정 필요 (RESEARCH §9) |
| `<details>` 펼침 동작 | TOOL-04 | native HTML 동작, JS 로직 없어 타입 체크로 확인 불가 | 브라우저에서 툴 호출 assistant bubble의 details 클릭 → JSON 노출 확인 |
| Skeleton bubble 교체 흐름 | TOOL-06 | React 상태 타이밍 기반 UX | Playwright로 법령 질의 → 응답 시작 직후 skeleton bar 3줄 캡처 → 응답 완료 후 실제 텍스트 전환 캡처 |

## Nyquist Compliance Note

Phase 2와 동일 방식으로 `nyquist_compliant: true` 선언. 이유는 VALIDATION.md와 RESEARCH.md §13에 validation signal이 requirement별로 매핑되어 있고 automatable/manual 구분이 명시되어 있기 때문.

---
*Phase: 03-tool-call-ui-feedback*
*Validation strategy drafted: 2026-04-13*
