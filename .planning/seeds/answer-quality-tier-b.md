---
title: Tier B 답변 품질 — 파이프라인 확장
planted_date: 2026-04-14
source: .planning/notes/answer-quality-research.md
trigger_condition: |
  다음 중 하나가 발생했을 때 surface:
  1. Tier A (Quick wins + Scaffold design) 모두 적용 후에도 사용자 피드백에서
     "깊이", "톤", "맥락 연결" 관련 불만이 계속 나올 때
  2. "답변이 한 번에 여러 법령/시행령/판례를 동시에 엮어서 분석해야 하는" 질문이
     많아지고, 단일 호출 LLM으로 한계가 명확할 때
  3. 토큰 비용/레이턴시보다 품질이 압도적으로 중요해지는 use case가 생길 때
     (예: 외부 고객사 대상 유료 SaaS 전환, 변호사 감수 기능 추가 등)
---

# Tier B 답변 품질 — 파이프라인 확장

## Why (지금은 안 하는 이유)

Tier A (프롬프트만) 로 2/3/4 pain point를 얼마나 해결할 수 있는지 측정 먼저. 리서치에서 본 사례들도 대부분 프롬프트-only로 초기 품질을 80% 수준까지 끌어올리고, 나머지 20%를 위해 Tier B 파이프라인 확장에 들어감.

Tier B는 **비용·레이턴시·복잡도가 모두 배 단위로 증가**. Tier A 천장을 실제로 친 뒤에 넘어가는 게 합리적.

## What (보류 중인 카드들)

### 1. Multi-step reasoning (agentic loop)

**패턴:**
```
1st pass: "이 질문의 쟁점을 3개 이하로 정리해줘" → 쟁점 리스트
2nd pass: 각 쟁점별로 MCP 병렬 호출 → 조문/판례 수집
3rd pass: 수집된 자료 + 쟁점 리스트 → 합성 답변
```

**레퍼런스:** Harvey AI가 "수십~수백 개 작은 호출"이라고 한 구조, LangGraph 다단 reasoning 패턴.

**트레이드오프:**
- 레이턴시 2~3배 (3 patterns of waiting)
- 토큰 비용 2~3배
- 복잡도: 실패 처리, 부분 결과, 스트리밍 UX 재설계 필요

### 2. Self-critique + revise (2-pass)

**패턴:**
```
1st pass: 초안 생성
2nd pass: 같은 모델한테 "법률 전문가 관점에서 이 초안의 부족한 점 3개" 물어봄
3rd pass: revised 답변
```

Tier A의 "단일 프롬프트 CoVe"는 이걸 **단일 호출 안에서 흉내낸 것**. 실제로는 별개 호출로 분리하면 품질이 더 뛰어남 (모델이 자신의 초안을 객관적으로 비평하기 쉬움).

**레퍼런스:** CoVe 원 논문(factored variant), Anthropic "Reflexion" 패턴.

**트레이드오프:** 레이턴시 2배. 비용 2배.

### 3. Context re-ranking

**패턴:** MCP가 던진 여러 결과를 Gemini가 먼저 "질문과 관련성" 점수 매기게 시킴 → 상위 N개만 최종 답변 합성에 사용.

**레퍼런스:** Cohere Rerank, Pinecone hybrid search 블로그.

**트레이드오프:** MCP 호출 수에 비례해 레이턴시 증가. 현재 우리 MCP가 반환하는 결과가 소수라면 불필요.

### 4. 질문 분류기 (LegalBench 기반)

**패턴:** 들어오는 질문을 LegalBench의 6 추론 유형(issue-spotting, rule-recall, rule-conclusion, interpretation, rhetorical-understanding, rule-application) 중 하나로 분류 → 유형별 특화 프롬프트 경로로 라우팅.

**레퍼런스:** LegalBench (HazyResearch/legalbench).

**트레이드오프:** 분류 에러 시 잘못된 경로로 가면 품질 저하. 분류 정확도 평가가 먼저 필요.

## How to apply (surfacing 됐을 때)

1. 먼저 **측정**: 현재 품질 문제의 얼마가 Tier A로 해결됐고, 얼마가 남았는지 정량화
   - 10개 이상의 실제 사용자 질문 샘플
   - 각 답변을 "깊이/톤/연결" 3축으로 1~5점 채점
2. 남은 문제의 패턴 파악
   - 깊이만 계속 부족 → Self-critique 2-pass 우선
   - 여러 법령 엮기가 안 됨 → Multi-step reasoning 우선
   - 특정 유형 질문에만 문제 → 질문 분류기 우선
3. 파일럿으로 한 가지만 먼저 시도 (4개 동시 착수 ❌)
4. A/B 측정 후 효과가 있어야 유지

## Related

- `.planning/notes/answer-quality-research.md` — 원 리서치
- `.planning/todos/pending/tier-a-prompt-quick-wins.md` — 선행 작업
- `.planning/todos/pending/tier-a-scaffold-design.md` — 선행 작업

## Out of scope (Tier C 이후)

- 자체 벡터 DB (Pinecone/Weaviate) + 판례/해설 인덱싱
- Hybrid search (BM25 + dense)
- LoRA fine-tuning / domain-adapted embedding
- 이것들은 완전히 다른 프로젝트 단계 — 이 seed 안에서 다루지 않음
