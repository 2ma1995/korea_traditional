import { MAX_DISCOUNT_RATE, type DiscountTier } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';
import type { MarketSnapshot } from './market';

/**
 * 빵장 — 호가 계산.
 *
 * 규칙은 두 줄이다.
 *   1. KOSPI가 **얼마나 움직였는지**(방향 아님)가 오늘 열릴 최저호가를 정한다
 *   2. 재고가 가격별로 실제 풀 수 있는 수량을 정한다
 *
 * 방향을 쓰지 않는 이유: 오르면 이 라인 할인, 내려도 저 라인 할인은 억지였고,
 * 연속 상승장에서 같은 상품군만 반복 할인됐다. 크기만 보면 규칙이 하나로 줄어든다.
 *
 * 맨 위 호가는 항상 '즉시구매'다 — 수량 제한이 없다. 이 칸이 없으면 호가창은
 * 구매 문턱을 낮추는 장치가 아니라 오히려 올리는 장치가 된다.
 */

/**
 * 빵장 개장 시각 (KST). 국장이 닫히는 그 순간에 연다 — "국장이 끝나면, 빵장".
 * 분 단위가 필요해서 시·분을 따로 둔다. 화면에 쓸 문자열은 OPEN_AT.
 */
export const OPEN_HOUR = 15;
export const OPEN_MINUTE = 30;
export const CLOSE_HOUR = 24;
export const OPEN_AT = `${String(OPEN_HOUR).padStart(2, '0')}:${String(OPEN_MINUTE).padStart(2, '0')}`;

/**
 * 테스트용 상시 개장.
 *
 * 빵장은 원래 20:00~24:00에만 열리는데, 그 시간이 아니면 화면에서 아무것도
 * 눌러볼 수 없어 개발·발표 준비가 막힌다. 그동안만 시간 제한을 끈다.
 *
 * ⚠️ 끄면 "장이 끝나면 빵장이 열립니다"라는 기획의 전제가 화면에서 사라진다.
 *    테스트가 끝나면 false로 되돌릴 것. 켜져 있는 동안에는 화면 시계가
 *    '테스트 · 상시 개장'으로 표시돼 실제 동작과 혼동되지 않는다.
 */
export const ALWAYS_OPEN = false;

/**
 * 실제로 상시 개장인가.
 *
 * 위 상수를 true로 바꿔 테스트하다 그대로 커밋되면 배포본이 24시간 열린다 —
 * 인수인계 문서가 경고한 사고다. 그래서 환경변수로도 열 수 있게 한다.
 * 로컬 .env.local에 MARKET_ALWAYS_OPEN=on 을 넣으면 커밋할 파일이 없다.
 *
 * ⚠️ Vercel 환경변수에는 넣지 말 것. 배포본이 휴장일에도 열린다.
 */
export const alwaysOpen = () => ALWAYS_OPEN || process.env.MARKET_ALWAYS_OPEN === 'on';

export interface Tick {
  /** 정가 대비 할인 폭 (0.05 = 5%) */
  depth: number;
  price: number;
  /** 수량 제한 없이 지금 살 수 있는 칸 */
  instant: boolean;
  /** 오늘 이 칸에 배정된 수량. instant면 null */
  quantity: number | null;
  /** 오늘 이미 체결된 수. quantity - filled 가 남은 수량 */
  filled: number;
  label: string;
}

export interface ProductBook {
  product: Product;
  ticks: Tick[];
  /** 오늘 이 상품에 열린 최저가 */
  floorPrice: number;
}

export interface MarketHours {
  /** 지금 빵장이 열려 있는가 */
  open: boolean;
  /** 왜 닫혔는가. test = 테스트용 상시 개장이라 열려 있다 */
  reason: 'open' | 'before' | 'after' | 'holiday' | 'test';
  /** KST 기준 현재 시각 표시용 */
  nowLabel: string;
  /** 휴장일에만 — 왜 쉬는가("추석" · "주말")와 다음 거래일("9/28(월)") */
  closedFor?: string;
  nextOpen?: string;
}

/** 10원 단위 절사 — 카페24에 반영하는 금액과 화면 금액을 맞춘다. */
/* 10원 단위 절사. Math.round를 먼저 거치는 이유 — 21000 * (1 - 0.3)이 IEEE754에서
   14699.999999999998이 되어 그냥 내리면 14,690원이 된다. 30% 할인인데 10원이 더
   깎인 값이다. 90개 조합 중 8개에서 이렇게 어긋났다. */
const floorTo10 = (won: number) => Math.floor(Math.round(won) / 10) * 10;

/** KST 기준 시/분/요일/날짜. 서버가 UTC라 직접 환산한다. */
function seoulParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    /* hour12:false는 자정을 '24'로 준다 — 00:30이 24:30이 되어 자정 뒤 한 시간 동안 '열림'으로 판정됐다 */
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return {
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
    /** YYYY-MM-DD (KST 달력) */
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/**
 * 한국거래소 휴장일 중 평일인 날 (KST 날짜 → 화면에 쓰는 이름). 코스피가 쉬는 날은 빵장도 쉰다.
 *
 * 2026 — 한국거래소 휴장일 공고 17일 그대로(6/3 지방선거 · 7/17 제헌절 포함).
 * 2027 — 거래소 공고(매년 12월) 전이라 우주항공청 2027년 월력요항으로 셌다.
 *        대체공휴일까지 넣었고, 12/31은 해마다 쉬는 연말 휴장이다.
 *
 * 선거일·임시공휴일은 그때그때 지정되니 공고가 나면 여기에 한 줄 넣는다.
 * ponytail: 손으로 적는 달력이라 2028년부터는 비어 있다 — 비어 있으면 평일은 전부
 *   개장으로 본다(예전과 같다). 거래소가 12월에 다음 해를 공고하면 그 해를 붙인다.
 */
export const KRX_HOLIDAYS: ReadonlyMap<string, string> = new Map([
  // 2026
  ['2026-01-01', '신정'],
  ['2026-02-16', '설날'],
  ['2026-02-17', '설날'],
  ['2026-02-18', '설날'],
  ['2026-03-02', '삼일절 대체공휴일'],
  ['2026-05-01', '노동절'],
  ['2026-05-05', '어린이날'],
  ['2026-05-25', '부처님오신날 대체공휴일'],
  ['2026-06-03', '지방선거'],
  ['2026-07-17', '제헌절'],
  ['2026-08-17', '광복절 대체공휴일'],
  ['2026-09-24', '추석'],
  ['2026-09-25', '추석'],
  ['2026-10-05', '개천절 대체공휴일'],
  ['2026-10-09', '한글날'],
  ['2026-12-25', '성탄절'],
  ['2026-12-31', '연말'],
  // 2027
  ['2027-01-01', '신정'],
  ['2027-02-08', '설날'],
  ['2027-02-09', '설날 대체공휴일'],
  ['2027-03-01', '삼일절'],
  ['2027-05-03', '노동절 대체공휴일'],
  ['2027-05-05', '어린이날'],
  ['2027-05-13', '부처님오신날'],
  ['2027-07-19', '제헌절 대체공휴일'],
  ['2027-08-16', '광복절 대체공휴일'],
  ['2027-09-14', '추석'],
  ['2027-09-15', '추석'],
  ['2027-09-16', '추석'],
  ['2027-10-04', '개천절 대체공휴일'],
  ['2027-10-11', '한글날 대체공휴일'],
  ['2027-12-27', '성탄절 대체공휴일'],
  ['2027-12-31', '연말'],
]);

/** 주말이거나 거래소 휴장일인가 — 코스피가 안 열리는 날 */
const isClosedDay = ({ weekday, date }: { weekday: string; date: string }) =>
  weekday === 'Sat' || weekday === 'Sun' || KRX_HOLIDAYS.has(date);

/** 이 KST 날짜 다음의 첫 거래일 — "9/28(월)". UTC 자정으로만 더해 시간대가 끼지 않게 한다 */
function nextOpenLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || KRX_HOLIDAYS.has(d.toISOString().slice(0, 10)));
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]})`;
}

/** 토·일인가. 평일 공휴일과 구분해야 하는 곳(주말 배당)이 쓴다 */
export const isWeekend = (at: Date = new Date()) => {
  const { weekday } = seoulParts(at);
  return weekday === 'Sat' || weekday === 'Sun';
};

/** 종목 선택 마감 시각 (KST). 주식장이 열리기 전에 골라야 결과를 보고 고를 수 없다 */
export const PICK_CLOSE_HOUR = 9;

export interface PickWindow {
  open: boolean;
  reason: 'open' | 'closed' | 'holiday' | 'test';
}

/**
 * 오늘 종목을 고를 수 있는가.
 *
 * 결과를 보고 고르면 게임이 된다 — 장 끝나고 제일 많이 움직인 종목을 고르면
 * 항상 제일 깊은 자리다. 그래서 장 시작(09:00) 전에만 받고 그 뒤로는 잠근다.
 * 테스트 중에는 열어둔다(ALWAYS_OPEN). 화면에 그 사실을 표시한다.
 */
export function pickWindow(at: Date = new Date()): PickWindow {
  if (alwaysOpen()) return { open: true, reason: 'test' };
  const parts = seoulParts(at);
  if (isClosedDay(parts)) return { open: false, reason: 'holiday' };
  return parts.hour < PICK_CLOSE_HOUR ? { open: true, reason: 'open' } : { open: false, reason: 'closed' };
}

/**
 * 개장 판정.
 *
 * 주말·공휴일은 KOSPI가 열리지 않으므로 빵장도 쉰다(KRX_HOLIDAYS). 매일 열면 평일
 * 습관이 약해지고, "주식시장이 쉬는 날은 빵장도 쉽니다"가 규칙으로 더 선명하다.
 * 개장 크론·예약 API·화면이 전부 여기를 본다 — 휴장일 판정은 이 한 곳에서 한다.
 */
export function marketHours(at: Date = new Date()): MarketHours {
  const parts = seoulParts(at);
  const { hour, minute } = parts;
  const nowLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  /* 테스트 중에는 요일·시간을 보지 않는다. 판정 로직 자체는 그대로 남겨둔다 */
  if (alwaysOpen()) return { open: true, reason: 'test', nowLabel };

  /* 휴장일 화면·배당금 쿠폰을 평일에 시험하려고 — 로컬 전용. 배포본에 넣으면 빵장이 닫힌다 */
  if (process.env.MARKET_FORCE_HOLIDAY === 'on') {
    return { open: false, reason: 'holiday', nowLabel, closedFor: '시험', nextOpen: nextOpenLabel(parts.date) };
  }
  if (isClosedDay(parts)) {
    const closedFor = KRX_HOLIDAYS.get(parts.date) ?? '주말';
    return { open: false, reason: 'holiday', nowLabel, closedFor, nextOpen: nextOpenLabel(parts.date) };
  }
  if (hour * 60 + minute < OPEN_HOUR * 60 + OPEN_MINUTE) return { open: false, reason: 'before', nowLabel };
  return { open: true, reason: 'open', nowLabel };
}

/**
 * 오늘 열리는 최대 할인 폭.
 *
 * 구간은 관리자가 화면에서 바꾼다(discount_tiers). 비어 있으면 코드 기본값을 쓴다.
 * 상한 38%는 기업 확인값이라 어떤 설정에서도 넘지 못하게 한 번 더 막는다.
 */
export function depthFor(absChangePct: number, tiers: DiscountTier[]): DiscountTier {
  const sorted = [...tiers].sort((a, b) => b.minAbsChange - a.minAbsChange);
  const hit = sorted.find(tier => absChangePct >= tier.minAbsChange) ?? sorted[sorted.length - 1];
  return { ...hit, rate: Math.min(hit.rate, MAX_DISCOUNT_RATE) };
}

/**
 * 한정 수량 기본값.
 *
 * 관리자가 가격별 수량을 직접 넣는 화면은 다음 단계다. 그때까지는
 * "재고가 많은 상품일수록 깊은 호가까지 물량이 있다"는 규칙만 코드로 흉내낸다.
 * 깊은 호가로 갈수록 줄어드는 형태만 유지하면 화면의 뜻은 전달된다.
 */
function defaultQuantity(index: number, inStock: boolean): number {
  if (!inStock) return 0;
  return [0, 12, 4, 1][index] ?? 1;
}

/** 구간 할인 폭들을 얕은 것부터 정렬한 호가 단계 목록 */
export function depthSteps(tiers: DiscountTier[]): number[] {
  return [...new Set(tiers.map(tier => Math.min(tier.rate, MAX_DISCOUNT_RATE)))].sort((a, b) => a - b);
}

/**
 * 특정 할인 폭 칸의 오늘 배정 수량.
 *
 * /api/fill이 클라이언트가 보낸 수량을 믿지 않고 서버에서 다시 계산할 때 쓴다.
 * 단계 인덱스는 전체 단계 목록에서의 위치다 — 오늘 몇 칸이 열렸는지와 무관하게
 * 같은 폭은 항상 같은 수량을 가진다.
 */
export function quantityForDepth(product: Product, depth: number, tiers: DiscountTier[]): number | null {
  const index = depthSteps(tiers).findIndex(step => Math.abs(step - depth) < 1e-9);
  if (index < 0) return null;
  if (index === 0) return null; // 즉시구매 칸은 수량 제한이 없다
  return defaultQuantity(index, product.inStock);
}

/** 오늘 체결된 수를 알려주는 함수. (productNo, depth) → 건수 */
export type FilledLookup = (productNo: number, depth: number) => number;

/** 한 상품의 호가표. 오늘 열린 폭보다 깊은 칸은 만들지 않는다. */
export function buildBook(
  product: Product,
  tiers: DiscountTier[],
  maxDepth: number,
  filledFor: FilledLookup = () => 0,
): ProductBook {
  /* 구간의 할인 폭들이 그대로 호가 단계가 된다. 오늘 열린 폭 이하만 남긴다.
     등락이 작은 날은 칸이 하나뿐일 수도 있다 — 그때도 즉시구매는 있다. */
  const depths = depthSteps(tiers).filter(depth => depth <= maxDepth + 1e-9);

  const ticks: Tick[] = depths.map((depth, index) => ({
    depth,
    price: floorTo10(product.price * (1 - depth)),
    instant: index === 0,
    quantity: index === 0 ? null : defaultQuantity(index, product.inStock),
    filled: index === 0 ? 0 : filledFor(product.productNo, depth),
    label: index === 0 ? '지금 바로 구매' : `한정 ${defaultQuantity(index, product.inStock)}개`,
  }));

  return {
    product,
    ticks,
    floorPrice: ticks.length ? ticks[ticks.length - 1].price : product.price,
  };
}

export interface BreadMarket {
  date: string;
  /** KOSPI 일간 절대등락률 (%) */
  absChangePct: number;
  /** 부호까지 있는 원래 등락률 — 화면에 같이 보여준다 */
  changePct: number;
  kospi: number;
  /** 오늘 적용된 구간 */
  tier: DiscountTier;
  hours: MarketHours;
  books: ProductBook[];
}

export function buildBreadMarket(
  market: MarketSnapshot,
  tiers: DiscountTier[],
  at: Date = new Date(),
  products: Product[] = PRODUCTS,
  filledFor: FilledLookup = () => 0,
): BreadMarket {
  const absChangePct = Math.abs(market.kospi.changePct);
  const tier = depthFor(absChangePct, tiers);

  return {
    date: market.date,
    absChangePct,
    changePct: market.kospi.changePct,
    kospi: market.kospi.value,
    tier,
    hours: marketHours(at),
    /* 재고 있는 상품을 먼저, 그 안에서는 정가 높은 순 — 할인 폭이 큰 것이 위로 온다 */
    books: [...products]
      .sort((a, b) => Number(b.inStock) - Number(a.inStock) || b.price - a.price)
      .map(product => buildBook(product, tiers, tier.rate, filledFor)),
  };
}
