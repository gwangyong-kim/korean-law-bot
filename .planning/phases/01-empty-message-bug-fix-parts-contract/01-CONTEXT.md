# Phase 1: Empty Message Bug Fix + Parts Contract - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

프로덕션(`frontend-phi-six-16.vercel.app`)에서 법령 질문이 빈 카드가 아니라 실제 답변 텍스트로 렌더링되도록, AI SDK 6 `UIMessage.parts` 계약 위에 재사용 가능한 parts 모듈을 신설하고 서버·클라이언트 양쪽의 root cause를 수정한다.

**Root causes locked (from REQUIREMENTS.md and code inspection):**
- `frontend/src/app/api/chat/route.ts:84-94` — `streamText`에 `stopWhen` 미지정 → 기본값 `stepCountIs(1)`로 첫 tool call 후 종료
- `route.ts:93` — `try/finally`의 `mcpClient.close()`가 lazy stream을 race condition에 빠뜨림
- `toUIMessageStreamResponse()`에 `consumeSseStream` / `onError` 콜백 부재

**Scope anchor:** Phase 1은 "새로 보낸 메시지가 제대로 렌더링되는 것"까지. localStorage reseed (`useChat({id, messages})`)는 Phase 4 (PERS) 범위.

</domain>

<decisions>
## Implementation Decisions

### A. 마이그레이션 전략 (COMPAT)
- **D-01:** 옛 flat `{id, role, content: string}` → parts 변환은 `lib/ui-message-parts.ts`의 `extractAssistantText` 내부에서 수행. single source of truth 원칙 유지 — `conversations.ts`는 AI SDK parts 타입을 몰라도 됨.
- **D-02:** 옛 포맷 감지 기준: `msg.parts`가 undefined이고 `msg.content`가 string일 때 legacy로 판정. false positive 없는 가장 명확한 조건.
- **D-03:** 변환 실패 시 fallback: 빈 문자열 반환 + `console.warn`. UI는 빈 카드 없이 연속 흐름을 보존하고, 예외로 대화 사이드바가 깨지지 않음.
- **D-04:** Phase 1은 **읽기 전용 마이그레이션**만. localStorage 저장 구조를 parts로 교체하는 것은 Phase 4 (PERS-01) 범위. Phase 1이 PERS 스코프를 잠식하지 않음.

### B. MessagePartRenderer 구조
- **D-05:** stub 처리 대상 파트(`reasoning`, `file`, `source-url`, `step-start`)는 기본적으로 `null` 반환 (완전 숨김). Phase 1에서는 UI 노이즈 0.
- **D-06:** `dynamic-tool` 파트의 4가지 상태(`input-streaming` / `input-available` / `output-available` / `output-error`)를 모두 **minimal chip 문자열**로 분기 처리. Phase 1은 "상태별 분기가 존재함"까지. 한국어 라벨, 시제, 펼침 UI 고도화는 Phase 3 (TOOL) 스코프.
- **D-07:** `switch (part.type)` 기본값(never-default)은 **개발 환경에서 throw, 프로덕션에서 `console.error` + null 반환**. 타입 안전성과 운영 안전성을 모두 확보.

### C. 진단 로그 및 검증 게이트 (CHAT-09)
- **D-08:** 진단 로그 위치: **클라이언트 `onMessagesChange` 직전**. `chat-container.tsx`의 useEffect 안에서 `messages.forEach(m => console.log(JSON.stringify(m.parts)))`. 브라우저 devtools에서 실제 세션의 before/after를 비교.
- **D-09:** 진단 로그 수명: fix 커밋 **직전 일시 삽입 → 스크린샷/콘솔 출력 확보 → 커밋 전 제거**. 프로덕션 노이즈 0. Phase 1 종료 후 repo에 로그가 남지 않음.
- **D-10:** before/after 기록 위치: **fix 커밋의 commit message body**. HEREDOC으로 Before (tool-only parts만 있는 JSON 스니펫) / After (text part 포함 JSON 스니펫) 기록. git log에 영구 보존.
- **D-11:** 프로덕션 수동 검증을 **merge 전 필수 게이트**로. CHAT-01의 "근로기준법 제60조 연차휴가" 질문을 사용자가 직접 프로덕션에서 던져 텍스트 렌더링 확인. 통과해야 VERIFICATION.md `passed`. 실패 시 rollback.

### D. 커밋 구성 및 스코프 경계
- **D-12:** Phase 1은 **3개 순차 커밋**으로 분할:
  1. `fix(api): stopWhen + MCP close 이동 + consumeSseStream/onError` [CHAT-02, 03, 04]
  2. `feat(parts): lib/ui-message-parts.ts + MessagePartRenderer 신설` [CHAT-05, CHAT-07]
  3. `refactor(chat): chat-container + test-sidebar inline getMessageText 제거 + COMPAT 마이그레이션` [CHAT-06, CHAT-08, COMPAT-01~03]
  각 스텝이 독립 빌드/타입체크 통과하도록. git bisect 가능.
- **D-13:** `frontend/src/app/test-sidebar/page.tsx`의 inline `getMessageText`는 **Phase 1에서 `extractAssistantText`로 교체**한다 (CHAT-06 명시). Phase 5에서 디렉터리 자체가 삭제될 예정이지만 CHAT-06 문구와의 일관성을 위해 Phase 1에서 교체. CLEAN-04와 중복되지 않음 (CLEAN-04는 디렉터리 삭제).
- **D-14:** `maxDuration` 값(현재 60)은 Phase 1에서 **건드리지 않는다**. STRE-09 (Phase 2) 범위. Phase 1은 순수하게 buggy 서버 로직 수정만.

### Claude's Discretion
- 3개 커밋 사이 세부 파일 정렬, import 순서, 빈 줄, 주석 위치는 Claude 재량.
- `extractAssistantText`의 정확한 시그니처(`(msg: UIMessage | LegacyMessage) => string` 등) 및 내부 헬퍼 이름.
- `MessagePartRenderer`의 props 이름, 스타일 클래스, Tailwind 조합.
- 변환 실패 시 `console.warn`의 정확한 메시지 문구.
- dev throw / prod console.error 분기를 `process.env.NODE_ENV` 또는 Next.js `process.env.NODE_ENV === 'production'` 체크 중 어느 쪽으로 할지.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 정의
- `.planning/PROJECT.md` — Core Value, 제약, Key Decisions (특히 "메시지 파트 추출 로직을 근본 재설계")
- `.planning/REQUIREMENTS.md` §Chat Rendering — CHAT-01~09 요구사항 전체 텍스트
- `.planning/REQUIREMENTS.md` §Backward Compatibility — COMPAT-01~03 요구사항
- `.planning/ROADMAP.md` §Phase 1 — Goal, Success Criteria, Key risks, Estimated effort

### Codebase 맥락
- `.planning/codebase/STACK.md` — Next.js 16.2.3 / React 19.2.4 / AI SDK 6.0.158 버전 정보
- `.planning/codebase/STRUCTURE.md` — frontend/src 디렉터리 레이아웃, 파일 역할
- `.planning/codebase/CONCERNS.md` §Tech Debt — "Message Type Handling Instability", "Ad-Hoc Text Extraction from Message Parts"
- `frontend/CLAUDE.md` → `frontend/AGENTS.md` — "This is NOT the Next.js you know" 경고. Next.js 16 / AI SDK 6 공식 API를 `node_modules/next/dist/docs/` 와 AI SDK 소스에서 직접 확인할 것.

### 수정 대상 파일 (root cause)
- `frontend/src/app/api/chat/route.ts` — `streamText` 호출부 (line 84-94), `try/finally` MCP close (line 92-94)
- `frontend/src/components/chat/chat-container.tsx` — inline `getMessageText` (line 158-167), localStorage 저장부 (line 67-81)
- `frontend/src/components/chat/chat-message.tsx` — `content: string` props 수신부 (content를 markdown으로 렌더링 중)
- `frontend/src/lib/conversations.ts` — `Message` interface (line 5-9) 및 CRUD
- `frontend/src/app/test-sidebar/page.tsx` — 중복된 `getMessageText` (CLAUDE.md에 언급됨)

### 기존 과거 fix 시도 (안티패턴 참고 — 다시 반복 금지)
- commits `fd4ba9c`, `45e73f7`, `3d6ff04`, `b618abe` — 모두 클라이언트 `getMessageText`만 패치. 서버 root cause 미수정 → 프로덕션에서 재발. 이번엔 route.ts부터.

### 외부 문서 (research 시점에 참조)
- AI SDK 6 공식 troubleshooting 페이지 — `consumeSseStream` 위치, `onError` 콜백 사용법 (research 단계에서 Context7로 최신판 조회)
- AI SDK 6 `UIMessage.parts` type guard API — `isTextUIPart`, `isToolUIPart`, `getToolName` (research로 정확한 re-export path 확보)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/chat/chat-message.tsx` — ReactMarkdown + remarkGfm 렌더링 보유. `content: string` props 유지하면 `MessagePartRenderer` → `ChatMessage` 위임 구조로 최소 변경.
- `frontend/src/lib/utils.ts` — `cn()` Tailwind 헬퍼 기존.
- `@ai-sdk/react`의 `useChat` hook — 이미 `chat-container.tsx`에서 사용 중 (line 34). AI SDK 6 공식.

### Established Patterns
- **Single responsibility 지연**: `chat-container.tsx`가 330줄 수준으로 state/effect/handler 혼재. Phase 1에서는 과감한 리팩터링 대신 `extractAssistantText` 위임 + inline 제거만. 전체 리팩터링은 CONCERNS.md의 tech debt.
- **localStorage 중심 상태**: `lib/conversations.ts`가 `STORAGE_KEY = "law-bot-conversations"` key로 전체 CRUD 캡슐화. read-time migration만으로 충분.
- **Tailwind + shadcn**: `components/ui/*`에 shadcn 래퍼 존재. 신규 UI 요소 거의 필요 없음.

### Integration Points
- `useChat({id: conversationId})` → `messages` 배열 (AI SDK 6 `UIMessage[]`) → `getMessageText` → `ChatMessage content prop` → ReactMarkdown.
- 신규 구조: `messages` → `MessagePartRenderer`가 parts 루프 돌며 분기 → text parts는 `ChatMessage`에 위임, tool parts는 minimal chip.
- `chat-container.tsx` useEffect (line 67-81) — localStorage 저장 경로. COMPAT 마이그레이션은 load 경로에서만 발동하므로 이 useEffect는 Phase 4에서 재검토.

### Known Pitfalls (from PROJECT.md + AGENTS.md)
- Next.js 16 + AI SDK 6는 기존 API 지식 의존 금지. type guard 이름, streamText 옵션 이름, response helper signature 모두 `node_modules` 또는 공식 최신 문서로 재확인.
- `convertToModelMessages` (route.ts line 54)는 이미 적용됨. 호출 위치는 유지.
- Vercel serverless 60초 제한 → stopWhen을 8까지 올려도 실제 MCP 호출 시간 고려. maxDuration은 Phase 2 스코프.

</code_context>

<specifics>
## Specific Ideas

- "과거 4차례 fix 시도는 모두 클라이언트 `getMessageText`만 건드렸다. 이번엔 root cause부터." — PROJECT.md Key Decisions에서 명시된 방향.
- `console.log(JSON.stringify(messages[i].parts))` before/after를 커밋 메시지에 **실제 JSON 스니펫으로 붙여넣어야 함**. "확인했다"는 문장이 아니라 raw JSON 증거.
- 사용자(혼자 개발/검증)가 실제 프로덕션 URL에서 "근로기준법 제60조 연차휴가"를 직접 쳐서 렌더링 확인 — 자동화 없음, 수동 게이트.
- MessagePartRenderer 분기 중 4가지 dynamic-tool 상태는 **Phase 3에서 시제/라벨/details 접힘**으로 고도화. Phase 1은 최소 분기만.

</specifics>

<deferred>
## Deferred Ideas

- `chat-container.tsx` 컴포넌트 분할 (useMessageHandling, useFileProcessing, ExportDialog 훅/컴포넌트 추출) — CONCERNS.md tech debt. v2 또는 별도 refactor 사이클.
- `test-sidebar/page.tsx` 전체 삭제 — Phase 5 CLEAN-04. Phase 1은 inline getMessageText만 교체.
- localStorage 저장 구조를 parts로 교체 — Phase 4 PERS-01.
- MCP 연결 타임아웃, degraded mode, 에러 배너 — Phase 2 STRE-01~04.
- 시스템 프롬프트 완화 (일상 인사에 도구 호출 금지) — Phase 2 STRE-07.
- `dynamic-tool` 한국어 라벨, 시제 chip, `<details>` 접힘 UI — Phase 3 TOOL-01~06.
- `maxDuration` 60 vs 300 결정 — Phase 2 STRE-09.
- Reasoning panel — Out of Scope (REQUIREMENTS.md).

</deferred>

---

*Phase: 01-empty-message-bug-fix-parts-contract*
*Context gathered: 2026-04-13*
