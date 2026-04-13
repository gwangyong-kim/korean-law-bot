# Coding Conventions

**Analysis Date:** 2026-04-13

## Naming Patterns

**Files:**
- Components: kebab-case with `tsx` extension
  - Examples: `chat-input.tsx`, `chat-message.tsx`, `theme-toggle.tsx`
- Utilities: kebab-case with `ts` extension
  - Examples: `law-api.ts`, `conversations.ts`, `models.ts`
- API routes: folder-based routing following Next.js conventions
  - Examples: `/app/api/chat/route.ts`, `/app/api/auth/[...nextauth]/route.ts`

**Functions:**
- Exported components and utilities: PascalCase
  - Examples: `ChatInput()`, `ChatMessage()`, `cn()`, `getConversations()`
- Internal helper functions: camelCase
  - Examples: `handleKeyDown()`, `getMcpUrl()`, `getMessageText()`
- Callback handlers: `handle` + action pattern
  - Examples: `handleSubmit()`, `handleDelete()`, `handleToggleFavorite()`

**Variables:**
- Constants (module-level): UPPER_SNAKE_CASE or camelCase for configuration
  - Examples: `STORAGE_KEY`, `ALLOWED_DOMAIN`, `EXAMPLE_QUESTIONS`, `SYSTEM_PROMPT`
- React state/refs: camelCase
  - Examples: `messages`, `activeId`, `sidebarOpen`, `textareaRef`
- Type narrowing: `is` prefix for type guards
  - Example: `p is { type: "text"; text: string }`

**Types:**
- Interface names: PascalCase with `-Props` suffix for component props
  - Examples: `ChatInputProps`, `ChatContainerProps`, `ChatSidebarProps`, `ChatMessageProps`, `ModelSelectorProps`
- Exported interfaces: PascalCase without suffix
  - Examples: `AttachedFile`, `Message`, `Conversation`, `ModelInfo`, `Release`
- Union types: camelCase
  - Examples: `type ViewMode = "chat" | "guide" | "updates"`

## Code Style

**Formatting:**
- Tool: No explicit formatter configured; follows implicit Next.js defaults
- Line length: No hard limit enforced; components vary (40-90 char ranges observed)
- Indentation: 2 spaces (observed in all files)
- Quotes: Double quotes for JSX attributes and strings
- Trailing commas: Present in multiline imports and object literals

**Linting:**
- Tool: ESLint 9 with `eslint-config-next` (core-web-vitals and typescript)
- Config file: `eslint.config.mjs` (flat config format)
- Execution: `npm run lint` runs eslint (no output formatting specified)
- Rules enforced via Next.js core: Web Vitals best practices, TypeScript strict mode
- Ignored directories: `.next`, `out`, `build`, `next-env.d.ts`

**TypeScript:**
- Target: ES2017
- Module: esnext
- Strict mode: enabled
- JSX: react-jsx (new JSX transform)
- No emit: true (type checking only, build handled by Next.js)
- Module resolution: bundler
- Path aliases: `@/*` maps to `./src/*`

## Import Organization

**Order:**
1. External packages (React, Next.js, third-party libraries)
2. Type imports from external packages (`import type { ... } from ...`)
3. Internal components (`@/components/...`)
4. Internal utilities/hooks (`@/lib/...`)
5. Internal types (`type { ... }` imports)

**Examples:**
```typescript
// chat-container.tsx
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput, type AttachedFile } from "./chat-input";
import { Scale, Download, FileText, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message } from "@/lib/conversations";
```

**Path Aliases:**
- Use `@/*` for all src-rooted imports, never relative paths
- Pattern: `@/components/...`, `@/lib/...`, `@/app/...`, `@/providers/...`

## Error Handling

**Patterns:**

1. **Explicit Error Throwing (validation/preconditions):**
   ```typescript
   function getMcpUrl(): string {
     const key = process.env.LAW_API_KEY;
     if (!key) throw new Error("LAW_API_KEY 환경변수가 설정되지 않았습니다.");
     return `https://...`;
   }
   ```
   - Throw immediately for missing critical env vars
   - Include Korean language error messages with context

2. **Network Error Handling (API calls):**
   ```typescript
   const resp = await fetch(`${BASE_URL}/lawSearch.do?${params}`);
   if (!resp.ok) throw new Error(`법령 검색 실패: ${resp.status}`);
   ```
   - Check HTTP status with `resp.ok`
   - Include operation name and status code in message
   - Let errors propagate to caller

3. **Try-Catch for Side Effects (localStorage, data parsing):**
   ```typescript
   try {
     const raw = localStorage.getItem(STORAGE_KEY);
     return raw ? JSON.parse(raw) : [];
   } catch {
     return [];
   }
   ```
   - Wrap operations that may silently fail
   - Return safe defaults on error (empty array, empty object)
   - No error logging needed for expected failures

4. **Try-Catch with Type Narrowing for Error Messages:**
   ```typescript
   try {
     mcpClient = await createMCPClient({ ... });
     tools = await mcpClient.tools();
   } catch (e) {
     const errMsg = e instanceof Error ? e.message : String(e);
     if (errMsg.includes("503") || errMsg.includes("429")) {
       return new Response(JSON.stringify({ error: "..." }), { status: 503 });
     }
     console.error("MCP 연결 실패, 도구 없이 진행:", errMsg);
   }
   ```
   - Use type guard `e instanceof Error` to access message property
   - Check for specific error conditions with `.includes()`
   - Log with context when recoverable

5. **UI Error Display (chat-container.tsx):**
   ```typescript
   {error && (
     <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
       <p className="text-sm font-medium text-destructive mb-1">오류가 발생했습니다</p>
       <p className="text-sm text-muted-foreground">
         {error.message?.includes("503") ? "..." : error.message || "알 수 없는 오류가 발생했습니다"}
       </p>
     </div>
   )}
   ```
   - Render user-friendly error UI conditionally
   - Provide specific messages for known error codes
   - Include fallback generic message

## Logging

**Framework:** `console` methods only (no dedicated logging library)

**Patterns:**
- `console.error()`: Server-side errors with context
  - Example: `console.error("MCP 연결 실패, 도구 없이 진행:", errMsg);`
- No `console.log()` observed in production code
- Errors logged with Korean context messages

**Where to log:**
- API route failures (chat/route.ts)
- External service connection failures
- Never in components or client-side utilities

## Comments

**When to Comment:**
- Block comments explaining entire sections (`/** ... */` for JSDoc)
- Inline comments for non-obvious logic or Korean instructions
- Comments in Korean for domain-specific explanation
- Comments before complex algorithms or state management logic

**JSDoc/TSDoc:**
- File-level documentation with `/** ... */` format
  - Example in `conversations.ts`: `/** localStorage 기반 대화 기록 관리 */`
  - Example in `law-api.ts`: `/** 국가법령정보센터 Open API 클라이언트 ... */`
- No function-level JSDoc observed; TypeScript types provide sufficient documentation
- No @param/@return tags used

**Example:**
```typescript
/**
 * localStorage 기반 대화 기록 관리
 */
export interface Message { ... }

// 첫 번째 유저 메시지를 제목으로 사용
const firstUserMsg = messages.find((m) => m.role === "user");
```

## Function Design

**Size:** 
- Functions typically 10-50 lines
- Larger functions: 80-100 lines (chat-container.tsx ChatApp component logic)
- Single responsibility principle observed

**Parameters:**
- Destructured props for React components
  - Example: `function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps)`
- Named parameters for utility functions
- Optional parameters with defaults
  - Example: `query: string, target: string = "law", page: number = 1, display: number = 5`

**Return Values:**
- Explicit typing required (strict mode)
- Components return JSX.Element implicitly
- Utilities return specific types: `Conversation[]`, `{ total: number; results: Record<string, string>[] }`
- Never implicit void or undefined

## Module Design

**Exports:**
- Named exports for utilities and components (consistent)
  - Example: `export function cn(...inputs: ClassValue[])`
  - Example: `export interface Message { ... }`
  - Example: `export function ChatInput({ ... }: ChatInputProps)`
- Default exports never used
- Re-exports via index files not observed

**Barrel Files:** 
- Not used in this codebase
- Each component/utility imported directly from file path

**File Organization:**
- One component per file (required by naming convention)
- Type definitions colocated with implementation
- Utility functions in `lib/` as separate files

## Client/Server Components

**Pattern:** Explicit directive usage

- Client components: `"use client"` at file top
  - All interactive components in `src/components/`
  - Examples: `chat-input.tsx`, `chat-message.tsx`, `chat-sidebar.tsx`, `model-selector.tsx`
  - State, hooks, event handlers

- Server components: No directive (default in App Router)
  - Layout components in `src/app/layout.tsx`
  - API routes in `src/app/api/`

## Tailwind CSS & Styling

**Pattern:** Inline class composition with `cn()` utility

```typescript
import { cn } from "@/lib/utils";

// Variable classes
className={cn(
  "group flex gap-3 py-4",
  isUser && "flex-row-reverse"
)}

// CVA pattern for component variants
const buttonVariants = cva("group/button inline-flex...", {
  variants: {
    variant: { default: "...", ghost: "..." },
    size: { default: "...", icon: "..." }
  }
})
```

**Patterns:**
- `cn()` utility merges clsx + tailwind-merge
- CSS variables for typography: `text-[length:var(--text-base)]`, `text-[length:var(--text-xs)]`
- class-variance-authority for complex component variants (button.tsx)
- Dark mode: `dark:` prefix for dark theme classes

---

*Convention analysis: 2026-04-13*
