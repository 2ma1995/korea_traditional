import { COST_GUARDRAIL, DISCOUNT_TIERS } from '@/data/indicators';
import { PRODUCTS, type Product, type ProductLine } from '@/data/products';
import type { MarketSnapshot } from './market';

export interface DiscountedItem {
  product: Product;
  rate: number;
  finalPrice: number;
  saved: number;
}

export interface DailyPlan {
  date: string;
  /** 할인 대상 라인 */
  targetLine: ProductLine;
  /** 적용 할인율 (가드레일 반영 후) */
  rate: number;
  /** 가드레일이 발동했는가 */
  guardrailApplied: boolean;
  headline: string;
  reason: string;
  /** 판매 가능한 할인 대상 */
  items: DiscountedItem[];
  /** 할인 대상이지만 품절인 제품 */
  soldOut: Product[];
}

/** 원 단위 절사 — 카페24 쿠폰과 표시 금액을 맞추기 위해 10원 단위로 내린다. */
function floorTo10(won: number) {
  return Math.floor(won / 10) * 10;
}

function tierFor(changePct: number) {
  const abs = Math.abs(changePct);
  return DISCOUNT_TIERS.find((t) => abs >= t.minAbsChange) ?? DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1];
}

/**
 * 코스피 방향으로 할인 대상 라인을 정하고, 등락 폭으로 할인율을 정한다.
 *
 * 상승 → 국산 라인 (쌀 자급률 96.0%)
 * 하락 → 수입 라인 (밀 자급률 1.5%)
 *
 * 코스피는 원가 지표가 아니라 응원 지표다. 양방향 모두 할인이므로
 * 소비자가 손해 보는 경우가 구조적으로 없다.
 */
export function buildDailyPlan(
  market: MarketSnapshot,
  products: Product[] = PRODUCTS,
): DailyPlan {
  const up = market.kospi.changePct >= 0;
  const targetLine: ProductLine = up ? 'domestic' : 'imported';

  const tier = tierFor(market.kospi.changePct);
  const guardrailApplied = market.costIndexPct > COST_GUARDRAIL.thresholdPct;
  const rate = guardrailApplied ? tier.rate * COST_GUARDRAIL.multiplier : tier.rate;

  const targeted = products.filter((p) => p.line === targetLine);

  const items = targeted
    .filter((p) => p.inStock)
    .map((product) => {
      const finalPrice = floorTo10(product.price * (1 - rate));
      return { product, rate, finalPrice, saved: product.price - finalPrice };
    })
    .sort((a, b) => b.saved - a.saved);

  return {
    date: market.date,
    targetLine,
    rate,
    guardrailApplied,
    headline: up ? '국장 좋은 날, 국산 쌀로 만든 빵' : '힘든 날, 부담 없는 가격으로',
    reason: up
      ? `코스피가 ${market.kospi.changePct.toFixed(2)}% 올랐습니다. 국산 쌀가루로 만든 글루텐프리 라인을 할인합니다.`
      : `코스피가 ${Math.abs(market.kospi.changePct).toFixed(2)}% 내렸습니다. 부담을 덜어드리는 가격으로 준비했습니다.`,
    items,
    soldOut: targeted.filter((p) => !p.inStock),
  };
}
