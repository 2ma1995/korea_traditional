import { requireAdmin } from '@/lib/adminAuth';
import { seoulDateString } from '@/lib/market';
import { applyPrices, priceSyncActive } from '@/lib/priceSync';
import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';

/**
 * 오늘의 할인안을 자사몰에 반영한다.
 *
 * 관리자가 고른 제품과 할인율을 그대로 받는다 — 코스피가 채운 기본값을
 * 관리자가 조정할 수 있어야 재고·기업 요청 같은 현실을 반영할 수 있다.
 * 다만 상한은 기업 확인값이라 여기서 다시 막는다. 화면을 우회해도 뚫리지 않게.
 *
 * 바꾸고 원가를 적는 일은 15:30 크론과 같은 함수(lib/priceSync.applyPrices)가 한다.
 * 따로 두었더니 이 버튼만 스위치·중복 반영·서울 날짜를 안 보고 있었다.
 */

interface Item { productNo: number; rate: number }

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  /* 스위치가 꺼져 있으면 자정 복원도 꺼져 있다 — 여기서 바꾸면 할인가가 영영 남는다 */
  if (!priceSyncActive()) {
    return Response.json({ error: '가격 동기화 스위치가 꺼져 있습니다(DISCOUNT_DELIVERY=price, PRICE_SYNC=on). 자정 복원이 돌지 않아 반영하지 않습니다.' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { items?: Item[] };
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return Response.json({ error: '반영할 제품이 없습니다.' }, { status: 400 });

  const rows: { product: Product; rate: number }[] = [];
  const unknown: { productNo: number; name: string; reason: string }[] = [];
  for (const item of items) {
    const product = PRODUCTS.find(p => p.productNo === item?.productNo);
    const rate = Number(item?.rate);
    if (!product || !Number.isFinite(rate)) {
      unknown.push({ productNo: Number(item?.productNo), name: product?.name ?? '', reason: '없는 제품이거나 할인율이 숫자가 아닙니다' });
      continue;
    }
    rows.push({ product, rate: Math.min(Math.max(rate, 0), MAX_DISCOUNT_RATE) });
  }

  /* 날짜는 서버가 서울 기준으로 정한다 — UTC로 적으면 00~09시에 어제 기록을 덮고
     자정 복원이 오늘 기록을 못 찾는다 */
  const result = await applyPrices(seoulDateString(), rows, {
    rate: rows[0]?.rate ?? 0, changePct: null, headline: '관리자 반영', reason: null, approvedBy: 'admin',
  });
  if (result.refused) return Response.json({ error: result.refused }, { status: 409 });

  return Response.json({
    applied: result.applied,
    skipped: [...unknown, ...result.skipped],
    ...(result.note ? { warning: result.note } : {}),
  });
}
