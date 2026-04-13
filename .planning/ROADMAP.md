# Roadmap: Korean Law Bot — v1 Milestone

**Milestone:** v1 — 사내 배포 준비 완료
**Timeline:** ~1주
**Strategy:** Phase 1 is the blocker; all other phases depend on it shipping first.
**Priority order:** Phase 1 > Phase 2 > Phase 3 > Phase 5 > Phase 4

## Phase Structure

| # | Phase | Requirements | Dependencies | Drop priority |
|---|-------|--------------|--------------|---------------|
| 1 | Empty Message Bug Fix + Parts Contract | CHAT-01..09, COMPAT-01..03 | — | Never drop (blocker) |
| 2 | Streaming Stability & Error UX | STRE-01..09 | Phase 1 | Drop if scope critical |
| 3 | Tool Call UI Feedback | TOOL-01..06 | Phase 1, Phase 2 | Drop before Phase 2 if critical |
| 5 | Chainlit Legacy Removal | CLEAN-01..06 | — | Independent, ships before Phase 4 if tight |
| 4 | Conversation Persistence | PERS-01..04 | Phase 1 | **Drop first** if scope tightens |

## Phase 1: Empty Message Bug Fix + Parts Contract

**The blocker.** Core Value cannot be met until this ships. Every other phase produces zero user value if this hasn't landed.

**Goal:** 프로덕션(`frontend-phi-six-16.vercel.app`)에서 법령 질문이 빈 카드가 아니라 실제 답변 텍스트로 렌더링되고, AI SDK 6의 공식 `UIMessage.parts` 계약 위에 재사용 가능한 parts 모듈이 마련된다.

**Requirements covered**
- CHAT-01 ~ CHAT-09 (9개)
- COMPAT-01 ~ COMPAT-03 (3개)

**Success Criteria**:
1. 프로덕션에서 "근로기준법 제60조 연차휴가" 질문 시 답변 텍스트가 렌더링됨 (빈 카드 아님)
2. 수정 전후 `console.log(messages[i].parts)` 진단 로그로 파트 구성 변화가 커밋 메시지에 기록됨
3. `route.ts`에 `stopWhen: stepCountIs(8)`, `onFinish`/`onError`에서 MCP close, `consumeSseStream` + `onError` 콜백 적용
4. 새 `lib/ui-message-parts.ts` 모듈에 `extractAssistantText` + 공식 type guard re-export 존재
5. 새 `MessagePartRenderer` 컴포넌트가 `text` + `dynamic-tool` 최소 두 타입을 분기 처리 (나머지는 stub)
6. `chat-container.tsx` / `test-sidebar/page.tsx` 양쪽의 inline `getMessageText` 제거
7. 기존 localStorage 대화가 refactor 후에도 빈 카드 없이 렌더링됨 (read-time migration)
8. Phase 1 종료 시 `finishReason: "stop"` (not `"tool-calls"`) 서버 로그로 확인

**Depends on:** —

**Key risks**
- Next.js 16 App Router의 Route Handler + streaming 조합에서 `consumeSseStream` 위치를 잘못 두면 응답이 완료되지 못할 수 있음 → AI SDK 6 공식 troubleshooting 페이지 참조
- `useChat({id})`가 `initialMessages`를 reseed하지 않는 이슈는 Phase 1 스코프 아님 — Phase 4에서 처리. Phase 1은 **새로 보낸 메시지가 제대로 렌더링되는 것**까지가 goal.

**Estimated effort**
소형 (서버 15~30줄 + 클라이언트 모듈 2~3개 신설). 단일 커밋 또는 밀접하게 묶인 두세 커밋.

---

## Phase 2: Streaming Stability & Error UX

Phase 1 이후 서버 에러/타임아웃/재시도 경로를 정비. 같은 `route.ts`를 건드리므로 Phase 1과 병합 충돌 방지 차원에서도 순차.

**Goal:** 스트림 주변의 모든 실패 모드(타임아웃, MCP 혼잡, MCP 다운, Gemini 멀티턴 thought_signature, 일상 인사에서의 강제 툴 호출)가 사용자에게 명확하게 드러나고, 필요한 경우 재시도 가능하며, 내부 자원은 정리된다.

**Requirements covered**
- STRE-01 ~ STRE-09 (9개)

**Success Criteria**:
1. `createMCPClient`가 5초 내 연결 안 되면 degraded mode로 fallback (도구 없이 진행)
2. MCP `tools()` 스키마가 모듈 스코프에서 캐시됨 — 로컬 PoC로 Vercel warm-container 재사용 확인
3. 에러 배너가 실패한 assistant bubble 내부에 inline 렌더링
4. 3가지 실패 모드에 대한 구분된 한국어 메시지 노출
5. 실패 턴에 "다시 시도" 버튼 (regenerate 호출)
6. 트랜지언트 503 시 1회 자동 재시도 적용
7. 시스템 프롬프트 완화 (일상 인사에 툴 호출 금지)
8. Gemini 멀티턴 smoke test (3연속 툴 쿼리) 통과 또는 `thinkingBudget: 0` 적용
9. `maxDuration` 값 결정 + PROJECT.md 업데이트 (60s 유지 근거 또는 300s 상향 근거)

**Depends on:** Phase 1 (route.ts 구조)

**Estimated effort**
중형. `route.ts` 정비 + `ChatContainer` 에러 UI + `tool-labels.ts`는 건너뛰고 단순 텍스트 매칭으로 분기.

**Research flag**: Vercel warm-container 동작 확인이 필요. 10줄 PoC로 Phase 2 착수 전에 확인.

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — route.ts MCP 타임아웃 + tools 캐시 + 구조화 에러 JSON + 503 재시도 + SYSTEM_PROMPT 일상 인사 예외 (Wave 1)
- [x] 02-02-PLAN.md — error-messages.ts 신설 + ChatMessage 인라인 배너 + MessagePartRenderer pass-through + chat-container 에러 라우팅 (Wave 2)
- [x] 02-03-PLAN.md — Vercel UAT (D-04 warm-container PoC, D-13 Gemini smoke, D-14 인사 smoke) + PoC 로그 정리 + PROJECT.md D-12 + VERIFICATION.md 신설 (Wave 3, checkpoint)

---

## Phase 3: Tool Call UI Feedback

Parts contract가 실제 데이터를 품고 있다는 전제 위에 UI 개선.

**Goal:** 사용자가 "어떤 법령을 찾고 있는지" 실시간으로 알 수 있고, 툴 호출 이력이 접히는 세부 블록에서 확인 가능한 상태.

**Requirements covered**
- TOOL-01 ~ TOOL-06 (6개)

**Success Criteria**:
1. `ToolInvocationView`가 `DynamicToolUIPart`의 4가지 상태를 모두 분기 처리
2. `tool-labels.ts` 맵이 4개 MCP 도구를 한국어로 매핑
3. 동사 시제 상태 chip ("법령 검색 중: 근로기준법" → "검색 완료: 근로기준법")
4. `<details>` 기반 접힘 블록, 기본 접힘 상태
5. 여러 도구 호출이 세로 체크리스트로 스택됨
6. 정적 "검색 중..." 문자열 제거됨

**Depends on:** Phase 1 (parts 계약), Phase 2 (에러 상태 공존)

**Estimated effort**
중형. 순수 프런트엔드 작업. 기존 chat bubble 컴포넌트 재활용 가능.

---

## Phase 5: Chainlit Legacy Removal

독립적 작업. 다른 phase의 실행 결과에 영향받지 않음. 우선순위상 Phase 4보다 먼저 나감.

**Goal:** Chainlit 관련 코드/의존성/설정이 레포에서 완전히 사라지고, Slack 봇 경로는 여전히 정상 동작.

**Requirements covered**
- CLEAN-01 ~ CLEAN-06 (6개)

**Success Criteria**:
1. `app.py`, `.chainlit/`, 관련 진입점 파일 모두 삭제
2. `requirements.txt`에서 `chainlit` 제거 (Slack 봇 의존성은 유지)
3. `Dockerfile` Chainlit 참조 제거 또는 Slack 봇 전용으로 재작성
4. `frontend/src/app/test-sidebar/` 삭제
5. `.env.example`에서 `CHAINLIT_AUTH_SECRET` 제거
6. 수정 후 `python main.py` 수동 기동 테스트 — Slack 봇이 이벤트를 여전히 수신함

**Depends on:** — (언제든 병렬로 진행 가능)

**Estimated effort**
소형. 대부분 파일 삭제 + requirements.txt 편집 + 스모크 테스트.

---

## Phase 4: Conversation Persistence Stabilization

**Drop-first candidate.** 스코프 타이트 시 가장 먼저 포기. Phase 1의 COMPAT가 safety floor이므로 드롭해도 프로덕션 regression은 없음.

**Goal:** localStorage에 full `UIMessage[]`를 저장하고, 사이드바에서 과거 대화 선택 시 과거 assistant 턴이 (텍스트 + 도구 호출 트레이스 모두) 정상 렌더링된다.

**Requirements covered**
- PERS-01 ~ PERS-04 (4개)

**Success Criteria**:
1. localStorage에 `{id, role, parts, metadata}` 구조로 저장됨 (flat string 제거)
2. 저장 시 text part의 `providerExecuted` 제거, tool part의 `providerMetadata`는 보존
3. 사이드바에서 과거 대화 선택 시 `useChat({id, messages: restored})` reseed 정상
4. 과거 assistant 턴의 툴 호출 트레이스가 재렌더링됨
5. 저장은 `status !== 'streaming'` 상태에서만 발동 (atomicity)

**Depends on:** Phase 1 (parts 계약)

**Estimated effort**
중~대형. `useChat` reseed API의 정확한 형태는 LOW confidence → 착수 전 research 필요.

**Research flag**: `/gsd-research-phase 4` 권장. `ChatInit.messages` API와 convertToModelMessages 라운드트립 버그(#8061, #9731) 검증.

**Drop criteria:** 수요일 (Day 3) 오후까지 Phase 1~3이 green이 아니면 Phase 4 전체 포기, Phase 5만 마저 진행.

---

## Execution Timeline (1-week)

| Day | Target |
|-----|--------|
| Day 1 (Mon) | Phase 1 diagnosis log → fix commit → deploy → 프로덕션 수동 검증 |
| Day 2 (Tue) | Phase 2 에러 UX + MCP 캐싱 + 프롬프트 소프트닝 |
| Day 3 (Wed) | Phase 3 도구 호출 UI (상태 chip + Korean labels) |
| Day 3 오후 | **Checkpoint**: Phase 4 drop 결정. Phase 5 착수 (병렬로 가능). |
| Day 4 (Thu) | Phase 4 (if kept) OR Phase 5 마무리 + 사내 배포 준비 |
| Day 5 (Fri) | 내부 smoke test + 사내 공개 |

## Milestone Exit Criteria

- [ ] 프로덕션 URL에서 법령 질의가 빈 카드 없이 답변 렌더링됨
- [ ] 세 가지 실패 모드에 대해 한국어 에러 메시지가 사용자에게 명확히 전달됨
- [ ] 도구 호출 진행 상태가 정적 "검색 중..." 이상의 피드백으로 노출됨
- [ ] Chainlit 흔적이 레포에 없음 (grep 기준 0개)
- [ ] Slack 봇 경로가 여전히 동작함 (수동 `python main.py` 기동 테스트)
- [ ] 기존 localStorage 대화가 업데이트 후에도 읽힘
- [ ] README 또는 CLAUDE.md에 사내 배포 URL + 알려진 제약 사항 기록 (v1은 단일 사용자용, v2 로드맵 참조)

---
*Roadmap created: 2026-04-13*
*Last updated: 2026-04-13 after format normalization for gsd-tools parser*
