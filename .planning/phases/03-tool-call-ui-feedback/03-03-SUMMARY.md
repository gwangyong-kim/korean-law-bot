---
phase: 03-tool-call-ui-feedback
plan: 03
name: skeleton-bubble-and-placeholder-removal
subsystem: components/chat + app
tags: [skeleton-bubble, placeholder-removal, test-sidebar, d-10, d-11, tool-06]
status: complete
completed: "2026-04-13"
task_commits:
  - hash: 0c43613
    subject: "feat(03-03): skeleton bubble + 검색중 제거 + test-sidebar MessagePartRenderer"
dependency_graph:
  requires:
    - 03-02-tool-invocation-view-and-renderer-layout (ddf89e4 — MessagePartRenderer 가 ToolInvocationView 로 소비되고 있어야 test-sidebar 업그레이드가 의미를 가짐)
    - 02-02-client-error-ux-inline-retry (chat-container.tsx 의 parsedError / handleRetry / attachedError 파이프라인 무손상 유지)
  provides:
    - "StreamingSkeletonBubble — 3-bar shadcn Skeleton + Scale avatar mirror + aria-busy/aria-live (D-10/D-11)"
    - "chat-container.tsx 에서 정적 '검색 중...' 문자열 0건 (D-10)"
    - "test-sidebar/page.tsx — /test-sidebar 에서 MessagePartRenderer 기반 chip UI 육안 검증 가능 (OAuth 우회 로컬 UAT 경로)"
  affects:
    - "frontend/src/components/chat/streaming-skeleton-bubble.tsx (신규)"
    - "frontend/src/components/chat/chat-container.tsx (+2 line import, +1 line / -2 line 블록 교체)"
    - "frontend/src/app/test-sidebar/page.tsx (+8 line / -2 line)"
tech_stack:
  added: []
  patterns:
    - "shadcn Skeleton reuse for placeholder skeletons — 디자인 시스템 단일 출처"
    - "Avatar + bubble mirror — CLS 0 placeholder 대체"
    - "aria-busy + aria-live=polite for non-intrusive loading announcements"
    - "Unauthenticated local UAT 경로 — /test-sidebar 가 MessagePartRenderer 를 직접 소비"
key_files:
  created:
    - path: "frontend/src/components/chat/streaming-skeleton-bubble.tsx"
      lines: 46
      provides: "StreamingSkeletonBubble 컴포넌트 — 3-bar Skeleton inside rounded-2xl card with Scale avatar"
  modified:
    - path: "frontend/src/components/chat/chat-container.tsx"
      change: "352 → 353 lines (+1 net). import StreamingSkeletonBubble 추가 + `<ChatMessage content='검색 중...' />` 블록을 `<StreamingSkeletonBubble />` 로 교체. 나머지 파일 (isLoading, parsedError, handleRetry, attachedError, standalone error bubble, useChat single-arg) 무손상."
    - path: "frontend/src/app/test-sidebar/page.tsx"
      change: "57 → 64 lines (+7 net). extractAssistantText import → MessagePartRenderer import 교체; messages.map 블록이 <MessagePartRenderer message={m} /> 호출로 변경 + Phase 5 CLEAN-04 deferral 코멘트 추가. <pre>{JSON.stringify(messages)}</pre> debug dump 유지."
decisions:
  - "StreamingSkeletonBubble 은 @/components/ui/skeleton 의 shadcn Skeleton 을 재사용 — animate-pulse + bg-muted + rounded-md 디자인 토큰을 통일. 3-bar 폭은 w-3/4 / w-full / w-5/6 으로 CONTEXT D-11 default 따름."
  - "Avatar / bubble 레이아웃을 chat-message.tsx 와 완전히 동일하게 mirror (h-8 w-8 rounded-full, max-w-[75%], rounded-2xl px-4 py-3). 실제 assistant 메시지가 도착해 skeleton 이 사라질 때 CLS (Cumulative Layout Shift) 0."
  - "Approach 1 유지 (RESEARCH §5): predicate `isLoading && messages[messages.length - 1]?.role === 'user'` 그대로. 첫 assistant part 가 도착하면 role 이 assistant 로 바뀌어 skeleton 이 자동 사라지고 ToolInvocationView chip + ChatMessage text 로 전환."
  - "aria-busy='true' + aria-live='polite' — screen reader 가 'loading' 을 non-intrusive 로 announce. 'assertive' 가 아니라 'polite' 를 선택해 announcement storm 방지."
  - "test-sidebar 업그레이드 결정: Plan 03-02 의 chip UI 는 OAuth 뒤의 production / 에서만 실제로 exercise 됨. 로컬 UAT 경로 확보 목적으로 /test-sidebar 를 MessagePartRenderer 로 rewire — Phase 5 CLEAN-04 에서 어차피 파일 전체 삭제 예정이지만 Phase 3/4 UAT 기간엔 가치 있음."
  - "chat-message.tsx 의 dead-code guard `content !== '검색 중...'` (L106) 는 본 plan 에서 정리하지 않음 — Option C 유지. Literal 이 unreachable 해졌을 뿐, guard 자체는 falsy check 와 동일 의미로 harmless. Phase 5 CLEAN-04 에서 test-sidebar 삭제와 함께 정리."
metrics:
  duration_minutes: 3
  task_count: 4
  files_changed: 3
  lines_added: 56
  lines_removed: 3
requirements_completed: [TOOL-06]
---

# Phase 03 Plan 03: skeleton-bubble-and-placeholder-removal Summary

**One-liner:** 정적 `"검색 중..."` placeholder 를 3-bar shadcn `StreamingSkeletonBubble` 로 교체하고 `/test-sidebar` 를 `MessagePartRenderer` 로 업그레이드해 Phase 3 chip UI 의 로컬 육안 검증 경로를 OAuth 없이 확보.

## What Changed

### Task 01: Create streaming-skeleton-bubble.tsx (46 lines) — `0c43613`

신규 React client component. 외부 props 없이 self-contained:

```tsx
<div className="group flex gap-3 py-4" aria-busy="true" aria-live="polite">
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
    <Scale className="h-4 w-4" />
  </div>
  <div className="flex max-w-[75%] flex-col gap-1">
    <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  </div>
</div>
```

**Layout mirror** (vs `chat-message.tsx` assistant variant):
- Avatar: `h-8 w-8 rounded-full bg-muted text-muted-foreground` + `<Scale className="h-4 w-4" />` — 완전 동일
- Bubble wrapper: `max-w-[75%] flex flex-col gap-1` → inner `rounded-2xl border border-border bg-card px-4 py-3` — 동일
- Outer flex: `group flex gap-3 py-4` — 동일

실제 ChatMessage 로 전환될 때 CLS 0 을 목표로 함.

**Accessibility:**
- `aria-busy="true"` — screen reader 에 "this region is busy" 전달
- `aria-live="polite"` — 'polite' 선택으로 announcement storm 방지 ('assertive' 는 다른 speech 를 interrupt 할 수 있음)

### Task 02: chat-container.tsx edit (3-line diff) — `0c43613`

**Change A** — import:
```typescript
import { MessagePartRenderer } from "./message-part-renderer";
import { StreamingSkeletonBubble } from "./streaming-skeleton-bubble";  // ← 추가
```

**Change B** — L219-221 placeholder block:
```typescript
// Before
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <ChatMessage role="assistant" content="검색 중..." />
)}

// After
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <StreamingSkeletonBubble />
)}
```

**Preserved (지침대로 전부 untouched):**
- `isLoading = status === "streaming" || "submitted"` at L60
- Standalone pre-stream error bubble at L227-235 (Phase 2 Q5 Option A)
- `useChat({ id: conversationId })` single-arg (PERS-03 boundary)
- `parsedError`, `handleRetry`, `attachedError`, `lastIsAssistant`, `regenerate`, `clearError`
- `handleSubmit`, `handleExport`, `handleModelChange`, `handleToggleFavorite`, `EXAMPLE_QUESTIONS`, `EmptyState`
- `ChatMessage` import (여전히 standalone error bubble 이 소비)
- `messages.map(...)` block with `attachedError` routing
- Phase 1 `extractAssistantText` usage (3x: 저장, export, handleRetry)

### Task 03: test-sidebar/page.tsx upgrade (+7 net) — `0c43613`

**Import replacement:**
```typescript
// Before
import { extractAssistantText } from "@/lib/ui-message-parts";

// After
import { MessagePartRenderer } from "@/components/chat/message-part-renderer";
```

**Render replacement:**
```tsx
// Before
{messages.map((m) => (
  <div key={m.id} style={{ marginBottom: 10 }}>
    <strong>{m.role}:</strong> {extractAssistantText(m)}
  </div>
))}

// After
{messages.map((m) => (
  <div key={m.id} style={{ marginBottom: 10 }}>
    {/* Phase 3 Plan 03-03: upgrade from plain text to full MessagePartRenderer
        dispatch. This route is unauthenticated, so it serves as the only local
        path for eyeballing Phase 3 chip UI without hitting the Google OAuth wall.
        Will be deleted in Phase 5 CLEAN-04 along with the rest of this file. */}
    <MessagePartRenderer message={m} />
  </div>
))}
```

**Preserved:**
- `useChat()` no-arg call (chat-container 의 single-arg 와 다르지만 의도적)
- `<pre>{JSON.stringify(messages, null, 2)}</pre>` debug dump
- Input/send/status/error UI
- `{messages.length === 0 && <p>메시지 없음</p>}` empty state
- `"Chat Test (인증 없음)"` heading
- 모든 inline style props

### Task 04: validation + commit — `0c43613` (atomic)

`cd frontend && npx tsc --noEmit && npm run build` 둘 다 exit 0. `git diff HEAD` 가 out-of-scope 파일에서 0 lines (chat-message.tsx / message-part-renderer.tsx / tool-invocation-view.tsx / tool-labels.ts / ui-message-parts.ts / conversations.ts / route.ts / error-messages.ts).

## Key Decisions

1. **shadcn Skeleton reuse** — `@/components/ui/skeleton` 가 이미 존재 (`animate-pulse rounded-md bg-muted`). 새 skeleton 라이브러리 도입 금지, 디자인 토큰 단일 출처.
2. **Avatar + bubble mirror** — 레이아웃이 chat-message.tsx 와 정확히 일치해야 실제 message 전환 시 CLS 0. `h-8 w-8`, `max-w-[75%]`, `rounded-2xl px-4 py-3` 모두 grep evidence 로 검증.
3. **Predicate Approach 1 유지** — `isLoading && lastRole === 'user'`. 첫 assistant part 도착 시 role 이 자동으로 바뀌어 skeleton 이 사라짐. 별도 useEffect 나 setState 불필요.
4. **3-bar default** — CONTEXT D-11 "3줄 기본" 따름. Claude 재량으로 2-4 허용이지만 3 이 Phase 3 표준.
5. **aria-live="polite"** — assertive 대신 polite 선택. 사용자 메시지 입력 후 skeleton 출현은 1회성이므로 storm 위험은 낮지만 polite 가 기본 safer.
6. **test-sidebar 업그레이드** — Phase 5 CLEAN-04 에서 파일 삭제 예정이지만 Phase 3/4 UAT 기간에는 OAuth 우회 경로로서 가치 있음. Plan 03-04 VERIFICATION 의 manual UAT 섹션이 이 경로를 활용.
7. **Dead-code guard 유지** — `chat-message.tsx` L106 의 `content !== "검색 중..."` check 는 literal 이 unreachable 해져도 harmless (falsy check 와 동등). Option C 보존이 우선. Phase 5 CLEAN-04 에서 test-sidebar 삭제와 함께 정리.

## Patterns Established

- **CLS-safe placeholder replacement** — skeleton 이 실제 message 와 정확히 같은 outer layout 을 가지면 전환 시 layout shift 0.
- **Single unauthenticated local UAT route** — `/test-sidebar` 가 production dispatcher 를 직접 사용. Phase 5 삭제 전까지 모든 chip UI 변경의 첫 검증 지점.

## Verification Evidence

```bash
# D-10: 검색 중 removed from renderable paths
grep -c '검색 중' frontend/src/components/chat/chat-container.tsx
# 0
grep -c '검색 중' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 0
grep -c '검색 중' frontend/src/app/test-sidebar/page.tsx
# 0

# D-11: StreamingSkeletonBubble wired
grep -c 'StreamingSkeletonBubble' frontend/src/components/chat/chat-container.tsx
# 2 (import + JSX use)
grep -c 'aria-busy\|aria-live' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 2

# Layout mirror
grep -c 'h-8 w-8' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 1
grep -c 'max-w-\[75%\]' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 1
grep -c 'rounded-2xl' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 1

# 3 skeleton bars
grep -c 'Skeleton className' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 3
grep -c 'w-3/4\|w-full\|w-5/6' frontend/src/components/chat/streaming-skeleton-bubble.tsx
# 3

# Predicate preserved
grep -c 'isLoading && messages\[messages.length - 1\]?.role === "user"' frontend/src/components/chat/chat-container.tsx
# 1

# Phase 2 boundaries preserved
grep -c 'useChat({ id: conversationId })' frontend/src/components/chat/chat-container.tsx
# 1
grep -c 'parseChatError\|parsedError\|handleRetry\|attachedError' frontend/src/components/chat/chat-container.tsx
# 12+ (all intact)

# test-sidebar upgrade
grep -c 'MessagePartRenderer' frontend/src/app/test-sidebar/page.tsx
# 2 (import + JSX)
grep -c 'extractAssistantText' frontend/src/app/test-sidebar/page.tsx
# 0 (removed)
grep -c 'JSON.stringify(messages' frontend/src/app/test-sidebar/page.tsx
# 1 (debug dump kept)

# Out-of-scope untouched
git diff HEAD -- frontend/src/components/chat/chat-message.tsx | wc -l  # 0
git diff HEAD -- frontend/src/components/chat/message-part-renderer.tsx | wc -l  # 0
git diff HEAD -- frontend/src/components/chat/tool-invocation-view.tsx | wc -l  # 0
git diff HEAD -- frontend/src/lib/tool-labels.ts | wc -l  # 0
git diff HEAD -- frontend/src/lib/conversations.ts | wc -l  # 0
git diff HEAD -- frontend/src/app/api/chat/route.ts | wc -l  # 0

# Build
cd frontend && npx tsc --noEmit && npm run build
# exit 0
```

## Threat Flags

- **T-03-01 inherited** — Plan 03-01 의 serializeInput mitigation 은 /test-sidebar 경로에서도 동일하게 작동. test-sidebar 노출이 공격 표면을 넓히지 않음.
- **T-03-07 / T-03-08 accepted** — /api/chat 의 NextAuth middleware gating 은 test-sidebar 에서 호출해도 동일하게 작동. 401 return 으로 unauthenticated invocation 방지.
- **T-03-10 transferred** — /test-sidebar 자체의 public 노출은 Phase 5 CLEAN-04 에서 파일 삭제로 제거.

## Performance

- **Duration:** ~3 minutes
- **Tasks:** 4 (Task 01 skeleton, Task 02 chat-container, Task 03 test-sidebar, Task 04 validation + commit)
- **Lines added:** 56
- **Lines removed:** 3
- **Files changed:** 3 (1 new, 2 modified)
- **Commit:** 1 atomic — `0c43613`
- **Out-of-scope diff:** 0 across all 8 guarded files

## Next Phase Readiness

Phase 3 code surface is complete. Plan 03-04 can now write VERIFICATION.md and update PROJECT.md without any further code changes. Runtime UAT on /test-sidebar is available at any time via `cd frontend && npm run dev` → `http://localhost:3000/test-sidebar`.

## Self-Check: PASSED

- [x] `streaming-skeleton-bubble.tsx` exists (46 lines)
- [x] `chat-container.tsx` has 0 `검색 중` occurrences
- [x] `test-sidebar/page.tsx` uses MessagePartRenderer
- [x] `0c43613` commit in git log
- [x] tsc + build green
- [x] Phase 2 boundaries preserved (parsedError, handleRetry, attachedError, useChat single-arg)
- [x] 8 out-of-scope files have 0 diff
- [x] Atomic commit (3 files in one commit)
