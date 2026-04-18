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
      <div data-message-id={id} className="group flex flex-row-reverse gap-3 py-4">
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
            // Note: @tailwindcss/typography 플러그인이 설치되어 있지 않아
            // `prose-*` modifier 들은 전부 no-op이었다 (matchCount 0 확인).
            // 플러그인 설치는 default prose 스타일이 갑자기 들어와 regression
            // 가능성 → arbitrary children selector로 직접 spacing/타이포 제어.
            // Tailwind v4 arbitrary: `[&>p]:my-4` → `.class > p { margin: 1rem 0 }`
            // preflight 의 `p { margin: 0 }` reset 을 specificity 로 이김.
            className={cn(
              "max-w-[72ch] text-[length:var(--text-base)] text-foreground",
              // Paragraphs: 16px base, 1.8 leading (Korean 장문 최적), 16px 간격
              "[&>p]:my-4 [&>p]:leading-[1.8]",
              // Lists: top-level spacing + bullet indent + 항목 간 gap
              "[&>ul]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2",
              "[&>ol]:my-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2",
              // List items themselves + any nested list
              "[&_li]:leading-[1.8]",
              "[&_ul_ul]:my-2 [&_ul_ol]:my-2 [&_ol_ul]:my-2 [&_ol_ol]:my-2",
              "[&_ul_ul]:list-[circle] [&_ul_ul]:pl-5",
              // Headings — hierarchy + 위쪽 여유
              "[&>h1]:text-xl [&>h1]:font-semibold [&>h1]:mt-8 [&>h1]:mb-3",
              "[&>h2]:text-lg [&>h2]:font-semibold [&>h2]:mt-8 [&>h2]:mb-3",
              "[&>h3]:text-base [&>h3]:font-semibold [&>h3]:mt-6 [&>h3]:mb-2",
              "[&>h4]:text-base [&>h4]:font-semibold [&>h4]:mt-5 [&>h4]:mb-2",
              // Inline emphasis — 다크모드 대비 보장
              "[&_strong]:font-semibold [&_strong]:text-foreground",
              "[&_em]:italic",
              // Blockquote — primary border + muted bg 로 시각 weight
              "[&_blockquote]:border-l-4 [&_blockquote]:border-l-primary",
              "[&_blockquote]:bg-muted/40 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:pr-3",
              "[&_blockquote]:rounded-r-md [&_blockquote]:my-4",
              "[&_blockquote]:text-foreground",
              "[&_blockquote_p]:my-1",
              // Inline code chip
              "[&_code]:bg-muted [&_code]:text-foreground",
              "[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded",
              "[&_code]:text-[length:var(--text-sm)] [&_code]:font-mono",
              // Horizontal rule
              "[&>hr]:my-6 [&>hr]:border-border",
              // Links
              "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline",
              // First/last child: no outer margin (avoid double gap with flex parent)
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
