# Phase 1: Empty Message Bug Fix + Parts Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 01-empty-message-bug-fix-parts-contract
**Areas discussed:** A. Migration strategy, B. MessagePartRenderer structure, C. Diagnostic logging and verification gate, D. Commit composition and scope boundary
**Mode:** Interactive (discuss inline, plan+execute in background via autonomous --interactive)

---

## A. Migration Strategy (COMPAT)

### Q1: COMPAT-02: 마이그레이션 로직을 어디에 두는 게 맞을까요?

| Option | Description | Selected |
|--------|-------------|----------|
| extractAssistantText 내부에서 변환 | 읽기 시점에 parts 없음 + content만 있으면 `[{type:'text', text:content, state:'done'}]` wrap. single source of truth + conversations.ts가 AI SDK 타입 몰라도 됨 | ✓ |
| lib/conversations.ts loadAll에서 변환 | localStorage JSON.parse 직후 flat 감지. 저장소 경계에서 한 번만. conversations.ts가 AI SDK parts 타입 알아야 함 | |
| 두 곳 모두 (방어적) | conversations.ts 1차 + extractAssistantText 2차 fallback. 중복, single source of truth 원칙 위배 | |

**User's choice:** extractAssistantText 내부에서 변환
**Rationale:** CHAT-05가 명시한 single source of truth 원칙과 일치. conversations.ts를 AI SDK 타입에 묶지 않음.

### Q2: 옛 포맷 감지 기준은?

| Option | Description | Selected |
|--------|-------------|----------|
| parts 부재 + content 존재 | `msg.parts === undefined && typeof msg.content === 'string'`. 명확하고 false positive 없음 | ✓ |
| content가 string인지만 체크 | `typeof content === 'string'`만. 간단하지만 parts 유무 무시 | |

**User's choice:** parts 부재 + content 존재

### Q3: 변환 실패 시 fallback?

| Option | Description | Selected |
|--------|-------------|----------|
| 빈 문자열 반환 + console.warn | 안전하게 ""를 반환하고 경고만 남김. UI는 빈 카드 없이 연속 흐름 보존 | ✓ |
| 원본 보존 | 예외 발생 시 원본 content 문자열 그대로 노출. 타입 안전성 약화 | |
| throw | 예만 발생. 대화 사이드바가 깨지는 위험 | |

**User's choice:** 빈 문자열 반환 + console.warn

### Q4: 마이그레이션 이후 localStorage 재기록?

| Option | Description | Selected |
|--------|-------------|----------|
| 읽기 전용 변환만 | Phase 1은 읽을 때만 변환. 저장 구조는 Phase 4에서 정식 변경 | ✓ |
| 즉시 localStorage re-write | 첫 로드 시 parts 구조로 교체 저장. Phase 4 부담 줄지만 PERS 스코프 잠식 | |

**User's choice:** 읽기 전용 변환만
**Rationale:** Phase 1이 Phase 4 PERS 스코프를 잠식하지 않도록.

---

## B. MessagePartRenderer 구조

### Q1: stub 처리 대상(reasoning / file / source-url / step-start) 기본 렌더링?

| Option | Description | Selected |
|--------|-------------|----------|
| null 반환 (완전 숨김) | Phase 1은 text + dynamic-tool만 보이면 됨. UI 노이즈 0 | ✓ |
| dev-only 디버그 배지 | `NODE_ENV==='development'`일 때만 `[{type}]` 플레이스홀더 | |
| 회색 `<details>` 블록 | 펼치면 raw JSON. 정보 노출 과다할 수 있음 | |

**User's choice:** null 반환

### Q2: dynamic-tool 파트의 4가지 상태 중 Phase 1 범위는?

| Option | Description | Selected |
|--------|-------------|----------|
| 네 상태 모두 minimal 처리 | input-streaming/input-available/output-available/output-error 각각 단순 chip. Phase 3에서 고도화 | ✓ |
| 단일 chip만 렌더링 | Phase 1은 모든 tool 파트를 'tool call' chip 하나로. 상태 분기 전부 Phase 3 | |

**User's choice:** 네 상태 모두 minimal 처리

### Q3: switch 기본값(never-default) 처리?

| Option | Description | Selected |
|--------|-------------|----------|
| dev throw / prod console.error + null | 개발 중 실수는 즉시 드러나고 프로덕션은 로그만 | ✓ |
| 항상 console.warn + null | throw 없이 조용히 무시 | |
| TypeScript never assert만 | 런타임 처리 없음. 타입 빠져나간 경우 위험 | |

**User's choice:** dev throw / prod console.error + null

---

## C. Diagnostic Logging and Verification Gate

### Q1: 진단 로그 위치?

| Option | Description | Selected |
|--------|-------------|----------|
| 클라이언트 `onMessagesChange` 직전 | chat-container.tsx useEffect에서 messages.forEach. 브라우저 devtools에서 실제 세션 관찰 | ✓ |
| 서버 `onFinish` 콜백 | route.ts streamText onFinish에서 finishReason + 서버 상태 | |
| 양쪽 다 | 클라 + 서버 모두. 데이터 풍부하지만 노이즈 증가 | |

**User's choice:** 클라이언트 onMessagesChange 직전

### Q2: 진단 로그의 수명?

| Option | Description | Selected |
|--------|-------------|----------|
| 커밋 전 일시 삽입 → 확인 후 제거 | fix 전 로그 삽입 → before 확인 → fix 후 after 확인 → 로그 제거. 프로덕션 노이즈 0 | ✓ |
| commit된 상태로 남겨두고 Phase 2에서 제거 | Phase 1 결과를 프로덕션에서 진단 가능하게 유지 | |
| debug flag로 가드해서 영구 유지 | NEXT_PUBLIC_DEBUG_PARTS 같은 플래그로 가드 | |

**User's choice:** 커밋 전 일시 삽입 → 확인 후 제거

### Q3: before/after 기록 위치?

| Option | Description | Selected |
|--------|-------------|----------|
| 커밋 메시지 body | HEREDOC에 Before/After JSON 스니펫. git log에 영구 보존 | ✓ |
| 별도 PHASE1-DIAGNOSIS.md 문서 | .planning/phases/01-.../하위에 검증 논문 스타일 문서 | |

**User's choice:** 커밋 메시지 body

### Q4: 프로덕션 수동 검증 게이트?

| Option | Description | Selected |
|--------|-------------|----------|
| merge 전 필수 게이트 | CHAT-01 "근로기준법 제60조 연차휴가" 질문을 사용자가 직접 프로덕션에서 확인해야 통과. human-needed로 VERIFICATION 기록 | ✓ |
| merge 후 smoke test로 지연 | 일단 merge 후 즉시 검증. 롤백 키트 필요 | |

**User's choice:** merge 전 필수 게이트

---

## D. Commit Composition and Scope Boundary

### Q1: 커밋 분할 방식?

| Option | Description | Selected |
|--------|-------------|----------|
| 3개 순차 커밋 | (1) fix(api) server patches (2) feat(parts) module + renderer (3) refactor(chat) replace + COMPAT migration. git bisect 가능 | ✓ |
| 단일 atomic 커밋 | 모든 변경을 하나로. 롤백 간단하지만 사이즈 큼 | |
| 2개 커밋 (서버 + 클라이언트) | 서버 패치 / 클라이언트 변경 이분화 | |

**User's choice:** 3개 순차 커밋

### Q2: test-sidebar/page.tsx의 inline getMessageText 처리?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1에서 교체 | CHAT-06 명시적 요구: "chat-container.tsx / test-sidebar/page.tsx 양쪽의 inline getMessageText 제거". 일관성 | ✓ |
| Phase 5 삭제에 맡김 | 어차피 삭제될 파일 | |

**User's choice:** Phase 1에서 교체
**Rationale:** CHAT-06 문구와 충돌하지 않게 함. CLEAN-04는 디렉터리 삭제 자체만 담당.

### Q3: maxDuration 확미은?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 1에서는 건들지 않음 | STRE-09 (Phase 2) 스코프. 순수하게 buggy 서버 로직 수정만 | ✓ |
| Phase 1에서 함께 검토 | stopWhen을 높이면 step 시간이 늘 수 있으므로 함께 결정 | |

**User's choice:** Phase 1에서는 건들지 않음

---

## Claude's Discretion

- 3개 커밋 사이 세부 파일 정렬, import 순서, 빈 줄, 주석 위치
- `extractAssistantText`의 정확한 시그니처 및 내부 헬퍼 이름
- `MessagePartRenderer` props 이름, Tailwind 클래스
- 변환 실패 시 `console.warn` 메시지 문구
- dev / prod 분기에서 `process.env.NODE_ENV` 체크 방식

## Deferred Ideas (for future phases)

- `chat-container.tsx` 컴포넌트 분할 (CONCERNS.md tech debt)
- `test-sidebar/` 디렉터리 전체 삭제 (Phase 5 CLEAN-04)
- localStorage 저장 구조를 parts 기반으로 교체 (Phase 4 PERS-01)
- MCP 연결 타임아웃 / degraded mode / 에러 배너 (Phase 2 STRE-01~04)
- 시스템 프롬프트 완화 (Phase 2 STRE-07)
- dynamic-tool 한국어 라벨 / 시제 chip / details 접힘 UI (Phase 3 TOOL)
- maxDuration 결정 (Phase 2 STRE-09)
