import { NextResponse } from 'next/server';
import { loadTape, recordSettlement, type SettlementSideKey } from '@/lib/tape';

/**
 * 오늘의 빵장 시황.
 *
 *   GET   오늘 집계를 읽는다
 *   POST  정산 한 건을 남기고 갱신된 집계를 돌려준다
 *
 * 받는 값은 side와 seat뿐이다. 수익률 숫자·종목·식별자는 받지 않는다 —
 * 받지 않으면 샐 일도 없다.
 *
 * 값 검증을 서버에서 다시 한다. 화면을 거치지 않고 부를 수 있는 경로라
 * 클라이언트가 보낸 범위를 믿지 않는다.
 */

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const SIDES: SettlementSideKey[] = ['gain', 'loss', 'flat'];

export async function GET() {
  return NextResponse.json({ ok: true as const, tape: await loadTape() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false as const, error: '본문을 읽지 못했습니다.' }, { status: 400, headers: NO_STORE });
  }

  const { side, seat } = (body ?? {}) as { side?: string; seat?: number };

  if (!SIDES.includes(side as SettlementSideKey)) {
    return NextResponse.json({ ok: false as const, error: 'side 값이 올바르지 않습니다.' }, { status: 400, headers: NO_STORE });
  }
  if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) > 9) {
    return NextResponse.json({ ok: false as const, error: 'seat 값이 올바르지 않습니다.' }, { status: 400, headers: NO_STORE });
  }

  const tape = await recordSettlement(side as SettlementSideKey, seat as number);
  return NextResponse.json({ ok: true as const, tape }, { headers: NO_STORE });
}
