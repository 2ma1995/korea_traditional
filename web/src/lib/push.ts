import webpush from 'web-push';

import { supabase } from '@/lib/supabase';

/**
 * 웹 푸시 — 담아둔 빵이 오늘 할인되면 알린다.
 *
 * 발표덱 3·6·8·12장의 "가격 알림 설정·반응"이 여기다. 12장의 KPI("알림 후 구매율")도
 * 이게 있어야 잴 수 있다 — 발송 기록과 예약 기록을 대조하면 나온다.
 *
 * 로그인이 없는 서비스라 사람을 방문자 표식(bm_v)으로만 안다. 그래서 "누구에게
 * 무엇을 보낼까"는 watches 표가 답한다 — 그 사람이 담은 빵이 오늘 할인 목록에
 * 있으면 보낸다. 담은 적 없는 사람에게는 아무것도 안 간다.
 *
 * ⚠️ 켜져 있어도 동의한 사람에게만 간다. 브라우저가 권한을 물어보고, 거절하면
 *    구독 자체가 안 생긴다. 덱 13장의 "알림 동의와 철회 반영"이 그 뜻이다.
 *
 * ⚠️ iOS 사파리는 홈 화면에 추가한 경우에만 푸시를 받는다. 안드로이드·데스크톱은
 *    그냥 된다. 화면에서 이 사실을 숨기지 않는다(components/PushToggle).
 */

/** 공개키는 브라우저가 구독할 때 쓰므로 NEXT_PUBLIC_이다. 비밀키는 서버만 본다 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com';

export const pushReady = () => Boolean(PUBLIC_KEY && PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured || !pushReady()) return;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** 모양만 본다. 유효한 구독인지는 실제로 보내 봐야 안다 */
export function wellFormed(raw: unknown): Subscription | null {
  const s = raw as Subscription | undefined;
  const endpoint = s?.endpoint;
  const p256dh = s?.keys?.p256dh;
  const auth = s?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return null;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** 구독을 저장한다. 같은 endpoint면 덮어쓴다 — 브라우저가 키를 갱신할 수 있다 */
export async function saveSubscription(visitor: string, sub: Subscription): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db.from('push_subscriptions').upsert({
    visitor,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    failed_at: null,
  }, { onConflict: 'endpoint' });
  return !error;
}

export async function dropSubscription(endpoint: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

export interface PushNote {
  title: string;
  body: string;
  url: string;
}

interface Row { endpoint: string; p256dh: string; auth: string }

/**
 * 한 사람의 모든 브라우저에 보낸다.
 *
 * 410·404는 구독이 죽은 것이다 — 지운다. 그대로 두면 매일 같은 실패를 반복하고,
 * 발송 수가 실제 도달과 달라져 "알림 후 구매율"이 틀어진다.
 * 그 밖의 실패는 남겨 둔다(일시적일 수 있다).
 */
async function sendTo(rows: Row[], note: PushNote): Promise<number> {
  configure();
  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(note),
      );
      sent += 1;
    } catch (cause) {
      const status = (cause as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) await dropSubscription(row.endpoint);
    }
  }
  return sent;
}

export interface PushReport {
  /** 보낼 대상이 있었는가 — 구독 수 */
  subscribers: number;
  sent: number;
  note: string | null;
}

/**
 * 오늘 할인되는 빵을 담아둔 사람들에게 알린다.
 *
 * 최근 7일 안에 담은 것만 본다. 한 달 전에 한 번 담고 잊은 빵으로 알림을 보내면
 * 그건 광고지 알림이 아니다. 창은 수요 보정이 쓰는 창과 같다(lib/skuSignals).
 */
export async function notifyWatchers(
  from: string,
  to: string,
  discounted: { productNo: number; name: string; rate: number }[],
): Promise<PushReport> {
  if (!pushReady()) return { subscribers: 0, sent: 0, note: 'VAPID 키가 없어 보내지 않았습니다.' };
  const db = supabase();
  if (!db) return { subscribers: 0, sent: 0, note: '저장소가 없어 구독을 읽지 못했습니다.' };
  if (!discounted.length) return { subscribers: 0, sent: 0, note: '오늘 할인되는 빵이 없습니다.' };

  const subs = await db.from('push_subscriptions').select('visitor, endpoint, p256dh, auth');
  if (subs.error || !subs.data?.length) return { subscribers: 0, sent: 0, note: '구독자가 없습니다.' };

  /* 누가 무엇을 담았나 — 이 창 안의 기록만 */
  const watched = await db.from('watches').select('visitor, product_no').gte('day', from).lte('day', to);
  if (watched.error) return { subscribers: subs.data.length, sent: 0, note: '관심 기록을 읽지 못했습니다.' };

  const byVisitor = new Map<string, Set<number>>();
  for (const w of (watched.data ?? []) as { visitor: string | null; product_no: number }[]) {
    if (!w.visitor) continue;
    (byVisitor.get(w.visitor) ?? byVisitor.set(w.visitor, new Set()).get(w.visitor)!).add(w.product_no);
  }

  const byName = new Map(discounted.map(d => [d.productNo, d]));
  const rowsFor = new Map<string, Row[]>();
  for (const s of subs.data as (Row & { visitor: string })[]) {
    (rowsFor.get(s.visitor) ?? rowsFor.set(s.visitor, []).get(s.visitor)!).push(s);
  }

  let sent = 0;
  for (const [visitor, rows] of rowsFor) {
    const mine = [...(byVisitor.get(visitor) ?? [])].map(no => byName.get(no)).filter(Boolean) as typeof discounted;
    if (!mine.length) continue;
    const head = mine[0];
    const more = mine.length - 1;
    sent += await sendTo(rows, {
      title: `담아두신 ${head.name}, 오늘 ${Math.round(head.rate * 100)}% 할인`,
      body: more > 0 ? `관심빵 ${more}개도 오늘 할인 중이에요. 물량이 끝나기 전에 확인해 보세요.` : '오늘 24시까지예요. 물량이 끝나면 닫힙니다.',
      url: '/',
    });
  }
  return { subscribers: subs.data.length, sent, note: null };
}
