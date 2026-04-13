import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";

// Vercel 서버리스 함수 타임아웃 확장 (무료: 최대 60초)
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


function getMcpUrl(): string {
  const key = process.env.LAW_API_KEY;
  if (!key) throw new Error("LAW_API_KEY 환경변수가 설정되지 않았습니다.");
  return `https://glluga-law-mcp.fly.dev/mcp?oc=${key}`;
}

export async function POST(req: Request) {
  const { messages: uiMessages, modelId } = await req.json();
  const selectedModel = modelId || "gemini-2.5-flash";

  // UIMessage → ModelMessage 변환 (AI SDK 공식 함수)
  const messages = await convertToModelMessages(uiMessages);

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | undefined;
  let tools = {};

  // korean-law-mcp 서버 연결 시도
  try {
    mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: getMcpUrl(),
      },
    });
    tools = await mcpClient.tools();
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);

    if (errMsg.includes("503") || errMsg.includes("Max sessions") || errMsg.includes("429")) {
      return new Response(
        JSON.stringify({
          error: "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    console.error("MCP 연결 실패, 도구 없이 진행:", errMsg);
  }

  // Safe MCP close helper — callable from onFinish/onError without
  // leaking unhandled promise rejections into the serverless worker.
  const closeMcp = async () => {
    if (!mcpClient) return;
    try {
      await mcpClient.close();
    } catch (closeErr) {
      console.error("mcpClient.close() failed:", closeErr);
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
      await closeMcp();
    },
    onError: async ({ error }) => {
      console.error("[route.ts] streamText error:", error);
      await closeMcp();
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
      let msg: string;
      if (error instanceof Error) msg = error.message;
      else if (typeof error === "string") msg = error;
      else msg = "알 수 없는 오류가 발생했습니다.";
      // Redact LAW_API_KEY query param if it leaked into the error message.
      return msg.replace(/oc=[^&\s"]+/g, "oc=REDACTED");
    },
  });
}
