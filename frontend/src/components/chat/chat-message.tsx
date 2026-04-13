"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, User, Copy, Check, Star, RotateCcw } from "lucide-react";
import type { ParsedError } from "@/lib/error-messages";

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

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("group flex gap-3 py-4", isUser && "flex-row-reverse")}>
      {/* 아바타 */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
      </div>

      {/* 메시지 */}
      <div className="flex max-w-[75%] flex-col gap-1">
        {/*
          Phase 2 D-07 Part D: bubble wrapper 조건부 렌더.
          - 사용자 메시지는 항상 보임
          - 봇 메시지는 content가 있을 때만 bubble 렌더 (pre-stream 에러로 content가 빈 경우
            빈 말풍선 + 에러 배너가 나란히 나타나는 UX 깨짐 방지)
          - "검색 중..."은 truthy이므로 로딩 플레이스홀더는 그대로 보임
        */}
        {(content || isUser) && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-[length:var(--text-base)]",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border"
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Phase 2 D-07: 인라인 에러 배너 — 실패한 assistant bubble 내부에 rendered */}
        {!isUser && error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2">
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
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <RotateCcw className="h-3 w-3" />
                다시 시도
              </button>
            )}
          </div>
        )}

        {/* 액션 버튼 (봇 메시지에만) */}
        {!isUser && content && content !== "검색 중..." && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="복사"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {id && onToggleFavorite && (
              <button
                onClick={() => onToggleFavorite(id)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="즐겨찾기"
              >
                <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-warning text-warning")} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
