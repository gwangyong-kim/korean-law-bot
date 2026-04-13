"use client";

/**
 * MessagePartRenderer — dispatches UIMessage.parts to the right UI.
 *
 * Phase 1 scope:
 *  - text → render via existing ChatMessage (ReactMarkdown)
 *  - tool-* / dynamic-tool → minimal state chip
 *  - reasoning / file / source-url / source-document / step-start / data-* → null (D-05)
 *  - switch default → dev throw, prod console.error (D-07)
 *
 * Requirements: CHAT-07, CHAT-08
 */

import type {
  UIMessage,
  UIMessagePart,
  UIDataTypes,
  UITools,
  DynamicToolUIPart,
  ToolUIPart,
} from "ai";
import { ChatMessage } from "./chat-message";
import {
  isTextUIPart,
  isToolUIPart,
  getToolName,
  extractAssistantText,
  type ExtractableMessage,
  type LegacyMessage,
} from "@/lib/ui-message-parts";

interface MessagePartRendererProps {
  message: ExtractableMessage;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function MessagePartRenderer({
  message,
  isFavorite,
  onToggleFavorite,
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
      />
    );
  }

  const uiMessage = message as UIMessage;

  // User messages in AI SDK 6 always carry their input as text parts.
  // Render them through a single ChatMessage bubble with concatenated text.
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
        <ToolChip key={`tool-${idx}`} part={part} />
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

  return (
    <>
      {textChunks.length > 0 && (
        <ChatMessage
          id={uiMessage.id}
          role="assistant"
          content={textChunks.join("")}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
        />
      )}
      {nonTextNodes.length > 0 && (
        <div className="mx-auto max-w-3xl flex flex-wrap gap-2 pl-11 pb-2">
          {nonTextNodes}
        </div>
      )}
    </>
  );
}

/**
 * Minimal tool state chip. Dispatches 4 D-06 states explicitly and a
 * neutral fallback for approval states (Phase 3 scope).
 *
 * Accepts the union of static ToolUIPart and DynamicToolUIPart —
 * both expose `state`, and `getToolName` handles both variants.
 */
function ToolChip({ part }: { part: ToolUIPart<UITools> | DynamicToolUIPart }) {
  const name = getToolName(part);

  let label: string;
  switch (part.state) {
    case "input-streaming":
      label = `${name}: 입력 준비 중`;
      break;
    case "input-available":
      label = `${name}: 호출 중`;
      break;
    case "output-available":
      label = `${name}: 완료`;
      break;
    case "output-error":
      label = `${name}: 오류 (${part.errorText ?? "unknown"})`;
      break;
    default:
      // Approval states and any unforeseen state — neutral fallback
      // per RESEARCH.md §2.3. Not a throw, because these are type-valid.
      label = `${name}: ${part.state}`;
      break;
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[length:var(--text-xs)] text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * Type-exhaustive safety net (D-07). Triggers at the switch default:
 *  - dev: throw (so the test-sidebar surfaces the gap immediately)
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
