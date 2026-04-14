/**
 * Chat error parsing + Korean message mapping.
 *
 * Server (frontend/src/app/api/chat/route.ts, Plan 02-01) returns error
 * info in two paths that share a single string format:
 *
 *   pre-stream  (HTTP 4xx/5xx body) : '{"error":{"code":"...","message":"..."}}'
 *   mid-stream  (SSE error chunk)   : '{"error":{"code":"...","message":"..."}}'
 *
 * useChat captures both into `error.message` as a string. parseChatError
 * first tries JSON.parse, and falls back to raw substring matching for
 * robustness across version drift.
 *
 * ─── 메시지 source-of-truth 규약 (Phase 2) ───────────────────
 * **이 파일(KOREAN_MESSAGES)이 사용자에게 렌더되는 한국어 문자열의 유일한
 * canonical source다.** 서버 route.ts의 KOREAN_ERROR_MESSAGES는 내부
 * debug log 용도이며, parseChatError는 서버가 보낸 body의 `code` 필드만
 * 사용하고 `message` 필드는 완전히 무시한다(아래 primary 경로 참조).
 * 서버/클라이언트 문자열이 drift해도 UI는 항상 이 파일의 값만 본다.
 * 문구 변경 시 이 파일만 수정하면 되고, 서버 상수와 동기화하지 말 것.
 * 규약 변경 시 frontend/src/app/api/chat/route.ts의 KOREAN_ERROR_MESSAGES
 * 위 주석도 함께 갱신할 것.
 * ───────────────────────────────────────────────────────────
 *
 * Requirements: STRE-04, D-06.
 */

export type ErrorCode =
  | "mcp_timeout"
  | "mcp_busy"
  | "mcp_offline"
  | "stream_timeout"
  | "rate_limited"
  | "unknown";

export interface ParsedError {
  code: ErrorCode;
  message: string; // Korean, ready to render
}

/**
 * D-06 한국어 매핑 + D-03 degraded mode "[⚠️ 미확인 답변]" 프리픽스.
 * mcp_timeout / mcp_offline 은 degraded mode 프리픽스를 포함.
 */
export const KOREAN_MESSAGES: Record<ErrorCode, string> = {
  mcp_timeout:
    "[⚠️ 미확인 답변] 법령 검색 서버 연결이 지연되어 일반 답변만 드릴 수 있습니다.",
  mcp_busy:
    "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
  mcp_offline:
    "[⚠️ 미확인 답변] 법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다.",
  stream_timeout:
    "응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요.",
  rate_limited:
    "LLM 사용량이 일시적으로 한도에 도달했습니다. 1분 정도 후 다시 시도해주세요.",
  unknown:
    "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.",
};

/**
 * Parse a useChat error into a structured ParsedError.
 *
 * 1) 서버가 JSON `{error:{code,message}}` 형태로 보냈으면 code 기반 매핑 (primary).
 * 2) Legacy raw-string fallback: 503/"Max sessions"/ECONNREFUSED/ENOTFOUND 같은
 *    단서로 분기. 절대 raw 문자열을 UI에 노출하지 않고 KOREAN_MESSAGES로 치환.
 * 3) 매칭 실패 → "unknown".
 */
export function parseChatError(err: Error | undefined): ParsedError {
  if (!err) return { code: "unknown", message: KOREAN_MESSAGES.unknown };
  const raw = err.message ?? "";

  // Primary: structured JSON body from Plan 02-01.
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      parsed.error &&
      typeof parsed.error === "object" &&
      "code" in parsed.error
    ) {
      const code = (parsed.error as { code: unknown }).code;
      if (typeof code === "string" && code in KOREAN_MESSAGES) {
        const typed = code as ErrorCode;
        return { code: typed, message: KOREAN_MESSAGES[typed] };
      }
    }
  } catch {
    // fall through to raw-string matching
  }

  // Legacy/raw fallback.
  // Gemini/LLM rate-limit/quota — classified BEFORE the generic 429→mcp_busy
  // rule so "quota exceeded" free-tier errors surface a specific message
  // instead of pointing the user at the law search server.
  if (
    /quota|rate[-_ ]?limit|AI_RetryError|generate_content.*requests/i.test(raw)
  ) {
    return { code: "rate_limited", message: KOREAN_MESSAGES.rate_limited };
  }
  if (raw.includes("503") || /Max sessions/i.test(raw) || raw.includes("429")) {
    return { code: "mcp_busy", message: KOREAN_MESSAGES.mcp_busy };
  }
  if (
    raw.includes("ECONNREFUSED") ||
    raw.includes("ENOTFOUND") ||
    raw.includes("fetch failed")
  ) {
    return { code: "mcp_offline", message: KOREAN_MESSAGES.mcp_offline };
  }
  if (/aborted|timeout/i.test(raw)) {
    return { code: "stream_timeout", message: KOREAN_MESSAGES.stream_timeout };
  }

  return { code: "unknown", message: KOREAN_MESSAGES.unknown };
}
