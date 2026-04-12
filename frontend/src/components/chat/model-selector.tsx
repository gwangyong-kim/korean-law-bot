"use client";

import { MODELS, type ModelInfo } from "@/lib/models";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = MODELS.find((m) => m.id === value) || MODELS[0];

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--text-sm)] text-muted-foreground hover:bg-muted transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>{current.name}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-1 w-64 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                model.id === value
                  ? "bg-accent/30"
                  : "hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-[length:var(--text-sm)] font-medium">{model.name}</span>
                {model.free && (
                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-[length:var(--text-xs)] text-success">
                    무료
                  </span>
                )}
              </div>
              <span className="text-[length:var(--text-xs)] text-muted-foreground">
                {model.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
