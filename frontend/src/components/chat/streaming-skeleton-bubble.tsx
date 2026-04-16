"use client";

import { Scale } from "lucide-react";

export function StreamingSkeletonBubble() {
  return (
    <div
      className="group flex gap-3 py-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="답변 준비 중"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Scale className="h-4 w-4" />
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-muted-foreground/60"
              style={{ animation: `typing-bounce 1s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
        <span className="text-[length:var(--text-sm)] text-muted-foreground">
          답변 준비 중...
        </span>
      </div>
    </div>
  );
}
