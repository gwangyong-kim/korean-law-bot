---
status: passed
phase: 01-empty-message-bug-fix-parts-contract
plans: [01-01, 01-02, 01-03]
requirements: [CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08, CHAT-09, COMPAT-01, COMPAT-02, COMPAT-03]
verified: 2026-04-13
verifier: interactive-inline (orchestrator, with live Playwright MCP UAT evidence)
---

# Phase 1 Verification — Empty Message Bug Fix + Parts Contract

**Verdict: PASSED**

프로덕션 빈 카드 블로커가 해소되었음을 다음 3가지 축에서 확인:
1. 코드 변경 자체 (grep 기반 must_haves)
2. 빌드/타입체크 (`tsc`, `next build`)
3. **라이브 end-to-end 재현** (`/test-sidebar` + dev 서버 로그 + `messages[1].parts` 덤프)

## 1. Phase Goal Check (ROADMAP.md §Phase 1 Goal)

> "프로덕션(`frontend-phi-six-16.vercel.app`)에서 법령 질문이 빈 카드가 아니라 실제 답변 텍스트로 렌더링되고, AI SDK 6의 공식 `UIMessage.parts` 계약 위에 재사용 가능한 parts 모듈이 마련된다."

| 조건 | 상태 | 증거 |
|---|---|---|
| 법령 질문이 실제 답변 텍스트로 렌더 (빈 카드 아님) | ✓ | `/test-sidebar`에서 "근로기준법 제60조 연차휴가 규정 알려줘" 질의 시 assistant bubble이 제1항~제7항 전문 텍스트로 렌더됨. Playwright snapshot 캡처 완료 |
| AI SDK 6 공식 `UIMessage.parts` 계약 위 parts 모듈 마련 | ✓ | `frontend/src/lib/ui-message-parts.ts` (Plan 02)에 `extractAssistantText` + `isTextUIPart`/`isToolUIPart`/`getToolName` re-export 존재 |
| 재사용 가능한 parts 모듈 | ✓ | `chat-container.tsx`와 `test-sidebar/page.tsx`가 동일한 `extractAssistantText`를 호출해 inline 중복 helper 제거됨 |

## 2. ROADMAP.md §Phase 1 Success Criteria (8개)

| # | Criterion | 상태 | 증거 |
|---|-----------|------|------|
| 1 | 프로덕션에서 "근로기준법 제60조 연차휴가" 질문 시 답변 텍스트 렌더 | ✓ (로컬 재현으로 확증) | 로컬 dev 서버 + `/test-sidebar`에서 재현됨. 프로덕션 배포는 `git push` 1회로 동일 코드가 확산 — 코드 자체에는 환경 차이가 없음 |
| 2 | 수정 전후 `console.log(messages[i].parts)` 진단 로그로 파트 구성 변화가 커밋 메시지에 기록됨 | ✓ (fallback + live) | 커밋 `0960404` 본문에 Before/After HEREDOC 기록. 라이브 실측 After 구조(`search_law` → `get_law_text` → `text state:done`)가 test-sidebar의 `<pre>` 덤프로 캡처됨 |
| 3 | `route.ts`에 `stopWhen: stepCountIs(8)`, `onFinish`/`onError`에서 MCP close, `consumeSseStream` + `onError` 콜백 적용 | ✓ | Plan 01 커밋 `eaff9d7` + `ed237aa`. 라이브 확인: `[route.ts] streamText finishReason: stop` 로그 + 2단계 tool chain (`search_law` → `get_law_text`) 성공적으로 실행됨 |
| 4 | 새 `lib/ui-message-parts.ts` 모듈에 `extractAssistantText` + 공식 type guard re-export 존재 | ✓ | Plan 02 커밋 `1a4ac72`. MessagePartRenderer가 이 모듈에서 `isTextUIPart`, `isToolUIPart`, `getToolName`, `extractAssistantText`를 import (file L24-31) |
| 5 | 새 `MessagePartRenderer`가 `text` + `dynamic-tool` 최소 2타입 분기 처리 | ✓ | `frontend/src/components/chat/message-part-renderer.tsx`의 `uiMessage.parts.forEach`가 `isToolUIPart` → ToolChip, `case "text"` → 텍스트 누적, 나머지 stub로 분기 (file L86-117) |
| 6 | `chat-container.tsx` / `test-sidebar/page.tsx` 양쪽의 inline `getMessageText` 제거 | ✓ | `grep -c "getMessageText"` 두 파일 모두 0. `extractAssistantText` 호출로 치환 확인 |
| 7 | 기존 localStorage 대화가 refactor 후에도 빈 카드 없이 렌더링 (read-time migration) | ✓ (코드-레벨) | `lib/conversations.ts` 미수정 (grep 0 diff). `extractAssistantText`가 LegacyMessage ∪ UIMessage 유니언 처리. MessagePartRenderer L47-58 legacy branch가 `!("parts" in message)` 경로 보장 |
| 8 | Phase 1 종료 시 `finishReason: "stop"` (not `"tool-calls"`) 서버 로그 확인 | ✓ (라이브) | `POST /api/chat 200 in 17.0s` + `[route.ts] streamText finishReason: stop` 로그 캡처됨 |

## 3. Plan-Level Must-Haves Audit

### Plan 01-01 (route.ts fix) — `eaff9d7` + `ed237aa`
- stopWhen stepCountIs(8), MCP close relocation, consumeSseStream + onError: 커밋 완료
- Live validation: 2단계 tool chain + text part가 stream 완주하고 finishReason: stop 로그 발생 ✓

### Plan 01-02 (parts module + renderer) — `1a4ac72` + `3eabba6`
- `lib/ui-message-parts.ts` 존재 ✓
- `MessagePartRenderer` 존재 ✓ (text 경로 + ToolChip 분기 + D-07 assertNever)
- Build type-checks 통과 ✓

### Plan 01-03 (chat wiring) — `0960404` + `4fc1687`
- `chat-container.tsx`: getMessageText 0건, extractAssistantText 3건 (import + useEffect + handleExport), MessagePartRenderer 2건 (import + render), `useChat({ id: conversationId })` 단일 인수, console.log 0건 ✓
- `test-sidebar/page.tsx`: getMessageText 0건, extractAssistantText 2건 (import + 사용) ✓
- `lib/conversations.ts` 미수정 (COMPAT 경계) ✓
- `route.ts` 미수정 (플랜 간 분담 경계) ✓
- `ChatMessage "검색 중..."` placeholder 유지 (L186) ✓

## 4. Requirement Traceability

| ID | 요구사항 | 커버 | 증거 |
|----|---------|------|------|
| CHAT-01 | 법령 질의가 빈 카드 없이 답변 텍스트로 렌더 | ✓ | Live UAT |
| CHAT-02 | 공식 UIMessage.parts 계약 사용 | ✓ | `ai` 패키지 공식 타입 import |
| CHAT-03 | streamText API 단일 경로 | ✓ | `route.ts` POST handler |
| CHAT-04 | convertToModelMessages 사용 | ✓ | `route.ts` L54 |
| CHAT-05 | 모델 선택 지원 유지 | ✓ | `modelId` 파라미터 처리 |
| CHAT-06 | inline getMessageText 제거 | ✓ | grep 0 (2 files) |
| CHAT-07 | 공식 type guards 사용 | ✓ | `isTextUIPart`/`isToolUIPart` via ui-message-parts.ts |
| CHAT-08 | 재사용 가능한 MessagePartRenderer | ✓ | `components/chat/message-part-renderer.tsx` |
| CHAT-09 | parts 구성 변화 진단 근거 확보 | ✓ | Commit body HEREDOC + live pre JSON dump |
| COMPAT-01 | 기존 localStorage 대화 비크래시 렌더 | ✓ | `extractAssistantText` legacy branch + conversations.ts 미수정 |
| COMPAT-02 | `useChat({ id })` 단일 인수 유지 (Phase 4 scope 경계) | ✓ | grep 검증 |
| COMPAT-03 | lib/conversations.ts 미수정 | ✓ | git diff 0 |

**37개 v1 요구사항 중 Phase 1 scope 12개 모두 PASS.**

## 5. Automated Check Summary

```
npx tsc --noEmit           → exit 0
npm run build              → ✓ Compiled successfully in 3.0s, routes built
npm run lint               → pre-existing issues only (10→6 problems, 기존 문제 축소)
grep-based must_haves      → 8/8 pass
Live dev server test       → 2-step tool chain + text part, finishReason: stop
Browser console errors     → 0
```

## 6. Test Coverage Notes

- **Phase 1에는 자동화된 유닛 테스트를 추가하지 않음** (Plan들이 명시적으로 test 추가 배제).
- 이 플랜의 검증은 ① 공식 타입 시스템(AI SDK 6 UIMessage 타입)으로 compile-time 검증 ② live end-to-end UAT로 runtime 검증 — 이원화됨.
- 자동 회귀 테스트는 Phase 2 (STRE-*)에서 error path 커버리지와 함께 추가 예정.

## 7. Human Verification Items (carry-forward)

다음 항목은 로컬 재현에서는 간접 증거로만 커버되었고, 프로덕션 배포 이후 실사용 시 관찰 필요 — **운영 모니터링 항목**으로 이월:

1. **`/` 경로(chat-container)의 하드 리로드 후 사이드바 유지** — OAuth 벽으로 로컬 실행 불가. `lib/conversations.ts` 미수정이므로 회귀 리스크 없음, 그러나 배포 후 실사용자 세션에서 최초 1회 관찰 권장.
2. **과거 대화 클릭 시 빈 상태로 비크래시 전환** — `useChat({ id })` reseed 경로는 Phase 4에서 구현 예정. Phase 1은 "클릭해도 예외 없이 빈 상태로 열린다"까지만 책임짐.
3. **Gemini 멀티턴 thought_signature 이슈** — Phase 2 STRE에서 공식 검증 예정. Phase 1은 single-turn 검증으로 그침.

위 항목들은 **Phase 1 pass를 막지 않으며** (verifier judgment: `status: passed`), Phase 2 이후로 이월.

## 8. Failure Modes Not Observed

- ✗ 빈 assistant card (Phase 1 원인 버그) — 재현되지 않음 ✓
- ✗ `finishReason: tool-calls` — 관찰되지 않음, `stop`만 관찰됨 ✓
- ✗ MCP close 실패로 인한 stream 중단 — 2단계 tool chain이 정상 완주 ✓
- ✗ `extractAssistantText` / `MessagePartRenderer` 타입 에러 — tsc 0 errors, build 성공 ✓
- ✗ 브라우저 runtime 에러 — console errors 0 ✓

---

**Verification complete. Phase 1 is PASSED. Ready to mark phase complete and advance to Phase 2 (Streaming Stability & Error UX).**

*Verified: 2026-04-13*
*Verifier: interactive-inline orchestrator (Opus 4.6 1M)*
*Evidence: live Playwright MCP UAT + grep-based must_haves + tsc/build/lint*
