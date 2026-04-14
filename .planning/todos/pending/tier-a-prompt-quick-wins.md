---
title: Tier A Quick Wins — SYSTEM_PROMPT 4줄 추가
date: 2026-04-14
priority: high
source: .planning/notes/answer-quality-research.md
estimate: 30분 ~ 1시간 (프롬프트 수정 + 프로덕션 A/B 확인)
---

# Tier A Quick Wins

SYSTEM_PROMPT 한 파일 (`frontend/src/app/api/chat/route.ts`) 만 열어서 넣을 수 있는 4가지 개선. 구조 설계 불필요. 오늘 배포 가능.

## Why

리서치(.planning/notes/answer-quality-research.md) 결과 중 **"디자인 고민 없이 바로 박을 수 있는" 4가지**. 비용 대비 효과 1순위. 스캐폴드 재설계(별도 todo)는 이것들을 먼저 돌려서 얼마나 나아지는지 본 다음 착수.

## What

### 1. Persona anchor (한 줄)

SYSTEM_PROMPT 맨 앞에 한 줄 추가:

```
당신은 10년차 한국 송무 변호사로, 사내 비법조인 팀(HR, 영업, 안전, 마케팅, 컴플라이언스)
대상 법률 브리핑을 담당합니다. 전문성은 유지하되 법률가 특유의 난해한 어휘(legalese)는 피하고,
실무자가 바로 행동할 수 있는 수준으로 설명합니다.
```

**출처:** Anthropic prompt engineering guide — role anchoring 한 문장이 톤 고정에 가장 효과적.

### 2. 결론-먼저 (Casetext 패턴)

모든 답변의 첫 줄을 고정 포맷으로 강제:

```
**핵심 결론:** {1~2문장으로 사용자가 알아야 할 것의 요약}
```

그 다음에 본문.

**출처:** Casetext CoCounsel 메모 포맷 — "핵심 결론 먼저, 분석 나중, 인용 끝". Perplexity도 executive summary를 첫 블록에 둠.
**해결하는 pain point:** "그래서 뭐가 중요한지" 결손 (깊이 부족).

### 3. 헤징 어휘 강제 + 디스클레이머

한국 법률 맥락에 필수:

```
- 단정적 표현(반드시, 절대, 무조건) 대신 헤징 표현을 사용합니다.
  선호: "~로 보입니다", "~할 여지가 있습니다", "다만 사안에 따라 달라질 수 있습니다"
- 답변 말미에 한 줄 디스클레이머를 포함합니다:
  "※ 본 답변은 법률 정보 제공이며, 구체적 사안은 법무팀 또는 변호사와 상의하시기 바랍니다."
```

**출처:** 한국 리걸테크(엘박스, 로앤비) 관례 + 변호사법 위반 리스크(LawTimes 변협 경고).
**해결하는 pain point:** 톤 일관성 + 법적 리스크 회피.

### 4. 단일 프롬프트 Chain-of-Verification

SYSTEM_PROMPT 마지막에 추가:

```
답변 생성 프로세스:
1. 먼저 머릿속으로 초안을 작성합니다 (출력하지 않음).
2. 그 초안에 대해 스스로 3개의 검증 질문을 만듭니다:
   - 인용한 조문/판례 번호가 정확한가?
   - 사용자가 실제로 묻고자 한 것에 답했는가 (질문 재해석 오류는 없는가)?
   - 중요한 예외/한계/관련 법령을 빠뜨렸는가?
3. 각 질문에 답하며 초안을 보완합니다.
4. 최종본만 사용자에게 출력합니다.
```

**출처:** CoVe paper (ACL 2024) — FACTSCORE 55.9 → 71.4.
**해결하는 pain point:** 깊이 + 정확성 동시 개선. 특히 "맥락 연결" (pain point #4 — 조문+판례+실무 엮기)에 직격.

## How to apply

1. `frontend/src/app/api/chat/route.ts` 의 `SYSTEM_PROMPT` 상수 열기
2. 위 4개 블록을 적절한 위치에 삽입 (Persona는 맨 앞, 나머지는 기존 규칙 블록에 흡수)
3. 기존 "상세 출처 형식" 섹션은 유지 (이미 잘 돌아가고 있음)
4. 로컬 `npm run dev`에서 3~5개 테스트 질문 돌려보기:
   - "중대재해처벌법 제4조 안전보건 확보 의무 알려줘" (단순 조문)
   - "성과급이 통상임금에 포함되는지 판례 찾아줘" (해석/판례)
   - "이 근로계약서에 문제가 있는지 확인해줘" + 샘플 계약 (검토)
5. Before/After 답변을 같이 놓고 눈으로 A/B — 4개 pain point(깊이/톤/연결) 가 느껴지게 개선됐는지
6. 괜찮으면 commit + `npx vercel --prod --yes` 배포

## Out of scope

- XML 스캐폴드 설계 (`tier-a-scaffold-design.md` 참조)
- 복잡도 게이팅 (단순 질문 vs 해석 질문 분기) — 스캐폴드 설계와 함께
- Few-shot 예시 작성 — 스캐폴드 설계 이후
- 다단 호출, self-critique 2-pass, RAG 확장 — 전부 Tier B (seed 참조)

## Definition of done

- [ ] SYSTEM_PROMPT에 4개 패치 적용
- [ ] 로컬에서 3개 이상 테스트 질문으로 Before/After 비교
- [ ] 결론-먼저 포맷이 강제되는지 확인
- [ ] 헤징 어휘로 답변이 작성되는지 확인
- [ ] 디스클레이머가 답변 말미에 붙는지 확인
- [ ] 프로덕션 배포 후 한 번 더 확인
