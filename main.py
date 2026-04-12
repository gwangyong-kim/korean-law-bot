"""
Korean Law Slack Bot — 진입점

사용법:
    python main.py
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()


def _check_env():
    """필수 환경변수 확인"""
    required = {
        "SLACK_BOT_TOKEN": "Slack Bot Token (xoxb-...)",
        "SLACK_APP_TOKEN": "Slack App-Level Token (xapp-...)",
        "GEMINI_API_KEY": "Google Gemini API Key",
        "LAW_API_KEY": "국가법령정보센터 Open API 인증키(OC)",
    }
    missing = []
    for key, desc in required.items():
        if not os.getenv(key):
            missing.append(f"  {key} — {desc}")

    if missing:
        print("❌ 다음 환경변수를 .env 파일에 설정해주세요:\n")
        print("\n".join(missing))
        print("\n📄 .env.example 파일을 참고하세요.")
        sys.exit(1)


def main():
    _check_env()

    from bot.slack_handler import start

    start(
        bot_token=os.environ["SLACK_BOT_TOKEN"],
        app_token=os.environ["SLACK_APP_TOKEN"],
    )


if __name__ == "__main__":
    main()
