import { cafe24Config, getProduct } from '@/lib/cafe24';
import { supabase } from '@/lib/supabase';

/**
 * 연결 점검.
 *
 * 인증을 누르기 전에 "환경변수가 실제로 들어갔는지 / 표가 만들어졌는지"를 본다.
 * 카페24 인증코드는 1분만 유효하고 토큰 요청은 2시간에 15회 제한이라,
 * 설정이 틀린 채로 인증을 시도하면 그 횟수를 그냥 버리게 된다.
 *
 * 값은 절대 돌려주지 않는다 — 있는지 없는지(boolean)와 개수만 본다.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cafe24 = cafe24Config();
  const db = supabase();

  const result: Record<string, unknown> = {
    cafe24: {
      mallId: cafe24?.mallId ?? null, // 공개값이라 그대로 보여준다
      clientId: Boolean(process.env.CAFE24_CLIENT_ID),
      clientSecret: Boolean(process.env.CAFE24_CLIENT_SECRET),
      redirectUri: cafe24?.redirectUri ?? null, // 개발자센터 등록값과 눈으로 대조해야 한다
    },
    supabase: { configured: Boolean(db) },
  };

  if (db) {
    // 표가 만들어졌는지 + 이미 인증된 토큰이 있는지
    const tokens = await db.from('cafe24_tokens').select('mall_id, expires_at');
    const entries = await db.from('contest_entries').select('id', { count: 'exact', head: true });
    result.supabase = {
      configured: true,
      tables: {
        cafe24_tokens: tokens.error ? `오류: ${tokens.error.message}` : 'OK',
        contest_entries: entries.error ? `오류: ${entries.error.message}` : 'OK',
      },
      cafe24Token: tokens.data?.length
        ? { mallId: tokens.data[0].mall_id, expiresAt: tokens.data[0].expires_at }
        : '아직 인증 전',
    };
  }

  /* ?product=9 를 붙이면 그 상품을 실제로 조회해 본다.
     토큰과 상품 읽기 권한이 살아 있는지 확인하는 가장 싼 방법이다. */
  const productNo = new URL(request.url).searchParams.get('product');
  if (productNo) {
    try {
      const product = await getProduct(Number(productNo));
      result.product = {
        product_no: product.product_no,
        product_name: product.product_name,
        price: product.price,
        retail_price: product.retail_price,
      };
    } catch (cause) {
      result.product = `오류: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
