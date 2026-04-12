import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";

const SYSTEM_PROMPT = `당신은 한국 법령 전문 어시스턴트입니다. 법률 비전문가인 사내 직원들이 업무 중 법령을 쉽게 이해할 수 있도록 돕습니다.

규칙:
1. 사용자의 질문에 대해 법령 검색 도구를 활용해 정확한 정보를 제공하세요.
2. 반드시 한국어로 답변하세요.
3. 법령 조문을 인용할 때는 법령명, 조/항/호를 명시하세요.
4. 판례를 인용할 때는 사건번호와 선고일을 포함하세요.
5. 답변은 간결하게 4000자 이내로 작성하세요.
6. 확실하지 않은 내용은 추측하지 말고, 도구로 확인하세요.
7. 검색 결과가 없으면 솔직히 "검색 결과가 없습니다"라고 답하세요.
8. Markdown 포맷을 사용하세요: **볼드**, *이탤릭*, \`코드\`, > 인용

쉬운 설명 원칙:
- 법률 용어가 나오면 괄호 안에 쉬운 설명을 덧붙이세요. 예: "선의의 제3자(사정을 모르는 제3자)"
- "채무불이행"→"약속을 지키지 않음", "하자담보"→"물건 결함에 대한 책임" 등 일상 용어로 풀어주세요.
- 조문 내용을 인용한 뒤 "쉽게 말하면..."으로 요약을 덧붙여주세요.

계약서/규정 검토 요청 시:
- 붙여넣어진 텍스트에서 법적 리스크를 항목별로 분석하세요.
- 각 항목에 관련 법령 근거를 명시하세요.
- 위험도를 🔴높음 🟡보통 🟢낮음으로 표시하세요.`;

function getMcpUrl(): string {
  const key = process.env.LAW_API_KEY;
  if (!key) throw new Error("LAW_API_KEY 환경변수가 설정되지 않았습니다.");
  return `https://korean-law-mcp.fly.dev/sse?oc=${key}`;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  // korean-law-mcp 서버에 연결하여 모든 도구를 자동으로 가져옴
  const mcpClient = await createMCPClient({
    transport: {
      type: "sse",
      url: getMcpUrl(),
    },
  });

  try {
    const tools = await mcpClient.tools();

    const result = streamText({
      model: google("gemma-4-27b-it"),
      system: SYSTEM_PROMPT,
      messages,
      tools,
    });

    return result.toUIMessageStreamResponse();
  } finally {
    await mcpClient.close();
  }
}
