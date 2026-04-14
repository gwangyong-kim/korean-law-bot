/**
 * Daily billing digest cron endpoint.
 *
 * Vercel Cron(vercel.json)이 매일 UTC 자정 = KST 오전 9시에 GET 호출한다.
 * KST 기준 어제의 일일 집계와 이번 달 누적을 읽어 Slack에 한 줄 리포트.
 *
 * 인증: Vercel Cron은 Authorization 헤더에 `Bearer ${CRON_SECRET}`을 자동으로
 * 붙인다. CRON_SECRET은 Vercel이 프로젝트에 자동 주입한다. 설정되어 있지 않으면
 * 요청을 거부한다 (외부에서의 자유 호출 차단).
 *
 * 수동 테스트:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<domain>/api/cron/billing-digest
 */

import {
  readDailySummary,
  readMonthlyCost,
  postSlackMessage,
  formatKrw,
  kstYesterdayKey,
  kstMonthKey,
} from "@/lib/billing-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 인증: Vercel Cron이 붙이는 Bearer 토큰 검증.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const yesterday = kstYesterdayKey();
  const thisMonth = kstMonthKey();

  const [daily, monthlyCost] = await Promise.all([
    readDailySummary(yesterday),
    readMonthlyCost(thisMonth),
  ]);

  if (!daily) {
    // Redis 미설정 — 조용히 성공 반환 (cron이 실패로 표시되지 않도록).
    return Response.json({ ok: false, reason: "redis_not_configured" });
  }

  // 요청 0건이어도 알림 생략 ("어제 0건" 메시지는 노이즈).
  if (daily.requests === 0) {
    return Response.json({ ok: true, skipped: "no_requests_yesterday" });
  }

  const costKrw = formatKrw(daily.costUsd);
  const monthlyKrw = monthlyCost != null ? formatKrw(monthlyCost) : "?";
  const monthlyUsdStr =
    monthlyCost != null ? `$${monthlyCost.toFixed(4)}` : "?";

  const lines = [
    `📊 *어제 (${yesterday}) 사용량*`,
    `• 요청: ${daily.requests.toLocaleString()}건`,
    `• 토큰: 입력 ${daily.tokensIn.toLocaleString()} / 출력 ${daily.tokensOut.toLocaleString()}`,
    `• 비용: *$${daily.costUsd.toFixed(4)}* (${costKrw})`,
    ``,
    `📅 *${thisMonth} 월간 누적*: ${monthlyUsdStr} (${monthlyKrw})`,
  ];

  const sent = await postSlackMessage(lines.join("\n"));

  return Response.json({
    ok: true,
    date: yesterday,
    requests: daily.requests,
    costUsd: daily.costUsd,
    monthlyCostUsd: monthlyCost,
    slackSent: sent,
  });
}
