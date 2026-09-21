import { requireAdmin } from '@/lib/adminAuth';
import { deleteRound, listRounds, saveRound, type RoundInput } from '@/lib/ipo';

/**
 * 공모 회차 편집 — 막지가 직접 회차를 열고 후보 빵을 넣고 뺀다.
 *
 * 절기 자동 편성을 대신하는 자리다. 절기는 주기를 공짜로 줬지만 후보를 제철
 * 재료에서 기계적으로 만들어, 실제로 만들 수 없는 빵이 후보에 올랐다.
 * 여기서는 기업이 만들 수 있는 것만 올린다.
 *
 * 열린 회차가 없으면 손님 화면에서 공모 섹션이 아예 안 뜬다 — 빈 회차를
 * 억지로 만들지 않는 것이 규칙이다(lib/ipo).
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json(await listRounds());
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Partial<RoundInput>;
  const name = String(body.name ?? '').trim();
  const opensOn = String(body.opensOn ?? '');
  const closesOn = String(body.closesOn ?? '');
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];

  if (!name) return Response.json({ error: '회차 이름이 필요합니다.' }, { status: 400 });
  if (!DAY.test(opensOn) || !DAY.test(closesOn)) {
    return Response.json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
  }
  if (closesOn < opensOn) {
    return Response.json({ error: '마감일이 시작일보다 빠릅니다.' }, { status: 400 });
  }
  /* 후보가 없는 회차는 열 수 없다 — 고를 것이 없는 공모는 공모가 아니다 */
  const cleaned = candidates
    .map(c => ({ ...c, name: String(c?.name ?? '').trim() }))
    .filter(c => c.name);
  if (!cleaned.length) return Response.json({ error: '후보 빵을 하나 이상 넣어주세요.' }, { status: 400 });

  try {
    const saved = await saveRound({ id: body.id, name, opensOn, closesOn, ask: body.ask, candidates: cleaned });
    return Response.json({ ...saved, ...(await listRounds()) });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return Response.json({ error: '회차 id가 필요합니다.' }, { status: 400 });
  try {
    /* 청약 기록(ipo_bids)은 남는다 — 지난 회차의 결과를 지울 이유가 없다 */
    await deleteRound(id);
    return Response.json(await listRounds());
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status: 400 });
  }
}
