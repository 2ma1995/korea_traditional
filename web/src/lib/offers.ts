import { DOWN_MARKET_BONUS, MAX_DISCOUNT_RATE, type DiscountTier } from '@/data/indicators';
import { demandBonusFor, inventoryBonusFor, skuRateFor, type SkuSignals } from '@/lib/skuAdjust';
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
 * 할인 금액을 보여라." 라인(글루텐프리 / 달콤)으로 가르는 건 LINE_MODE 하나로 켠다 —
 * 지금은 재고 있는 상품이 6종뿐이라 라인으로 가르면 하루에 2~4종만 남는다.
 * 원산지("국내산 쌀")로는 가르지 않는다 — 쌀가루가 국내산이 아니다(products.ts 주석).
 */

/** 오늘 각 빵의 한정 수량. 기업 협의 값 — 관리자 입력 화면은 다음 단계 */
export const DAILY_ALLOTMENT = 30;

/** 'all' = 전 상품 같은 폭 · 'line' = 오르면 식사형(meal), 내리면 달달한(sweet) 라인.
 *  라인 분기의 근거는 Garg·Wansink·Inman (2007) — 슬플 때 hedonic food 섭취가 늘고
 *  기쁠 때 덜 hedonic한 것이 늘어난다. 원산지가 아니라 감정이 기준이다.
 *  라인은 products.ts의 line 필드가 정한다(발표덱 8·9장과 같은 구성). */
export const LINE_MODE: 'all' | 'line' = 'line';

/**
 * 오늘 라인에 남는 빵이 이보다 적으면 라인 밖에서 채운다.
 *
 * 켜 놓고 보니 하락일에 두 종만 남는 날이 있다 — 덱의 하락 라인 4종 중 둘(초코케이크·
 * 티라미수)이 품절이라서다. 화면에 두 칸만 뜨면 "오늘 살 것"이 사라져 컨셉보다 손해가
 * 크다. 라인을 우선하되 최소 진열은 지킨다. 채워 넣은 빵은 화면에서 라인 밖임을 밝힌다.
 */
export const MIN_LINE_OFFERS = 3;

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
  /** 오늘 라인(상승=식사형 · 하락=달달)에 든 빵인가 */
  onLine: boolean;
  /** 이 빵의 오늘 폭 — 시장 기본 + 하락장 + 수요 + 재고 */
  rate: number;
  /** 수요 보정분 (0 · 0.02 · 0.03) */
  demandBonus: number;
  /** 재고 보정분 (0 · 0.01 · 0.02) */
  inventoryBonus: number;
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
  /** 오늘 폭 (0.1 = 10%) — 구간 기본 + 하락장 보정을 합친 최종값 */
  rate: number;
  /** 구간 기본 폭 (보정 전) */
  baseRate: number;
  /** 하락 마감이라 더 얹은 폭. 0이면 보정 없음 */
  bonusRate: number;
  mood: Mood;
  hours: MarketHours;
  /** 재고 있는 빵, 할인 금액 큰 순 */
  offers: TodayOffer[];
  soldOut: Product[];
}

/* 10원 단위 절사. Math.round를 먼저 거치는 이유 — 21000 * (1 - 0.3)이 IEEE754에서
   14699.999999999998이 되어 그냥 내리면 14,690원이 된다. 30% 할인인데 10원이 더
   깎인 값이다. 90개 조합 중 8개에서 이렇게 어긋났다. */
const floorTo10 = (won: number) => Math.floor(Math.round(won) / 10) * 10;

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
 * 오늘 폭 = 구간 기본 + 하락장 보정.
 *
 * 히어로·카드·차트·서버 체결 검증이 전부 이 함수 하나를 쓴다. 한쪽만 보정을 넣으면
 * 화면 가격으로 누른 예약이 서버에서 "오늘 폭이 아닙니다"로 튕긴다.
 */
export function rateFor(changePct: number, tiers: DiscountTier[]) {
  const tier = depthFor(Math.abs(changePct), tiers);
  const wanted = tier.rate + (moodFor(changePct).side === 'loss' ? DOWN_MARKET_BONUS : 0);
  const rate = Math.min(MAX_DISCOUNT_RATE, wanted);
  /* 상한에 걸려 깎였으면 실제로 얹힌 만큼만 보정으로 표시한다 */
  return { tier, base: tier.rate, bonus: rate - tier.rate, rate };
}

/**
 * 상품 배지 — "왜 이 빵인가"를 상품 자체가 말한다.
 *
 * 현직자가 "국내산 쌀 사용" 배지를 말했지만 달지 않는다 — 2026-09-18 원재료 표기
 * 전수 확인 결과 쌀가루가 국내산이 아니다. 확인된 것만 쓴다 — 글루텐프리 표기와 설탕 무첨가.
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
  return product.line === (side === 'gain' ? 'meal' : 'sweet');
}

export function buildToday(
  market: MarketSnapshot,
  tiers: DiscountTier[],
  filledFor: FilledLookup = () => 0,
  at: Date = new Date(),
  products: Product[] = PRODUCTS,
  signals: SkuSignals = {},
): TodayMarket {
  const absChangePct = Math.abs(market.kospi.changePct);
  const mood = moodFor(market.kospi.changePct);
  const { tier, base, bonus, rate } = rateFor(market.kospi.changePct, tiers);

  /* 오늘 라인에 드는 빵. 너무 적으면 라인 밖에서 정가 높은 순으로 채운다 —
     라인이 뜻을 만들지만, 살 것이 두 개뿐인 화면은 뜻보다 손해가 크다 */
  const sellable = products.filter(product => product.inStock);
  const onLine = sellable.filter(product => inTodayLine(product, mood.side));
  const filler = LINE_MODE === 'line' && onLine.length < MIN_LINE_OFFERS
    ? sellable.filter(product => !onLine.includes(product)).sort((a, b) => b.price - a.price).slice(0, MIN_LINE_OFFERS - onLine.length)
    : [];

  const offers = [...onLine, ...filler]
    .map<TodayOffer>(product => {
      /* 여기서 빵마다 폭이 갈린다. 신호가 없으면 보정이 0이라 전 상품 같은 폭이다 */
      const signal = signals[product.productNo];
      const demandBonus = demandBonusFor(signal);
      const inventoryBonus = inventoryBonusFor(signal);
      const skuRate = skuRateFor({ base, down: bonus, demand: demandBonus, inventory: inventoryBonus });
      const { price, saved } = priceAt(product.price, skuRate);
      return {
        product,
        /* 오늘 라인에 든 빵인가. false면 최소 진열을 맞추려고 채워 넣은 것이다 */
        onLine: inTodayLine(product, mood.side),
        rate: skuRate,
        demandBonus,
        inventoryBonus,
        price,
        saved,
        allotment: DAILY_ALLOTMENT,
        /* 체결은 폭으로 구분된다 — 그 빵의 폭으로 세야 잔량이 맞는다 */
        filled: filledFor(product.productNo, skuRate),
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
    baseRate: base,
    bonusRate: bonus,
    mood,
    hours: marketHours(at),
    offers,
    soldOut: products.filter(product => !product.inStock),
  };
}
