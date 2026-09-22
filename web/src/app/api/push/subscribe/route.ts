import { visitorId } from '@/lib/visitor';
import { dropSubscription, pushReady, saveSubscription, wellFormed } from '@/lib/push';

/**
 * 알림 구독 — POST { subscription } · DELETE { endpoint }
 *
 * 브라우저가 권한을 받은 뒤에만 여기에 온다. 우리가 물어보는 것이 아니라
 * 브라우저가 물어보고, 손님이 허락해야 구독이 생긴다.
 *
 * 방문자 표식은 여기서 발급한다 — 라우트 핸들러라 쿠키를 구울 수 있다.
 * 표식이 있어야 "이 사람이 담은 빵"을 찾아 보낼 수 있다(lib/push).
 */
export const dynamic = 'force-dynamic';

const bad = (message: string, status = 400) =>
  Response.json({ ok: false as const, error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!pushReady()) return bad('알림이 준비되지 않았습니다.', 503);

  const body = (await request.json().catch(() => ({}))) as { subscription?: unknown };
  const subscription = wellFormed(body.subscription);
  if (!subscription) return bad('구독 정보가 올바르지 않습니다.');

  const saved = await saveSubscription(await visitorId(), subscription);
  if (!saved) return bad('구독을 저장하지 못했습니다.', 503);
  return Response.json({ ok: true as const }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== 'string') return bad('endpoint가 없습니다.');
  await dropSubscription(body.endpoint);
  return Response.json({ ok: true as const }, { headers: { 'Cache-Control': 'no-store' } });
}
