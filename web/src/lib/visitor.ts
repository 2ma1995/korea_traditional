import { cookies } from 'next/headers';

import { COOKIE_OPTIONS, VISITOR, WELL_FORMED } from '@/lib/visitorCookie';

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
 * 표식을 굽는 곳은 proxy.ts(첫 방문)와 라우트 핸들러의 visitorId()(빠져나간 경우)
 * 둘이다. 서버 컴포넌트 렌더 중에는 Next가 쿠키 쓰기를 막으므로 읽기만 한다.
 */

/**
 * 이미 발급된 표식만 읽는다. 없으면 null이다.
 *
 * 서버 컴포넌트는 쿠키를 쓸 수 없다 — visitorId()를 부르면 발급을 시도하다
 * "Cookies can only be modified in a Server Action or Route Handler"로 렌더가 죽는다.
 * 화면을 그리는 쪽(page.tsx의 출석 기록)은 이 함수를 쓴다.
 *
 * 그래서 발급은 proxy.ts가 맡는다. 라우트 핸들러(첫 예약·관심 담기)에서만 발급하던
 * 때에는 **둘러보기만 하는 사람에게 표식이 영영 안 생겼다**. 출석은 주간 활동점수
 * 세 항목 중 하나인데(lib/dividend), 그 점수를 받을 수 있는 사람이 이미 담거나 산
 * 사람뿐이라 출석이 독립된 신호 노릇을 못 했다. 지금은 첫 방문에 표식이 붙는다.
 */
export async function currentVisitorId(): Promise<string | null> {
  const jar = await cookies();
  const seen = jar.get(VISITOR)?.value ?? '';
  return WELL_FORMED.test(seen) ? seen : null;
}

/** 지금 브라우저의 표식. 없거나 모양이 틀리면 새로 발급한다 — 라우트 핸들러 전용 */
export async function visitorId(): Promise<string> {
  const jar = await cookies();
  const seen = jar.get(VISITOR)?.value ?? '';
  if (WELL_FORMED.test(seen)) return seen;
  const fresh = crypto.randomUUID();
  jar.set(VISITOR, fresh, COOKIE_OPTIONS);
  return fresh;
}
