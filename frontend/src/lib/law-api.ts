/**
 * 국가법령정보센터 Open API 클라이언트
 * Python law/api.py → TypeScript 변환
 */

import { XMLParser } from "fast-xml-parser";

const BASE_URL = "https://www.law.go.kr/DRF";
const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

function getApiKey(): string {
  const key = process.env.LAW_API_KEY;
  if (!key) throw new Error("LAW_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

function parseXmlResults(xml: string): { total: number; results: Record<string, string>[] } {
  const parsed = parser.parse(xml);
  const root = parsed[Object.keys(parsed)[0]];
  if (!root) return { total: 0, results: [] };

  const total = Number(root.totalCnt) || 0;

  // 결과 항목 추출 (totalCnt, page 등 메타 필드 제외)
  const results: Record<string, string>[] = [];
  for (const [key, value] of Object.entries(root)) {
    if (["totalCnt", "page", "npage"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object") results.push(item as Record<string, string>);
      }
    } else if (typeof value === "object" && value !== null) {
      results.push(value as Record<string, string>);
    }
  }

  return { total, results };
}

export async function searchLaw(
  query: string,
  target: string = "law",
  page: number = 1,
  display: number = 5
): Promise<{ total: number; results: Record<string, string>[] }> {
  const params = new URLSearchParams({
    OC: getApiKey(),
    type: "XML",
    target,
    query,
    display: String(display),
    page: String(page),
  });

  const resp = await fetch(`${BASE_URL}/lawSearch.do?${params}`);
  if (!resp.ok) throw new Error(`법령 검색 실패: ${resp.status}`);

  const xml = await resp.text();
  return parseXmlResults(xml);
}

export async function getLawText(
  mst: string,
  jo?: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    OC: getApiKey(),
    type: "JSON",
    target: "eflaw",
    MST: mst,
  });
  if (jo) params.set("JO", jo);

  const resp = await fetch(`${BASE_URL}/lawService.do?${params}`);
  if (!resp.ok) throw new Error(`법령 조문 조회 실패: ${resp.status}`);

  const data = await resp.json();
  // 최상위 키 언래핑
  const topKey = Object.keys(data)[0];
  return topKey && typeof data[topKey] === "object" ? data[topKey] : data;
}

export async function searchDecisions(
  query: string,
  target: string = "prec",
  page: number = 1,
  display: number = 5
): Promise<{ total: number; results: Record<string, string>[] }> {
  return searchLaw(query, target, page, display);
}

export async function getDecisionText(
  target: string,
  id: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    OC: getApiKey(),
    type: "JSON",
    target,
    ID: id,
  });

  const resp = await fetch(`${BASE_URL}/lawService.do?${params}`);
  if (!resp.ok) throw new Error(`판례/결정 조회 실패: ${resp.status}`);

  const data = await resp.json();
  const topKey = Object.keys(data)[0];
  if (topKey && typeof data[topKey] === "object" && Object.keys(data).length === 1) {
    return data[topKey];
  }
  return data;
}
