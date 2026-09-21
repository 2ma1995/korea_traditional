import { requireAdmin } from '@/lib/adminAuth';
import { loadIpoEnabled, saveIpoEnabled } from '@/lib/appSettings';

/**
 * 공모주 노출 스위치 — 관리자가 껐다 켠다.
 *
 * 가격 스위치(PRICE_SYNC_ENABLED)와 달리 여기 둔 이유 — 공모를 껐다 켜는 건
 * 진짜 돈이 움직이는 동작이 아니고, 기업이 "이번 시즌은 쉬겠다"고 하면 배포
 * 없이 바로 꺼야 한다. 반대로 가격 스위치는 켜는 순간 자사몰 판매가가 바뀌므로
 * 관리자 화면에 두지 않는다.
 */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { value, stored } = await loadIpoEnabled();
  return Response.json({ enabled: value, stored });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') {
    return Response.json({ error: 'enabled는 true/false여야 합니다.' }, { status: 400 });
  }
  try {
    const { stored } = await saveIpoEnabled(body.enabled);
    return Response.json({ enabled: body.enabled, stored });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
