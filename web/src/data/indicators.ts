// 시장 지표 마스터
//
// 지표를 3계층으로 나눈다. 이게 "왜 이 지표와 이 제품을 연결했는가"의 답이다.
// 계층을 섞지 않는 것이 핵심 — 원가와 무관한 지표를 가격 근거로 쓰면 논리가 무너진다.
//
//   support : 응원 지표. 원가와 무관. 오늘의 "이유"를 만든다.        → 할인 대상 선택
//   cost    : 원가 지표. 실제 원료비에 직결.                          → 할인 폭 상한
//   demand  : 수요 지표. 소비 성향에 직결.                            → 노출 순서
//
// 기업 문서 원문: "시장 데이터는 목적이 아니라 수단으로 생각해주시면 됩니다"

export type IndicatorLayer = 'support' | 'cost' | 'demand';
export type UpdateCycle = 'daily' | 'weekly' | 'biweekly';

export interface Indicator {
  code: string;
  name: string;
  unit: string;
  layer: IndicatorLayer;
  /** 데이터 출처 */
  source: string;
  updateCycle: UpdateCycle;
  /** 유료 여부 — 외부 데이터 예산 팀당 $50 제약 */
  free: boolean;
  /** 이 지표를 가격 근거로 주장해도 되는가 */
  priceJustification: boolean;
  note: string;
}

export const INDICATORS: Indicator[] = [
  {
    code: 'KOSPI',
    name: '코스피 지수',
    unit: 'pt',
    layer: 'support',
    source: '한국거래소 / 공공데이터포털',
    updateCycle: 'daily',
    free: true,
    priceJustification: false,
    note: '원가와 무관한 응원 지표. 할인 대상 라인만 결정한다. 원가 인과로 주장하지 말 것.',
  },
  {
    code: 'FX_USDKRW',
    name: '원/달러 환율',
    unit: 'KRW',
    layer: 'cost',
    source: '한국은행 ECOS',
    updateCycle: 'daily',
    free: true,
    priceJustification: true,
    note: '버터 자급률 16%, 아몬드가루 전량 수입 → 원가 직결.',
  },
  {
    code: 'COCOA',
    name: '국제 코코아',
    unit: 'USD/t',
    layer: 'cost',
    source: 'ICE Cocoa (CC) 지연 시세',
    updateCycle: 'daily',
    free: true,
    priceJustification: true,
    note: '2024년 3배 폭등. 마틸다 초코케이크·티라미수에 직결.',
  },
  {
    code: 'BUTTER',
    name: '버터 공표가',
    unit: 'USD/lb',
    layer: 'cost',
    source: 'USDA AMS',
    updateCycle: 'weekly',
    free: true,
    priceJustification: true,
    note: '주간 갱신이므로 일간 문제·일간 로직에는 환율을 대리 지표로 쓴다.',
  },
  {
    code: 'WEATHER_TEMP',
    name: '서울 기온',
    unit: '°C',
    layer: 'demand',
    source: '기상청 API',
    updateCycle: 'daily',
    free: true,
    priceJustification: false,
    note: '세븐일레븐 검증: 24도 아이스커피 / 27도 막대 아이스크림 등 임계값별 수요 급증.',
  },
  {
    code: 'PRODUCE',
    name: '국산 농산물 도매가',
    unit: 'KRW/kg',
    layer: 'demand',
    source: '공공데이터포털 (가락시장 경락가)',
    updateCycle: 'daily',
    free: true,
    priceJustification: false,
    note: '제철 페어링 재료 선정용. 제품 원재료가 아니라 "위에 올리는 재료"라 인과가 성립한다.',
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
  { minAbsChange: 1.5, rate: 0.15, label: '큰 변동' },
  { minAbsChange: 0.5, rate: 0.1, label: '보통 변동' },
  { minAbsChange: 0, rate: 0.05, label: '보합' },
];

/** 원가 지표가 이 비율 이상 오른 날은 할인율을 축소한다 (마진 방어) */
export const COST_GUARDRAIL = { thresholdPct: 10, multiplier: 0.6 };

/**
 * 빵 위에 올려보기 규칙.
 *
 * 재료는 판매 상품이 아니라 페어링 제안이다. MAKJI는 냉동·상온 베이커리라
 * 신선 농산물을 유통하지 않는다. 따라서 재료를 올려도 가격은 바뀌지 않는다.
 * 시세는 "지금 무엇이 제철인지"를 알려주는 콘텐츠로만 쓴다.
 */
export const TOPPING_RULES = {
  /** 빵 위에 올릴 수 있는 최대 재료 수 */
  maxToppings: 4,
};
