import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getProduct } from '@/lib/cafe24';

/**
 * 카페24 상품 조회. 관리자만.
 *
 * '자사몰 현재가 확인'이 쓴다 — 반영 전에 "무엇이 얼마로 바뀌는지"를 눈으로 보는
 * 자리다. 우리 정가(products.ts)가 자사몰과 다를 수 있어서, 할인은 늘 자사몰의
 * 현재 판매가를 기준으로 계산된다(lib/priceSync).
 */

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const no = Number(request.nextUrl.searchParams.get('no'));
  if (!Number.isInteger(no) || no <= 0) {
    return Response.json({ error: '상품번호(no)가 필요합니다.' }, { status: 400 });
  }
  try {
    const product = await getProduct(no);
    return Response.json({
      productNo: product.product_no,
      name: product.product_name,
      price: product.price,
      retailPrice: product.retail_price,
    });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 502 });
  }
}

/* 판매가 쓰기(PUT)는 '카페24 연결 시험' 패널만 쓰던 것이라 같이 걷어냈다.
   지금 자사몰 가격을 바꾸는 길은 둘뿐이다 — 관리자 화면의 '자사몰에 반영'과
   15:30 크론(lib/priceSync). 손으로 한 상품만 바꾸는 창구는 두지 않는다. */
