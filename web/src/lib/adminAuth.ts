import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { loadSetting, saveSetting } from '@/lib/appSettings';
import { limiter } from '@/lib/attempts';

/**
 * 관리자 잠금.
 *
 * 화면을 감추는 것과 막는 것은 다르다. 메뉴에서 링크를 빼도 주소를 아는 사람은
 * 들어오므로, 검사는 반드시 서버에서 한다 — 페이지 렌더와 API 라우트 양쪽에서.
 *
 * 지금은 비밀번호 하나(ADMIN_PASSWORD)다. 카페24 관리자 인증이 가능해지면
 * verifyAdmin()의 조건만 바꾸면 되고, 호출부는 그대로 둘 수 있다.
 */

const COOKIE = 'makji_admin';
/** 로그인 유지 기간. 짧으면 매번 치고, 길면 남의 브라우저에 오래 남는다 */
const TTL_MS = 12 * 60 * 60 * 1000;

const password = () => process.env.ADMIN_PASSWORD ?? '';

/** 쿠키 값은 비밀번호로 서명한다. 비밀번호를 모르면 만들어낼 수 없다. */
function sign(expiry: number): string {
  return createHmac('sha256', password()).update(String(expiry)).digest('hex');
}

/** 길이가 다르면 timingSafeEqual이 던지므로 먼저 거른다. */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function checkPassword(input: string): boolean {
  const expected = password();
  if (!expected) return false; // 환경변수가 없으면 아무도 못 들어온다 — 열어두지 않는다
  return sameString(input, expected);
}

export function issueCookie(): { name: string; value: string; maxAge: number } {
  const expiry = Date.now() + TTL_MS;
  return { name: COOKIE, value: `${expiry}.${sign(expiry)}`, maxAge: Math.floor(TTL_MS / 1000) };
}

export const COOKIE_NAME = COOKIE;

/** 로그인 상태인가. 서버 컴포넌트·라우트 양쪽에서 쓴다. */
export async function isAdmin(): Promise<boolean> {
  if (!password()) return false;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [expiryText, signature] = raw.split('.');
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  if (!sameString(signature ?? '', sign(expiry))) return false;
  /* 로그아웃 전에 발급된 쿠키는 버린다. 지우기만 하면 복사해둔 쿠키가 12시간 산다 */
  const loggedOut = (await loadSetting(LOGOUT_KEY, 0, asNumber)).value;
  return expiry - TTL_MS >= loggedOut;
}

const LOGOUT_KEY = 'admin_logout_at';
const asNumber = (raw: unknown) => (typeof raw === 'number' && Number.isFinite(raw) ? raw : null);

/** 로그아웃 — 그 전에 발급된 관리자 쿠키를 전부 무효로 만든다(비밀번호가 하나라 모두 같은 사람이다) */
export async function revokeAll(): Promise<void> {
  await saveSetting(LOGOUT_KEY, Date.now());
}

/* ── 로그인 시도 제한 ──
   비밀번호 하나로 막는 문이라 무한히 대입하면 언젠가 열린다. IP마다 15분에 5번까지(lib/attempts) */
const logins = limiter('admin_login_fail', 5, 15 * 60 * 1000);

/** 막혀 있으면 풀리기까지 남은 분, 아니면 null */
export const loginLocked = () => logins.locked();

export async function recordLogin(ok: boolean): Promise<void> {
  await (ok ? logins.reset() : logins.hit());
}

/** API 라우트용. 통과하지 못하면 401 응답을 돌려준다(그때 null이 아님). */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401 });
}
