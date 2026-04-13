# Phase 4: Conversation Persistence Stabilization - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Mode:** Claude's discretion (user delegated Phase 4/5)

<domain>
## Phase Boundary

localStorage에 full `UIMessage[]`를 저장하고, 사이드바에서 과거 대화 선택 시 과거 assistant 턴이 (텍스트 + 도구 호출 트레이스 모두) 정상 렌더링된다. Phase 1의 COMPAT read-migration 위에서 **정식 parts 저장 구조**로 전환.

**Drop-first candidate**: 스코프 타이트 시 가장 먼저 포기. Phase 1의 COMPAT가 safety floor이므로 포기해도 프로덕션 regression 없음.

**In scope:** PERS-01~04. localStorage 구조를 parts 기반으로 교체, `providerExecuted` 제거 + `providerMetadata` 보존, `useChat({id, messages: restored})` reseed 정상화, `status !== 'streaming'` atomicity.

**Out of scope:** 서버 DB 저장(V2-PERS), 다기기 동기화, 대화 전문 검색, 공유 링크.

</domain>

<decisions>
## Implementation Decisions

### A. Storage schema 전환 (PERS-01)
- **D-01:** localStorage 저장 타입을 `Pick<UIMessage, 'id' | 'role' | 'parts' | 'metadata'>`로 변경. `lib/conversations.ts`의 `Message` interface를 다음과 같이 업데이트:
  ```ts
  export interface Message {
    id: string;
    role: 'user' | 'assistant';
    parts: UIMessage['parts'];
    metadata?: UIMessage['metadata'];
  }
  ```
  `content: string` 필드는 **제거**. `extractAssistantText`는 parts에서 계산.
- **D-02:** **Backward 호환**: `loadAll()`에서 읽을 때 기존 flat `{role, content: string}` 감지 → parts `[{type: 'text', text: content, state: 'done'}]` 으로 in-place 변환 후 반환. 저장 시점에는 무조건 parts 구조로 저장 → **다음 save 호출에서 자연 재저장**.
- **D-03:** STORAGE_KEY는 그대로 유지 (`law-bot-conversations`). 스키마 버저닝 없음. 읽기 호환으로 충분.

### B. providerExecuted / providerMetadata 처리 (PERS-02)
- **D-04:** 저장 전 sanitize 함수 `sanitizePartsForStorage(parts: UIMessage['parts']): UIMessage['parts']`를 `lib/ui-message-parts.ts`에 추가:
  - `text` 파트 → `providerExecuted` 필드 제거
  - `dynamic-tool` 파트 → `providerMetadata` 보존 (Gemini thought_signature 유지)
  - 나머지 파트 → 그대로
- **D-05:** `updateConversation(id, messages)`에서 저장 직전에 `sanitizePartsForStorage` 호출. 단방향 — 저장 시에만 sanitize, load 시에는 변환 없음.

### C. useChat reseed (PERS-03)
- **D-06:** 사이드바에서 과거 대화 선택 시 `chat-container.tsx`는 **컴포넌트 unmount/remount** 패턴으로 reseed. `key={conversationId}`를 상위에서 전달 → React가 언마운트 + 재마운트 → `useChat({id: conversationId, messages: initialMessages})` 로 초기값 주입.
- **D-07:** `useChat`의 `messages` 초기값 prop은 AI SDK 6 `ChatInit.messages` API 사용. **research 필수**: `node_modules/@ai-sdk/react/dist/*.d.ts`와 Context7로 `ChatInit` 타입 shape 확인. vercel/ai 이슈 #8061, #9731 언급된 convertToModelMessages 라운드트립 버그 확인.
- **D-08:** reseed 실패(타입 불일치 / 버그) 시 fallback: 기존 flat content에서 parts 변환한 값을 넘기되 warning 로그. 사이드바 선택은 동작하지만 도구 트레이스가 렌더링 안 될 수 있음 (regression acceptable — drop-first candidate).

### D. Atomicity (PERS-04)
- **D-09:** `chat-container.tsx`의 save useEffect에서 `status !== 'streaming'` 조건 강화. 현재 이미 line 78-80에서 체크하고 있음 → 유지하고 명시적 주석 추가. `submitted` 상태도 save 금지 (중간 반영 방지).
- **D-10:** save 호출은 `useEffect(..., [messages, status])`로 `status`가 `'ready'` 또는 `'idle'`로 돌아왔을 때만 트리거. `'streaming' | 'submitted' | 'error'` 상태에서는 skip.

### Claude's Discretion
- `sanitizePartsForStorage`의 정확한 구현(map vs forEach, shallow copy 여부)
- `Message` interface를 generic `UIMessage` 재사용 vs Pick 유지 — 타입 안전성 우선
- `key={conversationId}`가 가장 simple한 reseed 패턴이지만 다른 AI SDK 6 공식 API가 있으면 그걸 우선

</decisions>

<canonical_refs>
## Canonical References

### 프로젝트 정의
- `.planning/REQUIREMENTS.md` §Conversation Persistence — PERS-01~04
- `.planning/ROADMAP.md` §Phase 4 — Goal, Research flag (LOW confidence on ChatInit.messages), Drop criteria (Wed PM)

### Codebase 맥락
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-CONTEXT.md` §COMPAT — Phase 1의 read-time migration 원칙. Phase 4는 저장 구조 자체를 parts로 바꿈.
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-CONTEXT.md` — `lib/ui-message-parts.ts` + `extractAssistantText` 존재 확인.

### 수정 대상 파일
- `frontend/src/lib/conversations.ts` — `Message` interface 변경, load/save 마이그레이션
- `frontend/src/lib/ui-message-parts.ts` — `sanitizePartsForStorage` 함수 추가
- `frontend/src/components/chat/chat-container.tsx` — save useEffect 재검토, reseed 시 `key` prop 전달받기
- `frontend/src/app/page.tsx` 또는 `chat-sidebar.tsx` — `chat-container` 상위에서 `key={conversationId}` 전달

### 외부 문서 (research 시점 필수)
- AI SDK 6 `useChat` / `ChatInit.messages` — reseed API의 정확한 형태 (Context7로 최신 확인)
- vercel/ai 이슈 #8061, #9731 — convertToModelMessages 라운드트립 버그 상태 확인

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractAssistantText` (Phase 1 산출) — 이미 flat content fallback 처리. Phase 4에서는 parts가 주 저장 구조가 되므로 fallback 분기 점차 drop 가능하지만 safety를 위해 유지.
- `lib/conversations.ts`의 CRUD API 구조 — `createConversation`, `updateConversation`, `deleteConversation` — 모두 유지. 내부 type만 변경.
- `useChat({id})` + `sendMessage` 패턴 — 그대로.

### Established Patterns
- **localStorage 중심 상태**: 유일한 persistence layer. 서버 DB는 out-of-scope.
- **status 기반 save gating**: Phase 1부터 `status !== 'streaming'` 체크 존재. Phase 4는 이 패턴을 강화 + 명시화.
- **React key 기반 remount**: 널리 쓰이는 reseed 패턴. `useChat({id})` 가 내부적으로 key-aware하지 않을 경우 대안.

### Integration Points
- `page.tsx` 또는 `chat-sidebar.tsx`에서 선택된 conversation ID를 state로 관리 → `chat-container`에 전달. 선택 바뀔 때 key prop으로 강제 remount.
- `useChat` 초기화 시 `{id, messages}` → restored messages가 AI SDK 6 내부 store에 reseed.

### Known Pitfalls
- `convertToModelMessages` 라운드트립 버그: restored parts가 다시 server로 전송될 때 변환 손실 가능. Phase 4에서 manual test 필수.
- `providerMetadata`에 Gemini thought_signature가 담김. 이를 drop하면 멀티턴 tool use에서 context loss 발생. 반드시 보존.
- `useChat` reseed가 내부 store를 완전 교체하지 않고 부분 병합할 위험. AI SDK 6 docs 검증 필요.

</code_context>

<specifics>
## Specific Ideas

- "Drop-first candidate": Phase 1 COMPAT가 safety floor이므로 Phase 4 포기해도 빈 카드 회귀 없음.
- 기존 사용자(개발자 본인)의 localStorage 대화 기록이 살아있어야 함 (PROJECT.md Constraints).
- 이미 refactoring된 `lib/conversations.ts`라 migration은 한 곳에서.

</specifics>

<deferred>
## Deferred Ideas

- 서버 DB 저장 (V2-PERS)
- 다기기 동기화 (V2-PERS)
- 대화 전문 검색 (V2-PERS)
- 대화 공유 링크 (V2-COLLAB)
- 대화 폴더/태그 정리 (V2-COLLAB)
- 인코딩 / 압축 / 최적화 — 단일 사용자 기준 불필요

</deferred>

---

*Phase: 04-conversation-persistence-stabilization*
*Context gathered: 2026-04-13*
