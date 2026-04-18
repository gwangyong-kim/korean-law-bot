/**
 * Citation extraction for assistant answers.
 *
 * Gemini writes citations following the SYSTEM_PROMPT "상세 출처 형식" rule:
 *   [출처: 근로기준법 제60조(연차 유급휴가), 시행일 2025.10.23, 법제처 국가법령정보센터]
 *   [출처: 대법원 2019다12345 2020.03.15 판결, 법제처 국가법령정보센터]
 *
 * Option C redesign (2026-04-14) parses these out of the rendered markdown
 * and moves them into a dedicated "참고 법령" card at the bottom of each
 * assistant message, so the body text reads as clean prose.
 */

export interface Citation {
  /**
   * Raw citation content without the surrounding `[출처: ... ]` brackets.
   * Used as the fallback display string when structured parsing fails.
   */
  raw: string;
  /**
   * Best-effort law name extracted from the first segment — used for
   * link target construction. `undefined` if parsing did not detect a
   * recognizable law pattern (rare; defensive fallback to plain display).
   */
  lawName?: string;
  /**
   * Best-effort article identifier (e.g. `제60조`, `제60조제1항`).
   */
  article?: string;
  /**
   * Court name for case citations (e.g. `대법원`, `헌법재판소`).
   * Mutually exclusive with `lawName` in practice — set when the
   * citation is a 판례 instead of a 법령 조문.
   */
  court?: string;
  /**
   * Case number for court decisions (e.g. `2009도14442`, `2019다12345`).
   * Used to construct the 판례 search URL on 국가법령정보센터.
   */
  caseNumber?: string;
}

const CITATION_RE = /\[출처:\s*([^\]]+?)\]/g;
const ARTICLE_RE = /^(.+?)\s+(제[\d조항의가-힣]+)(?:\(([^)]+)\))?/;
// 대법원/헌법재판소/하급심 + 사건번호(YYYY+한글계+숫자, 예: 2009도14442, 2019다12345, 2017헌가12)
const CASE_RE = /^(대법원|헌법재판소|.+?법원)\s+(\d{2,4}[가-힣]+\d+)/;

/**
 * Extract all `[출처: ...]` citations from markdown content and return the
 * body text with those citation blocks removed.
 *
 * - Deduplicates identical raw strings so repeat citations (e.g. "동일 법령
 *   여러 항" cases) render once in the footer instead of N times.
 * - Collapses any whitespace left behind by citation removal so the prose
 *   body stays clean.
 * - Best-effort structured parsing: law name + article for link building.
 *   Falls back to raw display when the format doesn't match expectations.
 */
export function extractCitations(text: string): {
  cleaned: string;
  citations: Citation[];
} {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  // Find all citation blocks, preserve the first-seen order.
  for (const match of text.matchAll(CITATION_RE)) {
    const raw = match[1].trim();
    if (seen.has(raw)) continue;
    seen.add(raw);

    const firstSegment = raw.split(",")[0].trim();
    // 판례 형식("대법원 2009도14442 ...")을 먼저 시도하고,
    // 매치 안 되면 법령 조문 형식("근로기준법 제60조 ...")을 시도한다.
    // 판례를 먼저 보는 이유: 법원명 안에 "법원"이 들어있어
    // ARTICLE_RE(`(.+?)\s+제N조`)에는 매칭되지 않지만, 안전을 위해
    // 더 구체적인 패턴(CASE_RE)을 우선 적용.
    const caseMatch = firstSegment.match(CASE_RE);
    if (caseMatch) {
      citations.push({
        raw,
        court: caseMatch[1].trim(),
        caseNumber: caseMatch[2].trim(),
      });
      continue;
    }
    const articleMatch = firstSegment.match(ARTICLE_RE);
    const lawName = articleMatch?.[1]?.trim();
    const article = articleMatch?.[2]?.trim();

    citations.push({ raw, lawName, article });
  }

  // Remove the literal `[출처: ...]` markers from the body and tidy up
  // whitespace that the removal may have left behind.
  const cleaned = text
    .replace(CITATION_RE, "")
    // Blockquote forms: `> [출처: ...]` -> empty blockquote line; remove.
    .replace(/^>\s*$/gm, "")
    // Collapse 3+ consecutive blank lines into 2.
    .replace(/\n{3,}/g, "\n\n")
    // Trim leading/trailing whitespace.
    .trim();

  return { cleaned, citations };
}

/**
 * Build a 법제처 국가법령정보센터 search URL that surfaces the cited law.
 *
 * The 국가법령정보센터 deep-link path scheme (e.g. `/법령/{법령명}/{조문}`)
 * varies by law type and is not fully documented for programmatic use.
 * A site-wide search query is the stable, always-works fallback — users
 * land on the search results page with the law name + article number
 * pre-filled, one click away from the authoritative source.
 */
export function buildLawGoKrUrl(c: Citation): string | undefined {
  // 판례: 사건번호로 국가법령정보센터 판례 검색.
  if (c.caseNumber) {
    return `https://www.law.go.kr/LSW/precSc.do?menuId=1&query=${encodeURIComponent(
      c.caseNumber,
    )}`;
  }
  // 법령 조문: 법령명 + 조문으로 통합 검색.
  if (c.lawName) {
    const query = c.article ? `${c.lawName} ${c.article}` : c.lawName;
    return `https://www.law.go.kr/LSW/lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query=${encodeURIComponent(
      query,
    )}`;
  }
  return undefined;
}

/**
 * Short display label for a citation. Uses structured fields when available
 * (compact, scannable) and falls back to the raw string when the parser
 * couldn't structure it.
 */
export function citationLabel(c: Citation): string {
  if (c.court && c.caseNumber) return `${c.court} ${c.caseNumber}`;
  if (c.lawName && c.article) return `${c.lawName} ${c.article}`;
  return c.raw;
}
