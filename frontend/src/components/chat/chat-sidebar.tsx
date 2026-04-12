"use client";

import { Plus, MessageSquare, Trash2, Scale, Search, X, BookOpen, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/conversations";

type ViewMode = "chat" | "guide" | "updates";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  activeView: ViewMode;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onViewMode: (mode: ViewMode) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchOpen?: boolean;
  onSearchToggle?: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  activeView,
  onSelect,
  onNew,
  onDelete,
  onViewMode,
  searchQuery = "",
  onSearchChange,
  searchOpen = false,
  onSearchToggle,
}: ChatSidebarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const weekAgoTs = todayTs - 7 * 86400000;

  const groups: { label: string; items: Conversation[] }[] = [];
  const todayItems = conversations.filter((c) => c.updatedAt >= todayTs);
  const weekItems = conversations.filter((c) => c.updatedAt >= weekAgoTs && c.updatedAt < todayTs);
  const olderItems = conversations.filter((c) => c.updatedAt < weekAgoTs);

  if (todayItems.length) groups.push({ label: "오늘", items: todayItems });
  if (weekItems.length) groups.push({ label: "최근 7일", items: weekItems });
  if (olderItems.length) groups.push({ label: "이전", items: olderItems });

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar shadow-[2px_0_8px_-2px_oklch(0_0_0/0.08)]">

      {/* 로고 */}
      <div className="flex items-center justify-between px-3 pt-4 pb-6">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <span className="text-[length:var(--text-base)] font-semibold">Glluga 법령 Assistant</span>
        </div>
        {onSearchToggle && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSearchToggle}>
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* 새 대화 + 검색 */}
      <div className="px-3 pb-3 space-y-2">
        {searchOpen && onSearchChange && (
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="대화 검색..."
            className="h-8 text-[length:var(--text-sm)]"
            autoFocus
          />
        )}

        <Button onClick={onNew} variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          새 대화
        </Button>
      </div>

      {/* 중앙: 대화 목록 (스크롤 영역) */}
      <ScrollArea className="flex-1 px-2">
        {groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-[length:var(--text-xs)] text-muted-foreground">
            {searchQuery ? "검색 결과가 없습니다" : "대화 기록이 없습니다"}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-3 py-1 text-[length:var(--text-xs)] font-medium text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                    activeView === "chat" && activeId === conv.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50"
                  )}
                  onClick={() => onSelect(conv.id)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-[length:var(--text-sm)]">
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(conv.id);
                    }}
                    className="hidden shrink-0 rounded p-1 hover:bg-destructive/10 group-hover:block"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </ScrollArea>

      {/* 하단: 가이드 + 업데이트 + 단축키 + Powered by */}
      <div className="p-3 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-2",
            activeView === "guide" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
          )}
          onClick={() => onViewMode("guide")}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span className="text-[length:var(--text-sm)]">사용 가이드</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-2",
            activeView === "updates" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
          )}
          onClick={() => onViewMode("updates")}
        >
          <History className="h-3.5 w-3.5" />
          <span className="text-[length:var(--text-sm)]">업데이트</span>
        </Button>

        <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 pt-2 text-[length:var(--text-xs)] text-muted-foreground/50">
          <span>Ctrl+⇧+O 새 대화</span>
          <span>Ctrl+/ 검색</span>
          <span>Ctrl+B 사이드바</span>
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-2 opacity-60">
          <span className="text-[length:var(--text-xs)] text-muted-foreground">Powered by</span>
          <div
            className="h-4 w-16 bg-primary"
            style={{
              maskImage: "url(/logo.png)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "left center",
              WebkitMaskImage: "url(/logo.png)",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "left center",
            }}
            role="img"
            aria-label="glluga"
          />
        </div>
      </div>
    </div>
  );
}
