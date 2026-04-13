"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput, type AttachedFile } from "./chat-input";
import { ModelSelector } from "./model-selector";
import { Scale, Download, FileText, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [modelId, setModelId] = useState(() => {
    if (typeof window === "undefined") return "gemma-4-27b-it";
    return localStorage.getItem("law-bot-model") || "gemma-4-27b-it";
  });

  function handleModelChange(id: string) {
    setModelId(id);
    localStorage.setItem("law-bot-model", id);
  }
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

  async function handleSubmit(attachedFiles?: AttachedFile[]) {
    if ((!input.trim() && !attachedFiles?.length) || isLoading) return;

    // 텍스트 파일 내용을 메시지에 추가
    let fullText = input;
    const imageDataUrls: string[] = [];

    if (attachedFiles?.length) {
      for (const f of attachedFiles) {
        if (f.file.type.startsWith("image/")) {
          // 이미지 → data URL
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(f.file);
          });
          imageDataUrls.push(dataUrl);
        } else {
          // 텍스트/문서 → 메시지에 포함
          const text = await f.file.text();
          fullText += `\n\n📎 ${f.file.name}:\n${text}`;
        }
      }
    }

    const opts = { body: { modelId } };

    if (imageDataUrls.length > 0) {
      sendMessage({
        text: fullText || "첨부된 이미지를 분석해주세요.",
        files: imageDataUrls.map((dataUrl) => ({
          type: "file" as const,
          mediaType: "image/png",
          url: dataUrl,
        })),
      }, opts);
    } else {
      sendMessage({ text: fullText }, opts);
    }
    setInput("");
  }

  function handleExampleClick(question: string) {
    sendMessage({ text: question }, { body: { modelId } });
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
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive mb-1">오류가 발생했습니다</p>
              <p className="text-sm text-muted-foreground">
                {error.message?.includes("503") || error.message?.includes("혼잡")
                  ? "법령 검색 서버가 현재 혼잡합니다. 잠시 후 다시 시도해주세요."
                  : error.message?.includes("429")
                  ? "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
                  : error.message || "알 수 없는 오류가 발생했습니다. 새로고침 후 다시 시도해주세요."}
              </p>
            </div>
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
            modelSelector={<ModelSelector value={modelId} onChange={handleModelChange} />}
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
  const [tab, setTab] = useState<"examples" | "guide" | "scope">("examples");

  const TIPS = [
    { title: "구체적으로 질문하세요", desc: "\"법률 알려줘\"보다 \"근로기준법 제60조 연차휴가 규정\"처럼 구체적으로 물어보면 더 정확합니다." },
    { title: "이어서 질문하세요", desc: "대화 맥락이 유지되므로 \"위 판례의 전문 보여줘\"처럼 이전 답변을 참조할 수 있습니다." },
    { title: "계약서를 붙여넣어 보세요", desc: "계약 조항을 붙여넣으면 법적 리스크를 🔴🟡🟢 등급으로 분석해줍니다." },
    { title: "법률 자문이 아닙니다", desc: "정보 검색 도우미입니다. 중요한 법적 판단은 전문가에게 확인하세요." },
  ];

  const SCOPES = [
    "법률 · 시행령 · 시행규칙", "대법원 판례", "헌법재판소 결정",
    "조세심판원 재결", "행정규칙", "자치법규 · 조례",
    "행정심판례", "관세청 법령해석", "노동위원회 결정",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Scale className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-[length:var(--text-xl)] font-semibold">Glluga 법령 Assistant</h2>
        <p className="mt-1 text-[length:var(--text-sm)] text-muted-foreground">
          법령, 판례, 행정규칙을 자연어로 질문해보세요
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {([
          { key: "examples" as const, label: "예시 질문" },
          { key: "guide" as const, label: "사용 팁" },
          { key: "scope" as const, label: "검색 범위" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[length:var(--text-sm)] transition-colors",
              tab === t.key
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="max-w-2xl w-full px-4">
        {tab === "examples" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => onQuestionClick(q)}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-left text-[length:var(--text-sm)] text-foreground transition-colors hover:bg-accent/30"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="line-clamp-2">{q}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "guide" && (
          <div className="space-y-3">
            {TIPS.map((tip) => (
              <div key={tip.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <div>
                  <p className="text-[length:var(--text-sm)] font-medium mb-0.5">{tip.title}</p>
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "scope" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SCOPES.map((item) => (
              <div key={item} className="rounded-xl border border-border bg-card px-3 py-2.5 text-center text-[length:var(--text-sm)]">
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
