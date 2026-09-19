import { cookies } from 'next/headers';

/**
 * 방문자 표식 — 관심 담기를 사람 단위로 세기 위한 것.
 *
 * 이 서비스에는 로그인이 없다. 그런데 수요 보정의 분모("몇 명이 담았나")는
 * 같은 사람을 두 번 세지 않아야 값이 뜻을 갖는다. 그래서 서버가 난수 하나를
 * HttpOnly 쿠키로 발급하고, 그 값으로만 중복을 거른다.
 *
 * 담고 있는 것은 난수뿐이다. 누구인지·무엇을 샀는지는 모른다. 자사몰 주문과
 * 이어붙일 수 있는 값도 아니다. 하는 일은 "이 브라우저가 이 빵을 오늘 이미
 * 담았는가" 하나다.
 *
 * ⚠️ 왜 클라이언트 중복 제거로 하지 않았나 —
 *    이 값은 가격을 움직인다. 관심 수를 부풀리면 그 빵이 최대 3%p 싸진다.
 *    서버가 클라이언트가 보낸 값을 다시 계산하는 것이 이 서비스의 규칙인데
 *    (api/fill), 분모만 클라이언트를 믿을 수는 없다.
 *
 * ⚠️ 한계. 쿠키를 지우면 같은 사람이 다시 한 명으로 잡힌다. 청약권(bidRight)이
 *    이미 같은 한계를 안고 있다. 다만 표본 20개 미만이면 전환율을 아예 쓰지
 *    않으므로(skuAdjust.MIN_DEMAND_SAMPLE) 한두 번의 반복으로는 폭이 안 움직인다.
 *
 * 쿠키를 굽는 호출이라 라우트 핸들러에서만 부른다 — 서버 컴포넌트 렌더 중에는
 * Next가 쿠키 쓰기를 막는다.
 */

const VISITOR = 'bm_v';

/** 30일. 집계 창이 7일이라 그보다 넉넉하면 되고, 더 길게 들고 있을 이유가 없다 */
const MAX_AGE = 60 * 60 * 24 * 30;

const OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
} as const;

/** UUID v4 모양만 받는다. 손으로 넣은 값으로 표를 더럽히지 않게 */
const WELL_FORMED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 지금 브라우저의 표식. 없거나 모양이 틀리면 새로 발급한다 */
export async function visitorId(): Promise<string> {
  const jar = await cookies();
  const seen = jar.get(VISITOR)?.value ?? '';
  if (WELL_FORMED.test(seen)) return seen;
  const fresh = crypto.randomUUID();
  jar.set(VISITOR, fresh, OPTIONS);
  return fresh;
}
