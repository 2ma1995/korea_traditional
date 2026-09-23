import { cookies } from 'next/headers';
import { checkPassword, issueCookie, loginLocked, recordLogin } from '@/lib/adminAuth';

/** 관리자 로그인. 비밀번호가 맞으면 서명 쿠키를 심는다. */
export async function POST(request: Request) {
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };

  if (!process.env.ADMIN_PASSWORD) {
    return Response.json(
      { error: 'ADMIN_PASSWORD 환경변수가 없습니다. Vercel에 넣고 재배포하세요.' },
      { status: 503 },
    );
  }
  const locked = await loginLocked();
  if (locked) return Response.json({ error: `시도가 너무 많습니다. ${locked}분 뒤에 다시 하세요.` }, { status: 429 });
  const ok = !!password && checkPassword(password);
  await recordLogin(ok);
  if (!ok) return Response.json({ error: '비밀번호가 맞지 않습니다.' }, { status: 401 });

  const cookie = issueCookie();
  (await cookies()).set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: cookie.maxAge,
  });
  return Response.json({ ok: true });
}
