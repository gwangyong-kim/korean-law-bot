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
  // Gemini 2.5 Flash (2026-04-14): 법령 bot의 default. Gemini는 MCP dynamic
  // tool을 안정적으로 호출한다 (search_law → get_law_text 체인 검증 완료).
  // 무료 tier RPM 한도가 낮으므로 소진 시 2.0 flash로 fallback 권장.
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    description: "최신 모델, 고성능, MCP 도구 호출 안정 (무료 RPM 낮음)",
    free: true,
  },
  // Kimi K2 (Groq) — 2026-04-14 조사 결과 tool calling이 **불안정**함.
  // Groq + Kimi K2 0905 조합에서 toolChoice='auto'면 법령 질문이 와도
  // MCP 도구를 전혀 호출하지 않고 LLM 기억으로 환각 답변을 생성한다.
  // toolChoice='required'로 강제하면 Groq가 "Failed to call a function"
  // (failed_generation) 에러를 반환한다. Groq 커뮤니티 포럼에서도 동일
  // 문제가 다수 보고됨 (https://community.groq.com/t/599, t/549, t/727).
  // 한국어 자연어 답변 품질은 좋으므로 **사용자가 의도적으로 선택**할 때만
  // 쓰되, 법령 bot의 default로는 사용하지 않는다. 디버그 세션:
  // .planning/debug/resolved/kimi-k2-skips-mcp-tools.md 참고.
  {
    id: "moonshotai/kimi-k2-instruct-0905",
    name: "Kimi K2 (Groq) — 도구 호출 불안정",
    provider: "groq",
    description: "한국어 강세, 262K context. ⚠️ MCP 도구 호출 미작동 — 일반 대화용",
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
    description: "안정 모델, 별도 쿼터 — 2.5 한도 초과 시 fallback",
    free: true,
  },
  // OpenRouter (2026-04-14): 무료 tier가 Gemini/Groq보다 RPM 여유가 크고
  // 여러 오픈 모델을 한 API 키로 접근 가능. :free 변형은 0원 추론.
  // 여기 등록된 모델 ID는 모두 OpenRouter /models?supported_parameters=tools
  // 엔드포인트에서 tool calling 지원으로 확인된 것만 포함. 한국어 품질이
  // 좋은 아시아권(중국 포함) 모델을 우선순위로 선별했다.
  {
    id: "openrouter/free",
    name: "OpenRouter Auto (Free)",
    provider: "openrouter",
    description: "tool calling 가능한 무료 모델 중 자동 선택 (가장 안정적)",
    free: true,
  },
  {
    id: "qwen/qwen3-next-80b-a3b-instruct:free",
    name: "Qwen 3 Next 80B (OpenRouter)",
    provider: "openrouter",
    description: "Alibaba Qwen3 Next MoE, 한국어·중국어 강세, 빠른 추론",
    free: true,
  },
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air (OpenRouter)",
    provider: "openrouter",
    description: "Zhipu AI GLM 4.5, 한국어 자연스러움 우수",
    free: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (OpenRouter)",
    provider: "openrouter",
    description: "Meta Llama 3.3 70B — Groq 버전과 달리 별도 한도",
    free: true,
  },
];

export const DEFAULT_MODEL = "gemini-2.5-flash";

export function getModelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}
