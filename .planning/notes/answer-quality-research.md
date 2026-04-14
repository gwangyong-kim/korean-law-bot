---
title: 답변 퀄리티 향상 — 업계 레퍼런스 리서치
date: 2026-04-14
context: /gsd:explore 세션에서 legal-tech + research AI 제품들의 "프롬프트로 답변 품질 올리는" 패턴 조사
tier: A (prompt/output-format only, no pipeline/RAG changes)
---

# 답변 퀄리티 향상 — 업계 레퍼런스 리서치

## 배경

Glluga 법령 Assistant v1 배포 이후, 실제 답변을 보면서 드러난 3가지 pain point:

1. **깊이 부족** — 사실은 맞는데 "그래서 뭐가 중요한지"가 빠짐
2. **톤/구조** — 정보는 다 있는데 법률 전문가가 쓴 답 같지 않음
3. **맥락 연결** — 단일 조문은 가져오는데 조문+시행령+판례+실무해설을 엮어주지 못함

사실성(#1 hallucination)은 MCP 연동으로 이미 잘 해결됨. **"추론의 깊이와 서사 연결"**이 남은 숙제.

**제약:** Tier A — SYSTEM_PROMPT + 출력 포맷만 수정. RAG/multi-step agentic loop/fine-tuning 등 파이프라인 변경은 out of scope.

---

## 소스별 핵심 패턴

### 1. Perplexity
- 출처: [Perplexity Help — Tips for Better Answers](https://www.perplexity.ai/help-center/en/articles/13645819-tips-for-getting-better-answers-from-perplexity), [Datastudios — Perplexity Prompting Techniques](https://www.datastudios.org/post/perplexity-ai-prompting-techniques-for-better-answers-sources-and-structured-outputs)
- 답변 스캐폴드: **요지(executive summary) → 본문(번호 매긴 인라인 인용) → Sources 카드**
- 슬롯형 지시 표준: "5 key findings + 5 cited sources with date/URL"

### 2. Harvey AI
- 출처: [OpenAI — Customizing models for Harvey](https://openai.com/index/harvey/), [Harvey Blog — How Harvey Uses Harvey](https://www.harvey.ai/blog/harvey-internal)
- "모든 문장이 인용한 케이스에 의해 직접 뒷받침"되도록 강제
- 변호사 97%가 "길이 = 품질"로 인식 — 단, **"clear language, not legalistic verbiage"** 톤 고수
- 단일 거대 호출 ❌, 수십~수백 개 작은 호출 결합

### 3. Casetext CoCounsel
- 출처: [LawNext — Casetext launches CoCounsel](https://www.lawnext.com/2023/03/casetext-launches-co-counsel-its-openai-based-legal-assistant-to-help-lawyers-search-data-review-documents-draft-memos-analyze-contracts-and-more.html), [ABA Journal — Fisher Phillips & CoCounsel](https://www.abajournal.com/web/article/how-a-law-firm-helped-test-and-then-implement-casetexts-cocounsel-into-its-practice)
- 패턴: **질문 재구성(reformulate) → 사용자 확인 → 메모 생성**
- 메모 출력: "3개 핵심 bullet 요건 → 상세 분석 → 28개 인용 케이스 리스트"
- 핵심 = **결론 먼저, 분석 나중, 인용 끝** 3단 구조

### 4. Anthropic prompt engineering guide
- 출처: [Anthropic — Prompting best practices (XML tags)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags)
- XML 태그(`<documents>`, `<quotes>`, `<answer>`)로 long-form 분리
- **"먼저 관련 부분을 quote → 그 다음 분석"** 패턴이 환각 감소에 가장 효과적
- Role anchor 단 한 문장으로 톤 고정
- Few-shot은 `<example>` 안에 3–5개

### 5. OpenAI Structured Outputs
- 출처: [OpenAI — Introducing Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- gpt-4o-2024-08-06부터 JSON Schema 100% 준수
- Gemini 스택이라 직접 적용 불가 → **Gemini의 `responseSchema`로 동등 패턴 가능**
- Tier A 핵심: 스키마 강제 자체보다, "스키마를 머리속에 그리고 답변하라"는 prompt-only 변형

### 6. 한국 리걸테크 (엘박스, 로앤비)
- 출처: [LBOX AI](https://lbox.kr/v2), [한국경제 — 1000장 판결문 AI 요약](https://www.hankyung.com/article/2024062637331), [LawTimes — 변협 형사고발 경고](https://www.lawtimes.co.kr/news/198232)
- 한국 리걸테크 표준 출력: **사실관계 → 쟁점 → 주장** 자동 정리
- 한국 변호사 톤: 단정적 결론 ❌, "~로 보입니다 / ~할 여지가 있습니다 / 다만 사안에 따라 달라질 수 있습니다" 헤징
- **변호사법 위반 리스크**: "법률 자문이 아닌 정보 제공" 디스클레이머 사실상 의무

### 7. Chain-of-Verification & LegalBench
- 출처: [CoVe paper (ACL Findings 2024)](https://aclanthology.org/2024.findings-acl.212.pdf), [Learn Prompting — Chain of Verification](https://learnprompting.org/docs/advanced/self_criticism/chain_of_verification), [LegalBench (HazyResearch)](https://github.com/HazyResearch/legalbench/)
- CoVe 4단계: 초안 → 검증 질문 생성 → 격리 답변 → 통합
- **단일 프롬프트로 압축 가능**: "초안을 쓴 뒤 스스로 3개 검증 질문을 만들고 각각 답한 뒤 최종본을 작성하라"
- 성능: FACTSCORE 55.9 → 71.4
- LegalBench: 6개 추론 유형 분류 → 질문 분류기 발상의 근거

---

## 즉시 적용 가능한 Tier A 기법 7개

1. **"쟁점 → 적용 법령 → 해석/판례 → 실무 결론 → 한계" 5단 XML 스캐폴드**
   - `<쟁점> <적용법령> <해석> <실무결론> <주의사항>` 태그를 SYSTEM_PROMPT가 강제
   - → 깊이·구조 동시 해결

2. **Persona anchor "10년차 한국 송무 변호사, 비법조 사내팀 대상 브리핑"**
   - Anthropic 가이드대로 한 문장
   - → 톤 고정, 비전문가 가독성

3. **"먼저 quote, 그 다음 분석"**
   - MCP가 가져온 조문 원문을 `<인용>` 안에 그대로 박은 뒤 그 아래에서만 해석 작성
   - → 사실 결합도 ↑, 환각 방지

4. **결론-먼저 (Casetext 패턴)**
   - 모든 답변 첫 줄을 "**핵심 결론: …(2문장)**"로 강제
   - → "그래서 뭐가 중요한지" 결손 해결 (pain point #1)

5. **단일 프롬프트 CoVe**
   - "최종본 직전, 스스로 3개 검증 질문을 만들고 답한 뒤 최종본을 작성하라" 추가
   - → 깊이 + 정확성

6. **복잡도 게이팅 (short/long mode)**
   - "단순 정의/조문 위치 질문은 8줄 이내, 해석·적용 질문은 5단 풀스캐폴드"를 라우팅 규칙으로
   - → 짧은 질문에 과잉응답 방지

7. **Few-shot "good answer" 1개 임베드**
   - HR/안전 주제로 5단 스캐폴드를 완성한 모범답안 하나를 `<example>`에 박음
   - → 톤·구조·인용 밀도 한 번에 학습

---

## 따라하지 말 것 (3가지)

1. **Harvey식 "초장문이 곧 품질" 가정**
   - 변호사 평가가 아닌 사내 비전문가 대상 → 길면 안 읽힘
   - 결론-먼저 + 접기 패턴이 더 적합

2. **Perplexity의 "권위 있는 호언" 톤**
   - 한국 법률 맥락에서 단정 진술 = 변호사법 위반 리스크 + 사용자 오신뢰
   - 헤징 어휘 강제 필수

3. **Casetext의 "질문 재구성 후 확인" 다단 인터랙션**
   - Tier A 단일 응답 제약 위반
   - 대신 "내가 이렇게 이해했음(1문장) → 답변" 정도의 인라인 미러링으로 축소

---

## 실행 플랜 매핑

| 기법 | 성격 | 후속 문서 |
|------|------|-----------|
| 2. Persona anchor | Quick win | `todos/pending/tier-a-prompt-quick-wins.md` |
| 4. 결론-먼저 | Quick win | 〃 |
| 5. CoVe 단일 프롬프트 | Quick win | 〃 |
| 헤징 어휘 + 디스클레이머 강제 | Quick win | 〃 |
| 1. 5단 XML 스캐폴드 | 디자인 필요 | `todos/pending/tier-a-scaffold-design.md` |
| 3. Quote-first-analyze | 디자인 필요 | 〃 |
| 6. 복잡도 게이팅 | 디자인 필요 | 〃 |
| 7. Few-shot 예시 | 디자인 필요 | 〃 |

Tier A 이후에도 품질 천장에 부딪힐 경우 → `seeds/answer-quality-tier-b.md`의 트리거 조건 확인.
