import { Scale, ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";

const GITHUB_REPO = "chrisryugj/korean-law-mcp";

async function getReadme(): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/readme`,
      {
        headers: { Accept: "application/vnd.github.v3.raw" },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return "README를 불러올 수 없습니다.";
    return res.text();
  } catch {
    return "README를 불러올 수 없습니다.";
  }
}

export default async function GuidePage() {
  const readme = await getReadme();

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm px-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <BookOpen className="h-5 w-5 text-primary" />
        <span className="text-[length:var(--text-base)] font-semibold">사용 가이드</span>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="prose prose-sm dark:prose-invert max-w-none
          [&_h1]:text-[length:var(--text-2xl)] [&_h1]:font-bold [&_h1]:mb-4
          [&_h2]:text-[length:var(--text-xl)] [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3
          [&_h3]:text-[length:var(--text-lg)] [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2
          [&_table]:text-[length:var(--text-sm)]
          [&_code]:text-[length:var(--text-sm)] [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded
          [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-4
          [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
