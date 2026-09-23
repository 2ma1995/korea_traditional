import { NextResponse } from 'next/server';
import { redeem } from '@/lib/payout';
import { visitorId } from '@/lib/visitor';

/**
 * 배당금 꺼내 쓰기 — POST
 *
 * 잔액만큼 정액 할인 쿠폰을 만들어 연결된 자사몰 계정 쿠폰함에 넣는다(lib/payout.redeem).
 * 금액은 서버가 잔액으로 정한다 — 클라이언트가 보내는 값은 없다.
 */
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST() {
  const result = await redeem(await visitorId());
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: NO_STORE });
  return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
}
