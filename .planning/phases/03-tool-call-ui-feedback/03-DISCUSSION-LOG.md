# Phase 3: Tool Call UI Feedback - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-13
**Phase:** 03-tool-call-ui-feedback
**Mode:** Interactive discuss
**Areas discussed:** A. Chip 디자인, B. Details 펼침, C. 다중 호출 스택, D. Skeleton 교체

## A. Chip 디자인

| Q | Options | Selected |
|---|---------|----------|
| 색상 팔레트 | semantic / neutral / dark-mode | semantic 상태별 색상 |
| 아이콘 | lucide-react / 이모지 / 없음 | lucide-react 기존 재사용 |
| 시제 변화 | '~ 중' → '~ 완료' / 명사형 고정 | '~ 중' → '~ 완료' |
| 첫 인자 표시 | 도구별 argKey / 전체 concat / 없음 | 도구별 기준 코하드 |

## B. Details 펼침 내용

| Q | Options | Selected |
|---|---------|----------|
| 노출 정보 | args + truncate / args만 / 전체 + highlight | args + raw 결과 truncate |

## C. 다중 호출 스택

| Q | Options | Selected |
|---|---------|----------|
| 스택 방식 | 세로 체크리스트 + 번호 없음 / 번호 매김 | 세로 체크리스트 + 번호 없음 |

## D. Skeleton 교체

| Q | Options | Selected |
|---|---------|----------|
| 대체 UX | chip + skeleton bubble / chip만 | chip + skeleton bubble 조합 |

## Claude's Discretion

- chip padding/rounded/gap 미세 조정
- Loader2 회전 속도
- truncate 문자 수 (1500~3000 허용)
- tool-labels.ts export 이름
- skeleton bar 개수 (2~4)

## Deferred Ideas

- Live input-streaming delta preview — v2
- 도구별 이모지 — v2
- 경과 시간 표시 — v2
- 결과 개수 chip — v2
