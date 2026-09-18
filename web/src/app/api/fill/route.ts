import { NextResponse } from 'next/server';
import { grantBidRight } from '@/lib/bidRight';
import { PRODUCTS } from '@/data/products';
import { getMarketSnapshot } from '@/lib/market';
import { marketHours } from '@/lib/orderbook';
import { DAILY_ALLOTMENT, rateFor } from '@/lib/offers';
import { demandBonusFor, inventoryBonusFor, skuRateFor } from '@/lib/skuAdjust';
import { loadSkuSignals } from '@/lib/skuSignals';
import { loadTiers } from '@/lib/settings';
import { fetchStock } from '@/lib/stock';
import { loadFilledCounts, tryFill } from '@/lib/fills';

/**
 * 한정 호가 체결 — POST { productNo, depth }
 *
 * 클라이언트가 보낸 것은 상품 번호와 할인 폭뿐이다. 수량·개장 여부·오늘 열린
 * 폭은 전부 서버가 다시 계산한다. 화면을 거치지 않고 부를 수 있는 경로라
 * 클라이언트가 말하는 "남은 수량"을 믿으면 안 된다.
 */

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false as const, error }, { status, headers: NO_STORE });

/** 오늘 상품·칸별 체결 수. 화면이 5초마다 불러 잔량 막대를 줄인다 */
export async function GET() {
  return NextResponse.json({ ok: true as const, filled: await loadFilledCounts() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: { productNo?: unknown; depth?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  const productNo = Number(body.productNo);
  const depth = Number(body.depth);
  const product = PRODUCTS.find(item => item.productNo === productNo);
  if (!product) return bad('없는 상품입니다.');
  if (!Number.isFinite(depth) || depth <= 0 || depth >= 1) return bad('할인 폭이 올바르지 않습니다.');
  const now = new Date();
  if (!marketHours(now).open) return bad('지금은 빵장이 닫혀 있습니다.', 409);

  /* 재고도 화면과 같은 곳에서 본다. 코드 상수만 보면, 자사몰에서 품절된 빵을
     계속 예약받거나 재입고된 빵을 거절한다 */
  const stock = await fetchStock();
  if (!(stock.map[productNo] ?? product.inStock)) return bad('품절 상품입니다.', 409);

  const [market, tiers, signals] = await Promise.all([getMarketSnapshot(now), loadTiers(), loadSkuSignals(now)]);
  /* 오늘 폭 하나만 받는다. 호가 사다리는 접었다 — 폭이 다르면 오늘 것이 아니다.
     하락장 보정까지 포함한 최종 폭이어야 한다. 화면은 rateFor로 그리는데 여기서
     구간 기본값만 비교하면, 내린 날 화면 가격으로 누른 예약이 전부 튕긴다. */
  const today = rateFor(market.kospi.changePct, tiers);
  /* 폭은 이제 빵마다 다르다. 전체 공통값으로 비교하면 수요·재고 보정이 붙은
     빵을 화면 가격으로 누른 예약이 전부 튕긴다 */
  const signal = signals[productNo];
  const skuRate = skuRateFor({
    base: today.base,
    down: today.bonus,
    demand: demandBonusFor(signal),
    inventory: inventoryBonusFor(signal),
  });
  if (Math.abs(depth - skuRate) > 1e-9) return bad('오늘 폭이 아닙니다.', 409);

  const quantity = DAILY_ALLOTMENT;

  try {
    const result = await tryFill(productNo, depth, quantity, now);
    /* 오늘 산 사람에게 공모 청약권 한 장. 구매가 증거금 역할을 한다 (lib/bidRight) */
    await grantBidRight(now);
    return NextResponse.json({ ok: true as const, ...result, quantity }, { headers: NO_STORE });
  } catch (err) {
    return bad(err instanceof Error ? err.message : '체결 처리에 실패했습니다.', 500);
  }
}
