"use client";

import { Plus, MessageSquare, Trash2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/conversations";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ChatSidebarProps) {
  // 날짜별 그룹핑
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
    <div className="flex h-full w-64 flex-col border-r border-border bg-sidebar">
      {/* 헤더 */}
      <div className="flex h-14 items-center gap-2 px-4">
        <Scale className="h-5 w-5 text-primary" />
        <span className="text-[length:var(--text-base)] font-semibold">법령 검색</span>
      </div>

      {/* 새 대화 버튼 */}
      <div className="px-3 pb-2">
        <Button onClick={onNew} variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          새 대화
        </Button>
      </div>

      <Separator />

      {/* 대화 목록 */}
      <ScrollArea className="flex-1 px-2 py-2">
        {groups.length === 0 ? (
          <p className="px-3 py-8 text-center text-[length:var(--text-xs)] text-muted-foreground">
            대화 기록이 없습니다
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
                    activeId === conv.id
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

      {/* Powered by 푸터 */}
      <div className="border-t border-sidebar-border">
        <div className="flex items-center justify-center gap-1.5 py-3 opacity-70">
          <span className="text-xs text-muted-foreground">Powered by</span>
          <div
            className="h-5 w-20 bg-primary"
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
