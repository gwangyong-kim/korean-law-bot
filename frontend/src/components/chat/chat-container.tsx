"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { Scale } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message } from "@/lib/conversations";

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

  // 메시지에서 텍스트 추출
  function getMessageText(m: (typeof messages)[number]): string {
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* 메시지 영역 */}
      <ScrollArea ref={scrollRef} className="flex-1 px-4">
        {messages.length === 0 && initialMessages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                role={m.role as "user" | "assistant"}
                content={getMessageText(m)}
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

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Scale className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-[length:var(--text-xl)] font-semibold">한국 법령 검색</h2>
        <p className="mt-1 text-[length:var(--text-sm)] text-muted-foreground">
          법령, 판례, 행정규칙을 자연어로 질문해보세요
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {[
          "근로기준법 연차휴가 규정",
          "개인정보보호법 제15조",
          "부당해고 관련 판례",
        ].map((q) => (
          <span
            key={q}
            className="rounded-full border border-border px-3 py-1.5 text-[length:var(--text-xs)] text-muted-foreground"
          >
            {q}
          </span>
        ))}
      </div>
    </div>
  );
}
