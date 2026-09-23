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

/**
 * 개발자센터에서 앱에 준 권한과 같아야 한다 — 상품(가격·재고), 프로모션(쿠폰), 주문.
 *
 * 주문 읽기는 "예약했는데 결제를 취소한 경우"를 잡으려고 넣었다.
 * 할인코드의 issued_count로 '결제 안 함'은 알 수 있지만, 결제 후 취소했을 때
 * 그 값이 되돌아오는지 확인되지 않았다. 되돌려 줄 재고를 놓치면 그 자리는
 * 아무도 못 산다.
 *
 * ⚠️ 여기에 적는다고 권한이 생기지 않는다. 개발자센터의 앱에 그 권한이
 *    등록돼 있어야 하고, 등록된 뒤 다시 인증해야(/api/cafe24/authorize) 토큰에 붙는다.
 *    없는 권한을 요청하면 인증 화면에서 거절된다.
 */
const BASE_SCOPES = [
  'mall.read_product',
  'mall.write_product',
  'mall.read_promotion',
  'mall.write_promotion',
] as const;

/**
 * 주문 조회는 **앱에 등록된 뒤에만** 요청한다.
 *
 * 2026-09-22에 그냥 넣었다가 인증이 통째로 막혔다 —
 *   invalid_scope: The scope added by Cafe24 Developers is invalid.
 * 카페24는 앱에 없는 권한을 요청하면 인증 화면을 아예 안 띄운다. 그래서 이 값을
 * 코드에 박아두면, 토큰이 만료돼 재인증해야 할 때 아무도 로그인할 수 없게 된다.
 * refresh_token은 2주짜리라 그 사고는 반드시 온다.
 *
 * 기업이 개발자센터에서 권한을 켜면 CAFE24_ORDER_SCOPE=on 을 넣고 재인증한다.
 */
/* payoutMode는 아래에 있다 — 함수 선언이라 여기서 불러도 된다 */
export const SCOPES: readonly string[] = [
  ...BASE_SCOPES,
  ...(process.env.CAFE24_ORDER_SCOPE === 'on' ? ['mall.read_order'] : []),
  /* 주말 배당(lib/payout). 아이디 확인에 회원 읽기, 적립금 방식이면 적립금 쓰기까지.
     주문 조회와 같은 이유로 개발자센터에 등록한 뒤에만 켠다 — DIVIDEND_PAYOUT */
  ...(payoutMode() ? ['mall.read_customer'] : []),
  ...(payoutMode() === 'mileage' ? ['mall.write_mileage'] : []),
];

/**
 * 배당을 어떻게 주는가.
 *   wallet   배당금은 우리 통장(dividend_payouts)에 쌓고, 쓸 때 그 금액의 할인 쿠폰을 발급한다.
 *            프로모션 권한만 있으면 된다 — 2026-09-23 테스트몰에서 회원 쿠폰 발급을 확인했다
 *   mileage  카페24 적립금으로 바로 넣는다. 적립금(WRITE_MILEAGE) 권한은 앱 권한 목록에
 *            없어서 카페24에 따로 신청해야 한다(2026-09-23 확인)
 *   (없음)   배당은 계산해서 보여주기만 한다
 */
export function payoutMode(): 'wallet' | 'mileage' | null {
  const mode = process.env.DIVIDEND_PAYOUT;
  return mode === 'wallet' || mode === 'mileage' ? mode : null;
}

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
 *
 * 만료가 5분 안으로 남았으면 미리 갱신한다. 다만 만료 시각만 믿지는 않는다 —
 * 카페24는 앱 타임존(Asia/Seoul) 기준으로 시각을 주고, 문자열에 오프셋이 없으면
 * 서버(UTC)에서 9시간 어긋나게 읽힌다. 그래서 adminApi가 401을 받으면
 * force로 다시 부른다.
 */
async function storedToken(mallId: string) {
  const { data, error } = await requireSupabase()
    .from('cafe24_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('mall_id', mallId)
    .maybeSingle();
  if (error) throw new Error(`토큰 조회 실패: ${error.message}`);
  if (!data) {
    throw new Error('카페24 인증이 아직 안 됐습니다. /api/cafe24/authorize 를 한 번 열어 인증하세요.');
  }
  return data as { access_token: string; refresh_token: string; expires_at: string };
}

/* 같은 인스턴스에서 동시에 갱신하지 않게 하나로 묶는다 — 갱신은 2시간 15회 제한이 있고,
   갱신하면 이전 refresh_token이 무효가 되어 뒤따른 갱신은 어차피 실패한다 */
let refreshing: Promise<string> | null = null;

export async function accessToken(force = false): Promise<string> {
  const { mallId } = requireCafe24Config();
  const data = await storedToken(mallId);

  const expiresAt = new Date(data.expires_at).getTime();
  if (!force && Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return data.access_token;
  }

  refreshing ??= (async () => {
    try {
      const refreshed = await requestToken({ grant_type: 'refresh_token', refresh_token: data.refresh_token });
      await saveToken(mallId, refreshed);
      return refreshed.access_token;
    } catch (cause) {
      /* 다른 인스턴스가 먼저 갱신했으면 우리 refresh_token은 이미 죽었다.
         저장소에 새 토큰이 있으면 그걸 쓴다 */
      const latest = await storedToken(mallId);
      if (latest.refresh_token !== data.refresh_token) return latest.access_token;
      throw cause;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/**
 * Admin API 호출. 경로는 '/api/v2/admin/...' 형태로 넘긴다.
 *
 * 401(invalid_token)이면 갱신하고 딱 한 번 다시 시도한다.
 * 만료 시각 계산이 어긋나도 스스로 복구되게 하려는 것이고, 무한 재시도는 하지 않는다
 * — 토큰 요청은 2시간에 15회 제한이 있어 반복하면 계정이 막힌다.
 */
export async function adminApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { mallId } = requireCafe24Config();

  const send = async (token: string) => {
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
    return { response, text: await response.text() };
  };

  let { response, text } = await send(await accessToken());

  if (response.status === 401) {
    ({ response, text } = await send(await accessToken(true)));
  }

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

/** 품목 — 옵션 하나에 붙는 추가금을 들고 있다 */
export interface Cafe24Variant {
  variant_code: string;
  /** 기본 판매가에 더해지는 금액. "7700.00" 같은 문자열이다 */
  additional_amount: string;
}

/**
 * 상품의 품목 목록.
 *
 * 막지의 빵은 수량을 옵션으로 판다 — 1개는 추가금 0원, 3개는 +7,700원 식이다.
 * 그래서 **판매가만 깎으면 3개를 고른 손님은 거의 할인을 못 받는다**(아래 setVariantAmount).
 */
export async function getVariants(productNo: number): Promise<Cafe24Variant[]> {
  const data = await adminApi<{ variants: Cafe24Variant[] }>(`/api/v2/admin/products/${productNo}/variants`);
  return data.variants ?? [];
}

/**
 * 품목 추가금 변경.
 *
 * 이게 없으면 할인이 수량에 따라 묽어진다. 4,500원짜리를 5% 깎아 4,270원으로
 * 만들어도, 3개 옵션(+7,700원)을 고르면 12,200원이 11,970원이 되어 실효 1.9%다.
 * 5개(+14,700원)면 1.2%까지 떨어진다 — 많이 살수록 덜 깎이는 역진적 구조다.
 * 추가금도 같은 비율로 깎아야 "오늘 5% 할인"이 옵션과 무관하게 참이 된다.
 */
export async function setVariantAmount(
  productNo: number,
  variantCode: string,
  amount: number,
): Promise<Cafe24Variant> {
  const data = await adminApi<{ variant: Cafe24Variant }>(
    `/api/v2/admin/products/${productNo}/variants/${variantCode}`,
    { method: 'PUT', body: { shop_no: 1, request: { additional_amount: amount.toFixed(2) } } },
  );
  return data.variant;
}

/* ── 회원 · 적립금 ─────────────────────────────────────── */

/** 이 아이디의 회원이 있는가. 배당을 엉뚱한 곳(오타 난 아이디)에 보내지 않으려고 연결할 때 본다 */
export async function memberExists(memberId: string): Promise<boolean> {
  const query = new URLSearchParams({ member_id: memberId, fields: 'member_id' });
  const data = await adminApi<{ customers?: { member_id: string }[] }>(`/api/v2/admin/customers?${query}`);
  return (data.customers ?? []).some(c => c.member_id === memberId);
}

/**
 * 적립금 지급. 되돌리려면 type 'decrease'로 같은 금액을 다시 보낸다 — 카페24가 원장을 든다.
 * 요청 모양·scope(WRITE_MILEAGE)는 apidocs.cafe24.com/docs/admin/post-points(2026-09-01)와 대조했다.
 * 1회 최대 1,000,000원, member_id는 20자 이하.
 */
export async function givePoints(memberId: string, amount: number, reason: string): Promise<void> {
  await adminApi('/api/v2/admin/points', {
    method: 'POST',
    body: { shop_no: 1, request: { member_id: memberId, amount: amount.toFixed(2), type: 'increase', reason } },
  });
}

/* ── 쿠폰 (배당금 꺼내 쓰기) ───────────────────────────────
   필드는 apidocs.cafe24.com/docs/admin/post-coupons · post-coupons-by-coupon-no-issues ·
   put-coupons-by-coupon-no(2026-09-01)와 대조했고, 2026-09-23 테스트몰에서 만들고·발급하고·지웠다.
   ⚠️ benefit_type 'F'(즉시적립)는 발급만으로 적립금이 들어가지 않는다 — 주문에 써야 적립된다.
   ⚠️ 이메일로 가입한 회원의 member_id는 이메일이 아니다(tester@naver.com → tester). */

/** 정액 할인 쿠폰을 만든다. 돌려주는 값은 coupon_no */
export async function createAmountCoupon(input: {
  name: string; amount: number; begin: string; end: string; minPrice: number;
}): Promise<string> {
  const data = await adminApi<{ coupon: { coupon_no: string } }>('/api/v2/admin/coupons', {
    method: 'POST',
    body: { shop_no: 1, request: {
      coupon_name: input.name.slice(0, 50),
      benefit_type: 'A', issue_type: 'M', issue_sub_type: 'M',
      available_period_type: 'F', available_begin_datetime: input.begin, available_end_datetime: input.end,
      available_site: ['W', 'M'], available_scope: 'O', available_coupon_count_by_order: 1,
      available_price_type: 'O', available_order_price_type: 'U', available_min_price: input.minPrice,
      discount_amount: { benefit_price: input.amount },
    } },
  });
  return data.coupon.coupon_no;
}

/** 쿠폰을 그 회원 쿠폰함에 넣는다 */
export async function issueCouponTo(couponNo: string, memberId: string): Promise<void> {
  await adminApi(`/api/v2/admin/coupons/${couponNo}/issues`, {
    method: 'POST',
    body: { shop_no: 1, request: { issued_member_scope: 'M', member_id: [memberId], send_sms_for_issue: 'F', allow_duplication: 'F', single_issue_per_once: 'T' } },
  });
}

/** 쿠폰을 지운다. 발급이 실패했을 때 빈 쿠폰을 남기지 않으려고 쓴다 */
export async function deleteCoupon(couponNo: string): Promise<void> {
  await adminApi(`/api/v2/admin/coupons/${couponNo}`, { method: 'PUT', body: { shop_no: 1, request: { deleted: 'D' } } });
}
