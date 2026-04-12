import { streamText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

import {
  searchLaw,
  getLawText,
  searchDecisions,
  getDecisionText,
} from "@/lib/law-api";

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
- 위험도를 🔴높음 🟡보통 🟢낮음으로 표시하세요.

도구 사용 흐름:
- 법령 내용 질문 → search_law로 법령 찾기 → get_law_text로 조문 확인
- 판례 질문 → search_decisions로 판례 검색 → get_decision_text로 전문 확인
- 검색 시 target 기본값: 법령은 "law", 판례는 "prec"`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemma-4-27b-it"),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      search_law: tool({
        description:
          "한국 법령을 검색합니다. 법률, 시행령, 시행규칙 등을 키워드로 찾습니다.",
        inputSchema: z.object({
          query: z.string().describe("검색 키워드 (법령명 또는 관련 용어)"),
          target: z
            .enum(["law", "admrul", "ordin"])
            .default("law")
            .describe("검색 대상: law(법령), admrul(행정규칙), ordin(자치법규)"),
        }),
        execute: async ({ query, target }) => searchLaw(query, target),
      }),

      get_law_text: tool({
        description:
          "법령의 조문 전문을 조회합니다. search_law 결과에서 얻은 MST(법령일련번호)를 사용합니다.",
        inputSchema: z.object({
          mst: z.string().describe("법령 MST 코드 (search_law 결과의 법령일련번호)"),
          jo: z
            .string()
            .optional()
            .describe("조 번호 (예: '060000'=제60조). 생략하면 전체 조문."),
        }),
        execute: async ({ mst, jo }) => getLawText(mst, jo),
      }),

      search_decisions: tool({
        description:
          "판례, 헌법재판소 결정, 조세심판 재결 등 각종 결정례를 검색합니다.",
        inputSchema: z.object({
          query: z.string().describe("검색 키워드"),
          target: z
            .enum(["prec", "detc", "decc", "expc", "appDcc", "ccDcc", "lcDcc"])
            .default("prec")
            .describe("검색 도메인: prec(판례), detc(헌재), decc(조세심판) 등"),
        }),
        execute: async ({ query, target }) => searchDecisions(query, target),
      }),

      get_decision_text: tool({
        description:
          "판례 또는 결정의 전문을 조회합니다. search_decisions 결과의 일련번호를 사용합니다.",
        inputSchema: z.object({
          target: z
            .enum(["prec", "detc", "decc", "expc", "appDcc", "ccDcc", "lcDcc"])
            .describe("도메인 코드"),
          id: z.string().describe("판례/결정 일련번호"),
        }),
        execute: async ({ target, id }) => getDecisionText(target, id),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
