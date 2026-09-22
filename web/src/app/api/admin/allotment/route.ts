import { requireAdmin } from '@/lib/adminAuth';
import { ALLOTMENT_DEFAULT, loadAllotment, saveAllotment } from '@/lib/appSettings';

/**
 * 오늘 풀 물량의 상한.
 *
 * 카페24 재고를 덮어쓰지 않는다 — 위에서 막을 뿐이다. 실제 물량은 둘 중 작은 쪽이고,
 * 재고가 그보다 적으면 재고가 이긴다(lib/offers).
 */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const allotment = await loadAllotment();
  return Response.json({ ...allotment, fallback: ALLOTMENT_DEFAULT });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { allotment?: unknown };
  try {
    const value = await saveAllotment(body.allotment);
    return Response.json({ value, stored: true });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
