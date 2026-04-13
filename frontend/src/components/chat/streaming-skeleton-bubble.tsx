"use client";

/**
 * StreamingSkeletonBubble — placeholder bubble shown while an assistant turn
 * is in flight but no message parts have arrived yet. Mimics ChatMessage's
 * avatar + bubble shape so the layout does not shift when the real message
 * replaces it.
 *
 * Replaces the Phase 1 static "검색 중..." placeholder (D-10).
 *
 * D-11: 3-bar skeleton inside a rounded-2xl card, reusing shadcn Skeleton
 * so animate-pulse + bg-muted come from the existing design system.
 *
 * Accessibility: aria-busy + aria-live="polite" so assistive tech announces
 * "loading" without interrupting other speech.
 *
 * Rendered by: chat-container.tsx (predicate: isLoading && lastRole === "user").
 * Requirements: TOOL-06.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Scale } from "lucide-react";

export function StreamingSkeletonBubble() {
  return (
    <div
      className="group flex gap-3 py-4"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Avatar — must match ChatMessage's assistant avatar exactly */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Scale className="h-4 w-4" />
      </div>

      {/* Skeleton bubble — matches ChatMessage's max-w-[75%] rounded-2xl card */}
      <div className="flex max-w-[75%] flex-col gap-1">
        <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
