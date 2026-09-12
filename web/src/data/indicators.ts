// 시장 지표 마스터
//
// 할인율을 정하는 것은 코스피 하나다. 방향으로 대상 라인을 고르고,
// 등락 폭으로 할인율을 정한다 (DISCOUNT_TIERS).
//
// 나머지 지표는 "오늘의 시장" 화면을 채우는 표시용이고 계산에 관여하지 않는다.
// 원가(환율·코코아·버터) 계층과 원가 가드레일은 폐기했다 — 원가를 가격 근거로
// 주장하지 않기로 확정했다. 코스피는 원가 지표가 아니라 응원 지표다.
//
// 기업 문서 원문: "시장 데이터는 목적이 아니라 수단으로 생각해주시면 됩니다"

export type IndicatorRole = 'discount' | 'display';
export type UpdateCycle = 'daily' | 'weekly' | 'biweekly';

export interface Indicator {
  code: string;
  name: string;
  unit: string;
  /** discount = 할인 계산에 쓴다 · display = 화면에 보여주기만 한다 */
  role: IndicatorRole;
  /** 데이터 출처 */
  source: string;
  updateCycle: UpdateCycle;
  /** 유료 여부 — 외부 데이터 예산 팀당 $50 제약 */
  free: boolean;
  note: string;
}

export const INDICATORS: Indicator[] = [
  {
    code: 'KOSPI',
    name: '코스피 지수',
    unit: 'pt',
    role: 'discount',
    source: '네이버 금융 폴링 API (비공식) → 실패 시 Yahoo ^KS11',
    updateCycle: 'daily',
    free: true,
    note: '원가와 무관한 응원 지표. 방향으로 할인 대상을, 등락 폭으로 할인율을 정한다. 원가 인과로 주장하지 말 것.',
  },
  {
    code: 'FX_USDKRW',
    name: '원/달러 환율',
    unit: 'KRW',
    role: 'display',
    source: 'Yahoo Finance KRW=X (비공식)',
    updateCycle: 'daily',
    free: true,
    note: '"오늘의 시장" 화면에 스파크라인으로 보여주기만 한다. 할인 계산에는 쓰지 않는다.',
  },
  {
    code: 'WEATHER_TEMP',
    name: '서울 기온',
    unit: '°C',
    role: 'display',
    source: 'Open-Meteo (키 없음)',
    updateCycle: 'daily',
    free: true,
    note: '날씨 타일로 보여주기만 한다. 할인 계산에는 쓰지 않는다.',
  },
];

/**
 * 코스피 등락률 → 할인율 구간.
 * 코드가 아니라 데이터로 둔다. 기업 협의로 숫자만 갈아끼울 수 있어야 한다.
 */
export interface DiscountTier {
  /** 등락률 절대값 하한 (%) */
  minAbsChange: number;
  rate: number;
  label: string;
}

export const DISCOUNT_TIERS: DiscountTier[] = [
  { minAbsChange: 4.5, rate: 0.38, label: '급변동' },
  { minAbsChange: 3, rate: 0.3, label: '큰 변동' },
  { minAbsChange: 1.5, rate: 0.2, label: '보통 변동' },
  { minAbsChange: 1, rate: 0.1, label: '작은 변동' },
];
// ±1% 미만은 tierFor()의 폴백이 마지막 티어(10%)를 준다 — 할인 없는 날은 만들지 않는다.

/**
 * 절대 할인 상한 — 기업 확인값 (2026-09).
 *
 * 기업 회신: "현재 막지 자사몰에서 판매하고 있는 상품 모두 동일하게 최대 할인률 38%".
 * 제품별로 다른 상한을 두지 않는다.
 *
 * 티어 값과 별개로 한 번 더 막는다. DISCOUNT_TIERS는 협의로 바뀔 수 있는 데이터인데,
 * 누군가 티어를 올렸을 때 상한까지 같이 뚫리면 안 된다.
 */
export const MAX_DISCOUNT_RATE = 0.38;


