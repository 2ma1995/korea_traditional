import { requireAdmin } from '@/lib/adminAuth';
import { loadTiers, saveTiers } from '@/lib/settings';
import { MAX_DISCOUNT_RATE, type DiscountTier } from '@/data/indicators';

/** 할인 구간 조회·저장. "코스피 몇 %면 몇 % 할인"을 관리자가 정한다. */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ tiers: await loadTiers(), maxRate: MAX_DISCOUNT_RATE });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { tiers?: DiscountTier[] };
  if (!Array.isArray(body.tiers)) {
    return Response.json({ error: '구간 목록이 필요합니다.' }, { status: 400 });
  }
  try {
    await saveTiers(body.tiers);
    return Response.json({ tiers: await loadTiers() });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
