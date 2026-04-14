---
title: Tier A Scaffold Design — XML 스캐폴드 + 게이팅 + Few-shot
date: 2026-04-14
priority: medium
source: .planning/notes/answer-quality-research.md
depends_on: tier-a-prompt-quick-wins.md (먼저 배포 후 효과 측정 권장)
estimate: 반나절 ~ 1일 (종이 설계 + 프롬프트 작성 + 테스트)
---

# Tier A Scaffold Design

Quick win 4개와 달리 **"구조 설계를 먼저 해야" 박을 수 있는** 3가지. 각각 한국 법률 맥락에 맞게 디자인이 필요.

## Why

리서치에서 발견한 7개 기법 중 남은 3개는 "개념은 좋은데 우리 context에 맞게 재단해야" 실효가 남. 그냥 영어 샘플 번역해서 넣으면 한국어 답변 품질에 오히려 역효과 가능.

Quick win 4개를 먼저 배포해서 "어디까지 개선되는지" 확인하고, 그래도 부족한 부분을 이 3개로 메우는 게 더 효율적. Quick win만으로 pain point 2/3/4가 충분히 개선되면 이 todo는 보류해도 됨.

## What (3 sub-tasks)

### Sub-task 1: 5단 XML 스캐폴드 설계

**목표:** `<쟁점> → <적용법령> → <해석> → <실무결론> → <주의사항>` 슬롯을 SYSTEM_PROMPT가 강제하도록 재설계.

**설계 결정사항 (먼저 정해야 할 것들):**

1. **태그 이름 — 한국어 vs 영어**
   - `<쟁점>` 같은 한국어 태그가 LLM 출력에 자연스럽게 섞여서 사용자에게도 보이는 구조가 될지
   - 아니면 `<issue>`, `<applicable_law>` 같은 영어 태그로 내부 구조만 잡고 렌더링은 헤더/섹션으로 변환할지
   - Anthropic 가이드는 영어 태그 기본이지만, 한국어 모델 출력에는 한국어 태그가 더 안정적일 수 있음

2. **슬롯 순서 고정 vs 선택적**
   - 5단 모두 항상 출력 vs 질문 유형에 따라 일부 생략 가능
   - 예: 단순 정의 질문은 `<쟁점>`, `<주의사항>` 불필요할 수 있음
   - 복잡도 게이팅(sub-task 2)과 물림

3. **슬롯 내용 가이드**
   - 각 슬롯에 "무엇을 쓸지"를 구체적으로 지시
   - 예: `<적용법령>`은 MCP가 가져온 조문을 **원문 그대로** 인용 + 조항 번호·시행일 명시
   - 예: `<실무결론>`은 "사내 팀이 실제로 행동할 수 있는 수준"으로 구체적 action item

4. **렌더링 side 대응**
   - 프론트엔드(`chat-message.tsx`)에서 XML 태그를 그대로 보여주지 않고 섹션 헤더로 변환해야 할지
   - 또는 태그를 markdown 헤더(`### 쟁점` 등)로 치환하는 prompt-level 규칙으로 통일할지

**출처:** Anthropic prompt engineering — XML tags 섹션, Casetext 메모 포맷 3단 구조의 한국 법률 버전 확장.

### Sub-task 2: 복잡도 게이팅 (short/long mode)

**목표:** 짧은 질문에 긴 스캐폴드가 씌워지는 과잉응답을 방지.

**설계 결정사항:**

1. **분류 기준**
   - LLM 스스로 판단 ("이 질문이 단순 조회인지, 해석/적용인지") vs 룰 기반 키워드 분류
   - LegalBench의 6개 추론 유형 참고 (issue-spotting, rule-recall, rule-conclusion, interpretation, rhetorical-understanding, rule-application)
   - 우리는 간단히 2분류면 충분할 가능성: **(A) 조회형 vs (B) 해석/적용형**

2. **각 모드의 출력 규칙**
   - 조회형 A: 핵심 결론(1문장) + 원문 인용 + 출처. 최대 8줄.
   - 해석/적용형 B: 5단 스캐폴드 풀 출력.

3. **경계 케이스 처리**
   - "근로기준법 제60조는?" → A
   - "근로기준법 제60조 연차휴가 계산 어떻게 해?" → B
   - "전자상거래법 청약철회 기간?" → A or B? (기간은 A이지만, "적용되는 상황은?"까지 묻는 거라면 B)
   - → 처음엔 A 기본값 + "더 자세히" 후속 질문 유도가 안전할 수도

### Sub-task 3: Few-shot "good answer" 1개 작성

**목표:** 5단 스캐폴드 + 결론-먼저 + 헤징 톤 + 인용 밀도를 모두 만족하는 **모범답안 1개**를 SYSTEM_PROMPT의 `<example>` 태그에 박음.

**설계 결정사항:**

1. **주제 선정**
   - 사내 audience에 가장 가까운 주제여야 함 (HR, 안전, 마케팅, 컴플라이언스 중 하나)
   - 후보:
     - "근로기준법 제60조 연차휴가 — 입사 1년 미만자도 발생하는지?" (HR)
     - "중대재해처벌법 제4조 — 안전보건 확보 의무 범위" (안전)
     - "전자상거래법 청약철회 — 디지털 콘텐츠 예외" (마케팅/영업)

2. **모범답안 직접 작성**
   - 실제로 해당 조문/판례를 찾아서 손으로 작성
   - 사실 정확성 + 스캐폴드 준수 + 톤 일관성 모두 성립
   - 길이: 현실적인 목표 길이 (너무 길면 프롬프트 토큰 낭비, 너무 짧으면 학습 신호 약함)

3. **프롬프트 임베드**
   - `<example>` 태그 안에 user 질문 + assistant 답변 쌍으로
   - 여러 개(3~5개) 쓸지 1개만 쓸지는 토큰 예산과 효과 보고 결정

**출처:** Anthropic prompt engineering — few-shot 예시 섹션.

## How to apply

1. **먼저 Quick wins 배포 후 1~2일 사용** (이 todo의 depends_on)
2. Quick wins 만으로 만족스러우면 → 이 todo 보류 / 삭제
3. 아직 부족하면 → Sub-task 1 → 2 → 3 순서로 진행
4. 각 sub-task는 별도 작은 PR로 (한 번에 3개 섞어 넣으면 A/B가 안 됨)

## Definition of done

- [ ] Quick wins 배포 후 효과 측정 완료
- [ ] (필요 시) Sub-task 1: XML 스캐폴드 설계 + SYSTEM_PROMPT 반영 + 프론트 렌더링 확인
- [ ] (필요 시) Sub-task 2: 게이팅 규칙 설계 + SYSTEM_PROMPT 반영
- [ ] (필요 시) Sub-task 3: Few-shot 모범답안 1개 작성 + 임베드
- [ ] 각 변경마다 3~5개 테스트 질문으로 Before/After 확인

## Out of scope

- Tier B 이후 (multi-step, self-critique 2-pass, re-ranking) — `seeds/answer-quality-tier-b.md` 참조
- RAG 아키텍처 (벡터 DB, 임베딩) — Tier C
