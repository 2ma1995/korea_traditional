import { requireAdmin } from '@/lib/adminAuth';
import { getProduct, setProductPrice } from '@/lib/cafe24';
import { loadProductLinks } from '@/lib/settings';
import { requireSupabase } from '@/lib/supabase';
import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { PRODUCTS } from '@/data/products';

/**
 * 오늘의 할인안을 자사몰에 반영한다.
 *
 * 관리자가 고른 제품과 할인율을 그대로 받는다 — 코스피가 채운 기본값을
 * 관리자가 조정할 수 있어야 재고·기업 요청 같은 현실을 반영할 수 있다.
 * 다만 상한은 기업 확인값이라 여기서 다시 막는다. 화면을 우회해도 뚫리지 않게.
 *
 * 반영 전 자사몰의 원래 판매가를 함께 저장한다. 카페24는 이전 값을
 * 보관해 주지 않으므로, 우리가 적어두지 않으면 되돌릴 방법이 없다.
 */

/** 원 단위 절사 — 화면에 쓰는 규칙과 같아야 한다. */
const floorTo10 = (won: number) => Math.floor(won / 10) * 10;

interface Item { productNo: number; rate: number }

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { items?: Item[]; date?: string };
  const items = body.items ?? [];
  if (!items.length) return Response.json({ error: '반영할 제품이 없습니다.' }, { status: 400 });

  const links = await loadProductLinks();
  const applied: unknown[] = [];
  const skipped: unknown[] = [];

  for (const item of items) {
    const product = PRODUCTS.find(p => p.productNo === item.productNo);
    if (!product) { skipped.push({ productNo: item.productNo, reason: '없는 제품' }); continue; }

    const rate = Math.min(Math.max(item.rate, 0), MAX_DISCOUNT_RATE);
    /* products.ts의 productNo는 makji.kr의 실제 카페24 상품번호다.
       그래서 실제 몰에서는 연결표 없이 그대로 쓰면 맞다.
       연결표는 상품번호가 다른 체험몰을 위한 우회로다. */
    const cafe24No = links[item.productNo] ?? item.productNo;

    try {
      /* 할인은 자사몰의 현재 판매가를 기준으로 건다. products.ts 정가로 계산하면
         자사몰 가격이 그 사이 바뀌었을 때 엉뚱한 금액이 걸린다. */
      const before = await getProduct(cafe24No);
      const target = floorTo10(Number(before.price) * (1 - rate));
      const after = await setProductPrice(cafe24No, target);
      applied.push({
        productNo: item.productNo,
        name: product.name,
        cafe24ProductNo: cafe24No,
        rate,
        originalPrice: before.price,
        newPrice: after.price,
      });
    } catch (cause) {
      skipped.push({
        productNo: item.productNo,
        name: product.name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  // 원래 가격은 여기 적어둔 것이 유일한 기록이다
  try {
    const db = requireSupabase();
    await db.from('daily_plans').upsert({
      plan_date: body.date ?? new Date().toISOString().slice(0, 10),
      rate: items[0]?.rate ?? 0,
      headline: '관리자 반영',
      items: applied,
      status: applied.length ? 'published' : 'failed',
      approved_at: new Date().toISOString(),
      cafe24_note: skipped.length ? `건너뜀 ${skipped.length}건` : null,
    }, { onConflict: 'plan_date' });
  } catch (cause) {
    return Response.json({
      applied, skipped,
      warning: `자사몰 반영은 됐지만 기록 저장에 실패했습니다 — 되돌리기 값을 잃을 수 있습니다: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }

  return Response.json({ applied, skipped });
}
