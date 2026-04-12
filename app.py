"""
Korean Law Chatbot — Chainlit 웹 UI

ChatGPT 스타일의 채팅 인터페이스로 한국 법령/판례를 검색합니다.
Google OAuth로 회사 계정만 접근 가능합니다.
"""

import os

import chainlit as cl

from bot.gemini_client import ask

# 허용할 회사 이메일 도메인 (환경변수로 설정, 기본값: 모든 Google 계정)
ALLOWED_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "")


@cl.oauth_callback
def oauth_callback(
    provider_id: str,
    token: str,
    raw_user_data: dict,
    default_user: cl.User,
) -> cl.User | None:
    """Google OAuth 콜백 — 회사 도메인만 허용"""
    if provider_id != "google":
        return None

    email = raw_user_data.get("email", "")
    hd = raw_user_data.get("hd", "")  # Google Workspace 호스트 도메인

    # 회사 도메인 제한이 설정된 경우 체크
    if ALLOWED_DOMAIN and hd != ALLOWED_DOMAIN:
        return None

    return cl.User(
        identifier=email,
        metadata={"provider": "google", "name": raw_user_data.get("name", "")},
    )


@cl.on_chat_start
async def on_chat_start():
    cl.user_session.set("history", [])
    await cl.Message(
        content=(
            "안녕하세요! **한국 법령 검색 어시스턴트**입니다.\n\n"
            "법령, 판례, 행정규칙 등을 자연어로 질문해주세요.\n\n"
            "**사용 예시:**\n"
            "- 근로기준법 연차휴가 규정 알려줘\n"
            "- 개인정보보호법 제15조 전문 보여줘\n"
            "- 부당해고 관련 최근 판례 찾아줘\n"
        ),
    ).send()


@cl.on_message
async def on_message(message: cl.Message):
    history = cl.user_session.get("history") or []

    # 처리 중 표시
    msg = cl.Message(content="")
    await msg.send()

    try:
        answer = await ask(message.content, history=history if history else None)
    except Exception as e:
        answer = f"오류가 발생했습니다: `{type(e).__name__}: {e}`"

    msg.content = answer
    await msg.update()

    # 히스토리 업데이트 (최근 6턴만 유지)
    history.append({"role": "user", "parts": [{"text": message.content}]})
    history.append({"role": "model", "parts": [{"text": answer}]})
    if len(history) > 12:
        history = history[-12:]
    cl.user_session.set("history", history)
