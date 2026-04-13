/**
 * UIMessage parts contract — single source of truth for message rendering
 * and text extraction. All chat code imports type guards from here (not
 * directly from "ai") so the project has one place to update if AI SDK 6
 * renames or moves exports.
 *
 * Requirements: CHAT-05, COMPAT-01, COMPAT-02
 */

import {
  isTextUIPart,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from "ai";

// Re-exports (CHAT-05) — downstream code imports type guards from here.
export { isTextUIPart, isToolUIPart, getToolName };
export type { UIMessage };

/**
 * Legacy message shape stored in localStorage by lib/conversations.ts
 * prior to Phase 1. Flat {id, role, content: string}. Phase 4 (PERS-01)
 * will migrate the storage shape to UIMessage-compatible parts; until
 * then, read-time conversion is the only migration.
 */
export interface LegacyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * Union accepted by extractAssistantText. Either a v6 UIMessage (new shape)
 * or a legacy flat message (old localStorage shape).
 */
export type ExtractableMessage = UIMessage | LegacyMessage;

/**
 * Detects the legacy shape. D-02: parts undefined AND content is string.
 * False-positive free — UIMessage always has `parts: UIMessagePart[]`.
 */
function isLegacyMessage(msg: unknown): msg is LegacyMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if ("parts" in m && m.parts !== undefined) return false;
  return typeof m.content === "string";
}

/**
 * Extract plain text from an assistant or user message, regardless of
 * whether it's a v6 UIMessage or a legacy flat message.
 *
 * - New shape: concatenates all text parts (using the official isTextUIPart
 *   type guard). Tool parts and other non-text parts are ignored — callers
 *   that want to render tool state should use MessagePartRenderer, not this
 *   function.
 * - Legacy shape: returns content directly.
 * - Unknown shape: logs a warning and returns "" (D-03 fallback).
 *
 * Single source of truth — replaces the duplicate inline getMessageText
 * helpers in chat-container.tsx and test-sidebar/page.tsx (CHAT-06).
 */
export function extractAssistantText(msg: ExtractableMessage): string {
  // Legacy branch (COMPAT-01, COMPAT-02): handle old localStorage shape.
  if (isLegacyMessage(msg)) {
    return msg.content;
  }

  // New branch: guard that parts is an array before iterating.
  if (!("parts" in msg) || !Array.isArray(msg.parts)) {
    console.warn("extractAssistantText: unexpected message shape", msg);
    return "";
  }

  const texts: string[] = [];
  for (const part of msg.parts) {
    if (isTextUIPart(part)) {
      texts.push(part.text);
    }
  }
  return texts.join("");
}
