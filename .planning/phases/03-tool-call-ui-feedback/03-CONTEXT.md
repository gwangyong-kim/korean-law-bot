# Phase 3: Tool Call UI Feedback - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

사용자가 "어떤 법령을 찾는 중인지" 실시간으로 알 수 있고, 툴 호출 이력이 접히는 세부 블록에서 확인 가능한 UI. Phase 1의 `MessagePartRenderer`가 갖춘 minimal chip을 4가지 상태별 색상/아이콘/시제/인자 표시로 고도화하고, 여러 도구 호출을 세로 체크리스트로 스택하며, 기존 "검색 중..." 정적 문자열을 chip + skeleton bubble로 대체한다.

**In scope:** TOOL-01~06 전체. `tool-labels.ts` 신설, `DynamicToolUIPart` 4가지 상태 분기, 시제 chip, `<details>` 접힘, 세로 체크리스트 스택, skeleton bubble.

**Out of scope:** Live `input-streaming` 인자 프리뷰 (v2 V2-TOOL-01), 도구별 아이콘 이모지 (v2 V2-TOOL-04), 도구 경과 시간 (v2 V2-TOOL-03), 결과 개수 chip (v2 V2-TOOL-02).

</domain>

<decisions>
## Implementation Decisions

### A. Chip 디자인 (색상/아이콘/시제)
- **D-01:** 상태별 semantic 색상 팔레트 — `input-streaming` / `input-available`: `bg-muted text-muted-foreground` (회색), `output-available`: `bg-success/10 text-success` (초록), `output-error`: `bg-destructive/10 text-destructive` (빨강). 다크모드는 CSS var 기반 (`--success`, `--destructive`)으로 자동 반영.
- **D-02:** 아이콘은 **lucide-react 기존 라이브러리 재사용** (프로젝트에 이미 설치됨). 상태별 매핑:
  - `input-streaming` / `input-available` → `Loader2` (회전 애니메이션 `animate-spin`)
  - `output-available` → `Check`
  - `output-error` → `AlertCircle`
  이미지·이모지 추가 의존성 없음.
- **D-03:** 시제 변화: 진행 중 `'{도구명} 중: {인자}'` → 완료 `'{도구명} 완료: {인자}'` → 실패 `'{도구명} 실패: {인자}'`. 한국어 자연스러운 동사 시제. 예:
  - "법령 검색 중: 근로기준법" → "법령 검색 완료: 근로기준법"
  - "판례 검색 실패: 부당해고"
- **D-04:** 첫 인자(케이스 인자) 표시는 **도구별 기준 코하드**로 매핑. `lib/tool-labels.ts`에서:
  ```ts
  { name: 'search_law', label: '법령 검색', argKey: 'query' }
  { name: 'get_law_text', label: '법령 본문', argKey: 'lawName' }
  { name: 'search_decisions', label: '판례 검색', argKey: 'keyword' }
  { name: 'get_decision_text', label: '판례 본문', argKey: 'caseId' }
  ```
  각 도구의 "사용자가 알아볼 인자"만 chip에. 2000자 초과 시 20자 + `...` truncate.

### B. Details 펼침 내용
- **D-05:** `<details>` 펼치면 노출:
  1. Request args 전체 JSON (`JSON.stringify(args, null, 2)` + `<pre>` 태그)
  2. Response body raw (2000자 truncate + `... (truncated)` 표시)
  3. syntax highlighting 없음 (prism/shiki 미도입)
- **D-06:** 접힘 상태가 기본. `<details>` native HTML element 사용해 JS 없이 토글. Tailwind prose 스타일 + `font-mono text-xs`.

### C. 다중 호출 스택 구성
- **D-07:** 여러 도구 호출은 **assistant bubble 상단에 세로 체크리스트**로 스택. 번호 없이 각 chip이 독립적인 줄. 위→아래 순서는 parts 배열 순서(= AI SDK 6이 결정한 호출 순서).
- **D-08:** 텍스트 응답은 chip 블록 아래에 렌더링. 즉 `[chip1][chip2][chip3]\n\n{answer text}` 레이아웃. 사용자가 "도구를 썼고 → 그 결과로 이렇게 답했다" 플로우를 시각적으로 인식.
- **D-09:** 그룹 상자(border/background wrapping) 없음. 각 chip이 `<div>` 라인으로, 버틀팅/점 없음. 미니멀.

### D. Skeleton 교체 + 기존 제거
- **D-10:** 기존 `chat-container.tsx:197-199`의 정적 `<ChatMessage role="assistant" content="검색 중..." />`를 **완전 제거**. `isLoading && lastRole === 'user'` 분기 삭제.
- **D-11:** 대체 UX: assistant turn이 시작되면 (`status === 'streaming'` + `messages.at(-1).role === 'assistant'`) **chip(s) + skeleton bubble 조합**:
  - 첫 tool part 도착 전: skeleton bar 3줄 (`components/ui/skeleton.tsx` 기존 재사용)
  - tool part 도착: chip 블록 표시 + skeleton bar 유지
  - text part 도착: skeleton bar 사라지고 실제 텍스트로 전환
  - output-available/output-error 도착: chip 시제 업데이트
- **D-12:** `chat-message.tsx`가 text content가 비어있을 때(`!content.trim()`)는 skeleton bar 렌더링. parts prop을 추가로 받아 chip 블록 렌더링. 즉 `ChatMessage` 컴포넌트가 parts-aware로 확장.

### Claude's Discretion
- chip 세부 padding, rounded 반경, gap 간격
- Loader2 회전 속도
- truncate 문자 수 미세 조정 (1500 vs 2000 vs 3000)
- `lib/tool-labels.ts`의 정확한 export 이름
- skeleton bar 개수(3줄이 기본이지만 2~4 허용)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 정의
- `.planning/REQUIREMENTS.md` §Tool Call UI Feedback — TOOL-01~06 전체 (라벨 매핑 locked)
- `.planning/ROADMAP.md` §Phase 3 — Goal, Dependencies (Phase 1 parts 계약, Phase 2 에러 상태 공존)

### Codebase 맥락
- `.planning/codebase/STACK.md` — lucide-react, shadcn, Tailwind 4
- `.planning/phases/01-empty-message-bug-fix-parts-contract/01-CONTEXT.md` — MessagePartRenderer 구조 (Phase 3에서 고도화)
- `.planning/phases/02-streaming-stability-error-ux/02-CONTEXT.md` — 에러 상태/재시도 UX (output-error chip이 이 UX와 공존)

### 수정 대상 파일
- `frontend/src/components/chat/chat-message.tsx` — parts prop 추가, chip 블록 렌더링, skeleton fallback
- `frontend/src/components/chat/chat-container.tsx` — 정적 "검색 중..." 제거 (line 197-199)
- `frontend/src/lib/ui-message-parts.ts` — Phase 1에서 신설된 모듈. 필요 시 chip 렌더링 헬퍼 추가
- `frontend/src/lib/tool-labels.ts` — **신규**. 4개 도구 한국어 라벨 + argKey 매핑
- `frontend/src/components/chat/tool-invocation-view.tsx` — **신규** (또는 MessagePartRenderer 내부에 추가). dynamic-tool 4가지 상태 분기 컴포넌트
- `frontend/src/components/ui/skeleton.tsx` — 기존 재사용 (추가 변경 없음)

### 외부 문서
- AI SDK 6 `DynamicToolUIPart` 타입 정의 — 4가지 상태(`input-streaming`, `input-available`, `output-available`, `output-error`) 필드 구조 (Context7로 최신 확인)
- `<details>` MDN — native 토글 접근성

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/skeleton.tsx` — shadcn Skeleton. parts 없는 상태에서 사용.
- `lucide-react` — Scale, User, Copy, Check, Star, Loader2, AlertCircle 모두 사용 가능 (import 추가만).
- `chat-message.tsx`의 ReactMarkdown + remarkGfm 렌더링 — text 파트 렌더링 그대로 재사용.
- `lib/utils.ts` `cn()` — Tailwind merge.

### Established Patterns
- **semantic 색상 변수**: `text-destructive`, `bg-primary/10`, `text-muted-foreground` 등 이미 사용 중. 새로 CSS var 정의 불필요.
- **중앙 집중 state**: `chat-container.tsx`의 `messages` 배열에서 parts를 순회. `MessagePartRenderer`는 각 part를 받아 분기 렌더링 (Phase 1 결과).
- **Minimal 컴포넌트 분할**: Phase 1에서 MessagePartRenderer 신설됨. Phase 3에서 `ToolInvocationView`를 분리하거나 MessagePartRenderer 내 switch 확장할 수 있음.

### Integration Points
- `MessagePartRenderer`의 `dynamic-tool` case에서 `ToolInvocationView`를 호출. 현재(Phase 1) minimal chip 렌더링 → Phase 3에서 색상/아이콘/시제/details로 확장.
- `chat-message.tsx`에 parts prop 추가 → text는 ReactMarkdown, tool parts는 chip 블록.
- `chat-container.tsx`의 static "검색 중..." 분기 제거 + skeleton fallback을 chat-message로 이동.

### Known Pitfalls
- `DynamicToolUIPart`의 field name은 AI SDK 6 버전마다 변할 수 있음. research 시점에 `node_modules/@ai-sdk/react/dist/types` 또는 Context7로 확인.
- `<details>`는 기본 스타일(삼각형 marker)이 브라우저마다 상이. `marker:` Tailwind 유틸 또는 `::marker` 초기화.
- `Loader2 animate-spin`은 CSS transform + rotate 기반. reduced-motion 사용자 설정 존중 여부는 스코프 밖(v2).
- skeleton bar 3줄은 `space-y-2` + `h-4 w-*/4` 조합. accessibility는 `aria-busy="true"`.

</code_context>

<specifics>
## Specific Ideas

- "동사 시제"가 사용자 경험의 핵심 — 진행/완료/실패를 한 눈에 구분.
- 기존 "검색 중..." bubble은 정보량 제로 → 삭제가 가장 깔끔.
- details 접힘 기본은 개발자 모드가 아닌 사용자를 위해 — 궁금할 때만 펼침.
- 다중 호출 스택이 번호 없이 체크리스트인 이유: 대부분 1~3개 호출만 발생, 번호는 소음.

</specifics>

<deferred>
## Deferred Ideas

- Live `input-streaming` 인자 델타 프리뷰 — v2 V2-TOOL-01 (Gemini가 실제로 인자 델타를 스트리밍한다는 전제, Phase 3 관찰 후 결정)
- 도구별 이모지 아이콘 — v2 V2-TOOL-04
- 경과 시간 표시 — v2 V2-TOOL-03
- 결과 개수 chip ("12건 발견") — v2 V2-TOOL-02
- raw JSON syntax highlighting — 의존성 증가, v2
- reduced-motion 대응 — v2 접근성
- 도구 호출 이력 필터/검색 — v2

</deferred>

---

*Phase: 03-tool-call-ui-feedback*
*Context gathered: 2026-04-13*
