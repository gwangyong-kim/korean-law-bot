"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { Scale, Download, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/conversations";

const EXAMPLE_QUESTIONS = [
  "근로기준법 연차휴가 규정 알려줘",
  "개인정보보호법 제15조 전문 보여줘",
  "부당해고 관련 판례 찾아줘",
  "이 계약 조항이 법적으로 유효한지 검토해줘",
  "수입 통관 시 필요한 법령 체크리스트",
  "하도급법 위반 사례와 판례",
];

interface ChatContainerProps {
  conversationId: string;
  initialMessages: Message[];
  onMessagesChange: (messages: Message[]) => void;
}

export function ChatContainer({
  conversationId,
  initialMessages,
  onMessagesChange,
}: ChatContainerProps) {
  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
  });
  const [input, setInput] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("law-bot-favorites");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const isLoading = status === "streaming" || status === "submitted";

  // 새 메시지 시 하단 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 메시지 변경 시 localStorage에 저장
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length === prevLenRef.current && status === "streaming") return;
    prevLenRef.current = messages.length;

    const mapped: Message[] = messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: getMessageText(m),
    }));

    if (status !== "streaming") {
      onMessagesChange(mapped);
    }
  }, [messages, status, onMessagesChange]);

  function handleSubmit() {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  function handleExampleClick(question: string) {
    sendMessage({ text: question });
  }

  const handleToggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("law-bot-favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);

  function handleExport() {
    const text = messages
      .map((m) => {
        const role = m.role === "user" ? "👤 질문" : "⚖️ 답변";
        return `${role}\n${getMessageText(m)}`;
      })
      .join("\n\n" + "─".repeat(40) + "\n\n");

    const header = `법령 검색 대화 기록\n날짜: ${new Date().toLocaleString("ko-KR")}\n${"═".repeat(40)}\n\n`;
    const blob = new Blob([header + text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `법령검색_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 메시지에서 텍스트 추출
  function getMessageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* 내보내기 버튼 (메시지 있을 때만) */}
      {messages.length > 0 && (
        <div className="flex justify-end px-4 pt-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            <span className="text-[length:var(--text-xs)]">내보내기</span>
          </Button>
        </div>
      )}

      {/* 메시지 영역 */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4">
        {messages.length === 0 && initialMessages.length === 0 ? (
          <EmptyState onQuestionClick={handleExampleClick} />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                id={m.id}
                role={m.role as "user" | "assistant"}
                content={getMessageText(m)}
                isFavorite={favorites.has(m.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <ChatMessage role="assistant" content="검색 중..." />
            )}
          </div>
        )}
        {error && (
          <div className="mx-auto max-w-3xl px-4 pb-4">
            <p className="text-sm text-destructive">오류: {error.message}</p>
          </div>
        )}
      </ScrollArea>

      {/* 입력 영역 */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm p-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
          <p className="mt-2 text-center text-[length:var(--text-xs)] text-muted-foreground">
            국가법령정보센터 Open API 기반 · 법률 자문이 아닌 정보 제공 목적
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onQuestionClick }: { onQuestionClick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Scale className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-[length:var(--text-xl)] font-semibold">한국 법령 검색</h2>
        <p className="mt-1 text-[length:var(--text-sm)] text-muted-foreground">
          법령, 판례, 행정규칙을 자연어로 질문해보세요
        </p>
      </div>

      {/* 클릭 가능한 예시 질문 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full px-4">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onQuestionClick(q)}
            className="flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-left text-[length:var(--text-sm)] text-foreground transition-colors hover:bg-accent/30"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
