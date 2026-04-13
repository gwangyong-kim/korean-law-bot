"use client";

/**
 * MessagePartRenderer — dispatches UIMessage.parts to the right UI.
 *
 * Phase 1 scope:
 *  - text → render via existing ChatMessage (ReactMarkdown)
 *  - tool-* / dynamic-tool → ToolInvocationView (Phase 3 upgrade)
 *  - reasoning / file / source-url / source-document / step-start / data-* → null (D-05)
 *  - switch default → dev throw, prod console.error (D-07)
 *
 * Phase 3 (D-07/D-08/D-09): assistant return JSX renders tool chip stack ABOVE
 * ChatMessage text bubble as a vertical flex-col (세로 체크리스트, no group box).
 * chat-message.tsx remains untouched per Option C (RESEARCH §4).
 *
 * Requirements: CHAT-07, CHAT-08, TOOL-01, TOOL-03, TOOL-04, TOOL-05
 */

import type {
  UIMessage,
  UIMessagePart,
  UIDataTypes,
  UITools,
} from "ai";
import { ChatMessage } from "./chat-message";
import { ToolInvocationView } from "./tool-invocation-view";
import {
  isTextUIPart,
  isToolUIPart,
  extractAssistantText,
  type ExtractableMessage,
  type LegacyMessage,
} from "@/lib/ui-message-parts";
import type { ParsedError } from "@/lib/error-messages";

interface MessagePartRendererProps {
  message: ExtractableMessage;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  // Phase 2 D-07: 마지막 assistant 메시지에만 parent가 전달.
  error?: ParsedError;
  onRetry?: () => void;
  isRetryDisabled?: boolean;
}

export function MessagePartRenderer({
  message,
  isFavorite,
  onToggleFavorite,
  error,
  onRetry,
  isRetryDisabled,
}: MessagePartRendererProps) {
  // Legacy path: no parts, render content directly via ChatMessage.
  // extractAssistantText handles both new and legacy shapes uniformly,
  // so we delegate for the user-message path too (which is always plain text).
  if (!("parts" in message) || !Array.isArray(message.parts)) {
    const legacy = message as LegacyMessage;
    return (
      <ChatMessage
        id={legacy.id}
        role={legacy.role}
        content={legacy.content}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        error={error}
        onRetry={onRetry}
        isRetryDisabled={isRetryDisabled}
      />
    );
  }

  const uiMessage = message as UIMessage;

  // User messages in AI SDK 6 always carry their input as text parts.
  // Render them through a single ChatMessage bubble with concatenated text.
  // user bubble에는 error prop을 의도적으로 pass-through 하지 않음 — chat-container가
  // isLastAssistant 체크로 standalone bubble을 별도로 렌더한다.
  if (uiMessage.role === "user") {
    return (
      <ChatMessage
        id={uiMessage.id}
        role="user"
        content={extractAssistantText(uiMessage)}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  // Assistant messages: iterate parts and render each. Text parts are
  // concatenated into a single ChatMessage bubble; tool parts become chips;
  // stubs return null.
  const textChunks: string[] = [];
  const nonTextNodes: React.ReactNode[] = [];

  uiMessage.parts.forEach((part, idx) => {
    // Normalize tool-* and dynamic-tool via isToolUIPart — covers both
    // static and dynamic variants. Dispatch states via an inner switch
    // inside ToolChip which accepts the union type directly.
    if (isToolUIPart(part)) {
      nonTextNodes.push(
        <ToolInvocationView key={`tool-${idx}`} part={part} />
      );
      return;
    }

    // Exhaustive switch on part.type for remaining variants.
    switch (part.type) {
      case "text":
        if (isTextUIPart(part)) {
          textChunks.push(part.text);
        }
        return;
      case "reasoning":
      case "file":
      case "source-url":
      case "source-document":
      case "step-start":
        // D-05: stub, render nothing.
        return;
      default: {
        // `data-*` parts have a templated type like `data-myKey`.
        if (typeof part.type === "string" && part.type.startsWith("data-")) {
          // D-05 (implied): stub data-* parts.
          return;
        }
        // Never-default (D-07): type-exhaustive safety net.
        assertNever(part, uiMessage.id, idx);
        return;
      }
    }
  });

  // Phase 2 D-07: textChunks가 비어있어도 error가 있으면 ChatMessage를 렌더해
  // 인라인 에러 배너가 표시될 통로를 보장한다 (partial fail / mid-stream 에러).
  // Phase 3 D-07: chip 블록을 세로 체크리스트(flex-col)로 스택.
  // Phase 3 D-08: chip 블록을 ChatMessage 위로 이동해 "[chip1][chip2]\n\n{text}" 레이아웃 달성.
  // Phase 3 D-09: 그룹 상자 없이 단순 flex-col + gap-1 (번호/bullet/border 없음).
  // Option C (RESEARCH §4): ChatMessage는 수정하지 않음 — Phase 2의 error/retry props 와
  // (content || isUser) bubble wrapper 가드가 그대로 작동.
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
}

/**
 * Type-exhaustive safety net (D-07). Triggers at the switch default:
 *  - dev: throw (so the gap surfaces immediately during development)
 *  - prod: console.error (so production never crashes on an unknown part)
 */
function assertNever(
  part: UIMessagePart<UIDataTypes, UITools>,
  messageId: string,
  index: number
): void {
  const msg = `MessagePartRenderer: unhandled UIMessagePart variant at message=${messageId} part=${index}`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(`${msg}: ${JSON.stringify(part)}`);
  }
  console.error(msg, part);
}
