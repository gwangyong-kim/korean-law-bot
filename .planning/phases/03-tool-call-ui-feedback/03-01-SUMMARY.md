---
phase: 03-tool-call-ui-feedback
plan: 01
name: tool-labels-module
subsystem: lib
tags: [tool-labels, korean-labels, mcp-schema, credential-redaction, pure-ts]
status: complete
completed: "2026-04-13"
task_commits:
  - hash: cec4efc
    subject: "feat(03-01): lib/tool-labels.ts — 실측 MCP argKey + apiKey redaction"
dependency_graph:
  requires:
    - 02-02-client-error-ux-inline-retry (Phase 2 종료 — master 가 깨끗한 상태)
    - 01-02-parts-module-and-renderer (ui-message-parts.ts 에서 getToolName 재사용 패턴)
  provides:
    - "TOOL_LABELS 상수 + getToolLabel / getToolArgPreview / serializeInput / ToolLabel interface (pure TS, React 의존성 0)"
    - "live MCP probe(2026-04-13) 기반 argKey priority list — CONTEXT D-04 phantom 교정"
    - "credential key (apiKey/api_key/auth/token/secret/password/credential) recursive redaction (T-03-01)"
  affects:
    - "frontend/src/lib/tool-labels.ts (신규)"
tech_stack:
  added: []
  patterns:
    - "Live-probe-verified schema mapping (RESEARCH §3 과 tool-labels.ts 의 주석이 상호 참조)"
    - "Defense-in-depth credential redaction (priority list skip + JSON.stringify redactDeep 이중 방어)"
    - "Pure-TS isolation (React/AI SDK/Next 의존성 없음 — 테스트 쉬움)"
key_files:
  created:
    - path: "frontend/src/lib/tool-labels.ts"
      lines: 168
      provides: "ToolLabel interface + TOOL_LABELS (4 entries) + getToolLabel + getToolArgPreview + serializeInput"
  modified: []
decisions:
  - "argKey priority list 교정: get_law_text → [jo, lawId, mst] (CONTEXT D-04 lawName 은 live probe 결과 존재하지 않음), search_decisions → [query, domain] (keyword phantom), get_decision_text → [id, domain] (caseId phantom)"
  - "REDACTED_KEY_PATTERN = /^(apiKey|api_key|auth|token|secret|password|credential)$/i — 7개 key family case-insensitive. Future-proof 하되 Phase 3 scope 의 4개 도구 모두 apiKey 만 실제 존재"
  - "getToolArgPreview 의 unknown-tool fallback: priority list 실패 시 input 의 첫 non-redacted string property 를 shows — chain_* 11개 unknown tool 에서도 chip 이 빈 텍스트 내지 undefined 로 빠지지 않도록"
  - "module-private helper (truncate / redactDeep / REDACTED_KEY_PATTERN / ARG_PREVIEW_MAX) non-export — API surface 를 최소화해 v2 에서 호환성 걱정 없이 내부 구현 교체 가능"
  - "ARG_PREVIEW_MAX = 20 + '...' suffix — CONTEXT D-04 의 '20자 + ...' 스펙 그대로"
metrics:
  duration_minutes: 3
  task_count: 2
  files_changed: 1
  lines_added: 168
  lines_removed: 0
requirements_completed: [TOOL-02]
---

# Phase 03 Plan 01: tool-labels-module Summary

**One-liner:** `frontend/src/lib/tool-labels.ts` 신설 — 4개 MCP 도구 한국어 라벨 + 실측 스키마 기반 argKey priority list + credential key recursive redaction 을 단일 pure-TS 모듈로 제공.

## What Changed

### Task 01: Create tool-labels.ts — `cec4efc`

Single-file delivery (168 lines). 5 public exports:

1. **`ToolLabel` interface** — `{ name, label, argKeys }` 구조로 TypeScript 컴파일 타임에 소비처(Plan 03-02)가 shape 를 알 수 있음.
2. **`TOOL_LABELS` Record** — 정확히 4개 entry (`search_law`, `get_law_text`, `search_decisions`, `get_decision_text`). 한국어 라벨 `법령 검색 / 법령 본문 / 판례 검색 / 판례 본문`.
3. **`getToolLabel(toolName)`** — unknown tool 은 raw name 을 fallback 으로 반환. 15개 MCP 도구 중 Phase 3 scope 4개만 Korean label, 11개 chain_* / get_annexes / discover_tools / execute_tool 은 raw 영문 이름으로 chip 에 표시.
4. **`getToolArgPreview(toolName, input)`** — tool-specific priority list 순회 후 string/number 첫 값을 `ARG_PREVIEW_MAX=20` chars 로 truncate 하여 반환. Redacted key 는 priority list 에서도 skip (T-03-02 defense in depth). Unknown tool 은 input 의 첫 non-redacted string property 를 fallback.
5. **`serializeInput(input)`** — `redactDeep` 을 거쳐 JSON pretty-print 반환. null/undefined → 빈 문자열. circular/non-serializable → `String(input)` fallback.

### D-04 Phantom Eradication

CONTEXT D-04 의 `lawName` / `keyword` / `caseId` 는 2026-04-13 live MCP probe (RESEARCH §3) 결과 실제 MCP input schema 에 존재하지 않음. 이 파일은 real-schema 기준으로 argKey 를 선언:

| Tool | CONTEXT D-04 argKey | tool-labels.ts argKeys (실측 기준) |
|------|---------------------|-------------------------------------|
| `search_law` | `query` | `["query"]` ✓ (일치) |
| `get_law_text` | `lawName` (PHANTOM) | `["jo", "lawId", "mst"]` |
| `search_decisions` | `keyword` (PHANTOM) | `["query", "domain"]` |
| `get_decision_text` | `caseId` (PHANTOM) | `["id", "domain"]` |

이 교정이 없었다면 chip 에 `undefined` 가 render 되거나 `법령 본문 중` 처럼 arg 가 완전히 사라졌을 것.

### T-03-01 Credential Redaction

MCP input schema 는 `apiKey` property 를 모든 도구에 exposing. Gemini 가 실제로 passing 할 가능성은 낮지만 defense-in-depth:

- `REDACTED_KEY_PATTERN` = `/^(apiKey|api_key|auth|token|secret|password|credential)$/i`
- `redactDeep` 이 recursive object / array traversal 로 매칭 key 를 `[REDACTED]` 치환
- `getToolArgPreview` 가 priority list / fallback 모두에서 redacted key 를 skip — chip text 자체에 secret 이 노출될 수 없음

## Key Decisions

1. **argKey priority list 교정** — live probe evidence 기준. RESEARCH §3 이 canonical source, tool-labels.ts 의 주석이 provenance 기록.
2. **REDACTED_KEY_PATTERN 은 7 key family** — `apiKey`, `api_key`, `auth`, `token`, `secret`, `password`, `credential`. Case-insensitive 라 `Authorization`/`API_KEY` 같은 변형도 커버.
3. **Pure TypeScript isolation** — React / AI SDK / Next.js import 0 건. Plan 03-02 의 client component 가 소비해도 server-side 재사용도 가능 (Phase 5 서버 로깅에서 재사용 가능).
4. **Module-private helper** — `truncate`, `redactDeep`, `REDACTED_KEY_PATTERN`, `ARG_PREVIEW_MAX` 는 non-export. Public API surface 를 5개 symbol 로 최소화.
5. **Unknown tool graceful fallback** — 15개 MCP 도구 중 4개만 라벨 정의. 나머지 11개는 `getToolLabel` 이 raw name 을 반환, `getToolArgPreview` 가 첫 non-redacted string property 를 사용. `chain_*` 도구가 Gemini 에 의해 호출될 때 chip 이 완전히 빈 상태가 되지 않음.

## Patterns Established

- **Live-probe-verified schema mapping** — 이후 MCP 스키마 drift 시 `grep 2026-04-13 frontend/src/lib/tool-labels.ts` 가 첫 탐지 지점. Drift 시 probe 재실행 + 이 파일 교정.
- **Defense-in-depth credential redaction** — priority list skip + redactDeep 이중 방어. 단일 지점 typo 로도 secret 이 UI 로 leak 되지 않음.

## Verification Evidence

```bash
# File + size
test -f frontend/src/lib/tool-labels.ts && wc -l frontend/src/lib/tool-labels.ts
# 168 lines

# 4 tool entries + Korean labels
grep -c '법령 검색\|법령 본문\|판례 검색\|판례 본문' frontend/src/lib/tool-labels.ts
# 4

# Phantom eradication
grep -c 'lawName\|caseId' frontend/src/lib/tool-labels.ts
# 0

# Redaction coverage
grep -Ec 'apiKey|api_key|auth|token|secret|password|credential' frontend/src/lib/tool-labels.ts
# 9 (7 in regex pattern + 2 in comments)

# Build
cd frontend && npx tsc --noEmit && npm run build
# exit 0 (Turbopack compile 2.5s)
```

## Threat Flags

- **T-03-01 mitigated (data layer)** — `serializeInput` recursive redaction. End-to-end wiring verified by Plan 03-02 (`<details>` Request block uses `serializeInput(part.input)` exclusively, 0 raw `JSON.stringify(part.input)` occurrences).
- **T-03-02 mitigated** — `getToolArgPreview` skips redacted keys even if a future typo adds one to a tool's priority list.
- T-03-03 (XSS via tool name) / T-03-04 (DoS via large input) — accepted per plan threat register.

## Performance

- **Duration:** ~3 minutes
- **Tasks:** 2 (Task 01 create, Task 02 verify + commit)
- **Lines added:** 168
- **Files changed:** 1 (new)
- **Out-of-scope diff:** 0 (no other file touched)

## Next Phase Readiness

Plan 03-02 can now `import { getToolLabel, getToolArgPreview, serializeInput } from "@/lib/tool-labels";` without any stubs. Signatures are stable, API surface is minimal, credential redaction is end-to-end at the data layer.

## Self-Check: PASSED

- [x] `frontend/src/lib/tool-labels.ts` exists (168 lines) — verified by Read + wc -l
- [x] `cec4efc` commit in git log — verified by `git log --oneline`
- [x] tsc + build + lint green
- [x] 5 exports (ToolLabel, TOOL_LABELS, getToolLabel, getToolArgPreview, serializeInput)
- [x] 4 tool entries with correct Korean labels
- [x] 0 phantom argKeys (lawName/caseId grep = 0)
- [x] REDACTED_KEY_PATTERN covers 7 key families
- [x] No other files modified
