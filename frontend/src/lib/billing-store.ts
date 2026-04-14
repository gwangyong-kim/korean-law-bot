/**
 * Billing 저장소 + Slack 알림 헬퍼.
 *
 * 2026-04-15: 비용 관측을 위해 Upstash Redis(Vercel KV)에 시간/일/월 누적값을
 * 기록한다. 시간별 digest(업무시간 매 시간), daily digest(어제 합계), 월간
 * 임계값 알림을 이 모듈이 제공한다. per-request 알림은 제거됨 (시끄러워서).
 *
 * Redis 키 설계:
 *   billing:hourly:{YYYY-MM-DDTHH}:*        — 시간별 (TTL 25h)
 *   billing:daily:{YYYY-MM-DD}:*            — 일별
 *   billing:monthly:{YYYY-MM}:cost_usd      — 월별
 *   billing:monthly:{YYYY-MM}:last_threshold_sent — integer (달러 단위)
 *
 * 각 단위 공통 필드: requests / tokens_in / tokens_out / cost_usd
 *
 * 시간대: KST 기준으로 "오늘/어제/이번 달/시간"을 계산한다. Vercel serverless가
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

/** KST 기준 "YYYY-MM-DDTHH" 시간 버킷 키 */
export function kstHourKey(date: Date = new Date()): string {
  const kst = toKst(date);
  return kst.toISOString().slice(0, 13); // 2026-04-15T10
}

/** KST 기준 직전 시간의 버킷 키 (현재가 10:30이면 09 버킷 반환) */
export function kstPreviousHourKey(date: Date = new Date()): string {
  const prev = new Date(date.getTime() - 60 * 60 * 1000);
  return kstHourKey(prev);
}

/** KST hour key에서 시간 숫자(0~23) 추출 */
export function hourFromKey(hourKey: string): number {
  return parseInt(hourKey.slice(11, 13), 10);
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

  const hourKey = kstHourKey();
  const dateKey = kstDateKey();
  const monthKey = kstMonthKey();
  const HOURLY_TTL_SEC = 25 * 60 * 60; // 25h — 직전 시간 cron이 읽을 수 있으면 충분

  // 정수 카운터는 incrby, float은 incrbyfloat.
  // 시간별/일별/월별 모두 같은 pipeline에서 처리.
  const pipeline = redis.pipeline();
  // 시간별 (TTL 25h)
  pipeline.incrby(`billing:hourly:${hourKey}:requests`, 1);
  pipeline.expire(`billing:hourly:${hourKey}:requests`, HOURLY_TTL_SEC);
  pipeline.incrby(`billing:hourly:${hourKey}:tokens_in`, inputTokens);
  pipeline.expire(`billing:hourly:${hourKey}:tokens_in`, HOURLY_TTL_SEC);
  pipeline.incrby(`billing:hourly:${hourKey}:tokens_out`, outputTokens);
  pipeline.expire(`billing:hourly:${hourKey}:tokens_out`, HOURLY_TTL_SEC);
  pipeline.incrbyfloat(`billing:hourly:${hourKey}:cost_usd`, costUsd);
  pipeline.expire(`billing:hourly:${hourKey}:cost_usd`, HOURLY_TTL_SEC);
  // 일별
  pipeline.incrby(`billing:daily:${dateKey}:requests`, 1);
  pipeline.incrby(`billing:daily:${dateKey}:tokens_in`, inputTokens);
  pipeline.incrby(`billing:daily:${dateKey}:tokens_out`, outputTokens);
  pipeline.incrbyfloat(`billing:daily:${dateKey}:cost_usd`, costUsd);
  // 월별
  pipeline.incrbyfloat(`billing:monthly:${monthKey}:cost_usd`, costUsd);

  const results = (await pipeline.exec()) as unknown[];
  // results[11] = daily cost_usd (index: 0..7 hourly 4x incr+expire 짝, 8..10 daily 정수 3개, 11 daily float, 12 monthly float)
  const dailyCostUsd = Number(results[11] ?? 0);
  const monthlyCostUsd = Number(results[12] ?? 0);

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
 * 시간별 집계 조회. 키 형식: YYYY-MM-DDTHH (예: 2026-04-15T10)
 */
export async function readHourlySummary(
  hourKey: string
): Promise<DailySummary | null> {
  const redis = getRedis();
  if (!redis) return null;

  const [requests, tokensIn, tokensOut, costUsd] = (await redis.mget(
    `billing:hourly:${hourKey}:requests`,
    `billing:hourly:${hourKey}:tokens_in`,
    `billing:hourly:${hourKey}:tokens_out`,
    `billing:hourly:${hourKey}:cost_usd`
  )) as [number | null, number | null, number | null, number | null];

  return {
    requests: Number(requests ?? 0),
    tokensIn: Number(tokensIn ?? 0),
    tokensOut: Number(tokensOut ?? 0),
    costUsd: Number(costUsd ?? 0),
  };
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

// 업무시간 설정 (KST). START <= hour < END인 시간대 버킷만 hourly digest로 보낸다.
// env BUSINESS_HOUR_START / BUSINESS_HOUR_END로 오버라이드 가능.
export function getBusinessHours(): { start: number; end: number } {
  const start = Number(process.env.BUSINESS_HOUR_START ?? "9");
  const end = Number(process.env.BUSINESS_HOUR_END ?? "18");
  return { start, end };
}

/**
 * 업무시간 내 "직전에 끝난 시간" 버킷이 있고 아직 flush 안 됐으면 Slack으로
 * 보내고 lock key로 중복 전송을 막는다.
 *
 * flush-on-next-request 패턴: Vercel Hobby 플랜이 cron을 하루 1회로 제한하기
 * 때문에 각 chat 요청이 들어올 때 스스로 "이전 시간 bucket을 flush해야 하나"를
 * 체크한다. 완벽하진 않다 — 활동이 0인 시간은 다음 활동 때까지 늦어진다. 이
 * 경우에도 daily digest(다음날 아침 09시)가 놓친 데이터를 잡아낸다.
 *
 * 동시성: 여러 요청이 동시에 같은 시간을 flush하려고 경쟁할 수 있으므로
 * `SET lock_key 1 NX EX 25h` (SETNX + TTL)로 단일 승자만 flush 실행.
 *
 * 반환: flush가 실제 일어났으면 true, skip됐으면 false.
 */
export async function maybeFlushPreviousHour(
  now: Date = new Date()
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const prevDate = new Date(now.getTime() - 60 * 60 * 1000);
  const prevKey = kstHourKey(prevDate);
  const prevHour = hourFromKey(prevKey);

  const { start, end } = getBusinessHours();
  if (prevHour < start || prevHour >= end) return false;

  // SETNX 잠금 — 처음 수신한 요청만 true를 받음.
  const lockKey = `billing:flush_lock:${prevKey}`;
  const lockResult = await redis.set(lockKey, "1", { nx: true, ex: 25 * 60 * 60 });
  if (lockResult !== "OK") return false;

  const hourly = await readHourlySummary(prevKey);
  if (!hourly || hourly.requests === 0) return false;

  const dayKey = prevKey.slice(0, 10);
  const monthKey = dayKey.slice(0, 7);
  const [daily, monthlyCost] = await Promise.all([
    readDailySummary(dayKey),
    readMonthlyCost(monthKey),
  ]);

  const hourEnd = prevHour + 1;
  const hourCostKrw = formatKrw(hourly.costUsd);
  const dailyLine =
    daily != null
      ? `오늘 누적 ${daily.requests}건 · $${daily.costUsd.toFixed(4)} (${formatKrw(daily.costUsd)})`
      : "오늘 누적 —";
  const monthlyLine =
    monthlyCost != null
      ? `${monthKey} 누적 $${monthlyCost.toFixed(4)} (${formatKrw(monthlyCost)})`
      : `${monthKey} 누적 —`;

  const text = [
    `⏰ *${String(prevHour).padStart(2, "0")}:00~${String(hourEnd).padStart(2, "0")}:00 사용량*`,
    `• 요청: ${hourly.requests.toLocaleString()}건`,
    `• 토큰: 입력 ${hourly.tokensIn.toLocaleString()} / 출력 ${hourly.tokensOut.toLocaleString()}`,
    `• 비용: *$${hourly.costUsd.toFixed(4)}* (${hourCostKrw})`,
    ``,
    `📅 ${dailyLine}`,
    `📆 ${monthlyLine}`,
  ].join("\n");

  await postSlackMessage(text);
  return true;
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
