import { NextResponse } from 'next/server';
import { bidIpo, currentRound, loadIpoCounts } from '@/lib/ipo';

/**
 * 절기빵 공모주.
 *   GET   이번 회차 + 경쟁률
 *   POST  { candidate } 청약 한 건 → 갱신된 경쟁률
 *
 * 받는 값은 후보 id 하나다. 회차는 서버가 오늘 날짜로 정한다 — 클라이언트가
 * 지난 회차나 없는 후보를 보내면 거부한다.
 */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  const round = currentRound();
  return NextResponse.json({ ok: true as const, round, ...(await loadIpoCounts(round)) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: { candidate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false as const, error: '본문을 읽지 못했습니다.' }, { status: 400, headers: NO_STORE });
  }

  const round = currentRound();
  const candidate = String(body.candidate ?? '');
  if (!round.candidates.some(c => c.id === candidate)) {
    return NextResponse.json({ ok: false as const, error: '이번 회차에 없는 후보입니다.' }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true as const, round, ...(await bidIpo(round, candidate)) }, { headers: NO_STORE });
}
