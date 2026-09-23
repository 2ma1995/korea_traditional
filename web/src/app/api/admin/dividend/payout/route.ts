import { requireAdmin } from '@/lib/adminAuth';
import { previewPayout, runPayout } from '@/lib/payout';

/**
 * 주말 배당 지급.
 *   GET   미리보기 — 누구에게 얼마, 합계와 예산
 *   POST  지급 — 카페24 적립금으로 넣는다. 한 아이디 한 주 한 번(0018)
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json(await previewPayout());
}

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const result = await runPayout();
  return Response.json(result, { status: result.refused ? 409 : 200 });
}
