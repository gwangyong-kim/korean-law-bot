"use client";

import { MessageSquare, Search, FileText, Scale, AlertTriangle, Lightbulb, CheckCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const EXAMPLES = [
  {
    category: "법령 검색",
    icon: Search,
    items: [
      { q: "근로기준법 연차휴가 규정 알려줘", desc: "특정 법령의 조문을 검색합니다" },
      { q: "개인정보보호법 제15조 전문 보여줘", desc: "특정 조문의 전체 내용을 확인합니다" },
      { q: "산업안전보건법에서 안전관리자 선임 기준은?", desc: "법령 내 특정 내용을 질문합니다" },
    ],
  },
  {
    category: "판례 검색",
    icon: Scale,
    items: [
      { q: "부당해고 관련 최근 판례 찾아줘", desc: "대법원 판례를 키워드로 검색합니다" },
      { q: "연차휴가 미사용 수당 관련 판례", desc: "구체적인 주제로 판례를 찾습니다" },
      { q: "하도급법 위반 사례 알려줘", desc: "법령 위반 관련 판례를 검색합니다" },
    ],
  },
  {
    category: "계약서/규정 검토",
    icon: FileText,
    items: [
      { q: "아래 계약 조항이 법적으로 유효한지 검토해줘\n\n[계약서 내용 붙여넣기]", desc: "계약서를 붙여넣으면 법적 리스크를 분석합니다" },
      { q: "이 근로계약서에 문제가 있는지 확인해줘", desc: "근로계약서의 법령 위반 여부를 확인합니다" },
    ],
  },
  {
    category: "법령 비교/해석",
    icon: MessageSquare,
    items: [
      { q: "근로기준법과 파견법에서 휴가 규정 차이 알려줘", desc: "두 법령 간 차이를 비교합니다" },
      { q: "채무불이행이 뭐야?", desc: "법률 용어를 쉬운 말로 설명합니다" },
    ],
  },
];

const TIPS = [
  { icon: CheckCircle, title: "구체적으로 질문하세요", desc: "\"법률 알려줘\"보다 \"근로기준법 제60조 연차휴가 규정\"처럼 구체적으로 물어보면 더 정확한 답변을 받을 수 있습니다." },
  { icon: Lightbulb, title: "이어서 질문하세요", desc: "대화 맥락이 유지되므로 \"위 판례의 전문 보여줘\"처럼 이전 답변을 참조할 수 있습니다." },
  { icon: AlertTriangle, title: "법률 자문이 아닙니다", desc: "이 도구는 법령 정보를 쉽게 찾아주는 검색 도우미입니다. 중요한 법적 판단은 반드시 전문가(법무팀, 변호사)에게 확인하세요." },
];

export function GuideView() {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* 소개 */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Scale className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-[length:var(--text-2xl)] font-bold mb-2">법령 검색 어시스턴트</h1>
          <p className="text-[length:var(--text-sm)] text-muted-foreground max-w-md mx-auto">
            한국 법령, 판례, 행정규칙을 자연어로 검색할 수 있습니다.
            어려운 법률 용어도 쉽게 풀어서 설명해드립니다.
          </p>
        </div>

        {/* 이런 걸 물어보세요 */}
        <h2 className="text-[length:var(--text-xl)] font-semibold mb-6">이런 걸 물어보세요</h2>
        <div className="space-y-8 mb-12">
          {EXAMPLES.map((section) => (
            <div key={section.category}>
              <div className="flex items-center gap-2 mb-3">
                <section.icon className="h-4 w-4 text-primary" />
                <h3 className="text-[length:var(--text-base)] font-medium">{section.category}</h3>
              </div>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-[length:var(--text-sm)] font-medium mb-1 whitespace-pre-line">
                      &ldquo;{item.q}&rdquo;
                    </p>
                    <p className="text-[length:var(--text-xs)] text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        {/* 검색 범위 */}
        <h2 className="text-[length:var(--text-xl)] font-semibold mb-4">검색할 수 있는 범위</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-12">
          {[
            "법률 · 시행령 · 시행규칙", "대법원 판례", "헌법재판소 결정",
            "조세심판원 재결", "행정규칙", "자치법규 · 조례",
            "행정심판례", "관세청 법령해석", "노동위원회 결정",
          ].map((item) => (
            <div key={item} className="rounded-lg bg-muted/50 px-3 py-2 text-center text-[length:var(--text-sm)]">
              {item}
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        {/* 사용 팁 */}
        <h2 className="text-[length:var(--text-xl)] font-semibold mb-4">사용 팁</h2>
        <div className="space-y-4 mb-12">
          {TIPS.map((tip) => (
            <div key={tip.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <tip.icon className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
              <div>
                <p className="text-[length:var(--text-sm)] font-medium mb-1">{tip.title}</p>
                <p className="text-[length:var(--text-xs)] text-muted-foreground">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 단축키 */}
        <h2 className="text-[length:var(--text-xl)] font-semibold mb-4">키보드 단축키</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {[
            { keys: "Ctrl + Shift + O", desc: "새 대화 시작" },
            { keys: "Ctrl + /", desc: "대화 검색" },
            { keys: "Ctrl + B", desc: "사이드바 열기/닫기" },
            { keys: "Enter", desc: "메시지 전송" },
            { keys: "Shift + Enter", desc: "줄바꿈" },
          ].map((shortcut, i) => (
            <div key={shortcut.keys} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
              <span className="text-[length:var(--text-sm)]">{shortcut.desc}</span>
              <kbd className="rounded bg-muted px-2 py-1 font-mono text-[length:var(--text-xs)]">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}
