"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, User, Copy, Check, Star } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  id?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function ChatMessage({ role, content, id, isFavorite, onToggleFavorite }: ChatMessageProps) {
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
