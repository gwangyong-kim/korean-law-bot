"""
국가법령정보센터 Open API 클라이언트
https://open.law.go.kr

2개 엔드포인트로 모든 기능 제공:
- lawSearch.do: 법령/판례/행정규칙 등 검색
- lawService.do: 조문/판례 전문 조회
"""

import os
import xml.etree.ElementTree as ET

import httpx

BASE_URL = "https://www.law.go.kr/DRF"

# 검색 대상(target) 코드 매핑
SEARCH_TARGETS = {
    "법령": "law",
    "판례": "prec",
    "헌재": "detc",
    "조세심판": "decc",
    "행정규칙": "admrul",
    "자치법규": "ordin",
    "조약": "trty",
}

# 판례/결정 도메인별 target 코드
DECISION_TARGETS = {
    "판례": "prec",
    "헌법재판소": "detc",
    "조세심판원": "decc",
    "관세청": "expc",
    "행정심판": "appDcc",
    "공정거래위원회": "ccDcc",
    "개인정보보호위원회": "pcDcc",
    "노동위원회": "lcDcc",
}


def _get_api_key() -> str:
    key = os.getenv("LAW_API_KEY", "")
    if not key:
        raise ValueError("LAW_API_KEY 환경변수가 설정되지 않았습니다.")
    return key


def _parse_xml(text: str) -> list[dict]:
    """XML 응답을 dict 리스트로 변환"""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []

    results = []
    # 최상위 자식 중 totalCnt, page 등 메타 제외하고 실제 항목 추출
    for item in root:
        if item.tag in ("totalCnt", "page", "npage"):
            continue
        entry = {}
        for child in item:
            entry[child.tag] = (child.text or "").strip()
        if entry:
            results.append(entry)
    return results


async def search_law(query: str, target: str = "law", page: int = 1, display: int = 5) -> dict:
    """
    법령/판례/행정규칙 등을 검색합니다.

    Args:
        query: 검색 키워드 (예: "근로기준법", "연차휴가")
        target: 검색 대상 - law(법령), prec(판례), admrul(행정규칙),
                ordin(자치법규), detc(헌재결정), decc(조세심판), trty(조약)
        page: 페이지 번호 (기본 1)
        display: 한 페이지 결과 수 (기본 5, 최대 100)

    Returns:
        {"total": 전체건수, "results": [{"법령명": ..., "법령ID": ..., ...}, ...]}
    """
    params = {
        "OC": _get_api_key(),
        "type": "XML",
        "target": target,
        "query": query,
        "display": str(display),
        "page": str(page),
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BASE_URL}/lawSearch.do", params=params)
        resp.raise_for_status()

    # 전체 건수 추출
    total = 0
    try:
        root = ET.fromstring(resp.text)
        total_el = root.find("totalCnt")
        if total_el is not None and total_el.text:
            total = int(total_el.text)
    except (ET.ParseError, ValueError):
        pass

    results = _parse_xml(resp.text)

    return {"total": total, "results": results}


async def get_law_text(mst: str, jo: str | None = None) -> dict:
    """
    법령 조문 전문을 조회합니다.

    Args:
        mst: 법령 MST 코드 (search_law 결과의 법령일련번호/MST 필드)
        jo: 특정 조 번호 (예: "060000" = 제60조). None이면 전체 조문.

    Returns:
        {"법령명": ..., "조문": [{"조문번호": ..., "조문내용": ..., ...}, ...]}
    """
    params = {
        "OC": _get_api_key(),
        "type": "JSON",
        "target": "eflaw",
        "MST": mst,
    }
    if jo:
        params["JO"] = jo

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BASE_URL}/lawService.do", params=params)
        resp.raise_for_status()

    data = resp.json()

    # JSON 응답 구조: {"법령": {..., "조문": [{...}, ...]}}
    law_info = {}
    if isinstance(data, dict):
        # 최상위 키가 하나인 경우 (예: "법령")
        top_key = next(iter(data), None)
        if top_key:
            law_info = data[top_key] if isinstance(data[top_key], dict) else data

    return law_info


async def search_decisions(
    query: str, target: str = "prec", page: int = 1, display: int = 5
) -> dict:
    """
    판례, 헌재결정, 조세심판 등 각종 결정례를 검색합니다.

    Args:
        query: 검색 키워드 (예: "부당해고", "연차휴가")
        target: 검색 도메인 - prec(판례), detc(헌재), decc(조세심판),
                expc(관세청), appDcc(행정심판), ccDcc(공정위), pcDcc(개인정보),
                lcDcc(노동위)
        page: 페이지 번호
        display: 결과 수

    Returns:
        {"total": 전체건수, "results": [{"사건명": ..., "판례일련번호": ..., ...}, ...]}
    """
    return await search_law(query=query, target=target, page=page, display=display)


async def get_decision_text(target: str, id: str) -> dict:
    """
    판례/결정 전문을 조회합니다.

    Args:
        target: 도메인 코드 - prec(판례), detc(헌재), decc(조세심판) 등
        id: 판례/결정 일련번호 (search_decisions 결과에서 획득)

    Returns:
        판례/결정 상세 내용 dict
    """
    params = {
        "OC": _get_api_key(),
        "type": "JSON",
        "target": target,
        "ID": id,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BASE_URL}/lawService.do", params=params)
        resp.raise_for_status()

    data = resp.json()

    # 최상위 키 언래핑
    if isinstance(data, dict) and len(data) == 1:
        top_key = next(iter(data))
        if isinstance(data[top_key], dict):
            return data[top_key]

    return data
