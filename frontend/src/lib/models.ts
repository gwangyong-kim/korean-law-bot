/**
 * 사용 가능한 AI 모델 목록
 * 나중에 다른 프로바이더(OpenAI, Anthropic 등) 추가 시 여기에 등록
 */

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  free: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "최신 모델, 고성능 (무료 RPM 낮음, 쿼터 소진 주의)",
    free: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "최고 성능, 복잡한 질문에 적합",
    free: true,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    description: "안정 모델, 별도 쿼터 — 2.5 한도 초과 시 fallback (실제로는 free-tier limit 0)",
    free: true,
  },
  // Anthropic Claude (2026-04-14): Gemini free-tier 마비 시 fallback.
  // 가격대 오름순으로 정렬 — Haiku = 제일 싼 빠른 모델, Opus = 최고 성능.
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "빠른 응답, 저비용 — 간단한 조회·정의 질문",
    free: false,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "균형 — 해석·판례 분석, 실무 브리핑",
    free: false,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    description: "최고 성능 — 복잡 쟁점·계약 검토·다단 추론",
    free: false,
  },
  // 확장 예시 (API 키 설정 시 활성화):
  // {
  //   id: "gpt-4o",
  //   name: "GPT-4o",
  //   provider: "openai",
  //   description: "OpenAI 최고 성능 모델",
  //   free: false,
  // },
];

export const DEFAULT_MODEL = "gemini-2.5-flash";

export function getModelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
