import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/data/products';
import { bidState, spendBidRight } from '@/lib/bidRight';
import { bidIpo, currentRound, loadIpoCounts } from '@/lib/ipo';
import { applyStock, fetchStock } from '@/lib/stock';

/**
 * 절기빵 공모주.
 *   GET   이번 회차 + 경쟁률 + 내 청약 상태
 *   POST  { candidate } 청약 한 건 → 갱신된 경쟁률
 *
 * 받는 값은 후보 id 하나다. 회차·모드·후보는 서버가 오늘 날짜와 재고로 정한다 —
 * 클라이언트가 지난 회차나 없는 후보를 보내면 거부한다.
 *
 * 청약 자격은 오늘 빵을 산 사람만이다(lib/bidRight). 구매가 증거금 역할이라
 * 여기서 청약권을 확인하고 성공하면 소진한다.
 */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false as const, error }, { status, headers: NO_STORE });

/** 품절 목록은 자사몰에서 받아온다 — 재입고 공모의 후보가 거기서 나온다 */
async function roundNow(at = new Date()) {
  const stock = await fetchStock();
  const soldOut = applyStock(PRODUCTS, stock).filter(product => !product.inStock);
  return currentRound(at, soldOut);
}

export async function GET() {
  const round = await roundNow();
  const [counts, mine] = await Promise.all([loadIpoCounts(round), bidState()]);
  return NextResponse.json({ ok: true as const, round, ...counts, ...mine }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: { candidate?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  const now = new Date();
  const round = await roundNow(now);
  const candidate = String(body.candidate ?? '');
  if (!round.candidates.some(item => item.id === candidate)) {
    return bad('이번 회차에 없는 후보입니다.');
  }

  const mine = await bidState(now);
  if (mine.bidFor) return bad('오늘은 이미 청약했습니다.', 409);
  if (!mine.canBid) return bad('오늘 빵을 사면 청약할 수 있어요.', 403);

  const counts = await bidIpo(round, candidate);
  await spendBidRight(candidate, now);
  return NextResponse.json(
    { ok: true as const, round, ...counts, canBid: false, bidFor: candidate },
    { headers: NO_STORE },
  );
}
