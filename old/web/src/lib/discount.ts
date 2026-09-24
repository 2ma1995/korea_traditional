import { DISCOUNT_TIERS, MAX_DISCOUNT_RATE, type DiscountTier } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';
import type { MarketSnapshot } from './market';

export interface DiscountedItem {
  product: Product;
  rate: number;
  finalPrice: number;
  saved: number;
}

export interface DailyPlan {
  date: string;
  /** 할인 대상이 글루텐프리 라인인가 */
  targetGlutenFree: boolean;
  /** 적용 할인율 (가드레일 반영 후) */
  rate: number;
  headline: string;
  reason: string;
  /** 판매 가능한 할인 대상 */
  items: DiscountedItem[];
  /** 할인 대상이지만 품절인 제품. 정가 높은 순 */
  soldOut: Product[];
}

/** 원 단위 절사 — 카페24 쿠폰과 표시 금액을 맞추기 위해 10원 단위로 내린다. */
function floorTo10(won: number) {
  return Math.floor(won / 10) * 10;
}

function tierFor(changePct: number, tiers: DiscountTier[]) {
  const abs = Math.abs(changePct);
  return tiers.find((t) => abs >= t.minAbsChange) ?? tiers[tiers.length - 1];
}

/**
 * 코스피 방향으로 할인 대상 라인을 정하고, 등락 폭으로 할인율을 정한다.
 *
 * 상승 → 글루텐프리 라인 (밀가루를 쓰지 않은 6종)
 * 하락 → 그 외 라인 (글루텐프리 표기가 없는 4종)
 *
 * 코스피는 원가 지표가 아니라 수요 지표다. 양방향 모두 할인이므로
 * 소비자가 손해 보는 경우가 구조적으로 없다.
 */
export function buildDailyPlan(
  market: MarketSnapshot,
  products: Product[] = PRODUCTS,
  /* 관리자가 화면에서 바꾼 구간. 없으면 코드 기본값 — 설정이 비었다고
     할인이 사라지면 안 된다. 읽어오는 곳은 lib/settings.ts */
  tiers: DiscountTier[] = DISCOUNT_TIERS,
): DailyPlan {
  const up = market.kospi.changePct >= 0;
  const targetGlutenFree = up;

  const tier = tierFor(market.kospi.changePct, tiers);
  // 기업 확인 상한(38%)을 넘지 않게 한 번 더 막는다. 티어는 협의로 바뀌는 데이터다.
  const rate = Math.min(tier.rate, MAX_DISCOUNT_RATE);

  const targeted = products.filter((p) => p.glutenFree === targetGlutenFree);

  const items = targeted
    .filter((p) => p.inStock)
    .map((product) => {
      const finalPrice = floorTo10(product.price * (1 - rate));
      return { product, rate, finalPrice, saved: product.price - finalPrice };
    })
    .sort((a, b) => b.saved - a.saved);

  return {
    date: market.date,
    targetGlutenFree,
    rate,
    headline: up ? '국장 좋은 날, 밀가루 없이 만든 빵' : '힘든 날, 부담 없는 가격으로',
    reason: up
      ? `코스피가 ${market.kospi.changePct.toFixed(2)}% 올랐습니다. 밀가루를 쓰지 않은 글루텐프리 라인을 할인합니다.`
      : `코스피가 ${Math.abs(market.kospi.changePct).toFixed(2)}% 내렸습니다. 부담을 덜어드리는 가격으로 준비했습니다.`,
    items,
    soldOut: targeted.filter((p) => !p.inStock).sort((a, b) => b.price - a.price),
  };
}
