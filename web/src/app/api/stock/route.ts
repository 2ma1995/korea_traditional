import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/data/products';
import { fetchStock } from '@/lib/stock';

/**
 * 재고 점검 — 어느 단계가 쓰였고, 상품별로 뭐라고 나오는지.
 *
 * 재고는 세 단계로 본다(카페24 → 자사몰 목록 → 코드 상수). 화면만 봐서는
 * 어느 단계가 쓰였는지 알 수 없어서, 눈으로 확인할 창구를 하나 둔다.
 * source가 'code'로 떨어져 있으면 note에 왜 그랬는지 적혀 있다.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await fetchStock();
  return NextResponse.json(
    {
      source: report.source,
      checkedAt: new Date(report.at).toISOString(),
      note: report.note,
      inStock: PRODUCTS.filter(product => report.map[product.productNo] ?? product.inStock).length,
      products: PRODUCTS.map(product => ({
        productNo: product.productNo,
        name: product.name,
        price: product.price,
        code: product.inStock,
        live: report.map[product.productNo] ?? null,
        /* 코드 값과 다르면 products.ts를 고칠 거리가 된다 */
        stale: product.productNo in report.map && report.map[product.productNo] !== product.inStock,
      })),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
