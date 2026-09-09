import { PRODUCTS, type IngredientCode } from '@/data/products';

/**
 * 원료 → 시장 지표 매핑.
 *
 * 선물시장이 없는 원료(아몬드가루·타피오카 등)는 전량 수입이므로 환율을 대리 지표로 쓴다.
 * 억지 연결이 아니라 실제 원가 경로다. 버터도 자급률 16%라 환율에 직결된다.
 *
 * null = 무료·일간으로 받을 수 있는 지표가 없는 원료.
 *        계란(축평원, 별도 키)·생크림·치즈(USDA 주간)는 인증키 발급 후 채운다.
 */
const INGREDIENT_INDICATOR: Record<IngredientCode, 'fx' | 'cocoa' | 'corn' | 'wheat' | null> = {
  butter: 'fx', // 자급률 16% → 환율 직결
  almondFlour: 'fx', // 선물시장 없음, 전량 수입
  allulose: 'corn', // 옥수수 유래
  cocoa: 'cocoa', // ICE Cocoa
  riceFlour: null, // 국산 쌀 96% — 정부수매로 변동 작음. 대리 지표 부적합
  egg: null, // 축산물품질평가원 (키 필요)
  cream: null, // CME Class III/IV (주간)
  cheese: null, // CME Cheese (주간)
  water: null,
};

/** 전 제품 레시피를 합산한 원료별 총 수요량 */
export function ingredientWeights(): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const product of PRODUCTS) {
    for (const [code, qty] of Object.entries(product.recipe)) {
      totals[code] = (totals[code] ?? 0) + (qty ?? 0);
    }
  }
  return totals;
}

export interface CostIndexResult {
  /** 가중 평균 원가 상승률 (%) */
  changePct: number;
  /** 지표로 커버되는 원료 비중 (0~1) */
  coverage: number;
  /** 커버되지 않은 원료 코드 */
  uncovered: string[];
}

/**
 * 원료 바스켓 가중치로 원가 지수 상승률을 계산한다.
 * 레시피표(products.ts)가 그대로 가중치가 되므로,
 * 기업 원재료표가 오면 레시피 숫자만 갈아끼우면 이 지수도 함께 정확해진다.
 */
export function computeCostIndex(changes: {
  fx: number;
  cocoa: number;
  corn: number;
  wheat: number;
}): CostIndexResult {
  const weights = ingredientWeights();
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  let covered = 0;
  let weighted = 0;
  const uncovered: string[] = [];

  for (const [code, weight] of Object.entries(weights)) {
    const indicator = INGREDIENT_INDICATOR[code as IngredientCode];
    if (!indicator) {
      uncovered.push(code);
      continue;
    }
    covered += weight;
    weighted += weight * changes[indicator];
  }

  return {
    changePct: covered > 0 ? Number((weighted / covered).toFixed(2)) : 0,
    coverage: total > 0 ? Number((covered / total).toFixed(3)) : 0,
    uncovered,
  };
}
