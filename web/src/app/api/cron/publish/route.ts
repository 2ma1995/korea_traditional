import { NextResponse } from 'next/server';
import { denyCron } from '@/lib/cronAuth';
import { marketHours } from '@/lib/orderbook';
import { publishToday } from '@/lib/priceSync';
import { seoulDateString } from '@/lib/market';
import { notifyWatchers } from '@/lib/push';

/**
 * 15:30 — 오늘의 폭을 자사몰 판매가에 반영한다.
 *
 * 국장이 닫히는 그 순간에 돈다. 휴장일에는 아무것도 하지 않는다 —
 * 빵장이 열리지 않는 날 가격을 바꾸면 되돌릴 크론도 의미가 없다.
 *
 * ⚠️ PRICE_SYNC_ENABLED가 false면 계산만 하고 아무것도 바꾸지 않는다(dryRun).
 *    기업 승인 전까지는 그 상태로 둔다 — lib/priceSync.ts의 주석 참고.
 */
/** 알림 대상을 고르는 창 — 수요 보정이 쓰는 창과 같은 7일(lib/skuSignals).
    한 달 전에 한 번 담고 잊은 빵으로 알림을 보내면 그건 광고지 알림이 아니다 */
const WATCH_WINDOW_DAYS = 7;

const dayBefore = (at: Date, days: number) => {
  const d = new Date(at);
  d.setDate(d.getDate() - days);
  return d;
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = denyCron(request);
  if (denied) return denied;

  const now = new Date();
  const hours = marketHours(now);
  if (hours.reason === 'holiday') {
    return NextResponse.json(
      { ok: true as const, skipped: '휴장일 — 반영하지 않았습니다.' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const report = await publishToday(now);

  /* 값을 바꾼 뒤에 알린다 — 알림을 먼저 보내면 손님이 아직 정가인 자사몰로 간다.
     실패해도 반영은 되돌리지 않는다. 알림이 안 간 것이 가격이 안 바뀐 것보다 가볍다 */
  const push = report.dryRun
    ? { subscribers: 0, sent: 0, note: '계산만 한 회차라 알리지 않았습니다.' }
    : await notifyWatchers(
        seoulDateString(dayBefore(now, WATCH_WINDOW_DAYS)),
        seoulDateString(now),
        report.applied.map(item => ({ productNo: item.productNo, name: item.name, rate: item.rate })),
      ).catch(cause => ({ subscribers: 0, sent: 0, note: cause instanceof Error ? cause.message : String(cause) }));

  return NextResponse.json({ ok: true as const, ...report, push }, { headers: { 'Cache-Control': 'no-store' } });
}
