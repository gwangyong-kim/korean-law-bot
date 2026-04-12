"""
Gemini Function Calling 도구 정의

국가법령 API 4개 핵심 기능을 Gemini가 호출할 수 있는
FunctionDeclaration 형태로 정의합니다.
"""

from google.generativeai.types import FunctionDeclaration, Tool

search_law_decl = FunctionDeclaration(
    name="search_law",
    description=(
        "한국 법령을 검색합니다. 법률, 시행령, 시행규칙 등을 키워드로 찾습니다. "
        "예: '근로기준법', '개인정보보호', '산업안전보건'"
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "검색 키워드 (법령명 또는 관련 용어)",
            },
            "target": {
                "type": "STRING",
                "description": "검색 대상: law(법령,기본값), admrul(행정규칙), ordin(자치법규)",
                "enum": ["law", "admrul", "ordin"],
            },
        },
        "required": ["query"],
    },
)

get_law_text_decl = FunctionDeclaration(
    name="get_law_text",
    description=(
        "법령의 조문 전문을 조회합니다. search_law 결과에서 얻은 MST(법령일련번호)를 사용합니다. "
        "특정 조만 조회하려면 jo 파라미터에 조번호를 입력합니다 (예: 제60조 → '060000')."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "mst": {
                "type": "STRING",
                "description": "법령 MST 코드 (search_law 결과의 법령일련번호 필드)",
            },
            "jo": {
                "type": "STRING",
                "description": "조 번호 (예: '060000'=제60조). 생략하면 전체 조문 조회.",
            },
        },
        "required": ["mst"],
    },
)

search_decisions_decl = FunctionDeclaration(
    name="search_decisions",
    description=(
        "판례, 헌법재판소 결정, 조세심판 재결 등 각종 결정례를 검색합니다. "
        "예: '부당해고 판례', '연차휴가 대법원'"
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "검색 키워드",
            },
            "target": {
                "type": "STRING",
                "description": (
                    "검색 도메인: prec(판례,기본값), detc(헌재결정), decc(조세심판), "
                    "expc(관세청), appDcc(행정심판), ccDcc(공정위), lcDcc(노동위)"
                ),
                "enum": ["prec", "detc", "decc", "expc", "appDcc", "ccDcc", "lcDcc"],
            },
        },
        "required": ["query"],
    },
)

get_decision_text_decl = FunctionDeclaration(
    name="get_decision_text",
    description=(
        "판례 또는 결정의 전문을 조회합니다. search_decisions 결과에서 얻은 "
        "일련번호(ID)와 도메인(target)을 사용합니다."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "target": {
                "type": "STRING",
                "description": "도메인 코드: prec(판례), detc(헌재), decc(조세심판) 등",
                "enum": ["prec", "detc", "decc", "expc", "appDcc", "ccDcc", "lcDcc"],
            },
            "id": {
                "type": "STRING",
                "description": "판례/결정 일련번호 (search_decisions 결과에서 획득)",
            },
        },
        "required": ["target", "id"],
    },
)

# Gemini 모델에 전달할 도구 번들
law_tools = Tool(
    function_declarations=[
        search_law_decl,
        get_law_text_decl,
        search_decisions_decl,
        get_decision_text_decl,
    ]
)
