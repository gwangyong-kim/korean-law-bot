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
    description: "최신 모델, 고성능",
    free: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    description: "최고 성능, 복잡한 질문에 적합",
    free: true,
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
