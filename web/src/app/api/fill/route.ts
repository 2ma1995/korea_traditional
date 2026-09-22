import { NextResponse } from 'next/server';
import { grantBidRight } from '@/lib/bidRight';
import { PRODUCTS } from '@/data/products';
import { getMarketSnapshot } from '@/lib/market';
import { marketHours } from '@/lib/orderbook';
import { rateFor } from '@/lib/offers';
import { demandBonusFor, inventoryBonusFor, skuRateFor } from '@/lib/skuAdjust';
import { loadSkuSignals } from '@/lib/skuSignals';
import { visitorId } from '@/lib/visitor';
import { loadTiers } from '@/lib/settings';
import { fetchStock } from '@/lib/stock';
import { attachCoupon, loadFilledCounts, tryFill } from '@/lib/fills';
import { issueCoupon } from '@/lib/coupon';
import { adjustInventory } from '@/lib/inventory';
import { allotmentFor, loadAllotments } from '@/lib/appSettings';
import { discountDelivery } from '@/lib/discountDelivery';
import { priceSyncActive } from '@/lib/priceSync';
import { sweepExpired } from '@/lib/settle';

/**
 * 한정 호가 체결 — POST { productNo, depth, unit? }
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
  /* 손님이 화면을 여는 것이 곧 타이머다 — 기한 지난 예약을 여기서 정리한다.
     Vercel 무료 플랜 크론은 하루 한 번이라 1시간 주기를 맡길 수 없다(lib/settle) */
  await sweepExpired();
  return NextResponse.json({ ok: true as const, filled: await loadFilledCounts() }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  let body: { productNo?: unknown; depth?: unknown; unit?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  const productNo = Number(body.productNo);
  const depth = Number(body.depth);
  const product = PRODUCTS.find(item => item.productNo === productNo);
  /* 자사몰 품목코드. 형태만 확인하고 값은 안 믿는다 — 실제로 그 상품의 품목인지는
     카페24가 판정한다(lib/inventory). 없으면 첫 품목으로 간다 */
  const unit = typeof body.unit === 'string' && /^[A-Za-z0-9]{1,32}$/.test(body.unit) ? body.unit : null;
  if (!product) return bad('없는 상품입니다.');
  if (!Number.isFinite(depth) || depth <= 0 || depth >= 1) return bad('할인 폭이 올바르지 않습니다.');
  const now = new Date();
  if (!marketHours(now).open) return bad('지금은 빵장이 닫혀 있습니다.', 409);

  /* 자리를 세기 전에 반납분을 먼저 정리한다 — 안 그러면 비어 있는 자리를
     "다 나갔습니다"라고 거절한다 */
  await sweepExpired(now);

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

  /* 화면과 같은 곳에서 같은 수량을 본다 — 여기만 코드 상수를 쓰면,
     카페24에서 수량을 줄인 순간 화면은 품절인데 서버는 계속 받는다 */
  /* 화면(lib/offers)과 같은 규칙으로 센다 — 자사몰 재고와 관리자 상한 중 작은 쪽.
     여기만 상한을 안 보면 화면이 "물량 끝"이라 해도 서버가 더 받아 준다 */
  const cap = allotmentFor((await loadAllotments()).value, productNo);
  const quantity = Math.min(stock.quantity[productNo] ?? Infinity, cap);

  try {
    const result = await tryFill(productNo, depth, quantity, now, await visitorId(), unit);
    /* 오늘 산 사람에게 공모 청약권 한 장. 구매가 증거금 역할을 한다 (lib/bidRight) */
    await grantBidRight(now);

    /* 자리를 잡은 사람에게만 할인코드를 준다 — 화면 가격과 자사몰 결제가를 맞추는
       유일한 수단이다(lib/coupon). 발급이 실패해도 예약은 그대로 살린다.
       손님은 이미 자리를 잡았고, 코드가 없어 아쉬울 뿐이다. */
    const coupon = result.filled ? await issueCoupon(productNo, depth, now) : null;

    if (result.filled) {
      /* 코드는 예약이 잡힌 뒤에 나온다. 나중에 "이 예약이 결제됐나"를 이 코드로 본다 */
      if (coupon && result.id !== null) await attachCoupon(result.id, coupon.code);
      /* 자사몰 재고도 같이 줄인다 — 그래야 31번째는 자사몰에서도 품절이다(설계도 §9).
         실패해도 예약은 살린다. fills가 정본이고 카페24는 따라가는 그림자다 */
      await adjustInventory(productNo, -1, unit);
    }

    /* 화면이 뭘 보여줄지는 **실제로 할인이 전달되는 방식**이 정한다.
       의도(DISCOUNT_DELIVERY)만 보고 말하면 안 된다 — price로 두고 PRICE_SYNC를
       안 켜면 값은 정가인데 화면은 "이미 적용돼 있습니다"라고 말한다.
       그게 설계도 최상단이 지적한 "싸다고 보여주고 정가로 보낸다"의 재발이다.
         price   판매가가 실제로 바뀌고 있다
         coupon  코드를 손에 쥐여줬다
         none    둘 다 아니다 — 자사몰에선 정가로 보인다고 밝힌다 */
    const delivery = priceSyncActive() ? 'price' : coupon ? 'coupon' : 'none';

    return NextResponse.json(
      { ok: true as const, ...result, quantity, coupon, delivery, intent: discountDelivery() },
      { headers: NO_STORE },
    );
  } catch (err) {
    return bad(err instanceof Error ? err.message : '체결 처리에 실패했습니다.', 500);
  }
}
