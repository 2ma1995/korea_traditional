import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { grantBidRight } from '@/lib/bidRight';
import { PRODUCTS } from '@/data/products';
import { getMarketSnapshot } from '@/lib/market';
import { marketHours, SEATS_PER_OPTION } from '@/lib/orderbook';
import { rateFor } from '@/lib/offers';
import { demandBonusFor, inventoryBonusFor, skuRateFor } from '@/lib/skuAdjust';
import { loadSkuSignals } from '@/lib/skuSignals';
import { currentVisitorId, visitorId } from '@/lib/visitor';
import { loadTiers } from '@/lib/settings';
import { fetchStock, withSold } from '@/lib/stock';
import { attachCoupon, loadFilledCounts, loadMyReservations, loadSoldCounts, tryFill, type MyReservation } from '@/lib/fills';
import { issueCoupon } from '@/lib/coupon';
import { adjustInventory } from '@/lib/inventory';
import { allotmentFor, loadAllotments } from '@/lib/appSettings';
import { discountDelivery } from '@/lib/discountDelivery';
import { priceSyncActive } from '@/lib/priceSync';
import { sweepExpired } from '@/lib/settle';

/**
 * 한정 호가 체결 — POST { productNo, depth, unit?, count? }
 *
 * count는 이 옵션을 몇 개 사고 싶은가(포트폴리오의 − n +, 최대 SEATS_PER_OPTION).
 * 서버는 "이미 쥔 자리 + 모자란 만큼"만 채운다 — 목표 개수라서 두 번 보내도 더 잡히지 않는다.
 *
 * 클라이언트가 보낸 것은 상품 번호와 할인 폭뿐이다. 수량·개장 여부·오늘 열린
 * 폭은 전부 서버가 다시 계산한다. 화면을 거치지 않고 부를 수 있는 경로라
 * 클라이언트가 말하는 "남은 수량"을 믿으면 안 된다.
 */

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false as const, error }, { status, headers: NO_STORE });

/** 오늘 상품·칸별 체결 수. 화면이 5초마다 불러 잔량 막대를 줄인다 */
/* 매 요청마다 새로 센다. 이 파일의 다른 라우트들과 같은 규칙이고(api/stock·api/health),
   응답 헤더의 no-store는 브라우저에게 하는 말이라 서버 쪽 캐시를 대신하지 못한다. */
export const dynamic = 'force-dynamic';

const reservationView = (reservation: MyReservation) => ({
  ...reservation, status: 'filled' as const,
  delivery: priceSyncActive() ? 'price' as const : reservation.coupon ? 'coupon' as const : 'none' as const,
});
/* 한 옵션에 여러 자리를 쥘 수 있다(0020). 화면에는 한 묶음으로 준다 — 가장 먼저 잡은 자리,
   가장 이른 결제 기한, 전부 결제됐을 때만 'paid' */
const seatView = (rows: MyReservation[]) => {
  const first = [...rows].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))[0];
  const expiresAt = rows.map(row => row.expiresAt).filter((at): at is string => Boolean(at)).sort()[0] ?? null;
  return { ...reservationView(first), count: rows.length, expiresAt, settled: rows.every(row => row.settled === 'paid') ? 'paid' as const : 'open' as const };
};
const resume = (rows: MyReservation[]) => NextResponse.json(
  { ok: true, filled: true, already: true, ...seatView(rows) }, { headers: NO_STORE },
);

export async function GET() {
  try {
    await sweepExpired();
    const [filled, mine] = await Promise.all([
      loadFilledCounts(), loadMyReservations(await currentVisitorId()),
    ]);
    return NextResponse.json({ ok: true, filled, reservations: mine.map(reservationView) }, { headers: NO_STORE });
  } catch (cause) {
    return bad(cause instanceof Error ? cause.message : '예약 내역을 불러오지 못했습니다.', 503);
  }
}

/**
 * 한 IP가 한 빵에 쥘 수 있는 자리 수. 기본 5 — 집·사무실·통신사 공유 IP를 생각해 넉넉히 둔다.
 * 0이면 끈다. scripts/race-test.mjs는 한 컴퓨터에서 쉰 명을 흉내 내므로 FILL_PER_IP=0으로 돌린다.
 * IP는 원문을 남기지 않고 서버 비밀로 해시한다.
 */
function ipGuard(request: Request): { hash: string; limit: number } | null {
  const limit = Number(process.env.FILL_PER_IP ?? 5);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  /* Vercel은 x-forwarded-for 첫 값을 실제 접속 IP로 덮어쓴다 */
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
  if (!ip) return null;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { hash: createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 32), limit };
}

export async function POST(request: Request) {
  let body: { productNo?: unknown; depth?: unknown; unit?: unknown; count?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('예약 요청이 올바르지 않습니다.');
  const productNo = Number(body.productNo);
  const depth = Number(body.depth);
  const product = PRODUCTS.find(item => item.productNo === productNo);
  /* 자사몰 품목코드. 형태만 확인하고 값은 안 믿는다 — 실제로 그 상품의 품목인지는
     카페24가 판정한다(lib/inventory). 없으면 첫 품목으로 간다 */
  const unit = typeof body.unit === 'string' && /^[A-Za-z0-9]{1,32}$/.test(body.unit) ? body.unit : null;
  if (!product) return bad('없는 상품입니다.');
  if (!Number.isFinite(depth) || depth <= 0 || depth >= 1) return bad('할인 폭이 올바르지 않습니다.');
  const now = new Date();
  const visitor = await visitorId();
  /* 몇 개를 원하는가 — 1..SEATS_PER_OPTION. 이상한 값은 1개로 본다 */
  const want = Math.min(SEATS_PER_OPTION, Math.max(1, Math.floor(Number(body.count ?? 1)) || 1));
  /* 자리는 옵션마다 따로 센다(0019) — 휘낭시에 코코넛을 잡아둔 사람이 피칸을 누르면
     코코넛 예약을 열어줄 게 아니라 피칸 자리를 새로 잡아야 한다 */
  const sameSeat = (row: MyReservation) => row.productNo === productNo && (row.unit ?? null) === unit;
  const mine = async () => (await loadMyReservations(visitor, now)).filter(sameSeat);
  // 기존 예약은 휴장·품절·시세 변경 뒤에도 결제 안내를 다시 열 수 있다.
  let held: MyReservation[];
  try {
    held = await mine();
  } catch (cause) {
    return bad(cause instanceof Error ? cause.message : '예약 확인에 실패했습니다.', 503);
  }
  /* 이미 원하는 만큼 쥐고 있다 — 새로 잡지 않고 그 예약을 연다 */
  if (held.length >= want) return resume(held);
  if (!marketHours(now).open) return held.length ? resume(held) : bad('지금은 빵장이 닫혀 있습니다.', 409);

  /* 자리를 세기 전에 반납분을 먼저 정리한다 — 안 그러면 비어 있는 자리를
     "다 나갔습니다"라고 거절한다 */
  await sweepExpired(now);

  /* 재고도 화면과 같은 곳에서 본다. 코드 상수만 보면, 자사몰에서 품절된 빵을
     계속 예약받거나 재입고된 빵을 거절한다 */
  const stock = await fetchStock();
  if (!(stock.map[productNo] ?? product.inStock)) return held.length ? resume(held) : bad('품절 상품입니다.', 409);

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
  const cap = allotmentFor((await loadAllotments()).value, productNo, unit);
  /* 재고는 **고른 옵션의** 재고다(lib/offers와 같다). 상품 전체 합을 쓰면 '5개' 옵션이
     바닥나도 다른 옵션 재고로 계속 받는다. 팔린 만큼은 되돌려 더한다(withSold) */
  const sold = withSold(stock, await loadSoldCounts(now));
  const option = unit ? sold.options[productNo]?.find(item => item.code === unit) : undefined;
  const shelf = option ? option.quantity : sold.quantity[productNo];
  const quantity = Math.min(shelf ?? Infinity, cap);

  try {
    /* 모자란 만큼 한 자리씩 잡는다. 번호(seq)는 이미 쥔 수 다음부터 목표 개수까지 —
       같은 번호는 DB가 두 번 받지 않아(0020), 두 번 눌러도 목표를 넘지 않는다 */
    let limited = false, stale = false, soldOut = false, added = 0, remaining = 0;
    for (let seq = held.length + 1; seq <= want; seq++) {
      const result = await tryFill(productNo, depth, quantity, now, visitor, unit, ipGuard(request), seq);
      remaining = result.remaining;
      if (result.limited) { limited = true; break; }
      /* 그 번호는 이미 있다 — 두 번 누른 요청이 먼저 잡았거나, 0020 전 DB라 한 자리뿐이다 */
      if (result.already) { stale = true; continue; }
      if (!result.filled) { soldOut = true; break; }
      /* 오늘 산 사람에게 공모 청약권 한 장. 구매가 증거금 역할을 한다 (lib/bidRight) */
      if (added === 0) await grantBidRight(result.id, now);
      added += 1;
      /* 자리를 잡은 사람에게만 할인코드를 준다(lib/coupon). 발급이 실패해도 예약은 살린다 */
      const coupon = await issueCoupon(productNo, depth, now);
      if (coupon && result.id !== null) await attachCoupon(result.id, coupon.code);
      /* 자사몰 재고도 같이 줄인다(설계도 §9). 실패해도 예약은 살린다 — fills가 정본이다 */
      await adjustInventory(productNo, -1, unit);
    }

    const rows = await mine();
    if (!rows.length) {
      if (limited) return bad('이 네트워크에서 이 빵을 이미 여러 개 예약했어요. 결제하거나 기한이 지나면 다시 예약할 수 있어요.', 429);
      /* 이 옵션은 안 잡혔는데 막혔다 — 0019 전 DB의 빵 단위 규칙이다 */
      if (stale) {
        return NextResponse.json(
          { ok: false as const, already: true as const, error: '오늘 이 빵은 이미 다른 옵션으로 예약하셨어요. 예약한 자리에서 결제해 주세요.' },
          { status: 409, headers: NO_STORE },
        );
      }
      return NextResponse.json({ ok: true as const, filled: false, remaining: 0, quantity, unit, depth }, { headers: NO_STORE });
    }

    /* 원한 만큼 못 잡았으면 왜인지 같이 말한다 — 잡힌 자리는 살린다 */
    const why = limited ? '같은 네트워크에서는 한 빵에 5자리까지예요'
      : soldOut ? '남은 물량이 모자랐어요'
      : stale ? '지금은 한 옵션에 한 자리씩만 받고 있어요' : null;
    const short = rows.length < want && why ? `${want}개 중 ${rows.length}개만 예약했어요 — ${why}.` : null;

    /* 화면이 뭘 보여줄지는 **실제로 할인이 전달되는 방식**이 정한다(설계도 최상단).
         price   판매가가 실제로 바뀌고 있다
         coupon  코드를 손에 쥐여줬다
         none    둘 다 아니다 — 자사몰에선 정가로 보인다고 밝힌다 */
    return NextResponse.json(
      { ok: true as const, filled: true, ...seatView(rows), requested: want, added, short, quantity, remaining, unit, depth, intent: discountDelivery() },
      { headers: NO_STORE },
    );
  } catch (err) {
    return bad(err instanceof Error ? err.message : '체결 처리에 실패했습니다.', 500);
  }
}
