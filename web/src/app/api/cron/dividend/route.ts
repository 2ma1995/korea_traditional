import { NextResponse } from 'next/server';
import { denyCron } from '@/lib/cronAuth';
import { seoulDateString } from '@/lib/market';
import { runPayout, syncCoupons } from '@/lib/payout';

/**
 * 매일 00:05 KST — 배당금 쿠폰을 맞춘다(lib/payout.syncCoupons).
 *
 *   휴장이 시작된 날   잔액만큼 할인 쿠폰을 쿠폰함에 넣는다(새로 쌓였으면 합쳐서 다시 한 장)
 *   장이 다시 열린 뒤  기한이 지난 쿠폰 중 안 쓴 것을 거둬 잔액으로 돌린다
 *
 * ⏰ Vercel 크론은 UTC다. 15:05 UTC = 다음 날 00:05 KST — 그 순간의 KST 날짜가 '오늘'이라
 *    restore 크론처럼 날짜를 뒤로 밀 필요가 없다. 주말·공휴일에도 돌아야 해서 매일이다.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = denyCron(request);
  if (denied) return denied;
  const now = new Date();
  /* 토요일 00:05 — 이번 주(월~금) 배당을 자동으로 결산한다. 쿠폰은 바로 아래 syncCoupons가 만든다 */
  const saturday = new Date(`${seoulDateString(now)}T00:00:00Z`).getUTCDay() === 6;
  const payout = saturday ? await runPayout(now, false) : null;
  const report = await syncCoupons(now);
  return NextResponse.json({
    ok: true as const,
    ...(payout ? { payout: { from: payout.from, to: payout.to, paid: payout.lines.filter(line => line.status === 'paid').length, total: payout.total, refused: payout.refused ?? null } } : {}),
    ...report,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
