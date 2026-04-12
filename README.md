# Korean Law Slack Bot

Slack에서 `@법령봇`을 멘션하면 한국 법령과 판례를 자연어로 검색할 수 있는 봇입니다.

- **AI**: Google Gemma 4 27B (무료, 오픈소스)
- **법령 데이터**: 국가법령정보센터 Open API (무료)
- **Slack 연동**: Socket Mode (웹서버/포트포워딩 불필요)

## 사용 예시

```
@법령봇 근로기준법 연차휴가 규정 알려줘
@법령봇 부당해고 관련 최근 판례 찾아줘
@법령봇 개인정보보호법 제15조 전문 보여줘
```

---

## 설치

### 1. 사전 준비

#### Slack App 생성

1. https://api.slack.com/apps 접속 → **Create New App** → **From scratch**
2. App 이름: `법령봇` (원하는 이름), Workspace 선택
3. 왼쪽 메뉴 **Socket Mode** → 활성화 → **App-Level Token** 생성
   - Token Name: `socket-token`
   - Scope: `connections:write`
   - **Generate** → `xapp-...` 토큰 복사
4. 왼쪽 메뉴 **OAuth & Permissions** → Bot Token Scopes 추가:
   - `app_mentions:read`
   - `chat:write`
   - `reactions:write`
   - `channels:history` (스레드 히스토리 읽기용)
5. 왼쪽 메뉴 **Event Subscriptions** → 활성화 → **Subscribe to bot events** 추가:
   - `app_mention`
   - `message.channels` (선택사항)
6. 페이지 상단 **Install to Workspace** → 허용 → `xoxb-...` Bot Token 복사
7. Slack에서 원하는 채널에 봇 초대: `/invite @법령봇`

#### Gemini API 키

1. https://aistudio.google.com/app/apikey 접속
2. **Create API Key** → 키 복사

#### 국가법령 Open API 키

1. https://open.law.go.kr 접속 → 회원가입
2. **Open API 사용 신청** → 인증키 발급

### 2. 프로젝트 설정

```bash
cd C:\dev\korean-law-bot

# 가상환경 생성 및 활성화
python -m venv .venv
.venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt
```

### 3. 환경변수 설정

`.env.example`을 `.env`로 복사하고 키를 입력합니다:

```bash
copy .env.example .env
```

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-level-token
GEMINI_API_KEY=your-gemini-api-key
LAW_API_KEY=your-law-api-key
```

### 4. 실행

```bash
python main.py
```

`⚡ 법령봇이 시작되었습니다!` 메시지가 나오면 성공입니다.

---

## 기능

| 기능 | 설명 | 예시 |
|------|------|------|
| 법령 검색 | 법률/시행령/시행규칙 검색 | `근로기준법 검색해줘` |
| 조문 조회 | 특정 조문 전문 확인 | `근로기준법 제60조 전문` |
| 판례 검색 | 대법원/헌재/조세심판 등 | `연차휴가 판례 찾아줘` |
| 판례 전문 | 판례 상세 내용 조회 | `위 판례 전문 보여줘` |
| 스레드 대화 | 이전 맥락 유지 | 스레드에서 추가 질문 |

## 구조

```
korean-law-bot/
├── main.py               # 진입점
├── bot/
│   ├── slack_handler.py  # Slack 이벤트 처리
│   └── gemini_client.py  # Gemini API + function calling
├── law/
│   ├── api.py            # 국가법령 API 호출
│   └── tools.py          # Gemini 도구 정의
├── .env                  # API 키 (gitignore)
└── requirements.txt
```
