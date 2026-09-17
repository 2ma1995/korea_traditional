import type { DiscountTier } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';
import type { MarketSnapshot } from '@/lib/market';
import { depthFor, marketHours, type FilledLookup, type MarketHours } from '@/lib/orderbook';

/**
 * 오늘의 빵 — 빵장의 하루.
 *
 * 2차 현직자 피드백 뒤 구조를 다시 짰다. 호가 사다리·선착순 체결·아침 종목 잠금은
 * 증권 앱을 통째로 옮긴 것이었고, 빵을 사는 데 필요한 만큼을 넘었다.
 *   "주식과 빵이 엄청나게 연관될 거라 기대하는 유저는 없다.
 *    '국장은 이랬는데 빵장은 어떨까' 정도의 기대감만 심어주면 충분하다."
 *
 * 그래서 하루는 이렇게만 흐른다.
 *   15:30  국장 마감 — 오늘 얼마나 움직였나 확정
 *          움직인 크기가 오늘 폭을 정하고, 방향이 오늘의 기분을 정한다
 *            오르면  Celebrate  자축가  "오르는 날엔 빵값도 내립니다"
 *            내리면  Comfort    위로가  "쓸쓸한 마감, 달콤하게"
 *   20:00  빵장 개장 — 오늘의 빵을 한정 수량으로. 산다 / 다음에 산다(관심)
 *
 * 폭은 전 상품 동일이다. 현직자: "모든 상품 할인율이 동일하다면 할인율 대신
 * 할인 금액을 보여라." 라인(국내산 쌀 / 달콤)으로 가르는 건 LINE_MODE 하나로 켠다 —
 * 지금은 재고 있는 상품이 5종뿐이라 라인으로 가르면 하루에 2~3종만 남는다.
 */

/** 오늘 각 빵의 한정 수량. 기업 협의 값 — 관리자 입력 화면은 다음 단계 */
export const DAILY_ALLOTMENT = 30;

/** 'all' = 전 상품 같은 폭 · 'line' = 오르면 글루텐프리(쌀) 라인, 내리면 달콤 라인 */
export const LINE_MODE: 'all' | 'line' = 'all';

/** 이 안쪽은 보합으로 본다 */
const FLAT_PCT = 0.1;

export type Side = 'gain' | 'loss' | 'flat';

export interface Mood {
  side: Side;
  /** 자축가 · 위로가 · 본전가 */
  title: string;
  /** 영문 라벨 — Celebrate · Comfort */
  en: string;
  /** 직설 카피. 은유 말고 "코스피 올랐어? 가격 낮춰줄게" */
  copy: string;
  /** 오늘의 라인 이름 — 화면 눈썹에 붙는다. "달달하게 녹이기" */
  theme: string;
}

export interface TodayOffer {
  product: Product;
  /** 오늘 가격 (10원 절사) */
  price: number;
  /** 정가 − 오늘 가격 */
  saved: number;
  allotment: number;
  /** 오늘 이미 나간 수 */
  filled: number;
  /** 왜 이 빵인지 — 상품 자체의 이유 */
  badges: string[];
}

export interface TodayMarket {
  date: string;
  kospi: number;
  kospiLive: boolean;
  changePct: number;
  absChangePct: number;
  tier: DiscountTier;
  /** 오늘 폭 (0.1 = 10%) */
  rate: number;
  mood: Mood;
  hours: MarketHours;
  /** 재고 있는 빵, 할인 금액 큰 순 */
  offers: TodayOffer[];
  soldOut: Product[];
}

const floorTo10 = (won: number) => Math.floor(won / 10) * 10;

/** 폭이 정해졌을 때의 오늘 가격. 장중엔 실시간 폭으로 '지금 예상'을 그리는 데 쓴다 */
export function priceAt(listPrice: number, rate: number) {
  const price = floorTo10(listPrice * (1 - rate));
  return { price, saved: listPrice - price };
}

export function moodFor(changePct: number): Mood {
  if (Math.abs(changePct) < FLAT_PCT) {
    return { side: 'flat', title: '본전가', en: 'Steady', copy: '잔잔한 하루. 그래도 빵장은 열립니다.', theme: '🍞 잔잔하게 한 입' };
  }
  return changePct > 0
    ? { side: 'gain', title: '자축가', en: 'Celebrate', copy: '오르는 날엔 빵값도 내립니다. 함께 축하해요.', theme: '🌾 함께 축하하기' }
    : { side: 'loss', title: '위로가', en: 'Comfort', copy: '쓸쓸한 마감, 달콤하게 마무리해요. 주식이 우울해도 빵은 살 수 있어요.', theme: '🍰 달달하게 녹이기' };
}

/**
 * 상품 배지 — "왜 이 빵인가"를 상품 자체가 말한다.
 *
 * 현직자가 "국내산 쌀 사용" 배지를 말했지만, products.ts 주석대로 쌀가루 사용은
 * 제품별 원재료 확인이 먼저다. 확인된 것만 쓴다 — 글루텐프리 표기와 설탕 무첨가.
 */
export function badgesFor(product: Product): string[] {
  const badges: string[] = [];
  if (product.glutenFree) badges.push('글루텐프리');
  if (/설탕/.test(product.label)) badges.push('무설탕');
  if (!badges.length && /보존료/.test(product.label)) badges.push('보존료 無');
  return badges;
}

/** 라인 모드일 때 오늘 대상인가. 오르면 글루텐프리(쌀) 라인, 내리면 달콤 라인 */
function inTodayLine(product: Product, side: Side): boolean {
  if (LINE_MODE === 'all' || side === 'flat') return true;
  if (side === 'gain') return product.glutenFree;
  return ['cocoa', 'cream', 'cheese', 'allulose'].some(code => (product.recipe as Record<string, number>)[code]);
}

export function buildToday(
  market: MarketSnapshot,
  tiers: DiscountTier[],
  filledFor: FilledLookup = () => 0,
  at: Date = new Date(),
  products: Product[] = PRODUCTS,
): TodayMarket {
  const absChangePct = Math.abs(market.kospi.changePct);
  const tier = depthFor(absChangePct, tiers);
  const mood = moodFor(market.kospi.changePct);
  const rate = tier.rate;

  const offers = products
    .filter(product => product.inStock && inTodayLine(product, mood.side))
    .map<TodayOffer>(product => {
      const { price, saved } = priceAt(product.price, rate);
      return {
        product,
        price,
        saved,
        allotment: DAILY_ALLOTMENT,
        filled: filledFor(product.productNo, rate),
        badges: badgesFor(product),
      };
    })
    .sort((a, b) => b.saved - a.saved);

  return {
    date: market.date,
    kospi: market.kospi.value,
    kospiLive: market.kospi.live,
    changePct: market.kospi.changePct,
    absChangePct,
    tier,
    rate,
    mood,
    hours: marketHours(at),
    offers,
    soldOut: products.filter(product => !product.inStock),
  };
}
