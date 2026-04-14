/**
 * 사용 가능한 AI 모델 목록
 *
 * 2026-04-15 정리: UAT에서 MCP 도구 호출이 **실제로 안정적**인 모델만 남김.
 * 제거된 모델:
 * - Groq Kimi K2 0905: tool calling upstream 버그 (기억으로 환각 답변)
 * - Gemini 2.0 Flash: 무료 tier limit 0 (Google 측에서 실질 사용 불가)
 * - OpenRouter 무료 모델들 (auto, Qwen3 Next, GLM 4.5, Llama 3.3): rate
 *   limit 즉시 도달 / tool 호출 건너뛰기 / auto-router 결과 불일치
 *
 * 다른 provider를 다시 추가하려면:
 * 1. route.ts의 resolveModel dispatch 확인 (Groq / OpenRouter branch 존재)
 * 2. 해당 환경변수 Vercel에 등록되어 있는지 확인 (GROQ_API_KEY / OPENROUTER_API_KEY)
 * 3. 이 배열에 ModelInfo 추가
 * 4. 실제 법령 질문으로 tool-input-available / tool-output-available 이벤트 발생 확인
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
    description: "MCP 도구 호출 안정, 한국어 자연스러움. 현재 법령 bot 기본값",
    free: true,
  },
  // Gemini 2.5 Pro는 무료 tier RPM이 매우 낮아 일상 사용 시 즉시 rate_limited.
  // 유료 tier에서는 정상 작동하므로 Billing 활성화 후 사용자가 복잡한 질의에
  // 한해 의도적으로 선택할 수 있도록 남겨둔다.
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (복잡 질의용)",
    provider: "google",
    description: "최고 성능 — 무료 RPM 즉시 소진. 유료 billing 필요 시 복잡 질문에만",
    free: true,
  },
];

export const DEFAULT_MODEL = "gemini-2.5-flash";

export function getModelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
