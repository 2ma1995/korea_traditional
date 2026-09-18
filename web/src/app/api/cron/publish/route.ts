import { NextResponse } from 'next/server';
import { denyCron } from '@/lib/cronAuth';
import { marketHours } from '@/lib/orderbook';
import { publishToday } from '@/lib/priceSync';

/**
 * 15:30 — 오늘의 폭을 자사몰 판매가에 반영한다.
 *
 * 국장이 닫히는 그 순간에 돈다. 휴장일에는 아무것도 하지 않는다 —
 * 빵장이 열리지 않는 날 가격을 바꾸면 되돌릴 크론도 의미가 없다.
 *
 * ⚠️ PRICE_SYNC_ENABLED가 false면 계산만 하고 아무것도 바꾸지 않는다(dryRun).
 *    기업 승인 전까지는 그 상태로 둔다 — lib/priceSync.ts의 주석 참고.
 */
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
  return NextResponse.json({ ok: true as const, ...report }, { headers: { 'Cache-Control': 'no-store' } });
}
