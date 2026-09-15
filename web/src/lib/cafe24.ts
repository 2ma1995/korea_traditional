import { requireSupabase } from '@/lib/supabase';

/**
 * 카페24 Admin API 연동.
 *
 * 하는 일은 두 가지뿐이다 (기획 확정 사항):
 *   1. 상품 가격 변경   — 오늘의 할인가를 자사몰에 반영
 *   2. 쿠폰 발급        — 대회 우승자 Winner Price
 *
 * 인증은 OAuth 2.0 Authorization Code.
 *   인증코드 유효 1분 · 액세스 토큰 2시간 · 갱신 토큰 2주
 *   토큰 요청은 2시간에 15회 제한이 있어 갱신을 남발하면 막힌다.
 *   그래서 만료 직전에만 갱신하고, 결과를 DB에 바로 되돌려 쓴다.
 *
 * 토큰을 DB에 두는 이유: 서버리스라 인스턴스 메모리가 요청 사이에 남지 않는다.
 */

/** 갱신 여유. 만료 5분 전부터 새로 받는다 — 호출 도중 만료되는 것을 막는다. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * API 버전 헤더.
 *
 * 앱이 처음 API를 부른 시점의 값으로 카페24가 앱 버전을 고정한다(개발자센터 '버전관리').
 * 고정된 값과 다른 버전을 요청하면 400이 나고, 응답에 올바른 값이 적혀 온다:
 *   "2024-06-01 version you requested is not available.
 *    The default value for the app version is 2026-09-01."
 * 버전을 올릴 때는 개발자센터에서 바꾸고 이 값도 같이 바꾼다.
 */
const API_VERSION = process.env.CAFE24_API_VERSION ?? '2026-09-01';

export interface Cafe24Config {
  mallId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** 배포 주소. Redirect URI는 카페24에 등록한 값과 글자까지 같아야 한다. */
function siteOrigin(): string {
  const explicit = process.env.SITE_ORIGIN;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

export function cafe24Config(): Cafe24Config | null {
  const mallId = process.env.CAFE24_MALL_ID;
  const clientId = process.env.CAFE24_CLIENT_ID;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET;
  if (!mallId || !clientId || !clientSecret) return null;
  return { mallId, clientId, clientSecret, redirectUri: `${siteOrigin()}/api/cafe24/callback` };
}

export function requireCafe24Config(): Cafe24Config {
  const config = cafe24Config();
  if (!config) {
    throw new Error(
      '카페24 환경변수가 없습니다. CAFE24_MALL_ID · CAFE24_CLIENT_ID · CAFE24_CLIENT_SECRET을 Vercel에 넣고 재배포하세요.',
    );
  }
  return config;
}

const apiBase = (mallId: string) => `https://${mallId}.cafe24api.com`;

/** 개발자센터에서 앱에 준 권한과 같아야 한다 — 상품(가격), 프로모션(쿠폰). */
export const SCOPES = [
  'mall.read_product',
  'mall.write_product',
  'mall.read_promotion',
  'mall.write_promotion',
] as const;

/** 인증을 시작할 주소. state는 CSRF 방지용으로 호출부가 쿠키에 함께 심는다. */
export function authorizeUrl(state: string): string {
  const { mallId, clientId, redirectUri } = requireCafe24Config();
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
    scope: SCOPES.join(','),
  });
  return `${apiBase(mallId)}/api/v2/oauth/authorize?${query}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  /** 카페24는 만료 시각을 문자열로 준다. 초 단위 expires_in을 주는 경우도 함께 받아둔다 */
  expires_at?: string;
  expires_in?: number;
  refresh_token_expires_at?: string;
  scopes?: string[];
  mall_id?: string;
}

/** Authorization: Basic base64(client_id:client_secret) */
function basicAuth({ clientId, clientSecret }: Cafe24Config): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const config = requireCafe24Config();
  const response = await fetch(`${apiBase(config.mallId)}/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(config),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    // 응답 본문을 남긴다 — invalid_grant / redirect_uri 불일치가 여기서만 보인다
    throw new Error(`카페24 토큰 발급 실패 (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

/** 만료 시각 계산 — expires_at(문자열)을 우선하고 없으면 expires_in(초)으로 만든다. */
function expiryOf(token: TokenResponse): string {
  if (token.expires_at) {
    const parsed = new Date(token.expires_at);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const seconds = token.expires_in ?? 2 * 60 * 60;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function saveToken(mallId: string, token: TokenResponse) {
  const db = requireSupabase();
  const { error } = await db.from('cafe24_tokens').upsert({
    mall_id: mallId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiryOf(token),
    refresh_expires_at: token.refresh_token_expires_at ?? null,
    scope: token.scopes?.join(',') ?? null,
  }, { onConflict: 'mall_id' });
  if (error) throw new Error(`토큰 저장 실패: ${error.message}`);
}

/** 콜백에서 받은 인증코드를 토큰으로 바꿔 저장한다. 코드는 1분 안에 써야 한다. */
export async function exchangeCode(code: string): Promise<void> {
  const config = requireCafe24Config();
  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });
  await saveToken(config.mallId, token);
}

/**
 * 쓸 수 있는 액세스 토큰을 돌려준다.
 * 만료가 5분 안으로 남았으면 갱신 토큰으로 새로 받는다.
 */
export async function accessToken(): Promise<string> {
  const { mallId } = requireCafe24Config();
  const db = requireSupabase();
  const { data, error } = await db
    .from('cafe24_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('mall_id', mallId)
    .maybeSingle();

  if (error) throw new Error(`토큰 조회 실패: ${error.message}`);
  if (!data) {
    throw new Error('카페24 인증이 아직 안 됐습니다. /api/cafe24/authorize 를 한 번 열어 인증하세요.');
  }

  const expiresAt = new Date(data.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return data.access_token;
  }

  const refreshed = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: data.refresh_token,
  });
  await saveToken(mallId, refreshed);
  return refreshed.access_token;
}

/** Admin API 호출. 경로는 '/api/v2/admin/...' 형태로 넘긴다. */
export async function adminApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { mallId } = requireCafe24Config();
  const token = await accessToken();
  const response = await fetch(`${apiBase(mallId)}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': API_VERSION,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`카페24 API 실패 ${init.method ?? 'GET'} ${path} (${response.status}): ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/* ── 상품 ─────────────────────────────────────────────── */

export interface Cafe24Product {
  product_no: number;
  product_name: string;
  /** 실제 결제되는 금액. 우리가 바꾸는 값 */
  price: string;
  /** 취소선이 그어질 원래 가격. 건드리지 않는다 */
  retail_price: string;
  selling: string;
  display: string;
}

/** 상품 한 건 조회. 가격을 바꾸기 전에 원래 값을 확인·보존하는 용도이기도 하다. */
export async function getProduct(productNo: number): Promise<Cafe24Product> {
  const data = await adminApi<{ product: Cafe24Product }>(`/api/v2/admin/products/${productNo}`);
  return data.product;
}

/**
 * 판매가 변경.
 *
 * price(실제 결제 금액)만 바꾸고 retail_price(취소선 그을 원래 가격)는 건드리지 않는다.
 * 그래야 자사몰에도 "5,000원 → 3,500원"으로 우리 사이트와 같게 보인다.
 *
 * 되돌릴 책임은 호출부에 있다. 원래 price를 먼저 저장해 두지 않으면
 * 할인 전 가격을 잃는다 — 카페24는 이전 값을 보관해 주지 않는다.
 *
 * 카페24 쓰기 요청은 본문을 request로 감싼다. shop_no는 기본 상점(1).
 */
export async function setProductPrice(productNo: number, price: number): Promise<Cafe24Product> {
  const data = await adminApi<{ product: Cafe24Product }>(`/api/v2/admin/products/${productNo}`, {
    method: 'PUT',
    body: { shop_no: 1, request: { price: price.toFixed(2) } },
  });
  return data.product;
}
