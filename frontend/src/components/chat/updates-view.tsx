"use client";

import { useEffect, useState } from "react";
import { History, Tag, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const APP_REPO = "gwangyong-kim/korean-law-bot";
const MCP_REPO = "chrisryugj/korean-law-mcp";

interface AppRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
}

interface McpCommit {
  sha: string;
  date: string;
  message: string;
}

function parseReleaseBody(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function UpdatesView() {
  const [appReleases, setAppReleases] = useState<AppRelease[]>([]);
  const [mcpCommits, setMcpCommits] = useState<McpCommit[]>([]);
  const [appLoading, setAppLoading] = useState(true);
  const [mcpLoading, setMcpLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${APP_REPO}/releases?per_page=20`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setAppReleases)
      .catch(() => setAppReleases([]))
      .finally(() => setAppLoading(false));

    fetch(`https://api.github.com/repos/${MCP_REPO}/commits?per_page=30`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { sha: string; commit: { author: { date: string }; message: string } }[]) =>
        data
          .filter((c) => /^(feat|fix|chore.*bump)/.test(c.commit.message.split("\n")[0]))
          .map((c) => ({
            sha: c.sha.slice(0, 7),
            date: c.commit.author.date.slice(0, 10),
            message: c.commit.message.split("\n")[0],
          }))
      )
      .then(setMcpCommits)
      .catch(() => setMcpCommits([]))
      .finally(() => setMcpLoading(false));
  }, []);

  const latest = appReleases[0];

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-[length:var(--text-2xl)] font-bold">업데이트</h1>
        </div>

        {latest && (
          <div className="mb-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[length:var(--text-sm)] font-semibold text-primary">
                최근 업데이트: {latest.name || latest.tag_name}
              </span>
              <span className="text-[length:var(--text-xs)] text-muted-foreground">
                {new Date(latest.published_at).toLocaleDateString("ko-KR")}
              </span>
            </div>
            {latest.body && (
              <ul className="mt-2 space-y-1">
                {parseReleaseBody(latest.body).slice(0, 3).map((item) => (
                  <li key={item} className="text-[length:var(--text-sm)] text-foreground/80">
                    · {item}
                  </li>
                ))}
                {parseReleaseBody(latest.body).length > 3 && (
                  <li className="text-[length:var(--text-xs)] text-muted-foreground">
                    외 {parseReleaseBody(latest.body).length - 3}건
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        <h2 className="text-[length:var(--text-lg)] font-semibold mt-8 mb-4">앱 업데이트</h2>
        {appLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="pl-6 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : appReleases.length === 0 ? (
          <p className="text-muted-foreground text-[length:var(--text-sm)]">
            릴리스 정보를 불러올 수 없습니다.
          </p>
        ) : (
          <div className="space-y-6 mb-12">
            {appReleases.map((release, i) => {
              const items = release.body ? parseReleaseBody(release.body) : [];
              return (
                <div key={release.id} className="relative pl-6 pb-6 border-l-2 border-border last:border-l-0">
                  <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-primary">
                      <Tag className="h-3 w-3" />
                      {release.tag_name}
                    </span>
                    <span className="text-[length:var(--text-xs)] text-muted-foreground">
                      {new Date(release.published_at).toLocaleDateString("ko-KR")}
                    </span>
                    {i === 0 && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-success">
                        최신
                      </span>
                    )}
                  </div>
                  <h3 className="text-[length:var(--text-base)] font-medium mb-2">
                    {release.name || release.tag_name}
                  </h3>
                  {items.length > 0 && (
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item} className="text-[length:var(--text-sm)] text-muted-foreground">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h2 className="text-[length:var(--text-lg)] font-semibold mb-4">법령 검색 서버 (MCP) 업데이트</h2>
        {mcpLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="pl-6 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-64" />
              </div>
            ))}
          </div>
        ) : mcpCommits.length === 0 ? (
          <p className="text-muted-foreground text-[length:var(--text-sm)]">
            업데이트 정보를 불러올 수 없습니다.
          </p>
        ) : (
          <div className="space-y-4">
            {mcpCommits.map((commit, i) => (
              <div key={commit.sha} className="relative pl-6 pb-4 border-l-2 border-border last:border-l-0">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[length:var(--text-xs)] font-mono text-muted-foreground">
                    {commit.sha}
                  </span>
                  <span className="text-[length:var(--text-xs)] text-muted-foreground">
                    {commit.date}
                  </span>
                  {i === 0 && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-success">
                      최신
                    </span>
                  )}
                </div>
                <p className="text-[length:var(--text-sm)] text-foreground/80">{commit.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href={`https://github.com/${MCP_REPO}/commits/main`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[length:var(--text-sm)] text-primary hover:underline"
          >
            GitHub에서 전체 커밋 보기 →
          </a>
        </div>
      </div>
    </ScrollArea>
  );
}
