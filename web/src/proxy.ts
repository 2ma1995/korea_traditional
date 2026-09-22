import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { COOKIE_OPTIONS, VISITOR, WELL_FORMED } from '@/lib/visitorCookie';

/**
 * 첫 방문에 방문자 표식을 굽는다.
 *
 * 왜 여기냐 — 출석(lib/visits)은 주간 활동점수 세 항목 중 하나인데, 표식을 예약·관심
 * 담기 라우트에서만 발급하던 때에는 **둘러보기만 하는 사람에게 표식이 영영 안 생겼다**.
 * 출석 점수를 받을 수 있는 사람이 이미 담거나 산 사람뿐이라, 셋이 참여·전환·재방문을
 * 따로 잰다는 설계(lib/dividend)가 무너져 있었다. 서버 컴포넌트는 쿠키를 못 굽고
 * (Next가 막는다), 요청 앞단인 여기는 구울 수 있다.
 *
 * Next 16에서 middleware.ts가 proxy.ts로 바뀌었다 — 파일명과 export 이름만 바뀌고
 * 동작은 같다(next/dist/docs .../middleware.md).
 *
 * 응답에만 심으면 이번 요청의 렌더는 아직 표식을 못 본다. 그래서 요청 헤더에도
 * 같이 넣어 넘긴다 — 그래야 page.tsx가 첫 방문 당일부터 출석을 센다.
 */
export function proxy(request: NextRequest) {
  const seen = request.cookies.get(VISITOR)?.value ?? '';
  if (WELL_FORMED.test(seen)) return NextResponse.next();

  const fresh = crypto.randomUUID();

  /* 이번 요청의 렌더가 읽을 몫. 기존 Cookie 헤더에 덧붙인다 —
     통째로 갈면 다른 쿠키(관리자 세션 등)가 이 요청에서 사라진다 */
  const headers = new Headers(request.headers);
  const jar = headers.get('cookie');
  headers.set('cookie', jar ? `${jar}; ${VISITOR}=${fresh}` : `${VISITOR}=${fresh}`);

  const response = NextResponse.next({ request: { headers } });
  /* 다음 요청부터 브라우저가 들고 오는 몫 */
  response.cookies.set(VISITOR, fresh, COOKIE_OPTIONS);
  return response;
}

/**
 * 화면 요청에만 돈다.
 *   api      라우트 핸들러는 visitorId()가 직접 굽는다 — 두 군데서 굽지 않는다
 *   _next·정적파일  표식이 필요 없고, 매 파일마다 Set-Cookie가 붙으면 낭비다
 */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
};
