import { NextResponse } from 'next/server';
import { linkMember, walletBalance } from '@/lib/payout';
import { visitorId } from '@/lib/visitor';

/**
 * 배당 받을 자사몰 아이디 연결 — POST { member }
 *
 * 방문자 표식(bm_v)에 아이디를 붙인다. 점수는 그 표식으로 쌓이고, 지급은 이 아이디로 간다(lib/payout).
 */
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { member?: unknown };
  const result = await linkMember(await visitorId(), body.member);
  if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: NO_STORE });
  /* 잔액도 같이 준다 — 화면은 연결 전 상태(0P)로 그려져 있어서, 안 주면 새로고침 전까지 0으로 보인다 */
  return NextResponse.json({ ok: true, member: result.member, balance: await walletBalance(result.member) }, { headers: NO_STORE });
}
