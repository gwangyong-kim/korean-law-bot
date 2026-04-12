"use client";

import { useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2 } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (value.trim() && !isLoading) onSubmit();
    }
  }

  return (
    <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="법령에 대해 질문해보세요..."
        className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
        rows={1}
      />
      <Button
        onClick={onSubmit}
        disabled={!value.trim() || isLoading}
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowUp className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
