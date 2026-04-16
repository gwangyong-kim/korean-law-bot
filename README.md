# Glluga 법령 Assistant

한국 법령, 판례, 행정규칙을 자연어로 검색하는 웹 채팅 서비스입니다.

- **Frontend**: Next.js + Vercel
- **AI 모델**: Gemini 3 Flash / 3.1 Flash-Lite
- **법령 데이터**: [korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp) (MCP 서버, Fly.io)
- **인증**: Google OAuth (회사 도메인 제한)

## 주요 기능

| 기능 | 설명 |
|------|------|
| 법령/판례 검색 | 자연어 질문 → MCP 도구로 법령·판례 검색 후 답변 |
| 계약서 리스크 분석 | 조항별 법적 리스크 등급 표시 |
| 상세 출처 인용 | 법령명, 조항, 시행일 + law.go.kr 링크 |
| 후속 질문 추천 | 심화/관련 법령/실무 3축 질문 자동 제시 |
| 대화 컨텍스트 유지 | 같은 세션에서 이전 맥락 기억 (최근 10턴) |
| 파일/이미지 첨부 | 계약서 등 문서 첨부 분석 |

## 로컬 개발

```bash
cd frontend
cp .env.example .env.local  # API 키 설정
npm install
npm run dev -- -p 3001
```

## 환경 변수

| 변수 | 설명 |
|------|------|
| `AUTH_SECRET` | NextAuth 세션 암호화 키 |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google OAuth |
| `ALLOWED_EMAIL_DOMAIN` | 로그인 허용 도메인 |
| `LAW_API_KEY` | MCP 서버 인증 키 |

## 프로젝트 구조

```
korean-law-bot/
└── frontend/
    ├── src/app/
    │   ├── api/chat/route.ts    # AI 스트리밍 + MCP 연동
    │   └── page.tsx             # 메인 채팅 UI
    ├── src/components/chat/     # 채팅 컴포넌트
    ├── src/lib/                 # 유틸리티 (모델, 출처, 에러, 비용)
    └── vercel.json              # Vercel 배포 설정
```
