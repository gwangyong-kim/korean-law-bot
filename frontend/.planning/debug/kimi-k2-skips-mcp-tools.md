---
status: awaiting_human_verify
trigger: "Kimi K2 모델이 /api/chat를 통해 법령 질문을 받았을 때 MCP 도구를 전혀 호출하지 않고 LLM 기억만으로 답변을 생성"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T21:55:00Z
---

## Current Focus

hypothesis: Groq의 Kimi K2 0905 모델은 tool calling이 업스트림에서 깨져있다. 우리 코드는 문제가 없다. fix = Kimi K2를 default에서 제거하고 tool-heavy 질문에 쓰지 말라고 경고 표시.
test: 수정 후 default (gemini-2.5-flash)로 3회 테스트. 2회는 tool-input-available=1 정상 호출 확인. 1회는 Gemini free tier RPM 한도 초과 (예상된 rate_limited 에러).
expecting: (충족됨) Gemini default로 법령 질문 시 MCP 도구 호출. Kimi K2는 greeting 등 non-law에는 여전히 사용 가능.
next_action: 사용자 human-verify 기다림

## Symptoms

expected: Kimi K2가 법령 질문을 받으면 search_law → get_law_text를 호출한 뒤 결과를 근거로 답변. SSE에 tool-input-available, tool-output-available 이벤트 포함
actual: Kimi K2 응답에서 tool-input-available/tool-output-available 이벤트 0개. 텍스트 델타만 바로 스트리밍. finishReason=stop, toolCalls=0.
errors: 평상시(auto) 에러 없음. toolChoice='required' 강제 시 Groq가 "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details." 반환 (invalid_request_error)
reproduction: curl POST /api/chat with modelId=moonshotai/kimi-k2-instruct-0905 → grep tool-input-available → 0
started: 2026-04-14 Kimi K2 추가 직후

## Eliminated

- hypothesis: AI SDK v6 + @ai-sdk/groq provider가 MCP tools를 Groq에 전달하지 못함
  evidence: 디버그 로그에 15개 tool이 정확히 로드되어 Groq API 요청의 tools 배열에 포함됨 확인. Llama 3.3 요청 로그에서 tool_choice='auto', tools: [Array] 관측됨.
  timestamp: 2026-04-14T21:50:00Z

- hypothesis: 15개 tool이 많아서 Kimi가 혼란스러워 함 (schema size)
  evidence: Kimi K2에만 tool을 search_law + get_law_text 2개로 제한한 상태에서 테스트 → 여전히 toolCalls=0, finishReason=stop. inputTokens=3012 (TPM 10000 대비 매우 여유). 제공 tool 수는 원인이 아님.
  timestamp: 2026-04-14T21:54:00Z

- hypothesis: stopWhen=stepCountIs(8)가 첫 tool call 이전에 종료
  evidence: step 1이 이미 finishReason=stop으로 끝남. stopWhen이 개입할 여지가 없음. 또한 다른 Groq 모델(llama-3.3-70b-versatile)에서는 같은 route.ts/같은 stopWhen 설정으로 tool call이 정상 발생했던 기록이 있음 (과거 finishReason=tool-calls 로그).
  timestamp: 2026-04-14T21:50:00Z

- hypothesis: MCP 서버 쪽 문제
  evidence: 동일 요청을 Gemini 2.5 Flash로 바꾸면 tool-input-available/tool-output-available이 정상 발생. MCP 서버는 정상.
  timestamp: 2026-04-14T21:56:00Z

## Evidence

- timestamp: 2026-04-14T21:41:42Z
  checked: curl POST /api/chat Kimi K2 "근로기준법 제60조 연차유급휴가" 
  found: 1378 lines of SSE, tool-input-available=0, tool-output-available=0, finishReason=stop
  implication: 증상 재현 확인. Kimi K2는 tool 호출 없이 텍스트만 생성.

- timestamp: 2026-04-14T21:50:00Z
  checked: route.ts에 DEBUG-KIMI 로그 추가 후 Vercel 재배포, Kimi K2 테스트
  found: 15개 MCP tool이 정확히 로드됨 (search_law, get_law_text, get_annexes, chain_*, discover_tools, execute_tool, search_decisions, get_decision_text). step finishReason=stop, toolCalls=0. usage: inputTokens=7386, outputTokens=651, totalTokens=8037 (TPM 한도 아래).
  implication: tools는 정상 전달됨. 토큰 한도 아님. Kimi 자체가 호출을 거부.

- timestamp: 2026-04-14T21:51:42Z
  checked: toolChoice='required' 강제 후 Kimi K2 테스트
  found: Groq API가 `{ message: "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.", type: 'invalid_request_error' }` 반환
  implication: Kimi는 tool 호출을 **시도**하지만 Groq가 모델의 function call 생성을 거부. 업스트림 버그.

- timestamp: 2026-04-14T21:52:00Z
  checked: Web search: Groq + Kimi K2 tool calling
  found: Groq 커뮤니티 포럼에 동일 증상 다수 보고. "moonshotai/kimi-k2-instruct-0905 errors with tool calls" (t/599), "Kimi K2 currently failing many tool calls" (t/549), "Issue with kimi-k2-0905 model and tool calling via Pipecat's GroqLLMService (specifically for simple function calls)" (t/727), "Kimi K2 0905 is degraded" (t/799). GitHub opencode issue #1018 동일 에러.
  implication: 이것은 우리 측 버그가 아니라 Groq + Kimi K2 0905의 알려진 업스트림 문제. 우리가 고칠 수 없음.

- timestamp: 2026-04-14T21:54:00Z
  checked: Kimi K2 + minimal 2 tools (search_law, get_law_text only)
  found: 여전히 toolCalls=0, finishReason=stop. inputTokens=3012.
  implication: schema 크기가 원인이 아님. Kimi K2 0905 자체가 결함.

- timestamp: 2026-04-14T21:56:00Z
  checked: 동일 prompt로 Gemini 2.5 Flash 호출
  found: tool-input-available=1, tool-output-available=1 (search_law tool 정상 호출). stream 정상 동작.
  implication: MCP 경로·route.ts·tool schema는 완전히 정상. 문제는 Kimi K2 전용.

- timestamp: 2026-04-14T21:58:00Z
  checked: fix 배포 후 default model(gemini-2.5-flash) 연속 3회 테스트
  found: run1 tool-input-available=1 OK. run2 rate_limited (Gemini free RPM 소진, 예상됨). run3 tool-input-available=1 OK. Kimi greeting("안녕하세요") 정상 49 text deltas (regression 없음).
  implication: fix 정상 작동. 일반 질문 기본 경로에서 MCP tool 다시 호출됨.

## Resolution

root_cause: |
  Groq 플랫폼의 Kimi K2 0905 (`moonshotai/kimi-k2-instruct-0905`)는 tool calling이
  업스트림에서 불안정/깨져있다. toolChoice='auto'일 때 Kimi는 법령 질문을 받아도
  MCP 도구를 전혀 호출하지 않고 LLM 기억만으로 hallucinated 답변을 생성한다.
  toolChoice='required'로 강제하면 Groq가 "Failed to call a function"
  (invalid_request_error, failed_generation) 에러를 반환한다. 이는 다수의 Groq
  커뮤니티 포럼에 보고된 알려진 문제이며 (t/599, t/549, t/727, t/799) 우리 측
  코드, MCP 서버, AI SDK 모두 정상 — 모델 서빙 품질 문제다.
  설정 실수: 이 Kimi K2를 DEFAULT_MODEL로 승격할 때 tool-calling 실제 호출 여부를
  검증하지 않고 "텍스트 delta 정상 생성" 하나만 보고 pass 처리한 것이 근본 설정 결함.
fix: |
  1) src/lib/models.ts: DEFAULT_MODEL을 "gemini-2.5-flash"로 복귀 (tool-calling 검증됨).
  2) src/lib/models.ts: Kimi K2 항목 name과 description에 "⚠️ MCP 도구 호출 미작동
     — 일반 대화용" 경고를 추가해 사용자가 법령 질문에 선택하지 않도록 유도.
  3) src/lib/models.ts: 주석에 Groq 커뮤니티 포럼 링크와 증상, 디버그 세션 경로 기록.
  4) src/app/api/chat/route.ts: 임시 DEBUG-KIMI 로그, onStepFinish 추가, forceTools,
     kimiMinimalTools 실험 코드 모두 revert. 원본 그대로 복구.
verification: |
  - route.ts: DEBUG-KIMI/forceTools/kimiMinimalTools/onStepFinish grep → 0 matches
  - 프로덕션 재배포 후 default model 법령 질문 2회 성공 (tool-input-available=1,
    tool-output-available=1), 1회 rate_limited (예상된 Gemini free RPM).
  - Kimi K2 greeting 경로 regression 없음 (49 text deltas 정상).
  - MCP tool integration 동작 확인 (Gemini 경로로 search_law 호출 정상).
files_changed:
  - src/lib/models.ts
