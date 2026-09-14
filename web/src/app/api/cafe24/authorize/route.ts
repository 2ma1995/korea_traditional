import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authorizeUrl, cafe24Config } from '@/lib/cafe24';

/**
 * 카페24 인증 시작.
 *
 * 이 주소를 브라우저로 한 번 열면 카페24 동의 화면으로 넘어가고,
 * 동의하면 /api/cafe24/callback 으로 인증코드가 돌아온다.
 * 사람이 직접 여는 주소라 GET이다.
 *
 * state는 CSRF 방지용이다 — 우리가 시작한 인증인지 콜백에서 확인해야 한다.
 * 쿠키에 같은 값을 심어두고 콜백에서 비교한다.
 */
export const STATE_COOKIE = 'cafe24_oauth_state';

export async function GET() {
  if (!cafe24Config()) {
    return new Response(
      '카페24 환경변수가 없습니다. CAFE24_MALL_ID · CAFE24_CLIENT_ID · CAFE24_CLIENT_SECRET을 넣고 재배포하세요.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const state = crypto.randomUUID();
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10분. 인증을 그 안에 끝내지 못하면 다시 시작하면 된다
  });

  redirect(authorizeUrl(state));
}
