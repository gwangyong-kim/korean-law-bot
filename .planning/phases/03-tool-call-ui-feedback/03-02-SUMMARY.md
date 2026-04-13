---
phase: 03-tool-call-ui-feedback
plan: 02
name: tool-invocation-view-and-renderer-layout
subsystem: components/chat
tags: [tool-chip, dynamic-tool-ui-part, lucide-react, details-block, option-c, d-07, d-08, d-09]
status: complete
completed: "2026-04-13"
task_commits:
  - hash: ddf89e4
    subject: "feat(03-02): ToolInvocationView + MessagePartRenderer 세로 체크리스트 (D-01..D-09)"
dependency_graph:
  requires:
    - 03-01-tool-labels-module (cec4efc — getToolLabel / getToolArgPreview / serializeInput)
    - 01-02-parts-module-and-renderer (ui-message-parts.ts getToolName re-export)
    - 02-02-client-error-ux-inline-retry (error/onRetry/isRetryDisabled prop pipeline 보존)
  provides:
    - "ToolInvocationView: 4 active DynamicToolUIPart states → state-colored chip + lucide icon + Korean label + tense + <details> block"
    - "MessagePartRenderer assistant return JSX 재배치: chip 블록이 ChatMessage 위에 flex-col 세로 체크리스트로 스택 (D-07/D-08/D-09)"
    - "End-to-end T-03-01 wiring: serializeInput(part.input) in <details> Request block, 0 raw JSON.stringify"
  affects:
    - "frontend/src/components/chat/tool-invocation-view.tsx (신규)"
    - "frontend/src/components/chat/message-part-renderer.tsx (rewire + JSX reorder + ToolChip 삭제)"
tech_stack:
  added:
    - "lucide-react icons: Loader2 (spinning) / Check / AlertCircle (import from lucide-react, already installed)"
  patterns:
    - "Option C — chat-message.tsx diff = 0; chip-above-text 레이아웃은 MessagePartRenderer return JSX 재배치로만 달성"
    - "Native <details> + Tailwind [&::-webkit-details-marker]:hidden — JS state 없이 cross-browser 접힘 토글"
    - "resolveVisual switch: 4 active states 명시 + 3 approval states neutral gray fallback (v2 경계)"
    - "State-conditional argument preview suppression — input-streaming 에서는 input 이 partial 이라 preview 생략"
key_files:
  created:
    - path: "frontend/src/components/chat/tool-invocation-view.tsx"
      lines: 197
      provides: "ToolInvocationView React client component"
  modified:
    - path: "frontend/src/components/chat/message-part-renderer.tsx"
      change: "210 → 177 lines (-33). ToolChip 42-line function 삭제 + unused imports 제거(DynamicToolUIPart/ToolUIPart/getToolName) + JSX reorder (flex-wrap gap-2 pb-2 → flex-col gap-1 pt-2, chip 블록이 ChatMessage 위로 이동) + file header comment 업데이트"
decisions:
  - "Option C 채택 (RESEARCH §4) — chat-message.tsx 는 Phase 3 전체에서 1줄도 수정하지 않음. Phase 2 의 error/onRetry/isRetryDisabled signature + (content || isUser) bubble wrapper guard 를 무손상 보존해 에러 UX 회귀 risk 0."
  - "JSX 재배치 rationale: CONTEXT D-07 (세로 체크리스트) + D-08 (chip 위 text 아래) + D-09 (그룹 상자 없음) 를 단일 `<div className='mx-auto max-w-3xl flex flex-col gap-1 pl-11 pt-2'>` 로 달성. 이전의 `flex-wrap gap-2 pl-11 pb-2` 는 가로 chip 래핑 + bottom padding 이었고 본 plan 에서 세로 stacking + top padding 으로 변경."
  - "Native <details> + group-open: 지시어로 ▶상세/▼숨기기 토글 — 별도 useState 없음. [&::-webkit-details-marker]:hidden + list-none 으로 기본 triangle marker 제거."
  - "7-state DynamicToolUIPart 중 4 active 만 switch 에서 명시 처리 (input-streaming, input-available, output-available, output-error), 3 approval states (approval-requested, approval-responded, output-denied) 는 default 로 fall through 해 neutral gray chip + raw state name 을 render. Phase 3 scope 는 active states 만, approval UX 는 v2."
  - "State-conditional details rendering: input-streaming 에서는 input 이 partial 이라 `showDetails = false` 로 details 블록 자체를 hide. 나머지 state 에서는 requestJson 이 빈 문자열이면 pre 블록 생략."
  - "RESPONSE_TRUNCATE_LIMIT = 2000 (D-05 그대로), truncateResponse 는 suffix 로 `\\n\\n... (truncated)` 추가."
  - "message-part-renderer.tsx 의 unused type imports 제거 (DynamicToolUIPart, ToolUIPart, getToolName) — 소비가 ToolInvocationView 로 넘어갔기 때문. `--noUnusedLocals` 체크 통과."
metrics:
  duration_minutes: 4
  task_count: 3
  files_changed: 2
  lines_added: 228
  lines_removed: 49
requirements_completed: [TOOL-01, TOOL-03, TOOL-04, TOOL-05]
---

# Phase 03 Plan 02: tool-invocation-view-and-renderer-layout Summary

**One-liner:** 신규 `ToolInvocationView` 컴포넌트로 4-state DynamicToolUIPart 를 state-colored chip + native `<details>` 블록으로 렌더하고, `MessagePartRenderer` 의 assistant JSX 를 재배치해 chip 블록이 ChatMessage 위에 세로 체크리스트로 스택 — `chat-message.tsx` 는 1줄도 수정하지 않음 (Option C).

## What Changed

### Task 01: Create tool-invocation-view.tsx (197 lines) — `ddf89e4`

**Public API:**
```typescript
interface ToolInvocationViewProps {
  part: ToolUIPart<UITools> | DynamicToolUIPart;
}
export function ToolInvocationView({ part }: ToolInvocationViewProps): JSX.Element;
```

**Chip rendering pipeline:**

1. `getToolName(part)` via `@/lib/ui-message-parts` (Phase 1 re-export)
2. `getToolLabel(toolName)` via `@/lib/tool-labels` (Plan 03-01) → Korean label 또는 raw name fallback
3. `getToolArgPreview(toolName, part.input)` → priority list 순회 + 20자 truncate
4. `resolveVisual(part.state)` → `{ Icon, tense, chipClass, spinning }`
5. `chipText = argPreview ? '${label} ${tense}: ${argPreview}' : '${label} ${tense}'` (colon 조건 제거)

**State → visual mapping (D-01/D-02/D-03):**

| State | Icon | Spinning | chipClass | tense |
|-------|------|----------|-----------|-------|
| `input-streaming` | Loader2 | ✓ | bg-muted text-muted-foreground | 중 |
| `input-available` | Loader2 | ✓ | bg-muted text-muted-foreground | 중 |
| `output-available` | Check | — | bg-success/10 text-success | 완료 |
| `output-error` | AlertCircle | — | bg-destructive/10 text-destructive | 실패 |
| *other (approval-*)* | Loader2 | — | bg-muted text-muted-foreground | `${state}` (raw) |

**`<details>` block (D-05/D-06):**

- Default-collapsed (no `open` attribute)
- `group-open:hidden` / `hidden group-open:inline` 으로 ▶상세/▼숨기기 토글
- `[&::-webkit-details-marker]:hidden` + `list-none` 으로 기본 marker 제거
- Request `<pre>` — `serializeInput(part.input)` 로 credential 키 redaction 후 pretty-print
- Response `<pre>` — `output-available` 는 serializeOutput(part.output), `output-error` 는 part.errorText
- `truncateResponse` 가 2000자 초과 시 `\n\n... (truncated)` suffix 추가

**Module-private helpers (non-exported):** `resolveVisual`, `serializeOutput`, `truncateResponse`, `VisualSpec`, `RESPONSE_TRUNCATE_LIMIT`.

### Task 02: Rewire message-part-renderer.tsx (210 → 177 lines, -33) — `ddf89e4`

**4 changes:**

1. **Import rewire:**
   - Added: `import { ToolInvocationView } from "./tool-invocation-view";`
   - Removed: `DynamicToolUIPart`, `ToolUIPart` from `"ai"` type imports
   - Removed: `getToolName` from `@/lib/ui-message-parts` (more no longer used here — ToolInvocationView 가 직접 호출)

2. **JSX usage replacement:** `<ToolChip key={...} part={part} />` → `<ToolInvocationView key={...} part={part} />` in the assistant forEach loop.

3. **ToolChip 함수 삭제:** 42-line function + JSDoc comment block 완전 삭제.

4. **Assistant return JSX 재배치 (D-07/D-08/D-09):**
   - **Before (Phase 1/2):**
     ```tsx
     <>
       {(textChunks.length > 0 || error) && <ChatMessage ... />}
       {nonTextNodes.length > 0 && (
         <div className="mx-auto max-w-3xl flex flex-wrap gap-2 pl-11 pb-2">
           {nonTextNodes}
         </div>
       )}
     </>
     ```
   - **After (Phase 3):**
     ```tsx
     <>
       {nonTextNodes.length > 0 && (
         <div className="mx-auto max-w-3xl flex flex-col gap-1 pl-11 pt-2">
           {nonTextNodes}
         </div>
       )}
       {(textChunks.length > 0 || error) && <ChatMessage ... />}
     </>
     ```
   - Chip 블록을 ChatMessage 위로 이동 (D-08)
   - `flex-wrap gap-2 pb-2` → `flex-col gap-1 pt-2` (D-07 세로 체크리스트, D-09 no group box)
   - Phase 2 `(textChunks.length > 0 || error)` 가드 + `error/onRetry/isRetryDisabled` prop pass-through 무손상

**Preserved:** legacy path, user role path, textChunks/nonTextNodes accumulator, `isTextUIPart` / `isToolUIPart` check, `assertNever` helper, exhaustive switch on part.type, data-* stub, `MessagePartRendererProps` interface 그대로.

## Key Decisions

1. **Option C (chat-message.tsx 0 diff)** — RESEARCH §4 권고 채택. Phase 2 의 error UX signature 를 건드리지 않는 가장 안전한 경로. Trade-off: MessagePartRenderer 가 layout 책임을 일부 떠안음 (원래 "dispatch only" 역할에서 "dispatch + parent layout coordinator" 로 확장). 대신 chat-message.tsx 는 pure presentational bubble 로 유지.
2. **Native `<details>` + Tailwind group-open 토글** — JS state (useState) 없음. `[&::-webkit-details-marker]:hidden` + `list-none` 이 Chrome/Safari/Firefox marker 모두 커버. cross-browser hazard 최소화.
3. **4 active states explicit, 3 approval states neutral fallback** — v2 scope 경계. approval-requested / approval-responded / output-denied 는 현재 실제로 발생하지 않지만 type-valid 라서 switch default 로 fall through. Raw state name 이 chip text 에 노출되어 devtools 에서 관찰 가능 (debug helpful).
4. **Input-streaming details 숨김** — `showDetails = part.state !== "input-streaming"`. input 이 partial 이라 JSON pretty-print 가 아직 의미 없음. Phase 3 v2 의 live input streaming preview (V2-TOOL-01) 때 이 분기를 재검토.
5. **unused import 제거** — `DynamicToolUIPart` / `ToolUIPart` 타입은 ToolInvocationView 로 이동, `getToolName` 도 그 쪽에서 직접 호출. MessagePartRenderer 는 `isToolUIPart` 검사만 남음.

## Phase 2 Error UX Preservation Evidence

```bash
grep -c '(textChunks.length > 0 || error)' frontend/src/components/chat/message-part-renderer.tsx
# 1 (보존)

grep -c 'error={error}' frontend/src/components/chat/message-part-renderer.tsx
# 2 (Legacy path + Assistant path, 둘 다 유지)

grep -c 'onRetry={onRetry}\|isRetryDisabled={isRetryDisabled}' frontend/src/components/chat/message-part-renderer.tsx
# 4 (2 props × 2 paths)

grep -c 'function assertNever' frontend/src/components/chat/message-part-renderer.tsx
# 1 (Phase 1 exhaustive safety net 보존)
```

## Option C Evidence

```bash
git diff HEAD~2 HEAD -- frontend/src/components/chat/chat-message.tsx | wc -l
# 0 (Plans 03-01 + 03-02 범위에서 chat-message.tsx 변경 0)

wc -l frontend/src/components/chat/chat-message.tsx
# 129 (Phase 2 와 동일)
```

## Patterns Established

- **Option C layout coordination** — 재배치는 parent dispatcher 에서, presentational shell (ChatMessage) 은 shape 만 정의. Phase 2 error pipeline 과 나란히 설 수 있는 최소 침습 패턴.
- **Native HTML toggle for collapsible UI** — React state 제거, 접근성 기본 제공 (screen reader 가 `<details>` 를 자동으로 disclosure widget 으로 announce).

## Verification Evidence

```bash
# File + imports
grep -c 'ToolInvocationView' frontend/src/components/chat/message-part-renderer.tsx
# 2 (import + JSX use)
grep -c 'function ToolChip' frontend/src/components/chat/message-part-renderer.tsx
# 0 (deleted)
grep -c 'DynamicToolUIPart\|ToolUIPart' frontend/src/components/chat/message-part-renderer.tsx
# 0 (unused imports removed)

# 4 states explicit
grep -c 'input-streaming\|input-available\|output-available\|output-error' frontend/src/components/chat/tool-invocation-view.tsx
# 13

# D-01 semantic colors
grep -c 'bg-success/10 text-success\|bg-destructive/10 text-destructive\|bg-muted text-muted-foreground' frontend/src/components/chat/tool-invocation-view.tsx
# >= 3

# D-03 tenses
grep -c '"중"\|"완료"\|"실패"' frontend/src/components/chat/tool-invocation-view.tsx
# 3

# D-05/D-06 details block
grep -c '<details' frontend/src/components/chat/tool-invocation-view.tsx
# 1 (tag)
grep -c ' open' frontend/src/components/chat/tool-invocation-view.tsx
# 0 (default-collapsed)
grep -c 'webkit-details-marker' frontend/src/components/chat/tool-invocation-view.tsx
# 1

# D-07/D-08/D-09 JSX reorder
grep -c 'flex flex-col gap-1 pl-11 pt-2' frontend/src/components/chat/message-part-renderer.tsx
# 1

# T-03-01 end-to-end
grep -c 'serializeInput' frontend/src/components/chat/tool-invocation-view.tsx
# 4 (import + declaration + 1 use)
grep -c 'JSON.stringify(part.input' frontend/src/components/chat/tool-invocation-view.tsx
# 0

# Option C preserved
git diff HEAD~2 HEAD -- frontend/src/components/chat/chat-message.tsx | wc -l
# 0

# Build
cd frontend && npx tsc --noEmit && npm run build
# exit 0
```

## Threat Flags

- **T-03-01 end-to-end wired** — `serializeInput(part.input)` is the only path from raw MCP input to DOM `<pre>` block. 0 occurrences of raw `JSON.stringify(part.input)` in the component.
- **T-03-05 DoS mitigated** — `truncateResponse` caps any response at 2000 chars. Even 100MB output only contributes 2KB to DOM.
- T-03-02 / T-03-03 / T-03-04 / T-03-06 — accepted per plan threat register, rely on Plan 03-01 mitigations and React JSX escaping.

## Performance

- **Duration:** ~4 minutes
- **Tasks:** 3 (Task 01 ToolInvocationView, Task 02 MessagePartRenderer rewire, Task 03 validation + commit)
- **Lines added:** 228
- **Lines removed:** 49
- **Files changed:** 2 (1 new, 1 modified)
- **Out-of-scope diff:** 0 (chat-message.tsx / chat-container.tsx / tool-labels.ts / ui-message-parts.ts / conversations.ts / route.ts 모두 unchanged)

## Next Phase Readiness

Plan 03-03 can now replace the `"검색 중..."` placeholder with `StreamingSkeletonBubble` and upgrade `test-sidebar/page.tsx` to use `MessagePartRenderer`, which will exercise this plan's chip rendering end-to-end without touching any Plan 03-02 artifact.

## Self-Check: PASSED

- [x] `frontend/src/components/chat/tool-invocation-view.tsx` exists (197 lines)
- [x] `frontend/src/components/chat/message-part-renderer.tsx` modified (210 → 177 lines)
- [x] `ddf89e4` commit in git log
- [x] tsc + build green (exit 0 both)
- [x] Option C preserved: chat-message.tsx diff = 0 across Phase 3 so far
- [x] Phase 2 error pipeline grep counts intact
- [x] 4 active states + 3 approval fallback
- [x] `<details>` default-collapsed, serializeInput wired
