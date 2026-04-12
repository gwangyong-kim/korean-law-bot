"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2, Paperclip, X, FileIcon, ImageIcon } from "lucide-react";

export interface AttachedFile {
  file: File;
  preview?: string; // 이미지 미리보기 URL
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files?: AttachedFile[]) => void;
  isLoading: boolean;
  modelSelector?: React.ReactNode;
}

export function ChatInput({ value, onChange, onSubmit, isLoading, modelSelector }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if ((value.trim() || files.length > 0) && !isLoading) handleSubmit();
    }
  }

  function handleSubmit() {
    onSubmit(files.length > 0 ? files : undefined);
    setFiles([]);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;

    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(selected)) {
      const attached: AttachedFile = { file };
      if (file.type.startsWith("image/")) {
        attached.preview = URL.createObjectURL(file);
      }
      newFiles.push(attached);
    }
    setFiles((prev) => [...prev, ...newFiles]);

    // input 초기화 (같은 파일 재선택 가능)
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      {/* 첨부 파일 미리보기 */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {files.map((f, i) => (
            <div
              key={i}
              className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5"
            >
              {f.preview ? (
                <img src={f.preview} alt={f.file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <FileIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate text-[length:var(--text-xs)]">
                {f.file.name}
              </span>
              <button
                onClick={() => removeFile(i)}
                className="rounded-full p-0.5 hover:bg-destructive/10"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 영역 */}
      <div className="flex items-end gap-2 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.hwp,.hwpx"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="법령에 대해 질문해보세요..."
          className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0"
          rows={1}
        />
        {modelSelector}
        <Button
          onClick={handleSubmit}
          disabled={(!value.trim() && files.length === 0) || isLoading}
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
    </div>
  );
}
