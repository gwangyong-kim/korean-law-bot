"use client";

import { ChatSidebar } from "@/components/chat/chat-sidebar";

export default function TestSidebar() {
  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        conversations={[
          { id: "1", title: "근로기준법 연차휴가", messages: [], createdAt: Date.now(), updatedAt: Date.now() },
          { id: "2", title: "개인정보보호법 제15조", messages: [], createdAt: Date.now(), updatedAt: Date.now() },
          { id: "3", title: "부당해고 판례 검색", messages: [], createdAt: Date.now() - 86400000 * 3, updatedAt: Date.now() - 86400000 * 3 },
        ]}
        activeId="1"
        activeView="chat"
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
        onViewMode={() => {}}
        searchQuery=""
        onSearchChange={() => {}}
        searchOpen={false}
        onSearchToggle={() => {}}
      />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        메인 영역
      </div>
    </div>
  );
}
