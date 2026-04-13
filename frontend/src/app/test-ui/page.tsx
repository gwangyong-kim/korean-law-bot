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
import { useState, useCallback, useEffect, useRef } from "react";
import { MessagePartRenderer } from "@/components/chat/message-part-renderer";
import { StreamingSkeletonBubble } from "@/components/chat/streaming-skeleton-bubble";
import { ChatMessage } from "@/components/chat/chat-message";
import { parseChatError, type ParsedError } from "@/lib/error-messages";
import { extractAssistantText } from "@/lib/ui-message-parts";

export default function TestUIPage() {
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  function handleSend() {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input }, { body: { modelId: "gemini-2.5-flash" } });
    setInput("");
  }

  const handleRetry = useCallback(async () => {
    clearError();
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      await regenerate({ body: { modelId: "gemini-2.5-flash" } });
      return;
    }
    if (last?.role === "user") {
      const text = extractAssistantText(last);
      if (!text) return;
      sendMessage({ text }, { body: { modelId: "gemini-2.5-flash" } });
    }
  }, [clearError, messages, regenerate, sendMessage]);

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
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
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
      </div>

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
