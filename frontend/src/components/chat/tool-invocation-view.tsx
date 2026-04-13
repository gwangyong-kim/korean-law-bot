"use client";

/**
 * ToolInvocationView — renders a single MCP tool invocation as a state-aware chip
 * plus an expandable <details> block exposing redacted request + truncated response.
 *
 * Implements Phase 3 decisions:
 *   D-01: semantic state colors (muted / success / destructive) via CSS variables
 *   D-02: lucide-react icons (Loader2 spin / Check / AlertCircle)
 *   D-03: verb tense (중 / 완료 / 실패) with Korean label
 *   D-04: tool-labels.ts priority list for arg preview (real MCP schema)
 *   D-05: <details> exposes JSON.stringify(input) + raw response (2000 char truncate)
 *   D-06: native <details> default-collapsed, Tailwind marker suppression
 *
 * Handles the 4 active DynamicToolUIPart states explicitly (input-streaming,
 * input-available, output-available, output-error). 3 approval-family states
 * (approval-requested, approval-responded, output-denied) hit a neutral gray
 * fallback showing the raw state name — Phase 3 scope is active states only,
 * approval UX is v2.
 *
 * Credential key redaction (T-03-01) is handled by serializeInput from
 * @/lib/tool-labels. Output path truncation is inline here.
 *
 * Requirements: TOOL-01, TOOL-03, TOOL-04 (+ TOOL-02 consumption, + TOOL-05 via layout in parent).
 * Referenced by: components/chat/message-part-renderer.tsx (assistant path).
 */

import type { ToolUIPart, UITools, DynamicToolUIPart } from "ai";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { getToolName } from "@/lib/ui-message-parts";
import {
  getToolLabel,
  getToolArgPreview,
  serializeInput,
} from "@/lib/tool-labels";
import { cn } from "@/lib/utils";

interface ToolInvocationViewProps {
  part: ToolUIPart<UITools> | DynamicToolUIPart;
}

const RESPONSE_TRUNCATE_LIMIT = 2000;

export function ToolInvocationView({ part }: ToolInvocationViewProps) {
  const toolName = getToolName(part);
  const label = getToolLabel(toolName);

  // D-04: argument preview. In input-streaming state, input is partial/undefined
  // (per DynamicToolUIPart discriminated union) so we suppress preview to avoid
  // rendering garbage. All other states have input: unknown (fully received).
  const argPreview =
    part.state === "input-streaming"
      ? ""
      : getToolArgPreview(toolName, part.input);

  const { Icon, tense, chipClass, spinning } = resolveVisual(part.state);

  // D-03: chip text. Drop the colon when no arg preview is available.
  const chipText = argPreview
    ? `${label} ${tense}: ${argPreview}`
    : `${label} ${tense}`;

  // D-05/D-06: details are only meaningful once input has arrived. During
  // input-streaming the input is partial, so we hide the details block.
  const showDetails = part.state !== "input-streaming";

  // D-05: request args via serializeInput (credential redaction applied by Plan 03-01).
  const requestJson = showDetails ? serializeInput(part.input) : "";

  // Response body: string output-available or errorText output-error.
  // Other states → empty (details still shows request only).
  let responseBody = "";
  if (part.state === "output-available") {
    responseBody = serializeOutput(part.output);
  } else if (part.state === "output-error") {
    responseBody = part.errorText;
  }
  const truncatedResponse = truncateResponse(responseBody);

  return (
    <div className="flex flex-col gap-1">
      {/* D-01/D-02/D-03: state-colored chip with icon + Korean label + tense */}
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[length:var(--text-xs)] w-fit",
          chipClass
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            spinning && "animate-spin"
          )}
        />
        <span>{chipText}</span>
      </div>

      {/* D-05/D-06: default-collapsed <details> — native HTML toggle, no JS */}
      {showDetails && (
        <details className="group ml-4 [&::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-[length:var(--text-xs)] text-muted-foreground hover:text-foreground select-none">
            <span className="group-open:hidden">▶ 상세</span>
            <span className="hidden group-open:inline">▼ 숨기기</span>
          </summary>
          <div className="mt-2 space-y-2">
            {requestJson && (
              <div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground mb-1">
                  Request
                </p>
                <pre className="rounded-md bg-muted p-3 font-mono text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap break-words">
                  {requestJson}
                </pre>
              </div>
            )}
            {truncatedResponse && (
              <div>
                <p className="text-[length:var(--text-xs)] text-muted-foreground mb-1">
                  Response
                </p>
                <pre className="rounded-md bg-muted p-3 font-mono text-[length:var(--text-xs)] overflow-x-auto whitespace-pre-wrap break-words">
                  {truncatedResponse}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Internal helpers — not exported.
// ----------------------------------------------------------------------

interface VisualSpec {
  Icon: typeof Loader2;
  tense: string;
  chipClass: string;
  spinning: boolean;
}

/**
 * Maps the 7-state DynamicToolUIPart union onto visual properties.
 * Phase 3 explicitly handles 4 active states. The 3 approval-family
 * states fall through to a neutral gray chip labeled with the raw
 * state name (v2 will add dedicated UX).
 */
function resolveVisual(state: string): VisualSpec {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return {
        Icon: Loader2,
        tense: "중",
        chipClass: "bg-muted text-muted-foreground",
        spinning: true,
      };
    case "output-available":
      return {
        Icon: Check,
        tense: "완료",
        chipClass: "bg-success/10 text-success",
        spinning: false,
      };
    case "output-error":
      return {
        Icon: AlertCircle,
        tense: "실패",
        chipClass: "bg-destructive/10 text-destructive",
        spinning: false,
      };
    default:
      // approval-requested / approval-responded / output-denied (v2 scope).
      // Neutral gray chip; show the raw state name so the user/devs can
      // see what's happening even without dedicated visuals.
      return {
        Icon: Loader2,
        tense: state,
        chipClass: "bg-muted text-muted-foreground",
        spinning: false,
      };
  }
}

/**
 * Safe JSON-ish stringification of arbitrary MCP tool output.
 * Strings pass through, objects are JSON.stringify'd, circular or non-
 * serializable values fall back to String(value).
 */
function serializeOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined || output === null) return "";
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/**
 * D-05: truncate response body to 2000 characters with a human-readable
 * suffix. Unicode code unit slice is used (ASCII + UTF-8 Korean is
 * practically safe; surrogate-pair correctness is out of scope).
 */
function truncateResponse(text: string): string {
  if (text.length <= RESPONSE_TRUNCATE_LIMIT) return text;
  return text.slice(0, RESPONSE_TRUNCATE_LIMIT) + "\n\n... (truncated)";
}
