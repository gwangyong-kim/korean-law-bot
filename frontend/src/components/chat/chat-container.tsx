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
import { extractAssistantText } from "@/lib/ui-message-parts";
import { MessagePartRenderer } from "./message-part-renderer";
import { StreamingSkeletonBubble } from "./streaming-skeleton-bubble";
import { parseChatError, type ParsedError } from "@/lib/error-messages";
import { DEFAULT_MODEL, getModelInfo } from "@/lib/models";

const EXAMPLE_QUESTIONS = [
  "중대재해처벌법 제4조 안전보건 확보 의무 알려줘",
  "개인정보보호법 제15조 전문 보여줘",
  "성과급이 통상임금에 포함되는지 판례 찾아줘",
  "이 계약 조항이 법적으로 유효한지 검토해줘",
  "전자상거래법 청약철회 가능 기간은?",
  "경업금지 약정의 효력 관련 대법원 판례",
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
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
    id: conversationId,
  });
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_MODEL;
    // localStorage에 저장된 modelId가 현재 MODELS 목록에 존재하는지 검증.
    // 없으면(예: 이전에 선택한 모델이 deactivate됐거나 리스트에서 제거됨)
    // DEFAULT_MODEL로 자동 fallback하고 캐시도 갱신한다. 이렇게 안 하면
    // 사용자 UI에는 새 기본값이 보여도 실제 요청은 stale modelId로 가서
    // "사용량 한도 도달" 같은 오해 에러를 보게 된다.
    const cached = localStorage.getItem("law-bot-model-v2");
    if (cached && getModelInfo(cached)) return cached;
    if (cached) localStorage.setItem("law-bot-model-v2", DEFAULT_MODEL);
    return DEFAULT_MODEL;
  });

  function handleModelChange(id: string) {
    setModelId(id);
    localStorage.setItem("law-bot-model-v2", id);
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

  // 과거 대화 복원 (post-v1 fix): initialMessages는 lib/conversations.ts에
  // localStorage로 저장된 flat Message[]이다. useChat은 세션마다 빈 messages로
  // 시작하므로 (Phase 4 drop으로 reseed API 미사용), 과거 대화를 클릭해도
  // 화면이 비어보였다. 해결: mount 시점의 initialMessages를 priorRef로 한 번
  // 캡처해서 live useChat messages 위에 정적으로 렌더. key={activeId}로
  // remount되므로 전환 시 항상 fresh. Save effect도 priorRef.current + 새
  // turn을 merge해서 history를 monotonic하게 append.
  // Trade-off: Gemini는 priorRef 내용을 context로 받지 못한다 — 과거 대화
  // 위에 새 질문이 올라와도 fresh session으로 답함. 사용자는 과거를 "읽을"
  // 수만 있고 "연속해서" 대화할 수는 없다. 풀 reseed는 Phase 4 재개 시 해결.
  const priorRef = useRef<Message[]>(initialMessages);

  const isLoading = status === "streaming" || status === "submitted";

  // 새 메시지 시 하단 스크롤.
  // Base UI ScrollArea는 Root를 forwardRef 대상으로 넘기고, 실제 scrollable
  // 요소는 내부의 Viewport(data-slot="scroll-area-viewport")다. Root의
  // scrollTop을 건드리면 아무 효과가 없다 — Viewport를 직접 찾아서 scroll.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  // 메시지 변경 시 localStorage에 저장.
  // priorRef.current(과거 대화 스냅샷) + 라이브 useChat 턴을 merge해서
  // 저장한다 — 그래야 다음 세션 open 시에도 전체 이력이 보인다. useChat
  // 메시지만 저장하면 과거 대화가 덮어씌워져 사라진다.
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length === prevLenRef.current && status === "streaming") return;
    prevLenRef.current = messages.length;

    const liveTurn: Message[] = messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: extractAssistantText(m),
    }));

    if (status !== "streaming") {
      onMessagesChange([...priorRef.current, ...liveTurn]);
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

  // D-09: 실패한 assistant 턴 재생성. Pre-stream 에러 케이스를 대비해
  // 마지막 메시지 역할을 확인한 뒤 regenerate()와 sendMessage() 중 선택.
  // (RESEARCH §5.2 Q3: pre-stream에서 regenerate() 동작 불확실 → fallback 필수)
  const handleRetry = useCallback(async () => {
    clearError();
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      // Mid-stream 에러: 마지막 assistant 메시지를 regenerate.
      await regenerate({ body: { modelId } });
      return;
    }
    // Pre-stream 에러: 마지막 user 메시지를 sendMessage로 재전송.
    if (last?.role === "user") {
      const text = extractAssistantText(last);
      if (!text) return;
      sendMessage({ text }, { body: { modelId } });
    }
  }, [clearError, messages, regenerate, sendMessage, modelId]);

  function handleExport() {
    // 과거 대화(priorRef) + 라이브 세션(messages) 둘 다 export.
    const priorLines = priorRef.current.map((m) => {
      const role = m.role === "user" ? "👤 질문" : "⚖️ 답변";
      return `${role}\n${m.content}`;
    });
    const liveLines = messages.map((m) => {
      const role = m.role === "user" ? "👤 질문" : "⚖️ 답변";
      return `${role}\n${extractAssistantText(m)}`;
    });
    const text = [...priorLines, ...liveLines].join("\n\n" + "─".repeat(40) + "\n\n");

    const header = `법령 검색 대화 기록\n날짜: ${new Date().toLocaleString("ko-KR")}\n${"═".repeat(40)}\n\n`;
    const blob = new Blob([header + text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `법령검색_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Phase 2 D-06/D-07: useChat.error를 한국어 ParsedError로 1회 변환.
  // 마지막 메시지의 role에 따라 인라인(assistant) vs standalone(pre-stream) 분기.
  const parsedError: ParsedError | undefined = error ? parseChatError(error) : undefined;
  const lastMessage = messages[messages.length - 1];
  const lastIsAssistant = lastMessage?.role === "assistant";

  return (
    <div className="flex h-full flex-col">
      {/* 내보내기 버튼 (메시지 있을 때만). 과거 대화 복원 경로도 포함. */}
      {(messages.length > 0 || priorRef.current.length > 0) && (
        <div className="flex justify-end px-4 pt-2">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            <span className="text-[length:var(--text-xs)]">내보내기</span>
          </Button>
        </div>
      )}

      {/* 메시지 영역. min-h-0는 flex column 자식이 content로 인해 늘어나지
          않고 flex-basis:0에서 shrink하도록 허용 — 없으면 Viewport의
          overflow:scroll이 절대 발동하지 않아 답변이 길어지면 입력창이 화면
          밖으로 밀려나고 스크롤도 안 된다. */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0 px-4">
        {messages.length === 0 && priorRef.current.length === 0 ? (
          <EmptyState onQuestionClick={handleExampleClick} />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {/* 과거 대화 복원 (정적, 읽기 전용). priorRef는 mount 시점의
                initialMessages 스냅샷 — key={activeId}로 remount되므로 전환
                시 항상 fresh. Gemini는 이 내용을 context로 받지 않으므로
                "이전 대화 내용 보이기"만 지원하고 "이어서 대화"는 Phase 4의
                풀 reseed 경로에 남긴다. */}
            {priorRef.current.map((m) => (
              <ChatMessage
                key={`prior-${m.id}`}
                id={m.id}
                role={m.role}
                content={m.content}
                isFavorite={favorites.has(m.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
            {messages.map((m, idx) => {
              const isLast = idx === messages.length - 1;
              const attachedError =
                parsedError && isLast && m.role === "assistant" ? parsedError : undefined;
              return (
                <MessagePartRenderer
                  key={m.id}
                  message={m}
                  isFavorite={favorites.has(m.id)}
                  onToggleFavorite={handleToggleFavorite}
                  error={attachedError}
                  onRetry={attachedError ? handleRetry : undefined}
                  isRetryDisabled={isLoading}
                />
              );
            })}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <StreamingSkeletonBubble />
            )}
            {/*
              Phase 2 RESEARCH Q5 옵션 A: pre-stream 에러 standalone bubble.
              마지막 메시지가 user(또는 messages 비어있음)인 상태로 error가 발생했을 때,
              user bubble 아래에 standalone assistant 에러 bubble을 렌더해 D-07 UX를 유지.
            */}
            {parsedError && !lastIsAssistant && (
              <ChatMessage
                role="assistant"
                content=""
                error={parsedError}
                onRetry={handleRetry}
                isRetryDisabled={isLoading}
              />
            )}
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
