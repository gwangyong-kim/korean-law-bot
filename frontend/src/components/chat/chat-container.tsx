"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { UIMessage } from "ai";
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

const MAX_CONTEXT_TURNS = 10;
const MAX_CONTEXT_CHARS = 8000;

function splitContextWindow(msgs: Message[]): {
  older: Message[];
  context: UIMessage[];
} {
  let splitIdx = Math.max(0, msgs.length - MAX_CONTEXT_TURNS * 2);

  let totalChars = 0;
  for (let i = splitIdx; i < msgs.length; i++) {
    totalChars += msgs[i].content.length;
  }
  while (totalChars > MAX_CONTEXT_CHARS && splitIdx < msgs.length) {
    totalChars -= msgs[splitIdx].content.length;
    splitIdx++;
  }

  while (splitIdx < msgs.length && msgs[splitIdx].role !== "user") {
    splitIdx++;
  }

  const older = msgs.slice(0, splitIdx);
  const context = msgs.slice(splitIdx).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.content }],
  }));

  return { older, context };
}

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
  const { olderMessages, contextMessages } = useMemo(
    () => {
      const { older, context } = splitContextWindow(initialMessages);
      return { olderMessages: older, contextMessages: context };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount 시 1회만 계산 (key={activeId}로 remount)
    [],
  );
  const olderRef = useRef<Message[]>(olderMessages);

  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({
    id: conversationId,
    messages: contextMessages,
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
  const stickToBottomRef = useRef(true);
  const prevLenRef = useRef(0);

  const isLoading = status === "streaming" || status === "submitted";

  // 사용자 의도 감지: wheel/touch/keyboard로 위로 스크롤하면 auto-scroll 해제.
  // scroll 이벤트가 아닌 입력 이벤트를 사용하는 이유:
  // scroll 이벤트는 프로그램적 scrollTop 변경(아래 effect)에도 발동되어
  // stickToBottom 플래그가 self-reset되는 루프가 생긴다. 입력 이벤트는
  // 사용자의 실제 동작만 포착하므로 이 루프를 끊어준다.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    function isAwayFromBottom(el: HTMLElement) {
      // 80px threshold: 스트리밍 중 새 청크로 scrollHeight가 급변해도
      // 사용자가 "충분히 위로" 올라간 케이스만 감지 (기존 50px은 너무 민감).
      return el.scrollHeight - el.scrollTop - el.clientHeight > 80;
    }

    // 사용자 제스처: 위로 스크롤 의도 감지 → sticky 해제
    function onUserScroll() {
      if (isAwayFromBottom(viewport!)) {
        stickToBottomRef.current = false;
      }
    }

    function onKey(e: KeyboardEvent) {
      // PageUp/ArrowUp/Home: 위로 이동 의도
      if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home") {
        // rAF로 한 프레임 지연 — 키가 적용된 후의 scrollTop을 읽기 위함
        requestAnimationFrame(() => {
          if (isAwayFromBottom(viewport!)) {
            stickToBottomRef.current = false;
          }
        });
      }
    }

    // 하단 복귀 감지: 사용자(또는 프로그램)가 하단 근처에 도달하면 sticky 재활성화.
    // 프로그램적 스크롤이 이를 트리거해도 이미 true → no-op이라 루프 없음.
    function onScroll() {
      const el = viewport!;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 80) {
        stickToBottomRef.current = true;
      }
    }

    viewport.addEventListener("wheel", onUserScroll, { passive: true });
    viewport.addEventListener("touchmove", onUserScroll, { passive: true });
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      viewport.removeEventListener("wheel", onUserScroll);
      viewport.removeEventListener("touchmove", onUserScroll);
      viewport.removeEventListener("keydown", onKey);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, []);

  // 새 메시지/스트리밍 시 하단 스크롤 — 사용자가 위로 스크롤한 상태면 건너뜀.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  // 메시지 변경 시 localStorage에 저장.
  // olderRef(컨텍스트 밖 오래된 메시지) + useChat messages를 merge해서
  // 전체 이력을 유지한다.
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
      onMessagesChange([...olderRef.current, ...liveTurn]);
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
    stickToBottomRef.current = true;
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
    const olderLines = olderRef.current.map((m) => {
      const role = m.role === "user" ? "👤 질문" : "⚖️ 답변";
      return `${role}\n${m.content}`;
    });
    const liveLines = messages.map((m) => {
      const role = m.role === "user" ? "👤 질문" : "⚖️ 답변";
      return `${role}\n${extractAssistantText(m)}`;
    });
    const text = [...olderLines, ...liveLines].join("\n\n" + "─".repeat(40) + "\n\n");

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
      {(messages.length > 0 || olderRef.current.length > 0) && (
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
        {messages.length === 0 && olderRef.current.length === 0 ? (
          <EmptyState onQuestionClick={handleExampleClick} />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {olderRef.current.map((m) => (
              <ChatMessage
                key={`older-${m.id}`}
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
