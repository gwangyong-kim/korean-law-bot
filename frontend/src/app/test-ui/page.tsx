"use client";

/**
 * /test-ui — Post-milestone diagnostic route.
 *
 * Full Phase 2 + Phase 3 UI fidelity without OAuth:
 *  - useChat (zero-arg, no conversationId persistence)
 *  - MessagePartRenderer (Phase 3 ToolInvocationView + Phase 2 error banner pass-through)
 *  - StreamingSkeletonBubble during loading
 *  - parsedError routing (inline on last assistant, standalone otherwise)
 *  - handleRetry with regenerate/sendMessage fallback (Phase 2 Q3)
 *
 * Created 2026-04-14 after milestone v1 close to enable Playwright-based e2e testing.
 * Phase 5 CLEAN-04 deleted the original /test-sidebar; this route is a post-milestone
 * testing scaffold, intentionally kept outside the v1 scope. Future cleanup if desired.
 */

import { useChat } from "@ai-sdk/react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { MessagePartRenderer } from "@/components/chat/message-part-renderer";
import { StreamingSkeletonBubble } from "@/components/chat/streaming-skeleton-bubble";
import { ChatMessage } from "@/components/chat/chat-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseChatError, type ParsedError } from "@/lib/error-messages";
import { extractAssistantText } from "@/lib/ui-message-parts";
import { MODELS, DEFAULT_MODEL } from "@/lib/models";

export default function TestUIPage() {
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 2026-04-14: ?model= query param + visible selector for Tier A A/B testing.
  // Lets us quickly switch Gemini models (e.g. 2.5-flash ↔ 2.0-flash) when one
  // model's free-tier RPM is exhausted during UAT without redeploying.
  const initialModelId = useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    const fromQuery = new URLSearchParams(window.location.search).get("model");
    if (fromQuery && MODELS.some((m) => m.id === fromQuery)) return fromQuery;
    return DEFAULT_MODEL;
  }, []);
  const [modelId, setModelId] = useState<string>(initialModelId);

  const isLoading = status === "streaming" || status === "submitted";

  // ChatContainer와 동일한 스크롤 fix — Base UI ScrollArea Root의 ref는
  // scrollable 요소가 아니다. data-slot="scroll-area-viewport"로 실제
  // viewport를 찾아서 scrollTop을 세팅해야 auto-scroll이 동작한다.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, isLoading]);

  function handleSend() {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input }, { body: { modelId } });
    setInput("");
  }

  const handleRetry = useCallback(async () => {
    clearError();
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      await regenerate({ body: { modelId } });
      return;
    }
    if (last?.role === "user") {
      const text = extractAssistantText(last);
      if (!text) return;
      sendMessage({ text }, { body: { modelId } });
    }
  }, [clearError, messages, regenerate, sendMessage, modelId]);

  const parsedError: ParsedError | undefined = error ? parseChatError(error) : undefined;
  const lastMessage = messages[messages.length - 1];
  const lastIsAssistant = lastMessage?.role === "assistant";

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Chat UI Test (인증 없음)</h1>
        <p className="text-xs text-muted-foreground">
          Phase 2/3 full UI fidelity — MessagePartRenderer + ToolInvocationView + StreamingSkeletonBubble + parsedError
        </p>
        <p className="text-xs">
          <span className="font-mono">status:</span>{" "}
          <strong data-testid="status">{status}</strong>
          {error && (
            <>
              {" | "}
              <span className="font-mono">error.code:</span>{" "}
              <strong data-testid="error-code" className="text-destructive">
                {parsedError?.code ?? "unknown"}
              </strong>
            </>
          )}
          {" | "}
          <span className="font-mono">model:</span>{" "}
          <select
            data-testid="model-select"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={isLoading}
            className="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-xs"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        </p>
      </header>

      {/* min-h-0: flex column 자식이 content로 늘어나지 않고 shrink하도록
          허용. 없으면 ScrollArea가 content에 맞춰 커져서 overflow가 발동하지
          않는다. ChatContainer와 동일한 패턴. */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 min-h-0"
        data-testid="messages-area"
      >
        <div className="mx-auto max-w-3xl py-4">
          {messages.length === 0 && (
            <p className="px-4 text-sm text-muted-foreground" data-testid="empty-state">
              메시지 없음 — 질문을 입력하세요
            </p>
          )}
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const attachedError =
              parsedError && isLast && m.role === "assistant" ? parsedError : undefined;
            return (
              <MessagePartRenderer
                key={m.id}
                message={m}
                error={attachedError}
                onRetry={attachedError ? handleRetry : undefined}
                isRetryDisabled={isLoading}
              />
            );
          })}
          {isLoading && lastMessage?.role === "user" && <StreamingSkeletonBubble />}
          {parsedError && !lastIsAssistant && (
            <ChatMessage
              role="assistant"
              content=""
              error={parsedError}
              onRetry={handleRetry}
              isRetryDisabled={isLoading}
            />
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="질문 입력..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            data-testid="input"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            data-testid="send"
          >
            전송
          </button>
        </div>
        <pre
          className="mx-auto mt-2 max-h-48 max-w-3xl overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[10px]"
          data-testid="debug-dump"
        >
          {JSON.stringify(messages, null, 2)}
        </pre>
      </div>
    </div>
  );
}
