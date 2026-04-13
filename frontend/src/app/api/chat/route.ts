import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { google } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPClient } from "@ai-sdk/mcp";

// D-12: Vercel serverless 60초 유지. Phase 2 스코프에서는 상향하지 않음.
// Fluid Compute 활성화 여부와 stream_timeout UX 방어는 02-03 UAT에서 재검증.
export const maxDuration = 60;

const SYSTEM_PROMPT = `당신은 한국 법령 전문 어시스턴트입니다. 법률 비전문가인 사내 직원들이 업무 중 법령을 쉽게 이해할 수 있도록 돕습니다.

━━━ 절대 규칙 (위반 금지) ━━━
- 법령 조문, 판례, 법률 해석을 답변할 때 반드시 도구를 호출하여 확인한 내용만 답변하세요.
- 도구 호출 없이 법령 내용을 답변하는 것은 금지합니다. 기억에 의존하지 마세요.
- 도구로 확인하지 못한 내용은 반드시 "⚠️ 확인되지 않은 정보"라고 명시하세요.
- 모든 법령/판례 인용에 출처를 표시하세요: [출처: 도구 검색 결과] 또는 [⚠️ 미확인]
- 도구 검색 결과에 없는 내용을 추가하거나 꾸며내지 마세요.
- 단, '안녕하세요', '고마워요' 같은 일상 인사나 봇 자체에 대한 메타 질문(이름, 기능)에는 도구를 호출하지 않고 자연스럽게 답변하세요. 도구는 법령·시행령·시행규칙·판례·행정규칙 등 **법률 내용 질문**에만 호출합니다.
━━━━━━━━━━━━━━━━━━━━━━

규칙:
1. 법령 관련 질문을 받으면 먼저 도구를 호출하세요. 절대 기억으로 답변하지 마세요.
2. 반드시 한국어로 답변하세요.
3. 법령 조문을 인용할 때는 법령명, 조/항/호를 명시하세요.
4. 판례를 인용할 때는 사건번호와 선고일을 포함하세요.
5. 답변은 간결하게 4000자 이내로 작성하세요.
6. 검색 결과가 없으면 솔직히 "검색 결과가 없습니다"라고 답하세요.
7. Markdown 포맷을 사용하세요: **볼드**, *이탤릭*, \`코드\`, > 인용

쉬운 설명 원칙:
- 법률 용어가 나오면 괄호 안에 쉬운 설명을 덧붙이세요. 예: "선의의 제3자(사정을 모르는 제3자)"
- "채무불이행"→"약속을 지키지 않음", "하자담보"→"물건 결함에 대한 책임" 등 일상 용어로 풀어주세요.
- 조문 내용을 인용한 뒤 "쉽게 말하면..."으로 요약을 덧붙여주세요.

계약서/규정 검토 요청 시:
- 붙여넣어진 텍스트에서 법적 리스크를 항목별로 분석하세요.
- 각 항목에 관련 법령 근거를 명시하세요.
- 위험도를 🔴높음 🟡보통 🟢낮음으로 표시하세요.

답변 형식:
- 도구로 확인한 내용: 그대로 인용 + [출처: 도구 검색 결과]
- 일반 상식/설명: 법령 인용 없이 설명만 (출처 불필요)
- 확인 불가: "⚠️ 이 내용은 도구로 확인하지 못했습니다. 정확한 확인이 필요합니다."`;

// ─────────────────────────────────────────────────────────
// Phase 2 hotfix v2 (2026-04-14): fresh MCPClient per request.
// ─────────────────────────────────────────────────────────
// Original Phase 2 D-02 cached the live MCPClient in module scope for
// TTL 5min. This was architecturally wrong — caching a live HTTP-backed
// resource across Vercel warm container invocations caused
// "Attempted to send a request from a closed client" errors. The
// underlying HTTP session was idle-closed by Vercel or the MCP server,
// but the cache still held a stale client reference, so the next request
// hit a dead connection and returned finishReason="tool-calls" (Phase 1
// exit criterion regression).
//
// Fix: create a fresh MCPClient per request, close it in onFinish/onError.
// The pending-promise stampede defense is no longer needed — each
// request's init is independent. Latency cost on warm containers is ~500ms.
// If concurrency becomes a real concern, a schema-only cache (cache
// ToolSet as data, rebind execute per request) can be introduced, but
// for single-user scope that's overkill.

type ErrorCode =
  | "mcp_timeout"
  | "mcp_busy"
  | "mcp_offline"
  | "stream_timeout"
  | "unknown";

// ─── 메시지 source-of-truth 규약 ─────────────────────────────
// Client(frontend/src/lib/error-messages.ts의 KOREAN_MESSAGES)가 사용자에게
// 렌더되는 canonical 문자열의 유일한 소스다. 서버의 KOREAN_ERROR_MESSAGES는
// **서버 내부 debug log 용도**로만 사용되며, client parseChatError는 body의
// `code` 필드만 읽고 `message` 필드는 무시한다 (client 측 KOREAN_MESSAGES로
// 치환). 두 테이블의 문자열은 drift 허용 — 규약상 client가 항상 이김.
// 이 주석을 제거하거나 서버/클라이언트 문자열을 동기화하려 하지 말 것.
// 규약 변경 시 frontend/src/lib/error-messages.ts 상단 주석도 함께 갱신할 것.
const KOREAN_ERROR_MESSAGES: Record<ErrorCode, string> = {
  mcp_timeout: "법령 검색 서버 연결이 지연되어 일반 답변만 드립니다.",
  mcp_busy: "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
  mcp_offline: "법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다.",
  stream_timeout: "응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요.",
  unknown: "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.",
};

function getMcpUrl(): string {
  const key = process.env.LAW_API_KEY;
  if (!key) throw new Error("LAW_API_KEY 환경변수가 설정되지 않았습니다.");
  return `https://glluga-law-mcp.fly.dev/mcp?oc=${key}`;
}

// D-11: createMCPClient / tools() throw의 에러 원인을 5개 code 중 하나로 분류.
function classifyMcpError(err: unknown): ErrorCode {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message ?? "";
  if (msg.includes("mcp_timeout")) return "mcp_timeout";
  if (msg.includes("503") || msg.includes("429") || /Max sessions/i.test(msg)) return "mcp_busy";
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
    return "mcp_offline";
  }
  if (err.name === "MCPClientError") return "mcp_offline";
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && cause !== null && "code" in cause) {
    const code = (cause as { code: unknown }).code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND") return "mcp_offline";
  }
  return "unknown";
}

// stream 도중 발생한 에러를 'stream_timeout' | 'unknown' 중 하나로 분류.
function classifyStreamError(
  err: unknown
): Exclude<ErrorCode, "mcp_timeout" | "mcp_busy" | "mcp_offline"> {
  if (!(err instanceof Error)) return "unknown";
  if (err.name === "AbortError" || /aborted/i.test(err.message ?? "")) return "stream_timeout";
  if (/timeout/i.test(err.message ?? "")) return "stream_timeout";
  return "unknown";
}

// pre-stream 에러에 대해 구조화 Response 반환.
// HTTP status는 관측용 (클라이언트는 body만 사용).
function makeErrorResponse(code: ErrorCode, status: number): Response {
  return new Response(
    JSON.stringify({ error: { code, message: KOREAN_ERROR_MESSAGES[code] } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

// D-01: createMCPClient에는 signal/timeout 파라미터가 없다 (RESEARCH §1.1 VERIFIED).
// Promise.race만이 init 단계에서 타임아웃을 enforce할 수 있는 유일한 수단.
async function raceWithTimeout(): Promise<MCPClient> {
  let lateClient: MCPClient | null = null;
  try {
    const client = await Promise.race<MCPClient>([
      createMCPClient({
        transport: { type: "http", url: getMcpUrl() },
      }).then((c) => {
        lateClient = c;
        return c;
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("mcp_timeout")), 5000)
      ),
    ]);
    return client;
  } catch (err) {
    // Best-effort cleanup: race loser가 이후 resolve되면 조용히 close (RESEARCH §1.3).
    queueMicrotask(() => {
      void lateClient?.close().catch(() => {});
    });
    throw err;
  }
}

// D-08: createMCPClient + tools() 조합에서 'mcp_busy'가 감지되면 1초 대기 후 1회 재시도.
async function connectMcpOnce(): Promise<{ client: MCPClient; tools: ToolSet }> {
  const client = await raceWithTimeout();
  try {
    const tools = (await client.tools()) as ToolSet;
    return { client, tools };
  } catch (toolsErr) {
    // tools() 실패는 우리가 client를 close할 책임을 진다.
    await client.close().catch(() => {});
    throw toolsErr;
  }
}

async function connectMcpWithRetry(): Promise<{ client: MCPClient; tools: ToolSet }> {
  try {
    return await connectMcpOnce();
  } catch (e) {
    if (classifyMcpError(e) !== "mcp_busy") throw e;
    // D-08: 1초 대기 후 1회 retry. 임시 관측 로그.
    console.log("[route.ts] mcp retry after 1s (503/Max sessions detected)");
    await new Promise((r) => setTimeout(r, 1000));
    return await connectMcpOnce();
  }
}

// Hotfix v2 (2026-04-14): fresh client per request. No module-scope caching
// of live resources. See comment block at the top of this file.
async function connectMcpFresh(): Promise<{ client: MCPClient; tools: ToolSet }> {
  return connectMcpWithRetry();
}

export async function POST(req: Request) {
  const { messages: uiMessages, modelId } = await req.json();
  const selectedModel = modelId || "gemini-2.5-flash";

  // UIMessage → ModelMessage 변환 (AI SDK 공식 함수)
  const messages = await convertToModelMessages(uiMessages);

  // D-01/D-08/D-11 + hotfix v2: fresh MCP client per request.
  let mcpClient: MCPClient | undefined;
  let tools: ToolSet = {};
  try {
    const fresh = await connectMcpFresh();
    mcpClient = fresh.client;
    // Gap #1 hotfix (2026-04-14): tools()가 throw 없이 빈 set을 반환하는 경로를
    // 명시적으로 mcp_offline으로 전환한다. 빈 tools로 streamText를 진행하면
    // Gemini가 SYSTEM_PROMPT "절대 규칙"을 위반하면서 hallucinated 답변을 생성
    // (가짜 [출처: 도구 검색 결과] 태그 포함). Phase 1이 해결했던 "빈 카드"
    // 문제가 "가짜 답변"으로 변형되는 케이스이므로 silent degrade를 차단한다.
    if (Object.keys(fresh.tools).length === 0) {
      console.error("[route.ts] MCP returned 0 tools — treating as mcp_offline");
      await mcpClient.close().catch(() => {});
      return makeErrorResponse("mcp_offline", 503);
    }
    tools = fresh.tools;
  } catch (e) {
    const code = classifyMcpError(e);
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[route.ts] mcp init failed:", { code, errMsg });

    // D-05: pre-stream 에러는 구조화된 JSON body + HTTP status로 반환.
    // - mcp_busy    → 503 Service Unavailable
    // - mcp_timeout → 504 Gateway Timeout
    // - mcp_offline → 503 Service Unavailable
    // - unknown     → 500 Internal Server Error
    if (code === "mcp_busy") return makeErrorResponse("mcp_busy", 503);
    if (code === "mcp_timeout") return makeErrorResponse("mcp_timeout", 504);
    if (code === "mcp_offline") return makeErrorResponse("mcp_offline", 503);
    return makeErrorResponse("unknown", 500);
  }

  // Hotfix v2: client는 요청 단위로 소유한다. Phase 1 패턴 (closeMcp in
  // onFinish/onError)을 재도입해 요청 끝에 확실히 close한다. Phase 1에서
  // 문제였던 `mcpClient.close()` in `try/finally`는 stream을 mid-consumption
  // kill했기 때문 — 여기서는 onFinish/onError 콜백 내부에서 close하므로
  // stream이 이미 끝난 시점에만 close가 실행되어 안전하다.
  const safeClose = async () => {
    if (!mcpClient) return;
    try {
      await mcpClient.close();
    } catch (closeErr) {
      console.error("[route.ts] mcpClient.close() failed:", closeErr);
    }
  };

  const result = streamText({
    model: google(selectedModel),
    system: SYSTEM_PROMPT,
    messages,
    stopWhen: stepCountIs(8),
    ...(Object.keys(tools).length > 0 ? { tools } : {}),
    onFinish: async ({ finishReason }) => {
      console.log("[route.ts] streamText finishReason:", finishReason);
      await safeClose();
    },
    onError: async ({ error }) => {
      console.error("[route.ts] streamText error:", error);
      await safeClose();
    },
  });

  return result.toUIMessageStreamResponse({
    consumeSseStream: async ({ stream }) => {
      // Drain the tee'd copy so abort/disconnect doesn't deadlock the response.
      const reader = stream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    },
    onError: (error) => {
      console.error("[route.ts] toUIMessageStreamResponse error:", error);
      // D-05: mid-stream 에러는 JSON-stringified 한 structured error 문자열을
      // 반환해 client parseChatError()가 pre-stream 경로와 동일하게 파싱한다.
      const code = classifyStreamError(error);
      const structured = JSON.stringify({
        error: { code, message: KOREAN_ERROR_MESSAGES[code] },
      });
      // LAW_API_KEY leak 방지 (Phase 1 redaction 유지).
      return structured.replace(/oc=[^&\s"]+/g, "oc=REDACTED");
    },
  });
}
