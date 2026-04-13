# Requirements: Korean Law Bot

**Defined:** 2026-04-13
**Core Value:** 사내 직원이 웹 브라우저에서 한국 법령·판례를 자연어로 물어봤을 때, 답이 빈 카드가 아니라 신뢰할 수 있는 근거 있는 텍스트로 화면에 정상 렌더링된다.

## v1 Requirements

이번 1주 사이클의 exit criteria. 모든 v1 항목이 체크되어야 사내 배포 준비 완료.

### Chat Rendering (CHAT)

채팅 메시지 렌더링 경로 전반을 AI SDK 6의 공식 `UIMessage.parts` 계약 위에 재구축한다. Phase 1의 핵심.

- [ ] **CHAT-01**: 프로덕션 URL(`frontend-phi-six-16.vercel.app`)에서 법령 관련 질문 ("근로기준법 제60조 연차휴가") 을 던지면, 빈 카드가 아니라 MCP 도구 결과에 근거한 실제 답변 텍스트가 화면에 렌더링된다. (Root cause: `route.ts`)
- [x] **CHAT-02**: `frontend/src/app/api/chat/route.ts`에 `stopWhen: stepCountIs(8)`을 명시해서 `stepCountIs(1)` 기본값 종료 문제를 제거한다.
- [x] **CHAT-03**: `mcpClient.close()`를 `try/finally`에서 제거하고 `streamText`의 `onFinish` / `onError` 콜백으로 이동시켜 lazy stream race condition을 제거한다.
- [x] **CHAT-04**: `toUIMessageStreamResponse()`에 `consumeSseStream` (abort safety) 과 `onError` (에러 마스킹 해제) 콜백을 추가한다.
- [x] **CHAT-05**: 새 공용 모듈 `frontend/src/lib/ui-message-parts.ts`를 만들어 공식 type guard (`isTextUIPart`, `isToolUIPart`, `getToolName`)를 재export하고, `extractAssistantText(message: UIMessage)` 를 노출한다.
- [ ] **CHAT-06**: `chat-container.tsx`의 inline `getMessageText`, `test-sidebar/page.tsx`의 동일 로직을 `extractAssistantText`로 교체하여 단일 진실 원천(single source of truth)을 만든다.
- [x] **CHAT-07**: 새 `MessagePartRenderer` 컴포넌트를 만들어 `switch (part.type)` with TypeScript `never`-default로 렌더링한다. v6의 `text`, `dynamic-tool`, `reasoning`, `file`, `source-url`, `step-start` 파트 타입을 모두 분기 처리 (stub 허용).
- [ ] **CHAT-08**: `ChatContainer`는 parts 렌더링을 직접 하지 않고 `MessagePartRenderer`에 위임하도록 슬림화한다.
- [ ] **CHAT-09**: Phase 1 수정 전후로 `console.log(JSON.stringify(messages[i].parts))` 로컬 진단 로그를 찍고, 수정 전에는 `tool-*` 파트만, 수정 후에는 `text` 파트가 포함됨을 커밋 메시지 또는 PR 설명에 기록한다.

### Backward Compatibility (COMPAT)

Phase 1과 함께 반드시 나가야 하는 무음 regression 방지책.

- [ ] **COMPAT-01**: localStorage에서 읽어온 기존 `{role, content: string}` 대화 기록이 refactor 후에도 빈 카드 없이 렌더링된다. (read-time migration)
- [ ] **COMPAT-02**: 마이그레이션 로직은 한 곳 — `lib/conversations.ts` 또는 `extractAssistantText` — 에만 존재하고, load 시점에 `content` 문자열을 `[{type: 'text', text: content, state: 'done'}]`로 감싸는 원샷 변환을 수행한다.
- [ ] **COMPAT-03**: 수정 배포 후 기존 사용자(= 본인)의 대화 목록이 날아가지 않고 사이드바에서 선택 시 과거 답변도 표시된다. (Phase 1 smoke test)

### Streaming Stability (STRE)

Phase 2. Phase 1이 끝난 뒤 스트림 주변의 모든 취약한 경로를 정비.

- [ ] **STRE-01**: MCP `createMCPClient` 호출을 `Promise.race`로 5초 타임아웃 wrapping하고, 타임아웃 시 degraded mode (도구 없이 진행)로 fallback한다.
- [ ] **STRE-02**: MCP `tools()` 스키마를 모듈 스코프에서 5분 TTL로 캐싱한다. 워밍된 Vercel 컨테이너에서 콜드스타트 200-800ms를 제거. (10줄 PoC로 Vercel Fluid Compute warm-container 동작 확인 후 구현)
- [ ] **STRE-03**: 에러 배너를 채팅 컨테이너 하단 floating 위치가 아니라 **실패한 assistant bubble 내부**에 렌더링한다.
- [ ] **STRE-04**: 세 가지 실제 실패 모드에 대해 구분된 한국어 메시지를 노출:
    - (a) `maxDuration` 타임아웃 — "응답 생성 시간이 초과되었습니다. 질문을 더 간단히 해보세요."
    - (b) MCP 503/"Max sessions" — "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요."
    - (c) MCP 연결 실패 — "법령 검색 서버에 연결할 수 없어 일반 답변만 드릴 수 있습니다. [⚠️ 미확인 답변]"
- [ ] **STRE-05**: 실패한 assistant 턴에 `useChat.regenerate()` 를 호출하는 "다시 시도" 버튼을 노출한다.
- [ ] **STRE-06**: 트랜지언트 503 에러 시 1회 자동 재시도 (exponential backoff 1초).
- [ ] **STRE-07**: 시스템 프롬프트의 "절대 도구 호출 없이 답변 금지" 규칙을 완화: "법령·판례 관련 질문일 때만 도구를 호출하세요. '안녕하세요' 같은 일상 인사에는 도구 없이 답변하세요."
- [ ] **STRE-08**: Gemini 2.5 Flash 멀티턴 `thought_signature` smoke test 수행 (3개 연속 툴 사용 질문). 실패 시 `providerOptions: {google: {thinkingConfig: {thinkingBudget: 0}}}` 로 escape hatch 적용.
- [ ] **STRE-09**: `maxDuration` 값을 결정하고 (60 유지 vs 300 상향) 이유를 PROJECT.md에 기록. 상향 시 Vercel Fluid Compute가 활성화되어 있는지 대시보드에서 확인.

### Tool Call UI Feedback (TOOL)

Phase 3. Parts contract가 살아있다는 전제 위에서 작동.

- [ ] **TOOL-01**: `ToolInvocationView` 컴포넌트가 `DynamicToolUIPart`의 네 가지 상태(`input-streaming` / `input-available` / `output-available` / `output-error`)를 모두 렌더링한다.
- [ ] **TOOL-02**: 새 `frontend/src/lib/tool-labels.ts` 맵이 4개 MCP 도구를 한국어로 표시:
    - `search_law` → "법령 검색"
    - `get_law_text` → "법령 본문"
    - `search_decisions` → "판례 검색"
    - `get_decision_text` → "판례 본문"
- [ ] **TOOL-03**: 도구 호출 상태는 동사 시제로 표시됨. 진행 중: "법령 검색 중: 근로기준법". 완료: "검색 완료: 근로기준법". (현재 인자 값이 chip에 보임.)
- [ ] **TOOL-04**: 도구 호출 블록은 `<details>` 엘리먼트로 기본 접힘 상태. 펼치면 요청 인자와 반환된 raw 결과(truncated)가 보인다.
- [ ] **TOOL-05**: 한 assistant 턴에서 여러 도구가 호출되면 세로 체크리스트처럼 순서대로 스택된다.
- [ ] **TOOL-06**: 기존의 정적 `"검색 중..."` 문자열을 제거하고, 대신 실제 도구 상태 chip + skeleton bubble로 대체한다.

### Conversation Persistence (PERS)

Phase 4. 스코프 tight 시 **첫 번째 드롭 후보**. Phase 1의 COMPAT-*가 safety floor.

- [ ] **PERS-01**: localStorage에 flat `{role, content: string}`이 아닌 `Pick<UIMessage, 'id' | 'role' | 'parts' | 'metadata'>` 을 저장한다.
- [ ] **PERS-02**: 저장 전 `providerExecuted` 필드를 text part에서 제거하고, tool part의 `providerMetadata`는 Gemini thought_signature 유지를 위해 그대로 보존한다. (vercel/ai #8061, #9731)
- [ ] **PERS-03**: 사이드바에서 과거 대화 선택 시 `useChat({id, messages: restored})` 를 통해 상태가 reseed 되어 과거 assistant 턴의 텍스트와 도구 호출이 모두 렌더링된다. (검증 대상: v6 `ChatInit.messages` API — Phase 3/4 사이에 research 필요)
- [ ] **PERS-04**: 저장 트리거가 `status !== 'streaming'` 상태에서만 발동하여 partial stream을 저장하지 않는다. (atomicity)

### Legacy Cleanup (CLEAN)

Phase 5. 독립적이며 마지막. 스코프 tight 시 Phase 4보다 먼저 나간다.

- [ ] **CLEAN-01**: 루트의 `app.py`, `.chainlit/` 디렉터리, `main.py` 외 Chainlit 관련 진입점, 그리고 `.chainlit` 관련 설정 파일을 삭제한다.
- [ ] **CLEAN-02**: `requirements.txt`에서 `chainlit` 의존성을 제거한다. Python Slack 봇 관련 의존성 (slack-bolt, google-generativeai, httpx, python-dotenv) 은 그대로 유지.
- [ ] **CLEAN-03**: `Dockerfile`이 Chainlit 기반이면 Slack 봇 전용으로 재작성하거나, 불필요한 CMD/EXPOSE 라인을 제거한다. 포트 7860 노출 제거.
- [ ] **CLEAN-04**: `frontend/src/app/test-sidebar/` 테스트 페이지를 삭제한다. 인증 없이 프로덕션에 노출 중이며 버그 있는 `getMessageText` 사본이 있는 경로.
- [ ] **CLEAN-05**: Python Slack 봇 경로 (`bot/`, `main.py`, `law/`)는 **일절 수정하지 않는다**. 정리 후 `python main.py`로 Slack 봇이 여전히 기동되는지 수동 검증.
- [ ] **CLEAN-06**: README (있다면) 및 `.env.example`에서 Chainlit 관련 환경변수(`CHAINLIT_AUTH_SECRET` 등)를 제거한다.

## v2 Requirements

v1 밖으로 명시적으로 밀어낸 항목. 다음 사이클 또는 그 이후.

### Server-Side Persistence (V2-PERS)

- **V2-PERS-01**: 대화 기록을 Vercel Postgres / KV 등 서버 DB에 사용자별로 저장
- **V2-PERS-02**: 다기기/다브라우저 동기화
- **V2-PERS-03**: 대화 기록 전문 검색 (메시지 본문 검색)

### Observability (V2-OBS)

- **V2-OBS-01**: Sentry 또는 유사 도구로 프로덕션 에러 수집
- **V2-OBS-02**: 구조화된 로깅 (structured logging) 도입
- **V2-OBS-03**: 사용량/메트릭 대시보드 (쿼리 수, 에러율, 평균 응답 시간)

### Advanced Tool UX (V2-TOOL)

- **V2-TOOL-01**: Live `input-streaming` 인자 프리뷰 — Gemini가 툴 인자 델타를 스트리밍한다는 전제. Phase 3 관찰 후 결정.
- **V2-TOOL-02**: 도구 결과 개수를 chip에 표시 ("12건 발견")
- **V2-TOOL-03**: 도구 호출 경과 시간 표시
- **V2-TOOL-04**: 도구별 아이콘 (📖 법령, 🔍 검색, ⚖️ 판례)

### Collaboration (V2-COLLAB)

- **V2-COLLAB-01**: 대화 공유 링크 생성
- **V2-COLLAB-02**: 대화 폴더/태그/정리
- **V2-COLLAB-03**: 메시지 반응 / 댓글

## Out of Scope

명시적 제외. 재추가 방지용 근거 포함.

| Feature | Reason |
|---------|--------|
| Slack 봇 수정·리팩터링 | 이미 돌아가고 있고, 이번 사이클은 웹 경로 안정화에 집중. 스코프 격리. |
| 서버 DB 대화 저장 (이번 사이클) | 1주 안에 아키텍처 변경은 위험. localStorage + 백워드 호환이 safety floor. v2로 이동. |
| Next.js / AI SDK 메이저 업그레이드 | 현행 버전(Next 16, AI SDK 6.0.158)에서 버그 수정. 업그레이드는 별도 사이클. |
| 법령 검색 결과 품질 개선 / 프롬프트 튜닝 | system prompt 유지. 툴 호출이 실제로 도는 것이 먼저. Phase 2에서 안전성 차원의 최소 소프트닝만. |
| Sentry / 외부 관측 도구 | 1주 안에 추가 인프라 도입은 위험. `console.error` 유지. v2. |
| 모바일 전용 UI | 반응형 기본 수준 유지, 최적화는 제외. v2. |
| Reasoning / "Thinking" 패널 | Gemini Flash가 ChatGPT처럼 reasoning을 노출하지 않음. 가짜로 만들면 theater. |
| 대화 기록 전문 검색 | 단일 사용자, 작은 규모 — 복잡도 대비 가치 낮음. v2. |
| 다기기 동기화 / 공유 링크 | 단일 사용자 내부 도구. 필요 없음. v2+. |
| 온보딩 투어 / 가짜 타자 애니메이션 / 토스트 에러 | UX theater, 신뢰도 오히려 떨어뜨림. 삭제. |

## Traceability

Phase와 Requirement 매핑. roadmap 작성 후 업데이트.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 to CHAT-09 | Phase 1 | Pending |
| COMPAT-01 to COMPAT-03 | Phase 1 | Pending |
| STRE-01 to STRE-09 | Phase 2 | Pending |
| TOOL-01 to TOOL-06 | Phase 3 | Pending |
| PERS-01 to PERS-04 | Phase 4 | Pending |
| CLEAN-01 to CLEAN-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 37 total (CHAT 9 + COMPAT 3 + STRE 9 + TOOL 6 + PERS 4 + CLEAN 6)
- Mapped to phases: 37
- Unmapped: 0 ✓

**Priority order:** Phase 1 > Phase 2 > Phase 3 > Phase 5 > Phase 4. Phase 4 is drop-first if scope tightens; the Phase 1 COMPAT floor keeps backward compatibility even if PERS is deferred.

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after initial definition*
