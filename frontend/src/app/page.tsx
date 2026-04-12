"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useCallback, useEffect } from "react";
import { ChatContainer } from "@/components/chat/chat-container";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { GuideView } from "@/components/chat/guide-view";
import { UpdatesView } from "@/components/chat/updates-view";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale } from "lucide-react";
import {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  type Conversation,
  type Message,
} from "@/lib/conversations";

type ViewMode = "chat" | "guide" | "updates";

export default function Home() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return <ChatApp userName={session.user?.name || ""} />;
}

function ChatApp({ userName }: { userName: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");

  // 초기 로드
  useEffect(() => {
    const all = getConversations();
    if (all.length > 0) {
      setConversations(all);
      setActiveId(all[0].id);
    } else {
      const conv = createConversation();
      setConversations([conv]);
      setActiveId(conv.id);
    }
  }, []);

  // 키보드 단축키
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "O" || e.key === "o" || e.code === "KeyO")) {
        e.preventDefault();
        e.stopPropagation();
        handleNew();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [searchOpen]);

  const handleNew = useCallback(() => {
    const conv = createConversation();
    setConversations(getConversations());
    setActiveId(conv.id);
    setViewMode("chat");
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setViewMode("chat");
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteConversation(id);
      const all = getConversations();
      setConversations(all);
      if (activeId === id) {
        setActiveId(all.length > 0 ? all[0].id : null);
      }
    },
    [activeId]
  );

  const handleMessagesChange = useCallback(
    (messages: Message[]) => {
      if (!activeId) return;
      updateConversation(activeId, messages);
      setConversations(getConversations());
    },
    [activeId]
  );

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : conversations;

  const activeConversation = activeId ? getConversation(activeId) : undefined;

  // 헤더 타이틀
  const headerTitle = viewMode === "guide" ? "사용 가이드" : viewMode === "updates" ? "업데이트" : "";

  return (
    <div className="flex h-full">
      {/* 사이드바 */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:relative md:z-auto">
            <ChatSidebar
              conversations={filteredConversations}
              activeId={viewMode === "chat" ? activeId : null}
              activeView={viewMode}
              onSelect={handleSelect}
              onNew={handleNew}
              onDelete={handleDelete}
              onViewMode={handleViewMode}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchOpen={searchOpen}
              onSearchToggle={() => {
                setSearchOpen(!searchOpen);
                if (searchOpen) setSearchQuery("");
              }}
            />
          </div>
        </>
      )}

      {/* 메인 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            {(!sidebarOpen || headerTitle) && (
              <>
                <Scale className="h-5 w-5 text-primary" />
                <span className="text-[length:var(--text-base)] font-semibold hidden sm:inline">
                  {headerTitle || "Glluga Statute"}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--text-xs)] text-muted-foreground hidden sm:inline">
              {userName}
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {viewMode === "guide" ? (
            <GuideView />
          ) : viewMode === "updates" ? (
            <UpdatesView />
          ) : activeId ? (
            <ChatContainer
              key={activeId}
              conversationId={activeId}
              initialMessages={activeConversation?.messages || []}
              onMessagesChange={handleMessagesChange}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Button onClick={handleNew} size="lg" className="gap-2">
                <Scale className="h-5 w-5" />
                새 대화 시작
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Scale className="h-10 w-10 text-primary" />
      </div>
      <div className="text-center">
        <h1 className="text-[length:var(--text-2xl)] font-bold">Glluga Statute</h1>
        <p className="mt-2 text-[length:var(--text-sm)] text-muted-foreground">
          회사 계정으로 로그인하여 한국 법령을 검색하세요
        </p>
      </div>
      <Button onClick={() => signIn("google")} size="lg" className="gap-2">
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Google 계정으로 로그인
      </Button>
    </div>
  );
}
