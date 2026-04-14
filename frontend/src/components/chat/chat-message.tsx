"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, User, Copy, Check, Star, RotateCcw } from "lucide-react";
import type { ParsedError } from "@/lib/error-messages";
import { extractCitations } from "@/lib/citations";
import { CitationList } from "./citation-list";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  id?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  // Phase 2 D-07: 인라인 에러 배너 + 재시도 버튼
  error?: ParsedError;
  onRetry?: () => void;
  isRetryDisabled?: boolean;
}

/**
 * ChatMessage
 *
 * 2026-04-14 Option C redesign: assistant path rendered as a full-width
 * "document" (no bubble) with tuned Tailwind Typography `prose` styles for
 * long-form Korean legal content. User messages keep their right-aligned
 * primary-color bubble — "chat" feel on the input side, "document" feel
 * on the answer side. Same component serves both paths so MessagePartRenderer's
 * legacy branch + all Phase 2/3 props continue to flow through.
 *
 * Key invariants preserved:
 * - Phase 2 D-07 inline error banner + 다시 시도 button (now inside the
 *   assistant document container, below the prose body).
 * - Phase 2 `(content || isUser)` empty-bubble guard — extended: assistant
 *   article only renders when there is cleaned prose OR a loading
 *   placeholder. When only an error exists (pre-stream), the error banner
 *   stands alone without ghost markup.
 * - Phase 3 "검색 중..." loading placeholder passes through verbatim
 *   (replaced live by StreamingSkeletonBubble in chat-container, but this
 *   component still renders the string safely if given).
 * - Copy / favorite action buttons still revealed on hover.
 */
export function ChatMessage({
  role,
  content,
  id,
  isFavorite,
  onToggleFavorite,
  error,
  onRetry,
  isRetryDisabled,
}: ChatMessageProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);

  // Extract [출처: ...] citations from assistant text and strip them from
  // the body so the prose flows cleanly. The memoized parse runs once per
  // content change — cheap regex, safe to re-run on every render.
  const { cleaned, citations } = useMemo(() => {
    if (isUser) return { cleaned: content, citations: [] };
    return extractCitations(content);
  }, [content, isUser]);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── User path: bubble kept (right-aligned primary) ──────────────────
  if (isUser) {
    return (
      <div className="group flex flex-row-reverse gap-3 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
        <div className="flex max-w-[75%] flex-col gap-1">
          <div className="rounded-2xl bg-primary px-4 py-3 text-[length:var(--text-base)] text-primary-foreground">
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Assistant path: full-width document layout ──────────────────────
  const hasBodyText = cleaned.length > 0 || content === "검색 중...";
  const displayText = cleaned.length > 0 ? cleaned : content;
  const showActions = content.length > 0 && content !== "검색 중...";

  return (
    <div className="group flex gap-3 py-6">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Scale className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/*
          Prose body. Tuned for Korean long-form legal content:
          - prose-base (16px) instead of prose-sm (14px)
          - leading-relaxed on paragraphs + list items (Korean reads
            better with more vertical breathing room)
          - max-w-[72ch] for ~70 Korean char line length (optimal)
          - strong/code/blockquote color tokens pulled from CSS vars so
            dark mode inherits the contrast fix automatically
          - blockquote given a primary-color left border + muted bg so
            quoted content (user text, sub-quotes) stands out
          - code gets a subtle bg chip (removes the default `` backticks)
        */}
        {hasBodyText && (
          <article
            className={cn(
              "prose prose-base dark:prose-invert max-w-[72ch]",
              "prose-p:leading-relaxed prose-p:my-3",
              "prose-li:leading-relaxed prose-li:my-1",
              "prose-headings:text-foreground prose-headings:font-semibold",
              "prose-headings:mt-6 prose-headings:mb-3",
              "prose-h2:text-lg prose-h3:text-base",
              "prose-strong:text-foreground prose-strong:font-semibold",
              "prose-em:text-foreground",
              "prose-blockquote:border-l-primary prose-blockquote:bg-muted/40",
              "prose-blockquote:py-2 prose-blockquote:pl-4 prose-blockquote:pr-3",
              "prose-blockquote:not-italic prose-blockquote:text-foreground",
              "prose-blockquote:rounded-r-md prose-blockquote:my-4",
              "prose-code:bg-muted prose-code:text-foreground",
              "prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
              "prose-code:before:content-none prose-code:after:content-none",
              "prose-code:text-[length:var(--text-sm)]",
              "prose-hr:my-6 prose-hr:border-border",
              "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          </article>
        )}

        {/* 참고 법령 footer card — extracted citations */}
        {citations.length > 0 && <CitationList citations={citations} />}

        {/* Phase 2 D-07 inline error banner — sits below the prose body */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2 max-w-[72ch]">
            <p className="text-[length:var(--text-sm)] text-destructive font-medium">
              {error.message}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isRetryDisabled}
                className={cn(
                  "inline-flex items-center gap-1.5 self-start rounded-md border border-border bg-background px-3 py-1.5 text-[length:var(--text-xs)] font-medium",
                  "hover:bg-muted transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <RotateCcw className="h-3 w-3" />
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* Action buttons (hover-revealed) */}
        {showActions && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="복사"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            {id && onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(id)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="즐겨찾기"
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    isFavorite && "fill-warning text-warning",
                  )}
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
