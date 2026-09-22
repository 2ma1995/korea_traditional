/**
 * 손님이 결제하러 가는 자사몰 주소.
 *
 * 예전에는 makji.kr이 코드 여러 곳에 박혀 있었다. 그런데 우리가 가격·재고를
 * 바꾸는 곳은 CAFE24_MALL_ID가 가리키는 몰이다. 지금은 체험몰(makjitest)이고,
 * 진짜 막지몰 계정은 아직 못 받았다.
 *
 * 둘이 어긋나면 화면은 체험몰 가격을 보여주고 결제는 진짜 몰로 보낸다 —
 * 손님이 정가로 결제한다. 설계도 최상단의 "싸다고 보여주고 정가로 보낸다"가
 * 또 다른 형태로 나타난 것이다.
 *
 * 그래서 주소를 여기 한 곳에 모으고 환경변수로 따라가게 한다.
 * 계정을 받으면 NEXT_PUBLIC_SHOP_BASE 한 줄만 바꾸면 실제 몰로 넘어간다.
 *
 * NEXT_PUBLIC_ 접두사는 화면(클라이언트)에서도 읽어야 해서 붙인다.
 * 공개돼도 되는 값이다 — 쇼핑몰 주소는 손님이 보는 것이다.
 */

export const SHOP_BASE = process.env.NEXT_PUBLIC_SHOP_BASE ?? 'https://makji.kr';

/** 빵 목록 카테고리. 몰마다 번호가 다르다 */
const CATE = process.env.NEXT_PUBLIC_SHOP_CATE ?? '24';

export const shopProductUrl = (productNo: number) =>
  `${SHOP_BASE}/product/detail.html?product_no=${productNo}`;

export const shopListUrl = `${SHOP_BASE}/product/list.html?cate_no=${CATE}`;
