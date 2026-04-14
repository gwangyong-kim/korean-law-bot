"""
Slack 이벤트 핸들러

Socket Mode로 동작하며, @멘션 이벤트를 처리합니다.
웹서버가 필요 없어 방화벽/포트포워딩 설정이 불필요합니다.
"""

import logging
import re

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

from bot import gemini_client

logger = logging.getLogger(__name__)


def _strip_mention(text: str) -> str:
    """<@U1234> 멘션 태그를 제거하고 순수 메시지만 추출"""
    return re.sub(r"<@[A-Z0-9]+>", "", text).strip()


def create_app(bot_token: str) -> App:
    app = App(token=bot_token)

    @app.event("app_mention")
    async def handle_mention(body, say, client):
        """봇이 @멘션되면 Gemini로 답변 생성"""
        event = body["event"]
        channel = event["channel"]
        thread_ts = event.get("thread_ts") or event["ts"]
        user_message = _strip_mention(event.get("text", ""))

        if not user_message:
            await say(text="질문을 입력해주세요! 예: `@법령봇 근로기준법 제60조 알려줘`", thread_ts=thread_ts)
            return

        # "처리 중" 리액션 추가
        try:
            await client.reactions_add(channel=channel, timestamp=event["ts"], name="hourglass_flowing_sand")
        except Exception:
            pass

        try:
            # 스레드 히스토리 가져오기 (대화 맥락 유지)
            history = await _get_thread_history(client, channel, thread_ts, event["ts"])

            # Gemini로 답변 생성
            answer = await gemini_client.ask(user_message, history=history)

            await say(text=answer, thread_ts=thread_ts)
        except gemini_client.QuotaExceededError:
            logger.warning("Gemini API 사용량 한도 초과")
            await say(
                text=(
                    ":hourglass: 현재 Gemini 무료 사용량 한도에 도달했습니다.\n"
                    "잠시 후(보통 1분 이내) 다시 질문해주세요. "
                    "계속 발생하면 일일 한도일 수 있으니 내일 다시 시도해주세요."
                ),
                thread_ts=thread_ts,
            )
        except Exception as e:
            logger.exception("답변 생성 실패")
            await say(
                text=f":warning: 답변 생성 중 오류가 발생했습니다.\n`{type(e).__name__}: {e}`",
                thread_ts=thread_ts,
            )
        finally:
            # "처리 중" 리액션 제거
            try:
                await client.reactions_remove(channel=channel, timestamp=event["ts"], name="hourglass_flowing_sand")
            except Exception:
                pass

    @app.event("message")
    def handle_message(body):
        """DM 등 기타 메시지 이벤트 무시 (에러 방지용)"""
        pass

    return app


async def _get_thread_history(client, channel: str, thread_ts: str, current_ts: str) -> list[dict] | None:
    """
    스레드의 이전 메시지를 Gemini 대화 히스토리 형태로 변환.
    최근 6개 메시지만 사용 (토큰 절약).
    """
    try:
        result = await client.conversations_replies(channel=channel, ts=thread_ts, limit=10)
        messages = result.get("messages", [])
    except Exception:
        return None

    if len(messages) <= 1:
        return None

    history = []
    for msg in messages[-6:]:
        # 현재 메시지는 제외 (Gemini에 별도로 전달)
        if msg["ts"] == current_ts:
            continue

        text = _strip_mention(msg.get("text", ""))
        if not text:
            continue

        # bot 메시지 → model 역할, 사용자 메시지 → user 역할
        role = "model" if msg.get("bot_id") else "user"
        history.append({"role": role, "parts": [{"text": text}]})

    return history if history else None


def start(bot_token: str, app_token: str):
    """Slack Bot을 Socket Mode로 시작합니다."""
    app = create_app(bot_token)
    handler = SocketModeHandler(app, app_token)
    print("⚡ 법령봇이 시작되었습니다!")
    handler.start()
