/**
 * Tool label + argument preview + input serialization module.
 *
 * Single source of truth for:
 *   1. Korean labels per MCP tool (D-04 / TOOL-02)
 *   2. Arg key priority list per tool — which input property to show in the chip
 *      text. **VERIFIED against live MCP schema on 2026-04-13 via LAW_API_KEY probe.**
 *      CONTEXT.md D-04's lawName / keyword / caseId mappings are PHANTOM — they
 *      don't exist in the real MCP input schemas and would render "undefined"
 *      in chips. See Phase 3 RESEARCH §3 for the live probe evidence.
 *   3. Input serialization with credential-key redaction (T-03-01 mitigation).
 *      The MCP input schema defines an apiKey property on every tool. Gemini
 *      should never pass it, but we redact it defensively before exposing the
 *      request JSON inside the chip's <details> block.
 *
 * If the MCP server changes its schema, this file is the first place that drifts.
 * Runtime indicator: chip shows "undefined" or empty arg preview → rerun a live
 * probe and update TOOL_LABELS.
 *
 * Requirements: TOOL-02 (4-tool Korean label map).
 * Referenced by: components/chat/tool-invocation-view.tsx (Plan 03-02).
 */

export interface ToolLabel {
  /** MCP tool name as received from AI SDK getToolName(part). */
  name: string;
  /** Korean display label. Used in chip text: `${label} ${tense}: ${arg}`. */
  label: string;
  /**
   * Fallback priority list of input property names to show in the chip.
   * First string/number value found wins. Unknown tools fall back to the
   * first string property of the input object (getToolArgPreview).
   */
  argKeys: string[];
}

export const TOOL_LABELS: Record<string, ToolLabel> = {
  search_law: {
    name: "search_law",
    label: "법령 검색",
    // Verified required: [query, display]. User-recognizable arg = query.
    argKeys: ["query"],
  },
  get_law_text: {
    name: "get_law_text",
    label: "법령 본문",
    // Verified schema: mst, lawId, jo, efYd, apiKey. CONTEXT D-04 lawName
    // is PHANTOM. Priority: 조문 번호(jo) → 법령 ID(lawId) → MST(mst).
    argKeys: ["jo", "lawId", "mst"],
  },
  search_decisions: {
    name: "search_decisions",
    label: "판례 검색",
    // Verified required: [domain]. properties: query, display, page, sort,
    // options. CONTEXT D-04 keyword is PHANTOM. Priority: query → domain.
    argKeys: ["query", "domain"],
  },
  get_decision_text: {
    name: "get_decision_text",
    label: "판례 본문",
    // Verified required: [domain, id]. CONTEXT D-04 caseId is PHANTOM.
    // Priority: id → domain.
    argKeys: ["id", "domain"],
  },
};

/**
 * Input property names that may carry credentials. Any match (case-insensitive)
 * is redacted in serializeInput output. Defense-in-depth against T-03-01 —
 * MCP input schema defines apiKey on every tool; Gemini should never pass
 * it, but we strip it before exposing request JSON in the chip <details>.
 */
const REDACTED_KEY_PATTERN = /^(apiKey|api_key|auth|token|secret|password|credential)$/i;

const ARG_PREVIEW_MAX = 20;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/**
 * Korean label for a tool name. Unknown tools (e.g. chain_* series, get_annexes,
 * discover_tools) fall back to the raw tool name so the chip still renders.
 * Phase 3 only ships labels for the 4 D-04 tools. v2 (V2-TOOL-04) may add more.
 */
export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName]?.label ?? toolName;
}

/**
 * Extract the first user-recognizable argument from a tool input object by
 * trying the tool-specific priority list in order. Returns empty string if
 * no candidate is found (chip renders `${label} ${tense}` without args).
 *
 * For unknown tools, falls back to the first string property of the input
 * (so chain_* calls still show something meaningful in the chip).
 *
 * Truncates to ARG_PREVIEW_MAX (20) chars with "..." suffix per D-04.
 *
 * Never reads redacted fields even if they match the priority list (defense
 * in depth — a tool-labels.ts typo that listed a credential key as a priority
 * would otherwise leak the secret into the chip text itself).
 */
export function getToolArgPreview(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const record = input as Record<string, unknown>;
  const priority = TOOL_LABELS[toolName]?.argKeys ?? [];

  for (const key of priority) {
    if (REDACTED_KEY_PATTERN.test(key)) continue;
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return truncate(value, ARG_PREVIEW_MAX);
    }
    if (typeof value === "number") {
      return truncate(String(value), ARG_PREVIEW_MAX);
    }
  }

  // Unknown tool fallback: first non-redacted string property.
  for (const [key, value] of Object.entries(record)) {
    if (REDACTED_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string" && value.length > 0) {
      return truncate(value, ARG_PREVIEW_MAX);
    }
  }

  return "";
}

/**
 * JSON-stringify a tool input object for display inside the chip's <details>
 * block. Any property whose key matches REDACTED_KEY_PATTERN is replaced with
 * "[REDACTED]" — defense-in-depth against T-03-01 (MCP input schema exposes
 * apiKey on every tool; Gemini should never pass it, but we strip it here).
 *
 * Recursively redacts nested objects. Handles primitive inputs and null/undefined
 * by returning empty string (nothing meaningful to show).
 *
 * Returns pretty-printed JSON with 2-space indent for human-readable <details>.
 */
export function serializeInput(input: unknown): string {
  if (input === undefined || input === null) return "";
  try {
    return JSON.stringify(redactDeep(input), null, 2);
  } catch {
    return String(input);
  }
}

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactDeep(v);
      }
    }
    return out;
  }
  return value;
}
