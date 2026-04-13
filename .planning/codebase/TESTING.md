# Testing Patterns

**Analysis Date:** 2026-04-13

## Test Framework

**Status:** No testing framework configured

- No test files exist in `src/` directory
- No Jest, Vitest, or other test runner installed
- No test configuration files (`jest.config.*`, `vitest.config.*`)
- Package.json contains no testing dependencies (@testing-library, jest, vitest)
- Only ESLint is configured for code quality

**Note:** This is a limitation in the current codebase. Testing infrastructure would need to be added.

## Assertion Library

Not applicable - no tests present.

## Run Commands

Not applicable - no test framework configured.

To add testing, these commands would be typical:
```bash
npm install --save-dev jest @types/jest @testing-library/react @testing-library/jest-dom
npm test                    # Would run Jest (if configured)
npm test -- --watch        # Watch mode (if configured)
npm test -- --coverage     # Coverage (if configured)
```

## Test File Organization

**Current Status:** No test files exist

**Recommended Pattern (if testing were added):**
- Co-located tests: `.test.tsx` or `.spec.tsx` next to component
  - `src/components/chat/chat-input.tsx` would have `src/components/chat/chat-input.test.tsx`
  - `src/lib/conversations.ts` would have `src/lib/conversations.test.ts`
- Test files in same directory as source files for easier discovery and maintenance

**Naming Convention (if testing were added):**
- Pattern: `[ComponentName].test.tsx` or `[utilityName].test.ts`
- Examples would be: `chat-input.test.tsx`, `conversations.test.ts`, `law-api.test.ts`

## Test Structure

No test files exist to analyze. However, based on codebase patterns, a test structure might follow:

```typescript
// Hypothetical example based on observed code style
describe("ChatInput", () => {
  it("should submit on Enter key when not composing", () => {
    // Test would verify handleKeyDown behavior
  });

  it("should handle file selection and preview images", () => {
    // Test would verify handleFileSelect logic
  });

  it("should remove file from attachment list", () => {
    // Test would verify removeFile functionality
  });
});
```

**Expected patterns (not yet implemented):**
- Suite organization: `describe()` blocks per component/utility
- Setup/teardown: Not yet established
- Assertion pattern: Would need to be determined upon test setup

## Mocking

**Framework:** None currently

**If tests were added, mocking would likely need:**

1. **Network mocks (for law-api.ts):**
   - Mock fetch responses from law.go.kr API
   - Test successful responses and error cases (HTTP 400, 503)
   - Mock XML/JSON parsing

2. **External service mocks (for chat/route.ts):**
   - Mock @ai-sdk/google and @ai-sdk/mcp
   - Mock createMCPClient connection failures
   - Mock 503/429 error scenarios

3. **localStorage mocks (for conversations.ts and chat-container.tsx):**
   - Mock window.localStorage for storing/retrieving conversations
   - Test JSON parse failures
   - Test getItem/setItem operations

4. **Next.js mocks (if needed):**
   - Mock next-auth session
   - Mock request/response objects for API routes

## Fixtures and Factories

**Current Status:** No test fixtures or factories

**Manual test data patterns observed:**
- Hardcoded example questions in `chat-container.tsx`:
  ```typescript
  const EXAMPLE_QUESTIONS = [
    "근로기준법 연차휴가 규정 알려줘",
    "개인정보보호법 제15조 전문 보여줘",
    // ...
  ];
  ```

- Hardcoded model list in `lib/models.ts`:
  ```typescript
  export const MODELS: ModelInfo[] = [
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      // ...
    },
    // ...
  ];
  ```

**Recommended factory pattern (if testing added):**
```typescript
// factories.ts
function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: `msg-${Math.random()}`,
    role: "user",
    content: "Test message",
    ...overrides
  };
}

function createConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: `conv-${Date.now()}`,
    title: "Test conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  };
}
```

## Coverage

**Requirements:** No coverage requirements enforced

**Current Status:** 
- 0% code coverage (no tests)
- No CI/CD coverage checks
- No coverage reporting tools installed

**To implement coverage (if testing added):**
```bash
npm test -- --coverage
# Would generate coverage reports in coverage/ directory
```

## Test Types

### Unit Tests

**Not yet implemented.** Would test in isolation:

- `lib/utils.ts`: The `cn()` function (merges class names)
- `lib/models.ts`: Model lookup functions
- `lib/conversations.ts`: localStorage CRUD operations
- `lib/law-api.ts`: API response parsing and error handling

**Example scope for conversations.ts:**
- `generateId()`: Generates unique ID strings
- `loadAll()` / `saveAll()`: localStorage serialization
- `getConversations()`: Sorting by updatedAt
- `createConversation()`: Initializes new conversation
- `updateConversation()`: Updates messages and title
- `deleteConversation()`: Removes from list

### Integration Tests

**Not yet implemented.** Would test interactions:

- **Chat flow:**
  - User sends message → component calls sendMessage() → API request made → response streamed to UI
  - File upload → FileReader → message enrichment → API call with file data

- **API route (chat/route.ts):**
  - Incoming UIMessage array → convertToModelMessages() → MCP client connection → AI SDK streamText call
  - Error handling: MCP connection fails → fallback to tools-less mode
  - Error responses: 503 service unavailable, 429 rate limit

- **Storage/State:**
  - Conversation CRUD through chat-container → conversations.ts → localStorage
  - favorites Set serialization/deserialization
  - Model selection persistence

### E2E Tests

**Not yet implemented.** Would require Playwright or Cypress:

- User login flow (next-auth Google OAuth)
- Start conversation → ask question → get response
- Upload file attachment → analyze → export conversation
- Sidebar: create/search/delete conversations
- Theme toggle, sidebar collapse, keyboard shortcuts

**Tools that would be suitable:**
- Playwright (modern, fast, supports multiple browsers)
- Cypress (UI-focused, good debugging)
- Not currently configured

## Common Patterns

### Async Testing

**Not yet implemented.** Expected patterns:

```typescript
// Component with async file reading
it("should read file content", async () => {
  // Mock FileReader
  // Trigger file selection
  // Assert file added to state
});

// API route with async operations
it("should call MCP client and stream response", async () => {
  // Mock fetch/streamText
  // POST request to /api/chat
  // Assert Response stream contains text
});
```

### Error Testing

**Not yet implemented.** Expected patterns:

```typescript
it("should handle network errors gracefully", () => {
  // Mock fetch to throw
  // Call API function
  // Assert error message is user-friendly
});

it("should show error UI for 503 service unavailable", () => {
  // Mock chat API to return 503
  // Send message
  // Assert error component rendered with specific message
});

it("should recover from localStorage parse failures", () => {
  // Mock JSON.parse to throw
  // Call getConversations()
  // Assert returns empty array (safe default)
});
```

## Testing Gaps & Recommendations

**Critical untested areas:**

1. **API Route Logic** (`src/app/api/chat/route.ts`):
   - MCP client connection and failure handling (503, 429 detection)
   - Message conversion with `convertToModelMessages()`
   - System prompt and tool integration
   - No testing framework in place

2. **Data Persistence** (`src/lib/conversations.ts`):
   - localStorage CRUD operations
   - JSON serialization/deserialization
   - Recovery from corrupt data
   - No mocking framework available

3. **Component State Management** (`src/app/page.tsx`, `src/components/chat/chat-container.tsx`):
   - Complex state interactions (conversations, active ID, sidebar toggle)
   - Keyboard shortcuts (Ctrl+Shift+O, Ctrl+/)
   - Favorites toggle and persistence
   - No component testing framework

4. **File Handling** (`src/components/chat/chat-input.tsx`):
   - File selection and preview generation
   - Image data URL creation
   - Text file reading and embedding
   - No file handling test utilities

5. **External Integrations:**
   - law-api.ts XML/JSON parsing from real API responses
   - AI SDK message streaming and model selection
   - next-auth session management
   - No integration test framework

**Recommended approach to add testing:**

```bash
# 1. Install testing dependencies
npm install --save-dev jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom

# 2. Create jest.config.ts
# 3. Add test scripts to package.json:
#    "test": "jest"
#    "test:watch": "jest --watch"
#    "test:coverage": "jest --coverage"

# 4. Start with unit tests for utilities:
#    - lib/conversations.ts (localStorage logic)
#    - lib/models.ts (model lookup)
#    - lib/utils.ts (cn() function)

# 5. Add integration tests for critical flows:
#    - API route error handling
#    - Chat message flow
#    - File upload processing

# 6. Consider E2E tests for user flows (Playwright)
```

---

*Testing analysis: 2026-04-13*
