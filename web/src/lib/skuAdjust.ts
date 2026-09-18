import { MAX_DISCOUNT_RATE } from '@/data/indicators';

/**
 * SKU별 할인 보정 — 같은 날에도 빵마다 폭이 갈리는 부분.
 *
 * 기획안 v5의 덧셈 구조에서 뒤의 두 항이다.
 *
 *   구간 기본  최대 30%   ← KOSPI 변동폭 (indicators.ts)
 *   하락장     +3%p      ← KOSPI 방향   (DOWN_MARKET_BONUS)
 *   수요       +3%p      ← 여기
 *   재고       +2%p      ← 여기
 *   ─────────────────
 *   합계 최대  38%       ← 규칙 자체의 최대가 상한과 같다. 절삭이 필요 없다
 *
 * 수요를 재고보다 크게 둔 이유: 관심·장바구니·구매전환은 다음 구매를 가장 직접
 * 보여주는 고객 행동이고, 재고는 우리 쪽 운영 사정이다. 가격 우선순위를
 * 시장 > 고객 > 운영으로 둔다.
 *
 * ⚠️ 여기 숫자는 전부 실측값이 아니라 38% 안에서 역할별로 나눈 MVP 운영값이다.
 *    발표에서 "연구로 검증된 최적값"이라고 말하면 안 된다.
 *
 * 개인별이 아니라 SKU별이다 — 같은 시점의 같은 빵은 누구에게나 같은 가격이다.
 */

/* ── 수요 보정 ─────────────────────────────────────────────
   관심·장바구니에 담아만 놓고 사지 않는 빵에 가격 반응을 시험한다.
   "안 샀으니 가격이 문제"라고 단정하는 게 아니라, 가격 반응 검증 대상으로 고른다. */

/** 전환율이 이 위면 잘 팔리는 것으로 본다 — 보정 없음 */
export const DEMAND_GOOD_MIN = 0.45;
/** 이 아래면 담아만 두고 안 사는 것으로 본다 — 최대 보정 */
export const DEMAND_LOW_MAX = 0.20;
/** 표본이 이보다 적으면 전환율을 신뢰하지 않는다 (v5 §23) */
export const MIN_DEMAND_SAMPLE = 20;

export const DEMAND_BONUS = { good: 0, mid: 0.02, low: 0.03 } as const;

/* ── 재고 보정 ─────────────────────────────────────────────
   재고 '개수'가 아니라 판매속도 대비 며칠치인지로 본다.
   60개(하루 20개 판매)보다 30개(하루 3개 판매) 쪽이 부담이 크다. */

/** 이 미만이면 정상 회전 */
export const COVER_OK_DAYS = 3;
/** 이 이상이면 부담이 크다고 본다 */
export const COVER_HEAVY_DAYS = 7;

export const INVENTORY_BONUS = { ok: 0, mid: 0.01, heavy: 0.02 } as const;

export interface SkuSignal {
  /** 관심·장바구니 대비 구매전환율 (0~1). 미수집·표본 미달이면 null */
  conversion: number | null;
  /** 전환율을 계산한 관심·장바구니 표본 수 */
  demandSample: number;
  /** 오늘 푼 물량이 최근 판매속도로 며칠치인가. 판매 이력이 없으면 null */
  coverDays: number | null;
}

export type SkuSignals = Record<number, SkuSignal | undefined>;

/**
 * 수요 보정. 데이터가 없거나 표본이 모자라면 0이다 — 콜드스타트 SKU에
 * 억지로 점수를 만들지 않는다 (v5 §22).
 */
export function demandBonusFor(signal: SkuSignal | undefined): number {
  if (!signal || signal.conversion === null) return 0;
  if (signal.demandSample < MIN_DEMAND_SAMPLE) return 0;
  if (signal.conversion >= DEMAND_GOOD_MIN) return DEMAND_BONUS.good;
  if (signal.conversion >= DEMAND_LOW_MAX) return DEMAND_BONUS.mid;
  return DEMAND_BONUS.low;
}

/** 재고 보정. 판매 이력이 없으면 속도를 모르니 0이다 */
export function inventoryBonusFor(signal: SkuSignal | undefined): number {
  const cover = signal?.coverDays ?? null;
  if (cover === null) return INVENTORY_BONUS.ok;
  if (cover < COVER_OK_DAYS) return INVENTORY_BONUS.ok;
  if (cover < COVER_HEAVY_DAYS) return INVENTORY_BONUS.mid;
  return INVENTORY_BONUS.heavy;
}

/**
 * 네 항을 더해 그 빵의 오늘 폭을 낸다.
 *
 * 상한이 둘이다. 플랫폼 38%는 기업 확인값이고, skuCap은 상품별 원가·마진을 고려한
 * 개별 한도다. 기업 회신이 "모든 상품 동일 38%"라 지금은 같은 값이지만, 나중에
 * 상품별로 갈릴 자리를 비워 둔다.
 */
export function skuRateFor(parts: {
  /** 구간 기본 폭 */
  base: number;
  /** 하락장 보정 (상한에 걸려 깎인 뒤의 실제 적용분) */
  down: number;
  demand: number;
  inventory: number;
  skuCap?: number;
}): number {
  const sum = parts.base + parts.down + parts.demand + parts.inventory;
  return Math.min(sum, MAX_DISCOUNT_RATE, parts.skuCap ?? MAX_DISCOUNT_RATE);
}

/** 이미 합쳐진 폭에 SKU 보정만 얹을 때 (장중 '지금 기준 예상' 가격) */
export function withSkuBonus(rate: number, demand: number, inventory: number, skuCap?: number): number {
  return Math.min(rate + demand + inventory, MAX_DISCOUNT_RATE, skuCap ?? MAX_DISCOUNT_RATE);
}
