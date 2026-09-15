import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getProduct, setProductPrice } from '@/lib/cafe24';

/**
 * 카페24 상품 조회·가격 변경. 관리자만.
 *
 * 이 라우트가 자사몰 판매가를 실제로 바꾼다. 화면에서 버튼을 감추는 것으로는
 * 막을 수 없으므로 여기서 직접 검사한다.
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

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { no, price } = (await request.json().catch(() => ({}))) as { no?: number; price?: number };
  if (!Number.isInteger(no) || !no || !Number.isFinite(price) || price === undefined || price <= 0) {
    return Response.json({ error: '상품번호(no)와 가격(price)이 필요합니다.' }, { status: 400 });
  }
  try {
    const updated = await setProductPrice(no, price);
    return Response.json({
      productNo: updated.product_no,
      name: updated.product_name,
      price: updated.price,
      retailPrice: updated.retail_price,
    });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 502 });
  }
}
