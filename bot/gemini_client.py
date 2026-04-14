"""
Gemini API 클라이언트 — Function Calling 루프 포함

사용자 메시지를 받아 Gemini에 전달하고,
법령 API 도구 호출이 필요하면 실행 후 최종 답변을 반환합니다.
"""

import json
import os

import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from google.generativeai.types import content_types

from law import api
from law.tools import law_tools


class QuotaExceededError(Exception):
    """Gemini API 무료 티어 한도 초과"""

SYSTEM_INSTRUCTION = """\
당신은 한국 법령 전문 어시스턴트입니다.

규칙:
1. 사용자의 질문에 대해 법령 검색 도구를 활용해 정확한 정보를 제공하세요.
2. 반드시 한국어로 답변하세요.
3. 법령 조문을 인용할 때는 법령명, 조/항/호를 명시하세요.
4. 판례를 인용할 때는 사건번호와 선고일을 포함하세요.
5. 답변은 간결하게 4000자 이내로 작성하세요.
6. 확실하지 않은 내용은 추측하지 말고, 도구로 확인하세요.
7. 검색 결과가 없으면 솔직히 "검색 결과가 없습니다"라고 답하세요.
8. Markdown 포맷을 사용하세요: **볼드**, *이탤릭*, `코드`, > 인용

도구 사용 흐름:
- 법령 내용 질문 → search_law로 법령 찾기 → get_law_text로 조문 확인
- 판례 질문 → search_decisions로 판례 검색 → get_decision_text로 전문 확인
- 검색 시 target 기본값: 법령은 "law", 판례는 "prec"
"""

# 도구 이름 → 실제 함수 매핑
TOOL_HANDLERS = {
    "search_law": api.search_law,
    "get_law_text": api.get_law_text,
    "search_decisions": api.search_decisions,
    "get_decision_text": api.get_decision_text,
}

MAX_TOOL_ROUNDS = 6  # 무한루프 방지


def _init_model() -> genai.GenerativeModel:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    return genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        tools=[law_tools],
        system_instruction=SYSTEM_INSTRUCTION,
    )


def _truncate(text: str, limit: int = 3000) -> str:
    """긴 API 응답을 잘라서 토큰 낭비 방지"""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...(이하 생략)"


async def ask(user_message: str, history: list[dict] | None = None) -> str:
    """
    사용자 메시지에 대해 Gemini로 답변을 생성합니다.
    Function calling 루프를 자동으로 처리합니다.

    Args:
        user_message: 사용자 질문
        history: 이전 대화 히스토리 (Slack 스레드용)

    Returns:
        Gemini의 최종 텍스트 답변
    """
    model = _init_model()
    chat = model.start_chat(history=history or [])

    try:
        response = chat.send_message(user_message)
    except google_exceptions.ResourceExhausted as e:
        raise QuotaExceededError(str(e)) from e

    for _ in range(MAX_TOOL_ROUNDS):
        # function_call이 있는 part 찾기
        fc_part = None
        for part in response.candidates[0].content.parts:
            if part.function_call and part.function_call.name:
                fc_part = part
                break

        if fc_part is None:
            # 도구 호출 없음 → 텍스트 응답 반환
            break

        func_name = fc_part.function_call.name
        func_args = dict(fc_part.function_call.args) if fc_part.function_call.args else {}

        # 도구 실행
        handler = TOOL_HANDLERS.get(func_name)
        if handler is None:
            result = {"error": f"알 수 없는 도구: {func_name}"}
        else:
            try:
                result = await handler(**func_args)
            except Exception as e:
                result = {"error": f"도구 실행 실패: {e}"}

        # 결과를 문자열로 변환 후 길이 제한
        result_str = _truncate(json.dumps(result, ensure_ascii=False, default=str))

        # function_response를 Gemini에 전달
        try:
            response = chat.send_message(
                genai.protos.Content(
                    parts=[
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=func_name,
                                response={"result": result_str},
                            )
                        )
                    ]
                )
            )
        except google_exceptions.ResourceExhausted as e:
            raise QuotaExceededError(str(e)) from e

    # 최종 텍스트 추출
    text_parts = []
    for part in response.candidates[0].content.parts:
        if part.text:
            text_parts.append(part.text)

    answer = "\n".join(text_parts).strip()

    if not answer:
        answer = "답변을 생성하지 못했습니다. 다시 질문해주세요."

    # Slack 메시지 길이 제한 (4000자)
    if len(answer) > 3900:
        answer = answer[:3900] + "\n\n_(답변이 길어 일부 생략되었습니다)_"

    return answer
