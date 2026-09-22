import { requireAdmin } from '@/lib/adminAuth';
import { ALLOTMENT_DEFAULT, loadAllotments, saveAllotmentFor } from '@/lib/appSettings';

/**
 * 상품별 오늘 풀 물량.
 *
 * 카페24 재고를 덮어쓰지 않는다 — 위에서 막을 뿐이다. 실제 물량은 둘 중 작은 쪽이고,
 * 재고가 그보다 적으면 재고가 이긴다(lib/offers).
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const all = await loadAllotments();
  return Response.json({ ...all, fallback: ALLOTMENT_DEFAULT });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { productNo?: unknown; allotment?: unknown };
  try {
    const value = await saveAllotmentFor(body.productNo, body.allotment);
    return Response.json({ value, stored: true });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
