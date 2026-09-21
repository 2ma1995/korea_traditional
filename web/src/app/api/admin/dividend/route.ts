import { requireAdmin } from '@/lib/adminAuth';
import { loadDividendPolicy, MAX_DIVIDEND_RATE, saveDividendPolicy } from '@/lib/appSettings';

/**
 * 주말 배당 정책 — 관리자가 넣는 값은 셋이다.
 *   평균 객단가 · 목표 할인율 · 주간 예산 상한
 *
 * 1인 주간 최대 배당은 앞의 둘에서 계산해 돌려준다. 관리자가 직접 넣지 않는다 —
 * 결과값을 손으로 넣게 하면 근거 없는 숫자가 박히고, 객단가가 바뀌어도 안 따라간다.
 *
 * 목표 할인율은 MAX_DIVIDEND_RATE를 넘길 수 없다. 저장 단계에서 막으므로
 * 잘못된 값이 애초에 들어가지 않는다.
 */

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const policy = await loadDividendPolicy();
  return Response.json({ ...policy, maxRate: MAX_DIVIDEND_RATE });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { aov?: unknown; rate?: unknown; budget?: unknown };
  try {
    const policy = await saveDividendPolicy(body);
    return Response.json({ ...policy, maxRate: MAX_DIVIDEND_RATE });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
