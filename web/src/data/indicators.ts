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

/**
 * 오늘의 기본 할인율 — KOSPI 일간 절대등락률이 그날 빵장 전체의 할인 강도를 정한다.
 *
 * rate는 '그날 모든 할인 대상 빵에 공통으로 적용되는 기본 할인율'이다.
 * 할인율 세분화 기획안의 나머지 세 축(수요 +3%p · 재고 +2%p · 하락장 +3%p)은
 * 이 값 위에 얹히고, 넷을 합한 최대가 정확히 38%가 되도록 기본 상단을 30%로 둔다.
 *   30 + 3 + 3 + 2 = 38  →  별도의 상한 절삭이 필요 없다
 *
 * 구간 경계는 KOSPI 5년 실측 분포로 잡았다 (Yahoo ^KS11, 1,218 거래일, 평균 |변동| 1.16%).
 *
 *   경계        기본    실측 빈도   연 환산
 *   0~0.3%       5%     22.2%      54일
 *   0.3~0.8%    10%     28.1%      69일
 *   0.8~1.5%    15%     26.4%      65일
 *   1.5~2.5%    20%     14.1%      35일
 *   2.5% 이상   30%      9.2%      23일
 *   → 기본 할인 기대값 13.5%
 *
 * 아래 세 구간이 거의 균등해 "매일 폭이 다르다"가 성립하고, 최상단 30%는 연 23일로
 * 희귀하지만 실제로 도달한다.
 *
 * ⚠️ 기획안 초안의 1.5/3.0/4.5% 경계는 쓰지 않는다 — 같은 데이터로 재면
 *    0~1.5%가 76.7%(연 188일)라 4일 중 3일이 5%에 몰리고, 30%는 연 9일뿐이라
 *    "매일 다른 폭"이 성립하지 않았다.
 */
export const DISCOUNT_TIERS: DiscountTier[] = [
  { minAbsChange: 2.5, rate: 0.30, label: '아주 큰 움직임' },
  { minAbsChange: 1.5, rate: 0.20, label: '매우 큰 움직임' },
  { minAbsChange: 0.8, rate: 0.15, label: '큰 움직임' },
  { minAbsChange: 0.3, rate: 0.10, label: '중간 움직임' },
  { minAbsChange: 0, rate: 0.05, label: '작은 움직임' },
];
// 하한 0인 구간이 있어 어떤 값이든 걸린다 — 호가가 하나도 없는 날은 만들지 않는다.

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


