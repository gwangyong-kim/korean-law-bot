/**
 * Billing 저장소 + Slack 알림 헬퍼.
 *
 * 2026-04-15: 비용 관측을 위해 Upstash Redis(Vercel KV)에 일/월 누적값을
 * 기록한다. 요청 단위 알림은 여전히 onFinish에서 즉시 발송되지만, daily
 * digest(어제 합계)와 월간 임계값 알림은 이 모듈이 담당한다.
 *
 * Redis 키 설계:
 *   billing:daily:{YYYY-MM-DD}:requests     — integer counter
 *   billing:daily:{YYYY-MM-DD}:tokens_in    — integer counter
 *   billing:daily:{YYYY-MM-DD}:tokens_out   — integer counter
 *   billing:daily:{YYYY-MM-DD}:cost_usd     — float (millionths 정밀도)
 *   billing:monthly:{YYYY-MM}:cost_usd      — float
 *   billing:monthly:{YYYY-MM}:last_threshold_sent — integer (달러 단위)
 *
 * 시간대: KST 기준으로 "오늘/어제/이번 달"을 계산한다. Vercel serverless가
 * UTC로 동작하므로 toKst() 헬퍼로 offset을 먹인다.
 *
 * 환경변수: Vercel Upstash 통합이 KV_REST_API_URL / KV_REST_API_TOKEN으로
 * 자동 주입한다. @upstash/redis의 기본 env 이름(UPSTASH_*)과 다르므로
 * 생성자에 명시적으로 전달한다.
 */

import { Redis } from "@upstash/redis";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

let _redis: Redis | null = null;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

/** KST 기준 YYYY-MM-DD */
export function kstDateKey(date: Date = new Date()): string {
  const kst = toKst(date);
  return kst.toISOString().slice(0, 10);
}

/** KST 기준 YYYY-MM */
export function kstMonthKey(date: Date = new Date()): string {
  const kst = toKst(date);
  return kst.toISOString().slice(0, 7);
}

/** KST 기준 어제의 YYYY-MM-DD */
export function kstYesterdayKey(date: Date = new Date()): string {
  const kst = toKst(date);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

// 임계값은 월간 누적 USD. 크로스 시 1회만 알림.
const MONTHLY_THRESHOLDS_USD = [1, 3, 5, 10, 20, 50, 100];

export interface DailySummary {
  requests: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface BillingIncrementResult {
  dailyCostUsd: number;
  monthlyCostUsd: number;
  crossedThresholdUsd: number | null;
}

/**
 * 요청 1건의 사용량을 누적 저장한다. 월간 누적값이 새로운 임계값을 넘으면
 * crossedThresholdUsd에 해당 값을 담아 반환한다. Redis 미설정 시 no-op.
 */
export async function incrementBilling(
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<BillingIncrementResult | null> {
  const redis = getRedis();
  if (!redis) return null;

  const dateKey = kstDateKey();
  const monthKey = kstMonthKey();

  // 정수 카운터는 incrby, float은 incrbyfloat.
  const pipeline = redis.pipeline();
  pipeline.incrby(`billing:daily:${dateKey}:requests`, 1);
  pipeline.incrby(`billing:daily:${dateKey}:tokens_in`, inputTokens);
  pipeline.incrby(`billing:daily:${dateKey}:tokens_out`, outputTokens);
  pipeline.incrbyfloat(`billing:daily:${dateKey}:cost_usd`, costUsd);
  pipeline.incrbyfloat(`billing:monthly:${monthKey}:cost_usd`, costUsd);
  const [, , , dailyCostUsd, monthlyCostUsd] = (await pipeline.exec()) as [
    number,
    number,
    number,
    number,
    number
  ];

  // 임계값 교차 체크 — 가장 높은 이미 발송된 임계값 초과 여부 확인.
  const lastSentKey = `billing:monthly:${monthKey}:last_threshold_sent`;
  const lastSentRaw = await redis.get<number>(lastSentKey);
  const lastSent = typeof lastSentRaw === "number" ? lastSentRaw : 0;

  let crossedThresholdUsd: number | null = null;
  for (const threshold of MONTHLY_THRESHOLDS_USD) {
    if (threshold <= lastSent) continue;
    if (monthlyCostUsd >= threshold) {
      crossedThresholdUsd = threshold;
    }
  }

  if (crossedThresholdUsd !== null) {
    await redis.set(lastSentKey, crossedThresholdUsd);
  }

  return { dailyCostUsd, monthlyCostUsd, crossedThresholdUsd };
}

/**
 * 지정 날짜(YYYY-MM-DD)의 일일 집계를 반환. Redis 미설정 시 null.
 */
export async function readDailySummary(
  dateKey: string
): Promise<DailySummary | null> {
  const redis = getRedis();
  if (!redis) return null;

  const [requests, tokensIn, tokensOut, costUsd] = (await redis.mget(
    `billing:daily:${dateKey}:requests`,
    `billing:daily:${dateKey}:tokens_in`,
    `billing:daily:${dateKey}:tokens_out`,
    `billing:daily:${dateKey}:cost_usd`
  )) as [number | null, number | null, number | null, number | null];

  return {
    requests: Number(requests ?? 0),
    tokensIn: Number(tokensIn ?? 0),
    tokensOut: Number(tokensOut ?? 0),
    costUsd: Number(costUsd ?? 0),
  };
}

export async function readMonthlyCost(monthKey: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  const value = await redis.get<number | string>(`billing:monthly:${monthKey}:cost_usd`);
  if (value == null) return 0;
  return Number(value);
}

/**
 * Slack 봇 토큰으로 chat.postMessage. 실패는 조용히 로그만 남긴다.
 * 여러 path(per-request, daily digest, threshold alert)에서 공유한다.
 */
export async function postSlackMessage(text: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_BILLING_CHANNEL;
  if (!token || !channel) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const body = (await res.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      console.error("[billing-store] Slack post failed:", body.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[billing-store] Slack post error:", err);
    return false;
  }
}

/** 환율 (USD → KRW). env override 지원, 기본값 1400. */
export function getUsdKrwRate(): number {
  const override = process.env.USD_KRW_RATE;
  if (override) {
    const n = Number(override);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1400;
}

export function formatKrw(usd: number): string {
  const krw = usd * getUsdKrwRate();
  return krw < 1
    ? `₩${krw.toFixed(2)}`
    : `₩${Math.round(krw).toLocaleString()}`;
}
