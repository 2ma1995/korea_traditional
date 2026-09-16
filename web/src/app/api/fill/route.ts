import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/data/products';
import { getMarketSnapshot } from '@/lib/market';
import { depthFor, marketHours, quantityForDepth } from '@/lib/orderbook';
import { loadTiers } from '@/lib/settings';
import { tryFill } from '@/lib/fills';

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
  if (!product.inStock) return bad('품절 상품입니다.');

  const now = new Date();
  if (!marketHours(now).open) return bad('지금은 빵장이 닫혀 있습니다.', 409);

  const [market, tiers] = await Promise.all([getMarketSnapshot(now), loadTiers()]);
  const today = depthFor(Math.abs(market.kospi.changePct), tiers);
  if (depth > today.rate + 1e-9) return bad('오늘 열리지 않은 호가입니다.', 409);

  const quantity = quantityForDepth(product, depth, tiers);
  if (quantity === null) return bad('이 칸은 걸기 대상이 아닙니다. 바로 구매하세요.');

  try {
    const result = await tryFill(productNo, depth, quantity, now);
    return NextResponse.json({ ok: true as const, ...result, quantity }, { headers: NO_STORE });
  } catch (err) {
    return bad(err instanceof Error ? err.message : '체결 처리에 실패했습니다.', 500);
  }
}
