import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { exchangeCode } from '@/lib/cafe24';
import { STATE_COOKIE } from '@/app/api/cafe24/authorize/route';

/**
 * 카페24 인증 콜백.
 *
 * 개발자센터의 Redirect URI에 등록한 주소가 여기다. 글자 하나라도 다르면
 * 카페24가 인증코드를 주지 않는다.
 *
 * 인증코드는 1분만 유효하므로 받는 즉시 토큰으로 바꿔 DB에 저장한다.
 * 사람이 보는 화면이라 결과를 글로 돌려준다 — 실패 원인을 화면에서 읽어야
 * 무엇이 틀렸는지(권한 누락 / URI 불일치 / 저장소 미연결) 알 수 있다.
 */

const page = (title: string, detail: string, status: number) =>
  new Response(`${title}\n\n${detail}\n`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const error = params.get('error');
  if (error) {
    return page('카페24 인증이 거부됐습니다.', `${error}: ${params.get('error_description') ?? ''}`, 400);
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code) return page('인증코드가 없습니다.', '/api/cafe24/authorize 에서 다시 시작하세요.', 400);

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  if (!expected || expected !== state) {
    return page(
      'state 값이 맞지 않습니다.',
      '우리가 시작한 인증이 아니거나 10분이 지났습니다. /api/cafe24/authorize 에서 다시 시작하세요.',
      400,
    );
  }
  store.delete(STATE_COOKIE);

  try {
    await exchangeCode(code);
  } catch (cause) {
    return page('토큰 발급에 실패했습니다.', cause instanceof Error ? cause.message : String(cause), 500);
  }

  return page(
    '카페24 연동이 완료됐습니다.',
    '액세스 토큰과 갱신 토큰을 저장했습니다. 이제 /admin 에서 가격 반영과 쿠폰 발급을 쓸 수 있습니다.',
    200,
  );
}
