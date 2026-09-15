import { requireAdmin } from '@/lib/adminAuth';
import { loadProductLinks, removeProductLink, saveProductLink } from '@/lib/settings';

/** 우리 제품번호와 자사몰 상품번호를 잇는 표. */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ links: await loadProductLinks() });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { productNo, cafe24ProductNo } = (await request.json().catch(() => ({}))) as {
    productNo?: number; cafe24ProductNo?: number | null;
  };
  if (!Number.isInteger(productNo) || !productNo) {
    return Response.json({ error: '제품번호가 필요합니다.' }, { status: 400 });
  }
  try {
    // 빈 값으로 저장하면 연결을 끊는 뜻이다
    if (cafe24ProductNo === null || cafe24ProductNo === undefined) await removeProductLink(productNo);
    else if (Number.isInteger(cafe24ProductNo) && cafe24ProductNo > 0) await saveProductLink(productNo, cafe24ProductNo);
    else return Response.json({ error: '자사몰 상품번호가 올바르지 않습니다.' }, { status: 400 });

    return Response.json({ links: await loadProductLinks() });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 500 });
  }
}
