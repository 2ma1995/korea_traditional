import { NextResponse } from 'next/server';
import { PRODUCTS } from '@/data/products';
import { visitorId } from '@/lib/visitor';
import { recordWatch } from '@/lib/watches';

/**
 * 관심 담기 기록 — POST { productNo }
 *
 * 화면이 빵을 관심에 담을 때 한 번 부른다. 오늘 이미 담은 빵이면 서버가 알아서
 * 거른다(watches의 unique) — 화면은 중복을 신경 쓰지 않아도 된다.
 *
 * 빵장이 닫혀 있어도 받는다. 관심은 사는 행위가 아니라 보는 행위라 시간 제한을
 * 둘 이유가 없고, 장 열리기 전에 담아두는 쪽이 오히려 자연스럽다.
 *
 * 응답은 화면이 쓰지 않는다. 담기는 이미 브라우저에서 끝났고 여기 실패가
 * 손님 화면을 되돌리면 안 된다 — 집계가 한 건 빠질 뿐이다.
 */

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false as const, error }, { status, headers: NO_STORE });

export async function POST(request: Request) {
  let body: { productNo?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  const productNo = Number(body.productNo);
  /* 없는 번호를 그대로 넣으면 집계에 유령 상품이 생긴다 */
  if (!PRODUCTS.some(item => item.productNo === productNo)) return bad('없는 상품입니다.');

  try {
    const visitor = await visitorId();
    const result = await recordWatch(productNo, visitor);
    return NextResponse.json({ ok: true as const, ...result }, { headers: NO_STORE });
  } catch (err) {
    return bad(err instanceof Error ? err.message : '관심 기록에 실패했습니다.', 500);
  }
}
