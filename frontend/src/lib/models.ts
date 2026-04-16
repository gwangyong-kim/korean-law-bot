export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  free: boolean;
}

export const MODELS: ModelInfo[] = [
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "최신 모델, MCP 도구 호출 안정, 1M 컨텍스트",
    free: false,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite",
    provider: "google",
    description: "경량·저비용, 간단한 질문에 최적",
    free: false,
  },
];

export const DEFAULT_MODEL = "gemini-3-flash-preview";

export function getModelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
