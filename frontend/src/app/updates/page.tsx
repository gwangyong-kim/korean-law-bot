import { ArrowLeft, History, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

const GITHUB_REPO = "chrisryugj/korean-law-mcp";

interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
}

async function getReleases(): Promise<Release[]> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      {
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function UpdatesPage() {
  const releases = await getReleases();

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <History className="h-5 w-5 text-primary" />
        <span className="text-[length:var(--text-base)] font-semibold">업데이트</span>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {releases.length === 0 ? (
          <p className="text-muted-foreground text-[length:var(--text-sm)]">
            릴리스 정보를 불러올 수 없습니다.
          </p>
        ) : (
          <div className="space-y-6">
            {releases.map((release, i) => (
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

                {release.body && (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-[length:var(--text-sm)]
                    [&_code]:text-[length:var(--text-xs)] [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.body}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href={`https://github.com/${GITHUB_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[length:var(--text-sm)] text-primary hover:underline"
          >
            GitHub에서 전체 릴리스 보기 →
          </a>
        </div>
      </div>
    </div>
  );
}
