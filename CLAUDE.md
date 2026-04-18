# korean-law-bot

## Commands
- Dev (3001): `cd frontend && npm run dev -- -p 3001` (3000은 다른 앱이 점유 가능)
- Build: `cd frontend && npm run build`
- Lint: `cd frontend && npm run lint`
- Type check: `cd frontend && npx tsc --noEmit`
- 필수 env vars: `frontend/.env.local.example` 참고 (AUTH_*, GEMINI_API_KEY, LAW_API_KEY)

## Architecture
- Frontend (이 리포): Next.js 채팅 UI, Vercel 배포
- 프로덕션 프론트엔드: `https://frontend-phi-six-16.vercel.app/`
- MCP 서버 (별도 리포): `C:/dev/korean-law-mcp-server` → origin `gwangyong-kim/korean-law-mcp` (fork of `chrisryugj/korean-law-mcp`)
- 프로덕션 MCP: `https://glluga-law-mcp.fly.dev/mcp` (Fly.io, nrt 리전)
- 연동 지점: `frontend/src/app/api/chat/route.ts` → `createMCPClient({ transport: { type: "http", url: getMcpUrl() } })`

## MCP Server Deployment
- Fly 앱명: `glluga-law-mcp` (upstream `fly.toml`의 `korean-law-mcp`와 다름)
- 배포 설정: `fly.glluga.toml` (개인 배포용 분리 파일)
- CI/CD: main push → GitHub Actions → `flyctl deploy --remote-only --depot=false --config fly.glluga.toml`
- `--depot=false` 필수: app-scope deploy token은 org-scope depot builder 접근 불가
- Dependabot: npm/github-actions/docker weekly PR
- Upstream 자동 동기화: `sync-upstream.yml` — 매일 KST 12:00 cron으로 Chris 원본 merge-upstream → 변경 시 자동 배포
- sync workflow가 직접 deploy하는 이유: GITHUB_TOKEN의 push는 다른 workflow를 트리거하지 않음

## Git
- **`git push` 금지: 사용자가 명시적으로 요청할 때만 push할 것.** Vercel 자동 배포가 연결되어 push = 즉시 프로덕션 배포.
- 이 리포의 git user: `gwangyong-kim <rainshadow66@gmail.com>` (local config)
- MCP 서버 리포: global git config 없음 — 커밋 시 `-c user.name/email` 필요
- MCP 서버 리포 remotes: `origin` = 사용자 fork, `upstream` = `chrisryugj/korean-law-mcp`

## Releases
- **GitHub Release는 사용자가 수동으로 발행한다 (Claude가 자동 생성 금지).**
- Release 내용(태그명, 제목, 본문)은 Claude가 초안을 제시하고 **사용자 검토·승인 후**에만 생성/푸시.
- 본문 첫 줄에 `<!-- date: YYYY-MM-DD -->` 주석 권장 — `update-readme.yml`이 README의 업데이트 내역 날짜로 사용.

## Chat UI Tech Notes
- AI SDK v6 스트리밍: `smoothStream` → `experimental_transform` 옵션으로 적용. 한국어 청킹은 `Intl.Segmenter("ko", { granularity: "grapheme" })` 필수 (기본 `word` 모드는 CJK 미지원)
- 대화 컨텍스트 유지: `useChat({ messages })` 로 과거 대화를 UIMessage 포맷으로 reseed. `splitContextWindow()`가 최근 10턴/8000자로 제한
- ScrollArea 스크롤 제어: `ref`는 Root를 가리킴 → 실제 scrollable은 `[data-slot="scroll-area-viewport"]` querySelector로 접근
- NextAuth v5 dev 쿠키: `authjs.session-token` (prod는 `__Secure-authjs.session-token`)
- 로컬 테스트 인증 우회: `next-auth/jwt`의 `encode()`로 JWT 생성 → 브라우저 쿠키 주입

## Gotchas
- Fork 리포의 GitHub Actions는 브라우저 UI에서 수동 활성화 필요 (API/CLI로 불가)
- Fly.io merge-upstream API 결과: "fast-forward" 또는 "merge"면 변경 있음, 빈 응답이면 이미 최신
- 로컬 포트 3000에 다른 앱(MRP WO) 점유 가능 → dev 서버는 `-p 3001` 사용
- AI SDK API 문서: Context7 할당량 초과 시 `node_modules/ai/dist/index.d.ts` 직접 참조
