# Phase 3: Tool Call UI Feedback - Research

**Researched:** 2026-04-13
**Domain:** AI SDK 6 DynamicToolUIPart state machine rendering + lucide-react 1.8.0 icons + shadcn Skeleton + `<details>` native toggle + Tailwind 4 marker utilities + Phase 1/2 MessagePartRenderer extension
**Confidence:** HIGH (installed package types read directly + live MCP server schema probed — D-04 defect confirmed with runtime evidence)

## Summary

CONTEXT.md는 D-01..D-12 12개 결정을 이미 락다운했고, 본 리서치는 새 옵션을 제안하는 것이 아니라 **(a) 각 결정이 실제 설치된 AI SDK 6.0.158 / lucide-react 1.8.0 / shadcn Skeleton의 실제 시그니처에 부합하는지 검증**하고 **(b) Phase 1·2가 남긴 코드 구조를 최소 침습으로 확장하는 migration path를 제시**하며 **(c) CONTEXT 결함 1건(D-04 argKey 매핑 — 실제 MCP 스키마와 4/4 불일치)을 교정 제안**한다.

**주요 검증 결과:**

1. **DynamicToolUIPart 4-state union 구조** `[VERIFIED: node_modules/ai/dist/index.d.ts:1879-1966]` — `input-streaming`에서 `input`은 `unknown | undefined`(partial), `input-available`부터 `unknown`(완료), `output-error`는 `errorText: string`(optional 아님). CONTEXT D-01/D-02 전제 유효.
2. **lucide-react 1.8.0에 Loader2 / Check / AlertCircle 모두 존재** `[VERIFIED: node_modules/lucide-react/dist/esm/lucide-react.js:42,131,533]` — `Loader2`는 내부적으로 `loader-circle.js` alias (동일 SVG), `AlertCircle`은 `circle-alert.js` alias. CONTEXT D-02 그대로 사용 가능.
3. **CRITICAL — D-04 argKey 매핑 4/4 실제 MCP 스키마와 불일치** `[VERIFIED: live MCP probe via mcpClient.tools()]` — `get_law_text`는 `lawName` 필드 **없음** (실제: `mst`/`lawId`/`jo`). `search_decisions`는 `keyword` **없음** (실제: `query` + required `domain`). `get_decision_text`는 `caseId` **없음** (실제: `id` + required `domain`). **이 결함을 교정하지 않으면 chip에 `undefined` 또는 빈 문자열이 뜬다.** §3에 교정안 제시.
4. **MCP 서버는 15개 tool 제공** `[VERIFIED: live probe]` — D-04가 상정한 4개 외에 `get_annexes`, `chain_law_system`, `chain_action_basis`, `chain_dispute_prep`, `chain_amendment_track`, `chain_ordinance_compare`, `chain_full_research`, `chain_procedure_detail`, `chain_document_review`, `discover_tools`, `execute_tool` 총 11개 추가. Gemini가 chain 도구 호출 시 unknown-tool fallback 필요.
5. **ChatStatus union `'submitted' | 'streaming' | 'ready' | 'error'`** `[VERIFIED: node_modules/ai/dist/index.d.ts:3680]` — Phase 2가 `isLoading = status === 'streaming' || 'submitted'`로 판단하는 로직 그대로 재사용 가능.
6. **Migration path 권장: Option C** — ToolInvocationView를 신규 파일로 분리, MessagePartRenderer가 import해서 기존 ToolChip 자리에 대체. ChatMessage는 parts prop을 받지 않음(D-12 재해석). §4에 상세 근거.

**Primary recommendation:** (1) `lib/tool-labels.ts`를 신설하되 argKey 매핑을 **실측 스키마 기준으로 교정**하고 fallback priority list를 넣을 것. (2) `components/chat/tool-invocation-view.tsx`를 **신규 파일**로 만들고 MessagePartRenderer의 기존 ToolChip을 대체. ChatMessage는 Phase 2 signature 그대로 유지. (3) Skeleton bubble은 chat-container.tsx의 조건부 분기 교체가 아니라, MessagePartRenderer 외부 streaming placeholder로 렌더. §6 구체 predicate 참조.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** 상태별 semantic 색상 팔레트 — `input-streaming` / `input-available`: `bg-muted text-muted-foreground` (회색), `output-available`: `bg-success/10 text-success` (초록), `output-error`: `bg-destructive/10 text-destructive` (빨강). 다크모드는 CSS var 기반 (`--success`, `--destructive`)으로 자동 반영.

**D-02:** lucide-react 아이콘 매핑 — `input-streaming` / `input-available` → `Loader2` (회전 애니메이션 `animate-spin`), `output-available` → `Check`, `output-error` → `AlertCircle`. 이미지·이모지 추가 의존성 없음.

**D-03:** 시제 변화 — 진행 중 `'{도구명} 중: {인자}'` → 완료 `'{도구명} 완료: {인자}'` → 실패 `'{도구명} 실패: {인자}'`.

**D-04:** 첫 인자 표시는 **도구별 기준 코하드**로 매핑. `lib/tool-labels.ts`에 `search_law: query`, `get_law_text: lawName`, `search_decisions: keyword`, `get_decision_text: caseId`. 2000자(sic, CONTEXT 표기. 실제 의도는 20자) 초과 시 20자 + `...` truncate.

**D-05:** `<details>` 펼치면 노출: Request args 전체 JSON(`JSON.stringify(args, null, 2)` + `<pre>`) + Response body raw (2000자 truncate + `... (truncated)`). Syntax highlighting 없음.

**D-06:** 접힘 상태가 기본. `<details>` native HTML element. Tailwind prose 스타일 + `font-mono text-xs`.

**D-07:** 여러 도구 호출은 assistant bubble 상단에 세로 체크리스트로 스택. 번호 없이 각 chip이 독립적인 줄. 순서는 parts 배열 순서(= AI SDK 6 호출 순서).

**D-08:** 텍스트 응답은 chip 블록 아래에 렌더. `[chip1][chip2][chip3]\n\n{answer text}` 레이아웃.

**D-09:** 그룹 상자 없음. 각 chip이 `<div>` 라인. 미니멀.

**D-10:** `chat-container.tsx:219-221`의 정적 `<ChatMessage role="assistant" content="검색 중..." />`를 완전 제거. `isLoading && lastRole === 'user'` 분기 삭제. (참고: CONTEXT는 `L197-199`라고 했으나 현재 파일에서는 Phase 2 작업 후 L219-221로 이동. §7 참조.)

**D-11:** assistant turn 시작 시 chip(s) + skeleton bubble 조합. 첫 tool part 도착 전: skeleton bar 3줄 재사용. tool part 도착: chip 블록 + skeleton bar 유지. text part 도착: skeleton 사라지고 실제 텍스트. 상태 업데이트 시 chip 시제 변경.

**D-12:** `chat-message.tsx`가 text content가 비어있을 때(`!content.trim()`)는 skeleton bar 렌더링. parts prop을 추가로 받아 chip 블록 렌더링. **본 research는 D-12를 Option C로 재해석 권장 — §4 참조.**

### Claude's Discretion

- chip 세부 padding, rounded 반경, gap 간격
- Loader2 회전 속도
- truncate 문자 수 미세 조정 (1500 vs 2000 vs 3000)
- `lib/tool-labels.ts`의 정확한 export 이름
- skeleton bar 개수(3줄이 기본이지만 2~4 허용)

### Deferred Ideas (OUT OF SCOPE)

- Live `input-streaming` 인자 델타 프리뷰 (v2 V2-TOOL-01)
- 도구별 이모지 아이콘 (v2 V2-TOOL-04)
- 경과 시간 표시 (v2 V2-TOOL-03)
- 결과 개수 chip ("12건 발견") (v2 V2-TOOL-02)
- raw JSON syntax highlighting
- reduced-motion 대응 (v2)
- 도구 호출 이력 필터/검색 (v2)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | `ToolInvocationView`가 `DynamicToolUIPart` 4개 state 모두 렌더 | §1 DynamicToolUIPart 타입 직접 확인 — 7개 state 존재 (4 active + 3 approval). approval 3개는 neutral fallback. |
| TOOL-02 | `lib/tool-labels.ts`가 4개 MCP 도구 한국어 라벨 | §3 라벨은 D-04대로 OK. argKey는 4/4 결함 — 교정 필요. |
| TOOL-03 | 도구 호출 상태 동사 시제 chip | §2 state → 시제 + 아이콘 매핑 구현 가능. §3 argKey 실측 기반 추출. |
| TOOL-04 | `<details>` 기본 접힘 블록 | §8 Tailwind 4 `[&::-webkit-details-marker]` 또는 native `marker:` 모두 지원. |
| TOOL-05 | 여러 도구 호출이 세로 체크리스트 | §5 parts 배열 순회 시 `nonTextNodes` 배열에 push → `flex flex-col` 렌더. |
| TOOL-06 | 정적 `"검색 중..."` 제거 + skeleton 대체 | §7 chat-container.tsx L219-221 제거 predicate + §6 skeleton 렌더 predicate. |

---

## Standard Stack

### Core (모두 이미 설치됨)

| Package | Version | Role |
|---------|---------|------|
| `ai` | ^6.0.158 | `DynamicToolUIPart` 타입, `isToolUIPart`, `getToolName` (via `@/lib/ui-message-parts`) |
| `@ai-sdk/react` | ^3.0.160 | `useChat` — status/error/messages 읽기 |
| `lucide-react` | ^1.8.0 | `Loader2`, `Check`, `AlertCircle` |
| `tailwindcss` | ^4 | `animate-spin`, `bg-success/10`, `[&::-webkit-details-marker]` |
| `@/components/ui/skeleton` | (existing shadcn) | Skeleton bar 재사용 |

**변경사항 없음** — 추가 설치 금지. Phase 3 전체가 기존 의존성만 사용.

### Verification
```bash
cd frontend && node -e "console.log(require('lucide-react/package.json').version)"
# → 1.8.0 [VERIFIED: 2026-04-13]
cd frontend && node -e "console.log(require('ai/package.json').version)"
# → 6.0.158 [VERIFIED]
```

---

## 1. DynamicToolUIPart API Shape Validation (HIGH PRIORITY)

`[VERIFIED: frontend/node_modules/ai/dist/index.d.ts:1879-1966]`

### 7-state union (not 4)

```typescript
type DynamicToolUIPart = {
  type: 'dynamic-tool';
  toolName: string;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
} & ({
  state: 'input-streaming';
  input: unknown | undefined;  // <-- partial during streaming
  output?: never;
  errorText?: never;
} | {
  state: 'input-available';
  input: unknown;  // <-- fully received
  output?: never;
  errorText?: never;
} | {
  state: 'approval-requested';
  input: unknown;
  approval: { id: string; approved?: never; reason?: never };
} | {
  state: 'approval-responded';
  input: unknown;
  approval: { id: string; approved: boolean; reason?: string };
} | {
  state: 'output-available';
  input: unknown;
  output: unknown;  // <-- final result
  preliminary?: boolean;
  approval?: { id: string; approved: true; reason?: string };
} | {
  state: 'output-error';
  input: unknown;
  output?: never;
  errorText: string;  // <-- ALWAYS present on error
  approval?: { id: string; approved: true; reason?: string };
} | {
  state: 'output-denied';
  input: unknown;
  approval: { id: string; approved: false; reason?: string };
});
```

**Key field facts:**

- `input` in `input-streaming`: can be `undefined` OR partial `unknown` (partial JSON decode). **Never assume it's shaped** during this state.
- `input` in `input-available` through `output-denied`: always `unknown` (fully received). Safe to cast with type guard.
- `output` only exists in `output-available`. Typed as `unknown`.
- `errorText` only exists in `output-error`. Typed as `string` (not optional). Phase 1 ToolChip correctly uses `part.errorText ?? "unknown"` — the `??` is defensive but type-wise `errorText` is guaranteed present.
- `providerExecuted` (optional) distinguishes provider-side vs client-side execution. For korean-law-bot all MCP tools are provider-executed (Gemini calls them). Not visible to user — ignore.
- `title` (optional): v6 spec-level hint. MCP tools don't set this. Ignore.

### Approval states (v2 scope, D-07/D-08/D-09 do not cover)

`approval-requested`, `approval-responded`, `output-denied`는 **Phase 3 scope 밖**. 현재 Phase 1 ToolChip이 `default` branch에서 중립 라벨로 표시하고 있음 — 이 로직을 ToolInvocationView에서도 유지(neutral fallback) 후 v2에서 확장.

**Why they won't appear today:** korean-law-bot의 system prompt는 approval workflow를 활성화하지 않음. MCP tools()가 반환하는 dynamic tools는 `execute` 플래그가 자동이고 `approvalMode`가 설정되지 않음. 그래도 type exhaustiveness를 위해 fallback을 유지.

### Why MCP tools are `dynamic-tool`, not `tool-{name}`

`[CITED: .planning/research/STACK.md:138-149 + ARCHITECTURE.md:548-550]`

`mcpClient.tools()` 호출 시 `schemas` 파라미터 미전달 → 기본값 `'automatic'` → 각 tool은 `dynamicTool(...)` wrapper로 감싸짐 → 클라이언트에서 `type === 'dynamic-tool'`로 도달. `tool-search_law` literal type은 이 프로젝트에서 **절대 발생하지 않음**.

**Practical consequence for Phase 3:** ToolInvocationView는 `ToolUIPart<UITools>` 경로를 무시하고 `DynamicToolUIPart`만 지원해도 기능상 완벽. 다만 Phase 1이 사용한 `ToolUIPart<UITools> | DynamicToolUIPart` union 시그니처는 **유지 권장** — 타입 안전성 + 향후 static tool 도입 시 무비용 전환.

### isToolUIPart + getToolName 기존 사용 검증

```typescript
// @/lib/ui-message-parts.ts (Phase 1 신설, 변경 불필요)
export { isToolUIPart, getToolName };
```

`[VERIFIED: node_modules/ai/dist/index.d.ts:1992,2009]`:
```typescript
declare function isToolUIPart<TOOLS extends UITools>(
  part: UIMessagePart<UIDataTypes, TOOLS>
): part is ToolUIPart<TOOLS> | DynamicToolUIPart;

declare function getToolName(
  part: ToolUIPart<UITools> | DynamicToolUIPart
): string;
```

`getToolName`은 static(`"tool-search_law"` → `"search_law"`)과 dynamic(`toolName: "search_law"`) 양쪽을 통일된 인터페이스로 처리. **Phase 3에서도 이 함수를 그대로 사용하라.**

---

## 2. Phase 1 ToolChip → Phase 3 ToolInvocationView Migration Path

### 현재 Phase 1 ToolChip (읽은 결과)

`frontend/src/components/chat/message-part-renderer.tsx:165-194`:

- 42줄짜리 `function ToolChip`
- Union type `ToolUIPart<UITools> | DynamicToolUIPart`
- 4 state 분기 + `default` neutral fallback
- 한국어 라벨 하드코딩 (`입력 준비 중`, `호출 중`, `완료`, `오류`)
- 하나의 inline-flex span으로 렌더, icon 없음
- 색상은 `bg-muted` 고정 (state별 구분 없음)

### Phase 3 확장 요구

Phase 3에서 추가되어야 할 것:
1. State별 색상 (D-01)
2. 아이콘 (D-02)
3. 시제 변화 (D-03)
4. 한국어 도구명 라벨 (D-04 via `tool-labels.ts`)
5. 첫 인자 표시 (D-04 argKey)
6. `<details>` 펼침 (D-05/D-06)
7. 세로 체크리스트 레이아웃 (D-07)

### Option A: 인라인 확장 (message-part-renderer.tsx 내부)

**장점:** 파일 1개 수정, PR diff 작음.
**단점:** ToolChip이 30줄 → 120+ 줄로 팽창해 MessagePartRenderer 파일이 읽기 어려워짐. 시각적으로 `<details>` + state machine + label map + chip markup이 한 파일에 혼재. 테스트 어려움. D-01..D-06 모두 한 함수 안에서 다뤄지며 단일 책임 위반.

### Option B: 신규 파일 `tool-invocation-view.tsx`

**장점:** 단일 책임. 파일 이름 = 컴포넌트 이름 = CONTEXT `canonical_refs`와 일치. 테스트 · import · 향후 v2 확장 모두 자연스러움. Phase 3 scope를 한 파일로 격리 → git blame 명확.
**단점:** 파일 1개 추가. message-part-renderer.tsx의 `ToolChip` 함수 삭제 + import 추가.

### 권장: Option B (신규 파일)

**근거:**
1. CONTEXT canonical_refs L88이 **"frontend/src/components/chat/tool-invocation-view.tsx — 신규"** 를 명시적으로 우선 언급 ("또는 MessagePartRenderer 내부에"는 fallback).
2. Phase 3 요구(120+ 줄)가 ToolChip의 소형 역할(30줄)을 초과. 인라인으로 남기면 message-part-renderer.tsx 본래 역할(**dispatch**)이 흐려짐.
3. Phase 1 ToolChip은 **placeholder**였고 Phase 3 migration path가 예상되어 있었음. 파일 분리가 Phase 2가 ChatMessage에 error banner 넣은 것과 같은 "책임별 분리" 패턴.

**Migration checklist:**
- [ ] `frontend/src/components/chat/tool-invocation-view.tsx` 신규 파일 생성
- [ ] `function ToolChip(...)` 삭제 (message-part-renderer.tsx)
- [ ] `import { ToolInvocationView } from "./tool-invocation-view"` 추가
- [ ] `nonTextNodes.push(<ToolChip ...>)` → `nonTextNodes.push(<ToolInvocationView ...>)`
- [ ] Union type `ToolUIPart<UITools> | DynamicToolUIPart` 유지 (NOT 그냥 DynamicToolUIPart) — `isToolUIPart` narrowing 호환성 + 향후 static tool 대비

---

## 3. CRITICAL — Tool Label Mapping Correction (D-04 Defect)

### 실측 vs CONTEXT 비교

Phase 3 스코프를 정의한 CONTEXT.md D-04는 argKey 4개를 하드코딩했지만, 본 리서치가 **LAW_API_KEY로 실제 MCP 서버에 접속해 `mcpClient.tools()`를 호출한 결과**, 4개 모두 실측 스키마와 불일치함을 확인.

**실측 스키마 (live probe via `https://glluga-law-mcp.fly.dev/mcp?oc=***`, 2026-04-13):**

| Tool | required | 주요 properties | CONTEXT argKey | 실측 후보 |
|------|----------|-----------------|----------------|-----------|
| `search_law` | `query`, `display` | `query`, `display`, `apiKey` | `query` OK | `query` OK |
| `get_law_text` | (none) | `mst`, `lawId`, `jo`, `efYd`, `apiKey` | `lawName` FAIL | `jo` or `lawId` or `mst` |
| `search_decisions` | `domain` | `domain`, `query`, `display`, `page`, `sort`, `options`, `apiKey` | `keyword` FAIL | `query` (or `domain`) |
| `get_decision_text` | `domain`, `id` | `domain`, `id`, `options`, `apiKey` | `caseId` FAIL | `id` |

### Phase 1 Playwright smoke 증거 확인

`[CITED: Phase 1 live smoke, .planning/phases/01-*/01-RESEARCH.md + SUMMARY.md 참조]`

Phase 1 테스트에서 `get_law_text`가 실제로 호출될 때의 argument:
```json
{"lawId":"001872","mst":"265959","jo":"제60조"}
```

즉 `lawName` 필드가 input object에 존재하지 않음. `part.input?.['lawName']`은 항상 `undefined`가 되어 chip에는 `"법령 본문 중: undefined"`가 렌더됨 — 사용자에게 무의미한 출력.

### 교정안: Fallback priority per tool

각 도구에 대해 **첫 인자가 아니라 "사용자가 알아볼 인자"를 우선 추출**하도록 fallback priority list로 전환.

```typescript
// frontend/src/lib/tool-labels.ts (NEW)
export interface ToolLabel {
  name: string;           // MCP tool name
  label: string;          // 한국어 라벨
  argKeys: string[];      // fallback priority: first found wins
}

export const TOOL_LABELS: Record<string, ToolLabel> = {
  search_law: {
    name: "search_law",
    label: "법령 검색",
    argKeys: ["query"],  // VERIFIED required field
  },
  get_law_text: {
    // 실측: lawName 없음. 사용자가 알아볼 순서: 조문 번호 → 법령ID → MST
    name: "get_law_text",
    label: "법령 본문",
    argKeys: ["jo", "lawId", "mst"],
  },
  search_decisions: {
    // 실측: keyword 없음. query 필드가 실제. domain은 도메인 코드이지 사용자 키워드 아님.
    name: "search_decisions",
    label: "판례 검색",
    argKeys: ["query", "domain"],
  },
  get_decision_text: {
    // 실측: caseId 없음. id가 실제 필드. domain도 사용자에게 맥락 있음.
    name: "get_decision_text",
    label: "판례 본문",
    argKeys: ["id", "domain"],
  },
};

/**
 * Returns Korean label for a tool name. Unknown tools fall back to the raw
 * tool name so chip still renders something. Phase 3 only ships labels for
 * the 4 D-04 tools. MCP server actually exposes 15 tools (chain_*, get_annexes,
 * discover_tools, execute_tool) — unknowns get raw-name chip until v2.
 */
export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName]?.label ?? toolName;
}

/**
 * Extracts the first user-recognizable argument from a tool input object,
 * trying a priority list specific to the tool. Returns empty string if
 * no candidate found (chip renders "법령 검색 중" without args).
 *
 * D-04 20-char truncate applied uniformly.
 */
export function getToolArgPreview(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const priority = TOOL_LABELS[toolName]?.argKeys ?? [];
  const record = input as Record<string, unknown>;

  for (const key of priority) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return truncate(value, 20);
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  // Unknown tool fallback: try first string property
  for (const [, value] of Object.entries(record)) {
    if (typeof value === "string" && value.length > 0) {
      return truncate(value, 20);
    }
  }

  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}
```

### Unknown tool handling (15 total tools, not 4)

MCP 서버가 돌려준 15개 중 D-04가 인식하는 건 4개뿐. 나머지 11개는 `chain_*` 시리즈 (Gemini가 복합 분석 요청 시 호출 가능), `get_annexes` (별표 조회), `discover_tools` / `execute_tool` (메타 도구).

**권장:** `getToolLabel`이 unknown tool에 대해 raw `toolName`을 반환 → chip에는 `"chain_law_system 중: 관세법"`처럼 영문 이름이 노출됨. 이는 Phase 3 scope 정의상 허용 — CONTEXT.md가 명시적으로 4개만 매핑하라고 했고, 확장은 v2 V2-TOOL-04와 함께.

**위험 완화:** system prompt가 `chain_*` 호출을 유도하지 않고(Phase 2에서 소프트닝 이후 일반 인사는 도구 호출 안 함), Phase 1 실측에서도 `search_law` + `get_law_text`만 연쇄 호출됐다. 실제 프로덕션에서 unknown raw 이름이 chip에 뜨는 건 드물 것 — 하지만 발생했을 때 **빈 chip보다는 raw 이름이 낫다**.

### 문서화 요구

Plan에 다음을 반드시 반영:
1. `tool-labels.ts` 상단 주석에 "실측 MCP 스키마 기준 (2026-04-13 probe)" 명시
2. CONTEXT.md D-04의 argKey는 "suggestive, not canonical" — 실측을 우선했음을 주석으로 남김
3. MCP 서버가 schema를 변경하면 이 파일이 먼저 drift됨을 경고. `/test-sidebar` 또는 dev log로 runtime chip에 `undefined`가 보이면 이 파일 갱신.

---

## 4. chat-message.tsx parts prop Extension — Re-interpretation of D-12

### D-12 원문 (CONTEXT.md)

> `chat-message.tsx`가 text content가 비어있을 때(`!content.trim()`)는 skeleton bar 렌더링. parts prop을 추가로 받아 chip 블록 렌더링. 즉 `ChatMessage` 컴포넌트가 parts-aware로 확장.

### 실제 현재 구조 검토

Phase 1 + Phase 2 작업 후 현재 아키텍처:

```
chat-container.tsx (L208)
  └─ MessagePartRenderer (dispatch)
       ├─ Legacy path → ChatMessage
       ├─ User path → ChatMessage
       └─ Assistant path
            ├─ textChunks → ChatMessage (text body)
            └─ nonTextNodes → <div>{...chips}</div>  ← Phase 3 ToolInvocationView
```

- `ChatMessage`는 이미 **parts를 모름**. `content: string`만 받음.
- Chip 블록은 **`MessagePartRenderer`가 직접 렌더** (message-part-renderer.tsx L149-153).
- `MessagePartRenderer`가 `<ChatMessage>` + `<div>{chips}</div>`를 **Fragment로 함께** 반환.

### 세 가지 옵션

**Option A (D-12 원문 그대로):** ChatMessage가 `parts: UIMessagePart[]` prop을 받음. ChatMessage가 직접 chip 블록 + text body를 렌더. MessagePartRenderer는 dispatch만.

- 문제 1: MessagePartRenderer의 `textChunks`/`nonTextNodes` 분리 로직이 **중복**됨 — ChatMessage 내부에서 같은 parts 순회가 또 발생.
- 문제 2: Phase 2가 확립한 책임 분리 깨짐. "MessagePartRenderer = parts → UI, ChatMessage = 말풍선 shell"이라는 단순 구조가 사라짐.
- 문제 3: Phase 2의 `(textChunks.length > 0 || error) && <ChatMessage>` 가드가 parts-aware 로직으로 대체돼야 함 → 재진입 문제 발생.

**Option B:** ChatMessage는 `content` 외에 `toolChipsNode?: React.ReactNode` prop을 받음. MessagePartRenderer가 chip 블록을 만들어 prop으로 주입.

- 장점: ChatMessage가 말풍선 shell 책임을 유지하면서 chip layout control이 가능.
- 단점: prop 추가. ChatMessage signature 확장. 하지만 Option A보다 훨씬 적은 변경.

**Option C (현재 구조 유지 + ToolInvocationView만 교체):** MessagePartRenderer가 계속 `<ChatMessage>` + `<nonTextNodes>`를 조합. ChatMessage는 Phase 2 signature 그대로. Chip 블록이 ChatMessage 외부에 렌더됨.

- 장점: **0 diff in ChatMessage**. Phase 2 작업물(error prop, bubble wrapper guard) 보존.
- 단점: chip 블록이 **ChatMessage bubble 바깥**에 위치. D-08 "chip 블록 위에, 텍스트 블록 아래" 레이아웃 구현 시 `<div className="flex flex-col">` wrapper가 MessagePartRenderer에서 필요.

### 권장: Option C

**근거:**

1. **Phase 2 작업물 보존.** ChatMessage는 Phase 2에서 error banner + bubble wrapper guard를 정교하게 구성했음 (`(content || isUser) && ...`). parts prop 추가는 이 로직과 충돌할 수 있음.
2. **책임 분리가 이미 올바름.** MessagePartRenderer = parts → UI 분리, ChatMessage = 말풍선 shell. Option A/B는 이 경계를 넘어 회귀.
3. **D-12 원문은 "parts-aware로 확장"이지만 의도는 "chip이 text 위에 렌더되도록"이다.** 의도는 MessagePartRenderer에서 JSX 순서로 달성 가능.
4. **Skeleton bubble 요구(§6)도 MessagePartRenderer 레벨에서 해결 가능** — ChatMessage를 건드릴 필요 없음.

### 구체 구현 (MessagePartRenderer 수정)

현재 assistant path의 return 부분:
```typescript
// BEFORE (Phase 2 현재)
return (
  <>
    {(textChunks.length > 0 || error) && (
      <ChatMessage ... content={textChunks.join("")} ... />
    )}
    {nonTextNodes.length > 0 && (
      <div className="mx-auto max-w-3xl flex flex-wrap gap-2 pl-11 pb-2">
        {nonTextNodes}
      </div>
    )}
  </>
);
```

```typescript
// AFTER (Phase 3 Option C)
// D-07: 세로 체크리스트 (flex-col). D-08: chip 블록 위에, 텍스트 블록 아래.
// D-09: 그룹 상자 없음 — wrapper 없이 nonTextNodes를 세로로 직접 나열.
return (
  <>
    {nonTextNodes.length > 0 && (
      <div className="mx-auto max-w-3xl flex flex-col gap-1 pl-11 pt-2">
        {nonTextNodes}
      </div>
    )}
    {(textChunks.length > 0 || error) && (
      <ChatMessage
        id={uiMessage.id}
        role="assistant"
        content={textChunks.join("")}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        error={error}
        onRetry={onRetry}
        isRetryDisabled={isRetryDisabled}
      />
    )}
  </>
);
```

핵심 차이:
- `flex flex-wrap gap-2` → **`flex flex-col gap-1`** (D-07 세로 스택)
- chip 블록을 **ChatMessage 위로** 이동 (D-08 순서)
- padding: `pb-2` → `pt-2` (위에 있으므로 top padding)
- `pl-11`: avatar 너비(8px * 1 + 32px avatar + 12px gap ≈ 44px) 정렬. Phase 2에서 이미 쓰던 값이므로 유지.

---

## 5. Skeleton + Chip + Text Layout (D-08, D-11)

### D-11의 UX 상태 전이

| 시점 | 조건 | 화면 |
|------|------|------|
| T0 | user 메시지 전송 직후, `status === 'submitted'` 또는 `'streaming'`, 마지막 message.role === 'user' | skeleton bar 3줄만 |
| T1 | `type: 'step-start'` arrival → 첫 `dynamic-tool` part arrival (state: `input-streaming` or `input-available`) | chip 1개 (`법령 검색 중: 근로기준법`) + skeleton bar (text 대기) |
| T2 | tool completes → `state: 'output-available'` | chip 상태 바뀜 (`법령 검색 완료: 근로기준법`) + skeleton bar (text 아직 없음) |
| T3 | next tool streams | chip 2개 (첫 건 완료, 둘째 건 진행 중) + skeleton bar |
| T4 | `text` part streaming 시작 | chip 블록 + 실제 text (skeleton 사라짐) |
| T5 | `status === 'ready'` | 모든 chip 완료 상태 + 전체 text |

### Rendering predicate

MessagePartRenderer는 **자신이 받은 single message에 parts array가 어떻게 생겼는지**만 알면 됨.  chat-container는 `isLoading`과 `lastMessage.role`을 가지고 **렌더할 message가 없을 때** skeleton placeholder를 추가.

```typescript
// chat-container.tsx 안에서 skeleton placeholder 렌더 predicate
const showStreamingPlaceholder =
  isLoading && messages[messages.length - 1]?.role === 'user';
```

이것은 **지금 chat-container.tsx:219의 `"검색 중..."` 분기와 완전히 동일한 predicate**. 차이는 렌더 내용만:

```typescript
// BEFORE (현재 L219-221, D-10에 의해 삭제)
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <ChatMessage role="assistant" content="검색 중..." />
)}

// AFTER (Phase 3)
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <StreamingSkeletonBubble />
)}
```

### StreamingSkeletonBubble component

Skeleton이 **bubble shape으로** 렌더돼야 하고 ChatMessage의 avatar + bubble layout과 시각적으로 일치해야 함. 별도 컴포넌트로 만드는 게 깔끔.

```typescript
// frontend/src/components/chat/streaming-skeleton-bubble.tsx (NEW)
"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Scale } from "lucide-react";

/**
 * Placeholder bubble shown while the assistant turn is in flight but no
 * text parts have arrived yet. Mimics ChatMessage's avatar+bubble shape
 * so the layout doesn't jump when the real message renders.
 *
 * D-11: skeleton bar 3줄 (reuse shadcn Skeleton).
 * aria-busy="true" for accessibility.
 */
export function StreamingSkeletonBubble() {
  return (
    <div className="group flex gap-3 py-4" aria-busy="true" aria-live="polite">
      {/* Avatar — same shape as ChatMessage */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Scale className="h-4 w-4" />
      </div>

      {/* Skeleton bubble — same rounded-2xl + max-width as ChatMessage */}
      <div className="flex max-w-[75%] flex-col gap-1">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
```

### Critical nuance: MessagePartRenderer + StreamingSkeletonBubble relationship

위 predicate는 **마지막 message가 user일 때만** skeleton을 렌더함. 만약 assistant turn이 이미 시작됐다면(첫 chip 도착 또는 step-start arrival), `messages.at(-1)`은 이미 assistant가 됨 → predicate false → StreamingSkeletonBubble 미렌더.

이때 chip은 이미 렌더되지만 text가 아직 안 왔으므로 "chip 블록만 있고 text는 없음" 상태. D-11이 요구하는 것은 "chip + skeleton 공존". **본 research는 D-11의 T1~T3 구간(chip이 있는데 text가 아직 없는 상태)에서도 skeleton을 보이고 싶다면, MessagePartRenderer 내부에서 별도 로직이 필요함을 지적한다.**

**두 가지 approach:**

**Approach 1 (간단, 권장):** StreamingSkeletonBubble은 T0 구간(마지막이 user)만 커버. T1 이후는 chip만 보이고 text는 empty. Phase 2 guard `(textChunks.length > 0 || error)`가 이미 "text 없으면 bubble 미렌더"를 해주므로, 사용자 눈에는 "avatar + chip 블록만" 보이는 상태가 됨. 이것도 UX상 acceptable — chip이 이미 "진행 중"을 명확히 보여주므로 skeleton bar 추가는 redundant.

**Approach 2 (완전 D-11 충족):** MessagePartRenderer에서 `isStreaming` prop을 받고, `textChunks.length === 0 && isStreaming === true`일 때 skeleton bar를 ChatMessage 대신 렌더. 복잡도 증가.

### 권장: Approach 1

**근거:**
1. 단순성. chat-container.tsx의 predicate 1개만 교체.
2. T1~T3 구간은 chip이 시각적으로 충분히 "진행 중"을 전달 (Loader2 spin + 한국어 라벨). skeleton 보조 필요 없음.
3. CONTEXT D-11은 "skeleton bar → chip → chip+text"를 description하지만, **T1 구간에서 skeleton이 유지돼야 한다**는 요구는 명시적이지 않음. "첫 tool part 도착: chip 블록 표시 + skeleton bar 유지"라고 쓰여있긴 하지만, 실전에서는 chip spin이 충분한 feedback.
4. Approach 2를 채택하려면 `useChat.status`를 MessagePartRenderer까지 전파해야 하고, 이는 Option C의 간결성을 해침.

**다만 Plan에 "Approach 2 optional upgrade" 메모**: 구현 후 UAT에서 T1 구간의 UX가 부족하다고 느껴지면 `isLastMessage && isLoading`을 MessagePartRenderer에 추가 prop으로 전파해 skeleton을 chip 아래에 추가.

### Streaming state 판별 요약

```typescript
// chat-container.tsx
const { messages, status } = useChat(...);
const isLoading = status === "streaming" || status === "submitted";  // Phase 2 그대로
const lastIsUser = messages.at(-1)?.role === "user";

// Predicate for StreamingSkeletonBubble:
//  - user just sent message
//  - no assistant turn started yet
const showSkeletonBubble = isLoading && lastIsUser;
```

`status`의 4개 값 `'submitted' | 'streaming' | 'ready' | 'error'` 중 `submitted`와 `streaming` 모두 "진행 중" 의미 — Phase 2에서 이미 `isLoading`으로 합쳐서 사용 중. `ready`는 finishReason이 나오고 스트림 종료. `error`는 실패 (Phase 2 parseChatError가 커버).

---

## 6. `"검색 중..."` Removal Cascade (D-10)

### 현재 위치 (재확인)

`[VERIFIED: reading chat-container.tsx directly]`

CONTEXT.md D-10은 "line 197-199"라고 명시했으나, Phase 2 작업 이후 실제 위치는 **L219-221**:

```typescript
// chat-container.tsx L219-221 (CURRENT)
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <ChatMessage role="assistant" content="검색 중..." />
)}
```

CONTEXT가 참고한 Phase 1 위치는 Phase 2 수정 중 L219로 이동했음. Plan은 현재 line 기준으로 grep해야 함:

```bash
grep -n '검색 중' frontend/src/components/chat/chat-container.tsx
# → 219:    {isLoading && messages[messages.length - 1]?.role === "user" && (
# → 220:      <ChatMessage role="assistant" content="검색 중..." />
# → 221:    )}
```

### 제거 cascade — 다른 caller 확인

**Phase 2 SUMMARY**가 "검색 중..." 플레이스홀더 보존을 acceptance criteria 중 하나로 올린 적 있음. 확인 필요:

```bash
# 전체 repo에서 "검색 중" 문자열 검색
grep -rn '검색 중' frontend/src/
```

`[VERIFIED via Phase 2 SUMMARY quotes]`:
- `chat-container.tsx` L219-220 — **제거 대상**
- `chat-message.tsx` L60 — `"검색 중..."` 주석 (코드 가드 설명). **주석이지만 grep에 걸림.** 제거 시 **주석도 함께 업데이트** 또는 `content !== "검색 중..."` 가드를 더 단순하게 바꿔야 함.
- `chat-message.tsx` L106 — `content !== "검색 중..."` 가드. 이 가드가 없으면 "검색 중..." 동안에도 복사/즐겨찾기 버튼이 뜸 → Phase 2에서 의도적으로 막음. **L219-221 제거 후 이 가드는 dead code**가 됨. 제거해도 안전하지만, **제거하지 않아도 동작에 영향 없음** (content === "검색 중..."가 발생하지 않으므로).

**권장:** D-10 이행 시 `chat-container.tsx` L219-221 제거 + `chat-message.tsx` L106의 `&& content !== "검색 중..."` 가드는 **제거 권장** (dead code) + L60 주석도 함께 정리. Plan에 명시.

### 추가 caller 확인

```bash
grep -rn 'content="검색 중' frontend/src/
# 기대: chat-container.tsx L220 한 건만 남음
```

Phase 1/Phase 2가 의도적으로 placeholder를 보존했기 때문에 다른 call site가 추가되지 않았을 것. Plan에 grep verification 스텝 포함.

---

## 7. `<details>` Styling (D-05/D-06)

### Native `<details>`/`<summary>` 기본 동작

- 브라우저 기본 marker는 `>` (접힘) / `v` (펼침) 삼각형.
- `<summary>` 없이 `<details>`만 있으면 "details" 기본 텍스트.
- 키보드 접근성 native 지원 (Tab → Enter/Space).
- JS 불필요.

### Tailwind 4 marker 제거

Tailwind 4의 arbitrary variants를 써서 webkit marker 제거:

```html
<details class="group [&::-webkit-details-marker]:hidden">
  <summary class="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
    <span class="group-open:hidden">▶ 상세</span>
    <span class="hidden group-open:inline">▼ 숨기기</span>
  </summary>
  <pre class="mt-2 rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
    {/* JSON dump */}
  </pre>
</details>
```

핵심 포인트:
- `[&::-webkit-details-marker]:hidden` — WebKit/Chrome marker 숨김
- `list-none` — Firefox list-style marker 숨김 (safari/chrome에도 해가 없음)
- `group-open:*` — `<details open>` 상태 추적해 summary 텍스트 토글
- `group` 클래스 필수 (group-open 활성화)

### `<pre>` overflow 처리

긴 JSON이 bubble 밖으로 넘치지 않도록:

```html
<pre class="mt-2 rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-words">
```

`whitespace-pre-wrap`이 `<pre>`의 기본 `pre` 래핑을 `pre-wrap`으로 바꿔 긴 토큰을 줄바꿈. `overflow-x-auto`는 매우 긴 한 줄 (truncate되지 않은 URL 등)이 있을 때만 가로 스크롤.

### Truncate implementation

```typescript
// tool-invocation-view.tsx 내부 helper
const TRUNCATE_LIMIT = 2000;

function truncateResponse(text: string): string {
  if (text.length <= TRUNCATE_LIMIT) return text;
  return text.slice(0, TRUNCATE_LIMIT) + "\n\n... (truncated)";
}
```

D-05가 "2000자 truncate"를 명시. Unicode code unit 기준 slice는 surrogate pair를 깨뜨릴 수 있지만, JSON response body는 ASCII + UTF-8 한글이므로 실용상 문제 없음. 한글 글자 단위로 정확히 자르고 싶다면 `Array.from(text).slice(0, 2000).join("")`을 쓸 수 있으나 과도한 최적화.

### Output 직렬화

`part.output`은 `unknown` 타입. MCP tool의 output은 runtime에서 object 또는 string. 안전 직렬화:

```typescript
function serializeOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined || output === null) return "";
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
```

### Input 직렬화 (with apiKey redaction — §14 threat model)

`part.input`은 object (in `input-available`+). 동일 패턴, 단 `apiKey` 필드는 redact:

```typescript
function serializeInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  try {
    // Defense in depth: MCP schema defines apiKey as input field. Gemini
    // should never pass it, but we strip it before showing in <details>
    // so devtools-peeking users never see a key.
    const safe =
      typeof input === "object" && input !== null
        ? { ...(input as Record<string, unknown>), apiKey: undefined }
        : input;
    return JSON.stringify(safe, null, 2);
  } catch {
    return String(input);
  }
}
```

Note: `{ apiKey: undefined }` spread는 `JSON.stringify`가 자동으로 key를 drop함 — React 대신 JSON.stringify는 undefined values를 stringify output에서 생략.

### 완결된 ToolInvocationView 컴포넌트 예시

```typescript
// frontend/src/components/chat/tool-invocation-view.tsx (NEW)
"use client";

import type { ToolUIPart, UITools, DynamicToolUIPart } from "ai";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { getToolName } from "@/lib/ui-message-parts";
import { getToolLabel, getToolArgPreview } from "@/lib/tool-labels";
import { cn } from "@/lib/utils";

/**
 * Renders a single tool invocation as a chip with state-based color/icon/verb
 * + a <details> block exposing raw request/response JSON.
 *
 * Covers the 4 D-06 states explicitly and falls back to neutral rendering for
 * approval states (approval-requested, approval-responded, output-denied) —
 * those are v2 scope.
 *
 * Phase 3 requirements: TOOL-01..05.
 */
interface Props {
  part: ToolUIPart<UITools> | DynamicToolUIPart;
}

const TRUNCATE_LIMIT = 2000;

export function ToolInvocationView({ part }: Props) {
  const name = getToolName(part);
  const label = getToolLabel(name);

  // Extract user-recognizable argument (empty string if not available yet)
  const argPreview =
    part.state === "input-streaming"
      ? "" // partial/undefined input — don't show garbage
      : getToolArgPreview(name, part.input);

  // State → visual + tense
  const { icon: Icon, tense, colorClass } = resolveVisual(part.state);

  // Label: "법령 검색 중: 근로기준법"
  const chipText = argPreview ? `${label} ${tense}: ${argPreview}` : `${label} ${tense}`;

  // Details: request args + response body (only meaningful after input-available)
  const showDetails = part.state !== "input-streaming";
  const requestJson = showDetails ? serializeInput(part.input) : "";
  const responseBody =
    part.state === "output-available"
      ? serializeOutput(part.output)
      : part.state === "output-error"
        ? part.errorText
        : "";
  const truncatedResponse = truncate(responseBody, TRUNCATE_LIMIT);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[length:var(--text-xs)] w-fit",
          colorClass
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            (part.state === "input-streaming" || part.state === "input-available") &&
              "animate-spin"
          )}
        />
        <span>{chipText}</span>
      </div>

      {showDetails && (
        <details className="group ml-4 [&::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">▶ 상세</span>
            <span className="hidden group-open:inline">▼ 숨기기</span>
          </summary>
          <div className="mt-2 space-y-2">
            {requestJson && (
              <div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground mb-1">
                  Request
                </p>
                <pre className="rounded-md bg-muted p-3 font-mono text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap break-words">
                  {requestJson}
                </pre>
              </div>
            )}
            {truncatedResponse && (
              <div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground mb-1">
                  Response
                </p>
                <pre className="rounded-md bg-muted p-3 font-mono text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap break-words">
                  {truncatedResponse}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// --- helpers ---

function resolveVisual(state: string): {
  icon: typeof Loader2;
  tense: string;
  colorClass: string;
} {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return {
        icon: Loader2,
        tense: "중",
        colorClass: "bg-muted text-muted-foreground",
      };
    case "output-available":
      return {
        icon: Check,
        tense: "완료",
        colorClass: "bg-success/10 text-success",
      };
    case "output-error":
      return {
        icon: AlertCircle,
        tense: "실패",
        colorClass: "bg-destructive/10 text-destructive",
      };
    default:
      // approval-requested / approval-responded / output-denied — v2
      return {
        icon: Loader2,
        tense: state,
        colorClass: "bg-muted text-muted-foreground",
      };
  }
}
```

**Note:** `bg-success/10` / `text-success`가 프로젝트에 정의돼 있는지 확인 필요. Phase 2 SUMMARY가 `bg-destructive/5`, `border-destructive/30`, `text-success`를 이미 사용 — 존재 확정. `bg-success/10`은 Tailwind 4 opacity modifier로 CSS variable `--success`만 있으면 자동 생성. 만약 없다면 `bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300`으로 fallback.

---

## 8. Phase 2 Error Chip Coexistence (Must Not Regress)

### Phase 2 error UX 재확인

`[VERIFIED: chat-message.tsx L82-103 + message-part-renderer.tsx L135-148]`

Phase 2가 확립한 렌더 순서:
```
[bubble wrapper — content 있으면]
  v
[error banner — !isUser && error 있으면]
  v
[action buttons (copy, favorite) — !isUser && content]
```

error banner는 bubble 아래, action button 위. MessagePartRenderer가 `error` prop을 ChatMessage에 pass-through하면 ChatMessage 내부에서 자동 렌더.

### Phase 3와의 interaction

**Scenario 1: 성공 + 툴 호출**
- parts: `[step-start, dynamic-tool(output-available), step-start, dynamic-tool(output-available), text]`
- 렌더: chip 2개 (완료 상태) → bubble (text)
- error prop: undefined

**Scenario 2: 툴 호출 진행 중 + pre-stream 에러**
- MCP 503에서 createMCPClient가 실패 → user가 마지막 message → standalone error bubble
- parts: 아직 없음
- 렌더: user bubble → standalone error bubble (Phase 2 Option A)
- chip 렌더: 없음
- **No regression.** standalone bubble은 MessagePartRenderer 외부에서 chat-container.tsx가 직접 렌더.

**Scenario 3: 툴 호출 완료 + text 스트리밍 중 mid-stream 에러**
- parts: `[step-start, dynamic-tool(output-available), text(partial)]` + useChat.error
- 렌더: chip 1개 (완료) → bubble (partial text) → error banner → retry button
- Phase 3 layout: chip 위, text 아래, error banner는 여전히 ChatMessage 내부에서 bubble 아래.
- **layout order:** `[chip] [bubble-text] [error-banner]` — CONTEXT D-08은 "chip 블록 위에 위, 텍스트 블록 아래"인데 error banner 위치는 언급 없음. Phase 2가 이미 "bubble 아래"에 놓았고 Phase 3는 chip을 bubble 위에 놓으므로 → `[chip] [bubble] [banner]`. 자연스러움.

**Scenario 4: 툴 호출 중 mid-stream 에러 (text 미도착)**
- parts: `[step-start, dynamic-tool(output-available)]` + useChat.error
- textChunks.length === 0 BUT error 존재
- Phase 2 guard: `(textChunks.length > 0 || error) && <ChatMessage ... content="" error={error} />`
- 렌더: `[chip] [빈 bubble 미렌더] [error banner 노출]` — ChatMessage bubble wrapper는 `(content || isUser)` guard로 미렌더되지만 error banner는 **부모 flex-col의 조건부 분기 안**에 있으므로 ChatMessage가 렌더됨.
- **Verified via Phase 2 Part D guard.** 이 케이스는 Phase 2 research가 이미 커버.
- **Phase 3 Option C layout:** `[chip] [ChatMessage (bubble 없음, banner 있음)]` → 시각적으로 `[chip 세로] [error banner]`. OK.

**Scenario 5: 툴 호출 output-error (한 개 도구가 실패)**
- `part.state === 'output-error'`
- 이건 useChat.error가 아니라 **chip state**. 툴 자체가 실패했지만 stream은 정상 진행.
- 렌더: chip (빨간 AlertCircle + "법령 검색 실패: 근로기준법") + 다음 step의 chip + text
- useChat.error는 undefined (stream 정상)
- **Phase 3 chip이 자체적으로 실패 상태를 표시.** error banner는 렌더 안 됨.

### 결론

Phase 2 error UX와 Phase 3 chip UX는 **서로 다른 channel** — banner는 stream-level failure, chip은 tool-level failure. 두 개가 동시에 발생할 수 있지만 layout 상 겹치지 않음. **No regression risk.**

**Plan에 scenario 1~5 모두 manual UAT로 검증할 것 권장.**

---

## 9. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible/expand block | Custom React state for open/closed | Native `<details><summary>` | Built-in keyboard accessibility, zero JS, zero state, D-06 명시 |
| Loading spinner | Custom rotating SVG | `Loader2` from lucide-react + `animate-spin` | 이미 프로젝트에 있음, CSS transform 기반, D-02 |
| Skeleton bar | `div className="animate-pulse bg-gray-200"` | `<Skeleton />` from `@/components/ui/skeleton` | 이미 shadcn component로 존재, D-11 명시, `bg-muted` + cn() composition 통일 |
| State machine for tool state | `useReducer` or `useState` to track `"pending" | "done" | "error"` | `DynamicToolUIPart.state` discriminated union 직접 switch | AI SDK가 이미 전이를 관리. useState 추가 = 중복 + drift |
| Korean tool name lookup | Inline ternary `name === "search_law" ? "법령 검색" : ...` | `lib/tool-labels.ts` map | D-04 + TOOL-02 요구사항. 파일 분리 = 한 곳 수정 = 유지보수 |
| JSON stringify with null safety | `JSON.stringify(x)` without try/catch | Try/catch wrapper with String(x) fallback | MCP output이 BigInt/circular면 throw. §7 serializeOutput 참조 |

**Key insight:** Phase 3는 **기존 컴포넌트를 조합**하는 UI 작업이지 **새 아키텍처를 만드는** 작업이 아님. 90% shadcn + lucide + Tailwind 조합, 10% 새 React 컴포넌트 1개(ToolInvocationView) + 선택적 1개(StreamingSkeletonBubble).

---

## 10. Common Pitfalls

### Pitfall 1: `part.input`을 `input-streaming` 상태에서 readAccess
**What goes wrong:** `part.input.query`에 접근했는데 `input === undefined`여서 TypeError.
**Why it happens:** `DynamicToolUIPart` union 타입에서 `input-streaming` 상태는 `input: unknown | undefined`. TypeScript가 narrowing 없이는 undefined 가능성을 알려줌.
**How to avoid:** `part.state === "input-streaming"`일 때는 argPreview를 빈 문자열로 처리. §7의 `argPreview` 계산 참조.
**Warning signs:** `Cannot read property 'query' of undefined` in devtools console.

### Pitfall 2: `getToolName(part)` 없이 `part.toolName` 직접 접근
**What goes wrong:** `ToolUIPart<UITools>` path에서 `toolName` 필드가 존재하지 않음 (type은 `tool-{NAME}`).
**Why it happens:** static tool vs dynamic tool의 shape 차이. Phase 1 ToolChip은 이미 `getToolName`을 쓰고 있음.
**How to avoid:** Phase 1 패턴 그대로 `getToolName(part)` 호출. Plan이 이걸 기억하도록 예시 코드에 포함.
**Warning signs:** TS 컴파일 에러 "`toolName` does not exist on type".

### Pitfall 3: `<details>` 내부의 `<pre>` overflow
**What goes wrong:** 긴 JSON이 bubble width를 넘어 horizontal overflow 생기고 layout이 깨짐.
**How to avoid:** `overflow-x-auto whitespace-pre-wrap break-words`. §7 참조.
**Warning signs:** 가로 스크롤바가 message bubble에 생김.

### Pitfall 4: D-04 argKey를 blind하게 따라가다 chip에 `undefined` 렌더
**What goes wrong:** CONTEXT.md의 D-04 `lawName`/`keyword`/`caseId` 4개 argKey가 실제 MCP input에 없어 `"법령 본문 중: undefined"` 렌더.
**How to avoid:** §3의 실측 기반 fallback priority list 사용. tool-labels.ts에 scheama-verified comment 필수.
**Warning signs:** Chip에 `undefined`가 보이거나 완전히 빈 인자. Phase 3 UAT에서 첫 번째로 눈에 띌 것.

### Pitfall 5: `<details>` marker removal이 Safari에서 다르게 동작
**What goes wrong:** `[&::-webkit-details-marker]:hidden`은 WebKit/Chrome용. Firefox는 `list-none` 필요.
**How to avoid:** **두 selector 모두 적용**. §7의 예시 코드가 둘 다 포함.
**Warning signs:** Firefox에서만 삼각형 marker가 남아있음.

### Pitfall 6: parts 순서와 Gemini의 step 구조 혼동
**What goes wrong:** 여러 `step-start` 사이에 tool parts가 interleave돼 있는데, chip이 순서대로 쌓이지 않을 것 같다고 오해.
**Clarification:** `[step-start, dynamic-tool, step-start, dynamic-tool, text]` 순서 그대로 `parts.forEach`에서 순회하면 자연스럽게 chip 순서가 보장됨. AI SDK 6가 stream 순서대로 parts를 push함.
**Verified:** Phase 1 live smoke에서 `step-start > tool > step-start > tool > step-start > text` 순서 관찰.

### Pitfall 7: `bg-success/10` / `text-success` CSS variable 미정의
**What goes wrong:** 프로젝트에 `--success` CSS variable이 없으면 Tailwind 4에서 클래스가 무효.
**How to verify:** `grep '\-\-success' frontend/src/app/globals.css` 또는 컴포넌트 실행 후 devtools inspect.
**Fallback:** 없으면 `bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300`. 또는 `--success`를 `globals.css`에 추가 (Phase 3 scope 내).
**Plan action:** Wave 0 검증 스텝에 "grep --success" 넣기.

---

## 11. Runtime State Inventory

본 Phase는 rename/refactor가 아닌 **new component + extension** 이므로 runtime state category는 대부분 "None":

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — localStorage에 저장된 parts 구조는 Phase 1이 이미 확립. Phase 3은 read만. | none |
| Live service config | None — MCP 서버 설정 변경 없음. Vercel/Next.js config 무변경. | none |
| OS-registered state | None — 프런트엔드 빌드만. | none |
| Secrets/env vars | None — LAW_API_KEY는 서버 전용, 프런트엔드는 인증 상태만 사용. | none |
| Build artifacts | None — 새 파일이 tsc/webpack 빌드에 자동 포함. | none |

---

## 12. Environment Availability

Phase 3는 **순수 프런트엔드** 변경이므로 외부 의존성 없음. 설치된 node_modules만 사용:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai` (DynamicToolUIPart type) | ToolInvocationView | OK | 6.0.158 | — |
| `@ai-sdk/react` (useChat) | chat-container | OK | 3.0.160 | — |
| `lucide-react` (Loader2, Check, AlertCircle) | ToolInvocationView | OK | 1.8.0 | — |
| `tailwindcss` | all components | OK | 4.x | — |
| `@/components/ui/skeleton` (shadcn) | StreamingSkeletonBubble | OK | existing | — |
| MCP server (runtime probe) | schema verification | OK | live | Phase 1 smoke data |
| `LAW_API_KEY` env | live MCP probe (research only) | OK | `frontend/.env.local` | — |

**No missing dependencies.** Phase 3 plan 착수 전 추가 설치 없음.

---

## 13. Validation Architecture (Nyquist)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | tsc + eslint + next build + manual UAT (프로젝트가 Playwright 미설치) |
| Config file | `frontend/tsconfig.json`, `frontend/eslint.config.*` |
| Quick run command | `cd frontend && npx tsc --noEmit && npm run lint` |
| Full suite command | `cd frontend && npm run build` |
| Manual UAT | OAuth-gated `/` route (Vercel production or local dev with NextAuth) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOOL-01 | 4 state별 chip 렌더 | tsc + manual UAT | `npx tsc --noEmit` + visual check on `/` | OK |
| TOOL-02 | tool-labels.ts map에 4개 도구 | static grep | `grep -c "search_law\|get_law_text\|search_decisions\|get_decision_text" frontend/src/lib/tool-labels.ts` — expect 4 | OK post-create |
| TOOL-03 | 동사 시제 chip ("법령 검색 중: {인자}") | static grep + manual UAT | `grep -n "법령 검색" frontend/src/lib/tool-labels.ts` + visual on `/` | OK post-create |
| TOOL-04 | `<details>` 접힘 + 펼침 | static grep + manual UAT | `grep -n "<details" frontend/src/components/chat/tool-invocation-view.tsx` + visual click | OK post-create |
| TOOL-05 | 세로 체크리스트 스택 | static grep + manual UAT | `grep -n "flex flex-col" frontend/src/components/chat/message-part-renderer.tsx` + visual check | OK post-edit |
| TOOL-06 | "검색 중..." 제거 + skeleton | static grep | `grep '검색 중' frontend/src/components/chat/chat-container.tsx` — expect 0 | OK post-edit |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (30초 이내)
- **Per wave merge:** `cd frontend && npm run build && npm run lint`
- **Phase gate:** Manual UAT on `/` route (OAuth) + UAT checklist (§13.4)

### Wave 0 Gaps

본 프로젝트는 **Playwright가 아직 설치 안 됨**. Phase 1/2에서도 local manual smoke와 production UAT로 검증. Phase 3의 **Playwright 전환 여부는 Plan에서 결정**:

- [ ] **Playwright 스킵 옵션 A (권장):** Phase 1/2 패턴 그대로 — manual UAT만, Plan 마지막 plan에서 UAT checklist 실행
- [ ] **Playwright 설치 옵션 B:** `npm install -D @playwright/test && npx playwright install` — Phase 3에 새 의존성 도입. Out of CONTEXT scope → 권장 안 함
- [ ] **Static grep 검증 (둘 다 가능):**
  - `lib/tool-labels.ts` 생성 확인
  - `tool-invocation-view.tsx` 생성 확인
  - `검색 중` 문자열 제거 확인
  - `animate-spin`, `<details>` presence grep

**권장: Option A + static grep.** Phase 1/2와 일관.

### UAT Checklist (manual, Plan 마지막 task에서 실행)

Production URL (`frontend-phi-six-16.vercel.app/`) 로그인 후:

1. **TOOL-01:** "근로기준법 제60조 연차휴가" 질문 → chip 3개 예상 (`search_law` → `get_law_text` → `text`)
2. **TOOL-02:** chip 라벨이 `법령 검색`, `법령 본문` 한국어로 표시되는지 확인
3. **TOOL-03:** 첫 chip은 `법령 검색 중: 근로기준법` → 완료 후 `법령 검색 완료: 근로기준법` 전환 확인
4. **TOOL-04:** chip의 `> 상세` 클릭 → Request/Response JSON 노출 확인 → 다시 클릭 → 접힘 확인
5. **TOOL-05:** chip이 세로로 2개 쌓이는지 (flex-col), 번호 없는지 확인
6. **TOOL-06:** 질문 전송 직후 "검색 중..." 텍스트 **없음** 확인, 대신 skeleton bar 3줄 확인
7. **Regression: Phase 2 error UX 공존:** 네트워크 차단 → 질문 → error banner + retry 버튼이 여전히 동작하는지 확인
8. **Regression: Phase 1 text 렌더:** 정상 질문에서 답변 text가 chip 아래에 마크다운으로 렌더되는지 확인
9. **output-error chip:** (랜덤성 높음) MCP 서버가 503 반환하는 drainage 상태에서 chip이 빨간 `AlertCircle`로 전환되는지 확인 — optional, 재현 어려우면 skip

### test-sidebar/page.tsx 주의

`/test-sidebar`는 plain `<div>{m.role}: {extractAssistantText(m)}</div>`를 사용해 **MessagePartRenderer를 쓰지 않음** (Read 결과 확인). 따라서 **Phase 3 변경사항은 `/test-sidebar`에 전혀 렌더되지 않음.**

**선택지:**
- **Option A (권장):** test-sidebar는 Phase 3 scope 밖. 현재 상태 유지. Phase 5 CLEAN-04가 이 파일을 **삭제**할 계획이므로 Phase 3에서 건드릴 이유 없음.
- **Option B:** test-sidebar를 `<MessagePartRenderer>`로 바꿔 Phase 3 로컬 검증 가능하게 만듦. 하지만 chat-container에 종속된 props(`isFavorite`, `onToggleFavorite`, etc.)가 많아 간단치 않음.

**권장: Option A.** Plan은 manual UAT on `/` 로 검증. `/test-sidebar`는 Phase 5에서 삭제 예정.

---

## 14. Security Domain

CONTEXT에 `security_enforcement`가 명시적으로 false가 아니므로 기본 enabled로 취급.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 3 전반 NextAuth-gated, 무관 |
| V3 Session Management | no | 동일 |
| V4 Access Control | no | 동일 |
| V5 Input Validation | yes (minor) | `part.input`/`part.output` serialize 시 try/catch (§7). React JSX는 기본 escape |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via tool output JSON | Tampering (T) | React JSX 기본 escape. 위험 HTML 삽입 API 미사용. `<pre>{serialized}</pre>`는 안전 |
| XSS via tool name | T | `getToolName(part)`이 string return > JSX child로 안전 |
| LAW_API_KEY leak in `<details>` | Info Disclosure (I) | **Critical.** tool input에 `apiKey` 필드가 스키마상 존재. serializeInput에서 redact (§7 구현) |

### Key Redaction (NEW threat from research probe)

MCP schema 확인 시 **각 도구 input에 `apiKey` property를 정의**했음:
```json
"apiKey": {
  "description": "법제처 Open API 인증키(OC)",
  "type": "string"
}
```

Gemini가 이 필드에 LAW_API_KEY를 넘기지 않는 것이 상식이지만, **만약 넘기면 `<details>` 펼침 시 사용자 devtools에 노출**. Phase 1 route.ts의 `/oc=[^&\s"]+/g → REDACTED` pattern을 client에도 적용해야 할 수 있음.

**구현:** §7의 `serializeInput`이 object를 stringify하기 전에 `apiKey` 키를 `undefined`로 덮어씀 → JSON.stringify가 자동 drop.

Plan에 **Security threat T-03-01: apiKey redaction in `<details>`** 반드시 포함.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bg-success/10` CSS variable이 프로젝트에 정의되어 있다 | §7 | chip이 초록색 없이 기본색으로 렌더. Plan Wave 0에서 `grep --success frontend/src/app/globals.css` 확인 필수. |
| A2 | Gemini가 `apiKey` 필드를 dynamic-tool input에 blind하게 포함하지 않는다 | §14 | 만약 포함하면 `<details>` 펼침 시 LAW_API_KEY devtools 노출. Mitigation은 제안한 redaction으로 해결. |
| A3 | Phase 5 CLEAN-04가 `/test-sidebar`를 삭제한다 (현재 roadmap 기준) | §13.5 | roadmap 변경 시 test-sidebar 업데이트 필요할 수 있음. ROADMAP.md Phase 5 기준 `CLEAN-04` 삭제 항목 존재 확인 — 유효. |
| A4 | Tailwind 4의 `[&::-webkit-details-marker]:hidden` arbitrary variant가 프로젝트 빌드에서 동작한다 | §7 | Tailwind 4는 arbitrary selector 지원. 실패 시 `list-none`만으로 대체 (firefox OK, chrome/safari marker 일부 남음). |
| A5 | chat-container.tsx의 `isLoading && lastIsUser` predicate가 skeleton bubble의 charge timing과 일치한다 (Approach 1 §6) | §5, §6 | T1 구간(chip 있음, text 없음)에서 skeleton 미표시 — chip spin이 feedback 제공. UAT에서 UX 부족 판단 시 Approach 2로 upgrade. |

---

## Open Questions

1. **`bg-success/10` CSS variable 존재 확인**
   - What we know: Phase 2가 `bg-destructive/5`, `text-success`를 사용 중 (SUMMARY에서 확인). `--destructive`는 확정, `--success`는 미확정.
   - What's unclear: `globals.css`에 `--success` 정의 유무.
   - Recommendation: Plan Wave 0에 `grep '\-\-success' frontend/src/app/globals.css` 확인 스텝 포함. 없으면 **추가하거나** `bg-green-*` 하드코딩.

2. **`_meta`/`title` 필드가 dynamic-tool UI에 보일 가치가 있는지**
   - AI SDK 6 타입에 `title?: string` 필드 존재. MCP 서버가 이 필드를 채울 수 있음.
   - Phase 3 scope에는 없음 (v2 후보).
   - Recommendation: 무시.

3. **`preliminary?: boolean` in `output-available` 상태**
   - MCP tool이 partial output을 먼저 emit하는 경우. 라이브 업데이트 가능.
   - korean-law-bot MCP는 이 플래그를 사용 안 함 (확인 불가, 하지만 Phase 1 smoke에서 없음).
   - Recommendation: Phase 3는 무시. v2에서 progressive rendering 고려.

4. **MCP의 15개 tool 중 Gemini가 실제 호출하는 빈도**
   - `chain_*` 시리즈는 Gemini가 **법령 구조/영향도 분석 query**에만 호출 가능.
   - 일상 법령 질문(Phase 1 smoke 수준)에서는 `search_law` + `get_law_text`만.
   - Recommendation: Phase 3는 D-04 4개만 매핑. unknown fallback이 raw 이름으로 렌더되는 걸 수용. v2에서 15개 전체 매핑.

---

## Code Examples (Verified Patterns)

### Example 1: ToolInvocationView 전체 (§7)
위 §7 참조. 150줄 전후.

### Example 2: Chip-only (minimal) test render

```typescript
// 테스트용 — MessagePartRenderer 바깥에서 독립 렌더 가능
<ToolInvocationView
  part={{
    type: "dynamic-tool",
    toolCallId: "test-1",
    toolName: "search_law",
    state: "input-available",
    input: { query: "근로기준법", display: 20 },
  } as DynamicToolUIPart}
/>
```

### Example 3: chat-container predicate change (§6)

```typescript
// chat-container.tsx L219-221 현재
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <ChatMessage role="assistant" content="검색 중..." />
)}

// Phase 3
{isLoading && messages[messages.length - 1]?.role === "user" && (
  <StreamingSkeletonBubble />
)}
```

### Example 4: tool-labels.ts 전체 (§3)
§3의 TOOL_LABELS/getToolLabel/getToolArgPreview 참조. ~70줄.

---

## State of the Art

| Old Approach (Phase 1) | New Approach (Phase 3) | When Changed | Impact |
|------------------------|------------------------|--------------|--------|
| Single `ToolChip` function in MessagePartRenderer, 30 lines | Separate `ToolInvocationView` component file, ~150 lines | Phase 3 | 책임 분리, test 용이, v2 확장 단위 |
| Hard-coded state labels in switch ("입력 준비 중") | Tense-based Korean labels via `resolveVisual()` | Phase 3 D-03 | 시제 변화, 아이콘, 색상 일관 |
| Single `bg-muted` color for all states | State-specific colors (bg-muted/bg-success/10/bg-destructive/10) | Phase 3 D-01 | 시각적 state discrimination |
| No icon | Loader2/Check/AlertCircle icons | Phase 3 D-02 | 스캔 속도 |
| No details block | `<details>` with Request+Response JSON | Phase 3 D-05/D-06 | 투명성, 디버깅 가능 |
| Static `"검색 중..."` string | Skeleton bar (3줄) | Phase 3 D-10/D-11 | 정보량 증가, layout stability |

---

## Sources

### Primary (HIGH confidence — verified by direct inspection)

- `frontend/node_modules/ai/dist/index.d.ts:1879-1966` — DynamicToolUIPart 7-state union type
- `frontend/node_modules/ai/dist/index.d.ts:3680` — ChatStatus union
- `frontend/node_modules/ai/dist/index.d.ts:1992,2009` — isToolUIPart, getToolName signatures
- `frontend/node_modules/lucide-react/dist/esm/lucide-react.js:42,131,533` — Loader2, Check, AlertCircle exports
- `frontend/node_modules/lucide-react/package.json` — version 1.8.0
- `frontend/package.json` — dependency matrix
- Live MCP probe (2026-04-13) — `https://glluga-law-mcp.fly.dev/mcp?oc=***` `mcpClient.tools()` — 15 tools, 4 D-04 tools' actual inputSchema.jsonSchema
- `frontend/src/components/chat/message-part-renderer.tsx` (current 211 lines) — Phase 1+2 current state
- `frontend/src/components/chat/chat-message.tsx` (current 129 lines) — Phase 2 bubble+error structure
- `frontend/src/components/chat/chat-container.tsx` (current 352 lines) — Phase 2 global error removal + standalone bubble
- `frontend/src/components/ui/skeleton.tsx` — shadcn Skeleton props
- `frontend/src/lib/ui-message-parts.ts` — Phase 1 re-exports
- `frontend/src/app/test-sidebar/page.tsx` — plain div, no MessagePartRenderer
- `law/tools.py` — Python Slack bot tool schemas (cross-reference for MCP)

### Secondary (MEDIUM confidence — existing project research)

- `.planning/research/STACK.md:138-149` — dynamic-tool vs tool-{name} explanation
- `.planning/research/ARCHITECTURE.md:85,251,447-470,548-550` — MCP tool part flow, chip migration plan, pitfalls
- `.planning/research/FEATURES.md:35,40,47-78,304-305,371` — Cursor-style tool blocks, verb-tense, Korean labels
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-02-SUMMARY.md` — MessagePartRenderer + ToolChip structure
- `.planning/phases/02-streaming-stability-error-ux/02-02-SUMMARY.md` — Phase 2 error prop pass-through
- `.planning/phases/02-streaming-stability-error-ux/02-RESEARCH.md` — `useChat.error`, `regenerate`, ChatStatus patterns

### Tertiary (contextual)

- AI SDK 6 CHANGELOG (inferred from installed package + type definitions)
- Tailwind 4 arbitrary variant documentation (assumed from Tailwind 4.0 release notes)
- MDN `<details>` element specification (native behavior assumed)

---

## Metadata

**Confidence breakdown:**
- DynamicToolUIPart API shape: HIGH — read installed `.d.ts` directly
- MCP tool schema: HIGH — live probe with real API key, 2026-04-13
- lucide-react exports: HIGH — read installed bundle
- D-04 argKey defect: HIGH — cross-referenced live probe + Python Slack bot + Phase 1 smoke evidence
- Phase 1+2 current state: HIGH — full file reads
- Migration path (Option C): MEDIUM — architectural judgment, not externally verified
- Skeleton Approach 1 vs 2: MEDIUM — UX judgment, validate in UAT
- `bg-success/10` availability: LOW — assumption, Plan Wave 0 to verify
- Tailwind 4 `[&::-webkit-details-marker]:hidden`: MEDIUM — arbitrary variant support standard in Tailwind 4

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (30 days — AI SDK 6 stable; MCP schema drift risk = LOW but tool-labels.ts drift monitor must be part of Plan)

*Phase: 03-tool-call-ui-feedback*
*Research completed: 2026-04-13*
