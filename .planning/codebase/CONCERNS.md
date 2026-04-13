# Codebase Concerns

**Analysis Date:** 2026-04-13

## Tech Debt

### Message Type Handling Instability

**Issue:** Recurring type mismatches between UIMessage `parts` format and ModelMessage `content` format requiring multiple fixes.

**Files:** 
- `frontend/src/components/chat/chat-container.tsx` (lines 157-167)
- `frontend/src/app/api/chat/route.ts` (line 54)

**Impact:** 
- Multiple commits fixing the same issue (`fd4ba9c`, `45e73f7`, `3d6ff04`, `b618abe`)
- Fragile message transformation logic that breaks when AI SDK updates
- Risk of message parsing failures in production

**Fix approach:**
- Create a robust type definition and validation layer for message transformation
- Add unit tests for all message format conversions
- Consider creating a dedicated `MessageTransformer` class instead of inline logic
- Document the exact format contract between frontend and backend

### Oversized Chat Container Component

**Issue:** `chat-container.tsx` contains 330 lines with multiple responsibilities (state management, message handling, file processing, localStorage, export functionality).

**Files:** `frontend/src/components/chat/chat-container.tsx`

**Impact:**
- Hard to test individual features
- Difficult to modify without breaking other functionality
- Composition logic obscures UI logic
- Performance impact from re-renders affecting unrelated state changes

**Fix approach:**
- Extract `useMessageHandling()` custom hook (lines 59-81)
- Extract `useFileProcessing()` custom hook (lines 83-106)
- Extract `ExportDialog` component (lines 139-155)
- Extract `EmptyState` into separate file
- Separate localStorage persistence into a custom hook

### Ad-Hoc Text Extraction from Message Parts

**Issue:** Custom text extraction logic (`getMessageText` function) duplicated in multiple files and vulnerable to format changes.

**Files:**
- `frontend/src/components/chat/chat-container.tsx` (lines 157-167)
- `frontend/src/app/test-sidebar/page.tsx` (lines 10-15)

**Impact:**
- Code duplication makes maintenance harder
- Inconsistent behavior if logic diverges
- No validation that text property exists

**Fix approach:**
- Create a shared utility `extractMessageText()` in `lib/message-utils.ts`
- Add type guards to validate message structure
- Add unit tests for edge cases (empty messages, malformed parts)

### Test Page Never Removed

**Issue:** Minimal test chat page (`test-sidebar/page.tsx`) added with "temp:" commit prefix but never deleted.

**Files:** `frontend/src/app/test-sidebar/page.tsx`

**Impact:**
- Accessible from `/test-sidebar` route without authentication (`useChat()` without session check)
- Security concern: exposes chat API to unauthenticated users
- Code clutter and confusion about intended codebase

**Fix approach:**
- Either remove the route entirely or protect it with authentication
- If keeping for development, move to `app/(dev)` segment and document
- Add a development-only guard or environment variable check

## Security Considerations

### Unauthenticated Test Page Accessible

**Risk:** The test sidebar page at `/test-sidebar` allows direct chat API access without checking Google OAuth session.

**Files:** 
- `frontend/src/app/test-sidebar/page.tsx`
- `frontend/src/app/api/chat/route.ts` (no session validation in route)

**Current mitigation:** Next Auth is configured for the main app, but this route is not protected.

**Recommendations:**
- Add session check middleware or useSession() hook to test-sidebar/page.tsx
- Return redirect/error if session is not valid
- Document that test routes are development-only or remove entirely
- Consider environment variable to disable test routes in production

### Hardcoded MCP Server URL

**Risk:** MCP server URL is hardcoded with API key passed as query parameter, vulnerable to log exposure.

**Files:** `frontend/src/app/api/chat/route.ts` (line 46)

```typescript
return `https://glluga-law-mcp.fly.dev/mcp?oc=${key}`;
```

**Current mitigation:** API key is in environment variable, but passing in URL means it appears in:
- Network request logs
- Browser dev tools
- Server logs
- Error messages

**Recommendations:**
- Pass API key via HTTP header (Authorization) instead of query parameter
- Use POST request with body containing API key
- Implement request signing (HMAC) if available
- Log only sanitized URLs (mask API key)

### Missing CSRF Protection on Chat Endpoint

**Risk:** Chat API route (`/api/chat`) accepts POST but has no CSRF token validation.

**Files:** `frontend/src/app/api/chat/route.ts`

**Current mitigation:** None visible. Next.js middleware not shown, might have default protection.

**Recommendations:**
- Verify CSRF protection is enabled in Next.js config
- Ensure CSRF tokens are validated on all state-changing endpoints
- Document CSRF strategy if custom implementation used

### Conversation History Stored Unencrypted in localStorage

**Risk:** All conversation messages are stored in browser localStorage in plaintext, including potentially sensitive legal information.

**Files:** `frontend/src/lib/conversations.ts` (lines 19-37)

**Impact:**
- Sensitive legal discussions accessible to any code running in same origin
- XSS vulnerability allows stealing all stored conversations
- No way to clear conversations on logout
- Syncs across all browser tabs

**Recommendations:**
- Consider sessionStorage for temporary storage (clears on tab close)
- Implement opt-in "save locally" vs "session-only" modes
- Add encryption layer for localStorage (libsodium.js or TweetNaCl.js)
- Clear localStorage on signOut event
- Add "clear all conversations" UI button

## Performance Bottlenecks

### Unnecessary Re-renders in Chat Container

**Issue:** Multiple state changes (messages, status, input, modelId, favorites, sidebar) cause entire component to re-render including message history.

**Files:** `frontend/src/components/chat/chat-container.tsx` (lines 34-54)

**Cause:** 
- All state managed at component level instead of isolated hooks
- No React.memo or useMemo on message list
- No key optimization for message rendering

**Improvement path:**
- Memoize `ChatMessage` components with React.memo
- Use `useMemo` for message filtering/searching
- Implement virtualization for large message lists (react-window)
- Move modelId state to context to avoid passing through props

### Message Text Extraction on Every Render

**Issue:** `getMessageText()` function called during render without memoization (line 75 and 143).

**Files:** `frontend/src/components/chat/chat-container.tsx`

**Cause:**
- No caching of extracted text
- Called in map() function creating new strings on every render

**Improvement path:**
- Memoize extracted text at message storage level
- Cache in custom hook or memo value
- Pre-process messages when storing in localStorage

### Redundant localStorage Reads/Writes

**Issue:** `getConversations()` reads entire localStorage JSON on every call, `updateConversation()` writes entire history back.

**Files:** `frontend/src/lib/conversations.ts` (lines 25-37, 39-41)

**Cause:**
- No in-memory cache of conversations
- Every function call parses JSON from string
- Full write on partial update

**Improvement path:**
- Implement in-memory cache with localStorage as backup
- Add debounced writes for frequent updates
- Cache parsed JSON instead of re-parsing
- Consider IndexedDB for larger conversation histories

### MCP Server Overload Not Rate-Limited Client-Side

**Issue:** Client sends requests rapidly to MCP server without rate limiting, server responds with 429/503.

**Files:** `frontend/src/app/api/chat/route.ts` (lines 60-81)

**Current handling:** Only catches and reports overload errors to user, no prevention.

**Improvement path:**
- Implement client-side request queue
- Add exponential backoff for retries
- Implement request deduplication (don't send duplicate queries)
- Consider request debouncing for rapid succession queries
- Display user feedback for rate limit (e.g., "Please wait X seconds")

## Fragile Areas

### MCP Server Hard Dependency

**Component:** Chat API endpoint depends on external MCP server at `glluga-law-mcp.fly.dev`.

**Files:** 
- `frontend/src/app/api/chat/route.ts` (lines 60-81)

**Why fragile:**
- Single point of failure - if server is down, all chat stops
- No fallback to direct API calls (previous approach removed)
- Fly.io infrastructure failures cause complete service outage
- No circuit breaker or fallback to cached responses
- Error messages expose external dependency

**Safe modification:**
- Document MCP dependency in architecture docs
- Implement circuit breaker pattern
- Add health check endpoint for MCP server
- Keep direct API implementation as fallback
- Monitor MCP server availability separately

**Test coverage:** 
- No tests for MCP connection failures
- No tests for rate limit recovery
- No end-to-end tests for chat flow with MCP

### Message Format Transformation Pipeline

**Component:** UIMessage → ModelMessage conversion requires specific handling.

**Files:**
- `frontend/src/app/api/chat/route.ts` (line 54)
- `frontend/src/components/chat/chat-container.tsx` (lines 72-76)

**Why fragile:**
- Tight coupling to AI SDK's internal message format
- Breaking changes when AI SDK updates (happened multiple times)
- No validation schema for message structure
- No type-safe conversion

**Safe modification:**
- Create Zod/TypeScript schema for both formats
- Add validation before transformation
- Write transformation tests with various message types
- Document format contract explicitly

### Model Switching Without Validation

**Component:** Model switching in dropdown with localStorage persistence.

**Files:**
- `frontend/src/components/chat/chat-container.tsx` (lines 38-46)
- `frontend/src/lib/models.ts` (lines 14-37)

**Why fragile:**
- localStorage stores arbitrary string, no validation
- If stored model doesn't exist in MODELS list, no fallback shown
- Switching models mid-conversation doesn't re-process history with new model
- No error handling if selected model API is down

**Safe modification:**
- Validate stored model exists in MODELS before using
- Add fallback to DEFAULT_MODEL with user notification
- Pre-fetch model availability before allowing selection
- Add model capability checks (tool support, context length)

## Scaling Limits

### Browser Storage Capacity

**Resource:** localStorage has ~5-10MB limit per domain

**Current capacity:** Depends on conversation length and count
- Average message: ~100-1000 bytes
- Supports ~5,000-10,000 average messages before hitting limit

**Limit reached when:** User accumulates thousands of messages across multiple conversations

**Scaling path:**
- Implement conversation archival (move old conversations to IndexedDB)
- Add server-side conversation storage (sync with backend)
- Implement lazy loading (load only recent conversations initially)
- Add pagination for message history within conversations
- Consider compression of stored messages

### MCP Server Single Instance

**Resource:** External MCP server at fly.dev likely single instance, can only handle N concurrent requests

**Current capacity:** Unknown, but hitting 503/Max sessions errors observed

**Limit reached when:** Multiple users query simultaneously or single user rapid-fires requests

**Scaling path:**
- Deploy MCP server with load balancing
- Implement client-side request queue and rate limiting
- Add request deduplication
- Use caching for common queries (popular laws/decisions)
- Consider read-only replica for search queries

### Vercel Serverless Function Timeout

**Resource:** Vercel free tier has 60-second timeout (extended from default via `maxDuration = 60`)

**Current capacity:** Supports queries completing in <60 seconds

**Limit reached when:** Complex queries or MCP server slow to respond

**Scaling path:**
- Consider streaming response earlier to provide feedback
- Implement query timeout and graceful degradation
- Split long operations into smaller functions
- Use background jobs for heavy processing
- Monitor actual response times in production

## Dependencies at Risk

### NextAuth Beta Version

**Package:** `next-auth@^5.0.0-beta.30`

**Risk:** Beta version is pre-release, API may change or be removed before stable release

**Impact:** 
- Breaking changes between minor versions
- Security patches may be delayed
- Production readiness not guaranteed
- May not receive long-term support

**Migration plan:**
- Monitor NextAuth releases for v5 stable
- Plan upgrade path when stable released
- Test against latest beta regularly
- Have rollback plan to v4 if needed

### Multiple Recent Model Migrations

**Issue:** Model switched from Gemini 2.0 to 2.5 Flash recently, before that other models removed

**Files:** `frontend/src/lib/models.ts`

**Observed commits:**
- `ce1596f`: Switched to Gemini 2.5 Flash, removed deprecated models
- `916a7e7`: Changed default to Gemini 2.0 Flash
- Earlier: Other model changes

**Risk:** Frequent model changes suggest API instability or unclear strategy

**Recommendations:**
- Document model selection criteria and support timeline
- Test all model changes thoroughly before deploying
- Keep fallback models available
- Monitor model deprecation notices from Google
- Consider abstraction layer for easier model switching

### Unclear AI SDK Versioning Strategy

**Packages:** `@ai-sdk/*` packages use caret ranges (^3.0.62, ^1.0.36, ^3.0.160)

**Risk:** Minor version updates could introduce breaking changes

**Current state:** Multiple recent fixes for message format issues suggest ongoing compatibility problems

**Recommendations:**
- Consider pinning to exact versions for stability
- Implement comprehensive test suite before updating
- Document AI SDK compatibility notes
- Monitor AI SDK breaking changes newsletter

## Missing Critical Features

### No Conversation Export to File

**Problem:** Users can export a single conversation to `.txt` but no bulk export or data portability

**Blocks:** 
- GDPR data portability rights
- Data migration to other systems
- Backup workflows

**Fix:** Add export-all button or implement periodic backup

### No Conversation Search Across All Chats

**Problem:** Search in sidebar only searches open conversations, doesn't search across all stored conversations efficiently

**Blocks:**
- Finding past conversations with specific topics
- Legal audit trail needs

**Fix:** Implement full-text search with indexing

### No Rate Limiting on Frontend

**Problem:** Users can spam requests without client-side throttling, putting load on MCP server

**Blocks:**
- MCP server stability
- Fair resource allocation

**Fix:** Add request queue and debouncing

### No Model Capability Detection

**Problem:** Cannot determine which models support tools/function-calling before trying to use them

**Blocks:**
- Dynamic model selection based on query type
- Graceful degradation if tools unavailable

**Fix:** Implement model capability registry

## Test Coverage Gaps

### No Unit Tests for Message Transformation

**What's not tested:** 
- UIMessage to ModelMessage conversion
- Different message part formats
- Edge cases (empty messages, multiple text parts, non-text content)

**Files:** `frontend/src/app/api/chat/route.ts` (lines 50-54)

**Risk:** Breaking changes silently fail, message content lost in production

**Priority:** High (core functionality)

### No Integration Tests for Chat Flow

**What's not tested:**
- End-to-end chat with MCP server
- Error handling and recovery
- Session lifecycle with authentication

**Files:**
- `frontend/src/app/api/chat/route.ts`
- `frontend/src/components/chat/chat-container.tsx`

**Risk:** Deployment breaks production without warning

**Priority:** High (critical path)

### No Tests for Conversation Persistence

**What's not tested:**
- localStorage save/restore functionality
- Conversation corruption handling
- Large conversation handling
- Concurrent modification edge cases

**Files:** `frontend/src/lib/conversations.ts`

**Risk:** User data loss or corruption

**Priority:** High (data integrity)

### No Tests for Model Switching

**What's not tested:**
- Switching models mid-conversation
- Invalid stored model names
- Model list updates

**Files:** 
- `frontend/src/components/chat/chat-container.tsx` (lines 38-46)
- `frontend/src/lib/models.ts`

**Risk:** Silent failures or wrong model selected

**Priority:** Medium (affects UX)

### No Tests for MCP Server Failures

**What's not tested:**
- 503 overload response
- 429 rate limit response
- Connection timeouts
- Partial failures

**Files:** `frontend/src/app/api/chat/route.ts` (lines 60-81)

**Risk:** Poor error handling in production

**Priority:** Medium (reliability)

### No Tests for File Attachment Processing

**What's not tested:**
- Image to data URL conversion
- Large file handling
- Various file types
- Failed attachment uploads

**Files:** `frontend/src/components/chat/chat-container.tsx` (lines 90-106)

**Risk:** Silent attachment failures or out-of-memory errors

**Priority:** Medium (feature stability)

---

*Concerns audit: 2026-04-13*
