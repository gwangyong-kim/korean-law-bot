"use client";

/**
 * CitationList — "참고 법령" footer card for assistant messages.
 *
 * Rendered below the prose body after extracting `[출처: ...]` blocks from
 * the raw markdown via `lib/citations.ts`. Each citation links (when
 * parseable) to 법제처 국가법령정보센터 search results for one-click
 * authoritative lookup.
 *
 * Part of the Option C chat-message redesign (2026-04-14): moves repeated
 * inline citations out of the prose flow so the body reads as clean
 * long-form text, and gives the citations a proper "legal document"
 * visual weight that chat-style inline brackets couldn't convey.
 */

import { BookOpen, Scale, ExternalLink } from "lucide-react";
import type { Citation } from "@/lib/citations";
import { buildLawGoKrUrl, citationLabel } from "@/lib/citations";

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null;

  return (
    <aside className="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <h4 className="flex items-center gap-1.5 text-[length:var(--text-xs)] font-semibold uppercase tracking-wide text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        참고 법령
      </h4>
      <ul className="mt-2 flex flex-col gap-2">
        {citations.map((citation, idx) => {
          const url = buildLawGoKrUrl(citation);
          const label = citationLabel(citation);
          // Derive any extra metadata (시행일, 법제처 라벨 등) that lives
          // after the primary label in the raw citation string.
          const trailing = citation.raw.startsWith(label)
            ? citation.raw.slice(label.length).replace(/^[,\s]+/, "")
            : citation.raw !== label
              ? citation.raw
              : "";
          return (
            <li
              key={`citation-${idx}`}
              className="flex items-start gap-2 text-[length:var(--text-sm)]"
            >
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    {label}
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{label}</span>
                )}
                {trailing && (
                  <p className="mt-0.5 text-[length:var(--text-xs)] text-muted-foreground">
                    {trailing}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
