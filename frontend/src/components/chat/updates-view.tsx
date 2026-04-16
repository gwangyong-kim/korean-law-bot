"use client";

import { useEffect, useState } from "react";
import { History, Tag, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

const GITHUB_REPO = "chrisryugj/korean-law-mcp";

interface McpCommit {
  sha: string;
  date: string;
  message: string;
}

interface AppUpdate {
  date: string;
  version: string;
  title: string;
  items: string[];
}

const APP_UPDATES: AppUpdate[] = [
  {
    date: "2026-04-16",
    version: "v1.6",
    title: "스트리밍 UX 대폭 개선 + 최신 모델",
    items: [
      "Gemini 3 Flash / 3.1 Flash-Lite 모델 지원 (2.5 시리즈 교체)",
      "부드러운 타이핑 효과 — 글자 단위 균일 속도 스트리밍",
      "스마트 자동 스크롤 — 스트리밍 중 자유롭게 위로 스크롤 가능",
      "대화 컨텍스트 유지 — 같은 세션에서 이전 대화 맥락을 기억 (최근 10턴)",
      "로딩 인디케이터 개선 — 바운싱 점 + '답변 준비 중...' 표시",
      "시스템 프롬프트 보호 — 내부 설정 노출 방지",
    ],
  },
  {
    date: "2026-04-15",
    version: "v1.5",
    title: "답변 품질 강화 + 비용 모니터링",
    items: [
      "후속 질문 추천 — 심화/관련 법령/실무 3축에서 구체적 질문 3개 자동 제시",
      "적응형 응답 길이 — 긴 계약서 검토도 중간에 잘리지 않고 완결",
      "비용 모니터링 — 시간별/일별 Slack 알림, 월간 임계값 알림",
      "답변 톤 개선 — 핵심 결론 먼저, 쉬운 설명 병기, 위험도 등급 표시",
    ],
  },
  {
    date: "2026-04-14",
    version: "v1.4",
    title: "가독성 재설계 + 안정성 강화",
    items: [
      "답변 레이아웃 재설계 — 문서형 레이아웃 + 참고 법령 카드 분리",
      "상세 출처 인용 — 법령명, 조항, 시행일 포함 + law.go.kr 링크",
      "다크모드 대비 개선 — WCAG AA 기준 충족",
      "도구 호출 상태 표시 — 법령 검색 중/완료/실패 실시간 칩",
      "에러 메시지 한국어화 + 인라인 재시도 버튼",
      "MCP 서버 연결 안정화 — 자동 재시도 + 타임아웃 처리",
      "과거 대화 복원 — 이전 대화 내용 화면에 표시",
    ],
  },
  {
    date: "2026-04-13",
    version: "v1.3",
    title: "MCP 서버 연동 + 환각 방지",
    items: [
      "자체 MCP 서버 연동 (glluga-law-mcp.fly.dev)",
      "도구 기반 답변 강제 — 법령·판례는 반드시 검색 후 답변",
      "AI SDK v6 UIMessage 파트 시스템 도입",
    ],
  },
  {
    date: "2026-04-12",
    version: "v1.0",
    title: "서비스 출시",
    items: [
      "Next.js 채팅 UI + Vercel 배포",
      "Google OAuth 회사 계정 로그인",
      "대화 기록 저장 (localStorage)",
      "AI 모델 선택기 (드롭다운)",
      "파일/이미지 첨부 지원",
      "키보드 단축키 (Ctrl+Shift+O 새 대화, Ctrl+/ 검색, Ctrl+B 사이드바)",
      "모바일 반응형 디자인",
      "예시 질문 / 사용 팁 / 검색 범위 가이드",
    ],
  },
];

export function UpdatesView() {
  const [mcpCommits, setMcpCommits] = useState<McpCommit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=30`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { sha: string; commit: { author: { date: string }; message: string } }[]) =>
        data
          .filter((c) => {
            const msg = c.commit.message.split("\n")[0];
            return /^(feat|fix|chore.*bump)/.test(msg);
          })
          .map((c) => ({
            sha: c.sha.slice(0, 7),
            date: c.commit.author.date.slice(0, 10),
            message: c.commit.message.split("\n")[0],
          }))
      )
      .then(setMcpCommits)
      .catch(() => setMcpCommits([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-6 w-6 text-primary" />
          <h1 className="text-[length:var(--text-2xl)] font-bold">업데이트</h1>
        </div>

        {APP_UPDATES.length > 0 && (
          <div className="mb-2 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[length:var(--text-sm)] font-semibold text-primary">
                최근 업데이트: {APP_UPDATES[0].title}
              </span>
              <span className="text-[length:var(--text-xs)] text-muted-foreground">
                {APP_UPDATES[0].date}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {APP_UPDATES[0].items.slice(0, 3).map((item) => (
                <li key={item} className="text-[length:var(--text-sm)] text-foreground/80">
                  · {item}
                </li>
              ))}
              {APP_UPDATES[0].items.length > 3 && (
                <li className="text-[length:var(--text-xs)] text-muted-foreground">
                  외 {APP_UPDATES[0].items.length - 3}건
                </li>
              )}
            </ul>
          </div>
        )}

        <h2 className="text-[length:var(--text-lg)] font-semibold mt-8 mb-4">앱 업데이트</h2>
        <div className="space-y-6 mb-12">
          {APP_UPDATES.map((update, i) => (
            <div key={update.version} className="relative pl-6 pb-6 border-l-2 border-border last:border-l-0">
              <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-primary bg-background" />
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-primary">
                  <Tag className="h-3 w-3" />
                  {update.version}
                </span>
                <span className="text-[length:var(--text-xs)] text-muted-foreground">
                  {update.date}
                </span>
                {i === 0 && (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[length:var(--text-xs)] font-medium text-success">
                    최신
                  </span>
                )}
              </div>
              <h3 className="text-[length:var(--text-base)] font-medium mb-2">{update.title}</h3>
              <ul className="space-y-1">
                {update.items.map((item) => (
                  <li key={item} className="text-[length:var(--text-sm)] text-muted-foreground">
                    · {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h2 className="text-[length:var(--text-lg)] font-semibold mb-4">법령 검색 서버 (MCP) 업데이트</h2>
        {loading ? (
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
            href={`https://github.com/${GITHUB_REPO}/commits/main`}
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
