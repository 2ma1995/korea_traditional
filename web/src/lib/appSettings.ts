import { supabase } from '@/lib/supabase';

/**
 * 운영 스위치 — 관리자가 화면에서 껐다 켜는 값.
 *
 * 코드 상수(ALWAYS_OPEN · PRICE_SYNC_ENABLED · LINE_MODE)와 역할이 다르다.
 * 그 셋은 켜면 진짜 자사몰 가격이 바뀌는 값이라 관리자 화면에 두면 안 된다.
 * 여기 있는 값은 운영 중에 바뀌어야 하는 것들이다 — 기업이 "이번 시즌은 공모를
 * 쉬겠다"고 하면 배포 없이 꺼야 한다.
 *
 * ⚠️ 저장소가 없으면 메모리로 받는다 — fills·ipo·watches와 같은 방식이다.
 *    표가 없다고 화면이 비면 안 되고, 로컬에서 확인도 못 하게 된다.
 */

/* ── 메모리 폴백 ── */
const memory = new Map<string, unknown>();

/** fills.ts와 같은 판정 — 아직 마이그레이션(0008)을 안 돌렸다는 뜻이다 */
const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

export interface SettingResult<T> {
  value: T;
  /** 저장소에 닿았는가. false면 이번 서버 세션 메모리에만 있다 */
  stored: boolean;
}

/**
 * 값을 읽는다. 없거나 모양이 틀리면 기본값이다.
 *
 * @param parse 저장된 jsonb를 검증한다. 통과 못 하면 null을 돌려 기본값으로 떨어진다.
 */
export async function loadSetting<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | null,
): Promise<SettingResult<T>> {
  const db = supabase();
  if (!db) {
    const seen = memory.get(key);
    return { value: seen === undefined ? fallback : (parse(seen) ?? fallback), stored: false };
  }

  const { data, error } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) {
    if (missingTable(error.code)) {
      const seen = memory.get(key);
      return { value: seen === undefined ? fallback : (parse(seen) ?? fallback), stored: false };
    }
    /* 읽기 실패로 화면이 비면 안 된다. 기본값으로 연다 */
    return { value: fallback, stored: false };
  }
  if (!data) return { value: fallback, stored: true };
  return { value: parse(data.value) ?? fallback, stored: true };
}

/** 값을 쓴다. 저장소가 없으면 메모리에 둔다(서버가 사는 동안만) */
export async function saveSetting(key: string, value: unknown): Promise<SettingResult<unknown>> {
  const db = supabase();
  if (!db) { memory.set(key, value); return { value, stored: false }; }

  const { error } = await db
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    if (missingTable(error.code)) { memory.set(key, value); return { value, stored: false }; }
    throw new Error(`설정 저장 실패: ${error.message}`);
  }
  return { value, stored: true };
}

/* ── 공모주 노출 ────────────────────────────────────────────────────────────
   기본값은 켜짐이다. 기업 답변(설계도 §10 ②)이 오기 전이라도 화면에서 확인은
   할 수 있어야 한다. 끄면 NEXT 섹션이 사라지고 청약 API가 409로 막힌다. */
export const IPO_KEY = 'ipo_enabled';
export const IPO_DEFAULT = true;

const asBool = (raw: unknown): boolean | null => (typeof raw === 'boolean' ? raw : null);

export const loadIpoEnabled = () => loadSetting(IPO_KEY, IPO_DEFAULT, asBool);
export const saveIpoEnabled = (on: boolean) => saveSetting(IPO_KEY, on);

/* ── 주말 배당 ──────────────────────────────────────────────────────────────
   기업이 자기 사업 규모에 맞춰 넣는 값 둘과, 비용 한도 하나다.
   1인 주간 최대 배당은 셋에서 계산해 낸다 — 관리자가 직접 넣지 않는다.
   그건 정책값이 아니라 결과값이고, 직접 넣게 하면 근거 없는 숫자가 박힌다.

     1인 주간 최대 = 평균 객단가 × 목표 할인율

   객단가는 기업만 아는 관측값이다(카페24 주문 이력). 우리는 fills에 visitor가
   없어서 못 잰다 — 붙으면 실측값을 옆에 띄워 '적용'으로 갈아끼우게 한다.

   ⚠️ 목표 할인율을 아무리 올려도 실제 사용은 MAX_DIVIDEND_RATE에서 막힌다.
      DISCOUNT_TIERS를 MAX_DISCOUNT_RATE가 막는 것과 같은 구조다. */

/** 결제금액 대비 배당 사용 상한 — 코드 고정. 관리자가 뚫지 못한다 */
export const MAX_DIVIDEND_RATE = 0.15;

/**
 * 오늘 풀 물량의 상한 — 관리자가 **상품마다** 정한다.
 *
 * 카페24 재고를 그대로 쓰면 "할인가로 몇 개까지 팔 것인가"를 정할 수가 없다.
 * 재고가 300개라고 300개를 5% 할인해 팔 생각은 아니기 때문이다. 그래서 이 값은
 * 재고를 **덮어쓰지 않고 위에서 막는다** — 실제 물량은 둘 중 작은 쪽이다(lib/offers).
 *
 * ⚠️ 카페24 재고를 바꾸지 않는다. 그건 기업이 관리하는 값이고, 우리가 건드리면
 *    같은 숫자를 두 곳에서 관리하게 된다(lib/inventory의 사고가 그것이었다).
 */
export const ALLOTMENT_KEY = 'daily_allotment';

/** 손으로 적어둔 30. 기업이 확정한 값이 아니다(lib/offers.DAILY_ALLOTMENT와 같은 뜻) */
export const ALLOTMENT_DEFAULT = 30;

export const AOV_KEY = 'dividend_aov';
export const DIVIDEND_RATE_KEY = 'dividend_rate';
export const DIVIDEND_BUDGET_KEY = 'dividend_budget';

/**
 * 평균 객단가 — 임시값. 실측이 붙으면 교체한다.
 *
 * 8,000원인 이유는 발표덱에 맞췄기 때문이다. 덱 8장이 주간 최대 800P를 제안하고
 * 9장이 "주문금액의 10%까지 사용"이라 하니, 목표 할인율 10%를 그대로 두면
 * 객단가가 8,000원이어야 800P가 나온다. 빵 두세 개 값이라 액수 자체도 그럴듯하다.
 *
 * ⚠️ 관측값이 아니다. 덱 17장이 "한 달 판매 집계 원본"을 보완 자료로 요구하는 이유가
 *    이것이다 — 기업이 카페24 주문 이력을 주면 그 값으로 갈아끼운다.
 */
export const AOV_DEFAULT = 8000;
/** 평일 할인 기대값 약 15%의 3분의 2. 평일이 유리한 날이 연 192일(78%)이 되는 지점 */
export const DIVIDEND_RATE_DEFAULT = 0.10;
export const DIVIDEND_BUDGET_DEFAULT = 500000;

const asMoney = (max: number) => (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= max ? Math.round(raw) : null;

const asRate = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= MAX_DIVIDEND_RATE ? raw : null;

/** 1 이상 1,000 이하. 0을 허용하면 관리자가 실수로 장을 닫아버릴 수 있다 */
const asCount = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 && raw <= 1000 ? Math.round(raw) : null;

/**
 * 상품별 물량 — 빵마다 다르게 준다.
 *
 * 하나로 묶으면 1,500원짜리 머핀과 42,000원짜리 케이크에 같은 수를 풀게 된다.
 * 여기 없는 상품은 ALLOTMENT_DEFAULT를 쓴다 — 새 빵이 들어와도 0이 되지 않는다.
 */
const asAllotments = (raw: unknown): Record<number, number> | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const productNo = Number(key);
    const count = asCount(value);
    if (Number.isInteger(productNo) && productNo > 0 && count !== null) out[productNo] = count;
  }
  return out;
};

export const loadAllotments = () => loadSetting(ALLOTMENT_KEY, {} as Record<number, number>, asAllotments);

/** 이 상품의 물량. 따로 정한 적 없으면 기본값 */
export const allotmentFor = (byProduct: Record<number, number>, productNo: number) =>
  byProduct[productNo] ?? ALLOTMENT_DEFAULT;

export async function saveAllotmentFor(productNo: unknown, raw: unknown): Promise<Record<number, number>> {
  const no = Number(productNo);
  if (!Number.isInteger(no) || no <= 0) throw new Error('상품 번호가 올바르지 않습니다.');
  const value = asCount(typeof raw === 'string' ? Number(raw) : raw);
  if (value === null) throw new Error('물량은 1 이상 1,000 이하의 숫자여야 합니다.');
  const current = await loadAllotments();
  const next = { ...current.value, [no]: value };
  await saveSetting(ALLOTMENT_KEY, next);
  return next;
}

export const loadAov = () => loadSetting(AOV_KEY, AOV_DEFAULT, asMoney(1_000_000));
export const loadDividendRate = () => loadSetting(DIVIDEND_RATE_KEY, DIVIDEND_RATE_DEFAULT, asRate);
export const loadDividendBudget = () => loadSetting(DIVIDEND_BUDGET_KEY, DIVIDEND_BUDGET_DEFAULT, asMoney(100_000_000));

export interface DividendPolicy {
  aov: number;
  rate: number;
  budget: number;
  /** 3점(만점) 유저가 한 주에 받는 최대 배당 */
  weeklyMax: number;
  /**
   * 점수별 지급액 — 1·2·3점. 만점의 37.5 / 62.5 / 100%.
   *
   * 발표덱 8장의 BASIC 300P · PLUS 500P · PRIME 800P에 맞춘 비율이다.
   * 덱은 점수 구간(2–3점 / 4–5점 / 6점 이상)으로 등급을 나누지만 그건 항목이
   * 다섯일 때 이야기고, 실제로 셀 수 있는 항목은 셋이라(lib/dividend) 1·2·3점이
   * 그대로 세 등급이 된다. 금액은 덱과 같다.
   */
  tiers: [number, number, number];
  stored: boolean;
}

/** 배당 정책 한 벌. 화면과 지급 계산이 같은 값을 보도록 여기 한 곳에서만 만든다 */
export async function loadDividendPolicy(): Promise<DividendPolicy> {
  const [aov, rate, budget] = await Promise.all([loadAov(), loadDividendRate(), loadDividendBudget()]);
  const weeklyMax = Math.round((aov.value * rate.value) / 100) * 100;   // 100P 단위로 끊는다
  const step = (ratio: number) => Math.round((weeklyMax * ratio) / 100) * 100;
  return {
    aov: aov.value,
    rate: rate.value,
    budget: budget.value,
    weeklyMax,
    tiers: [step(0.375), step(0.625), weeklyMax],
    stored: aov.stored && rate.stored && budget.stored,
  };
}

export async function saveDividendPolicy(next: { aov?: unknown; rate?: unknown; budget?: unknown }) {
  const aov = asMoney(1_000_000)(next.aov);
  const rate = asRate(next.rate);
  const budget = asMoney(100_000_000)(next.budget);
  if (aov === null) throw new Error('평균 객단가는 0원 이상 100만원 이하 숫자여야 합니다.');
  if (rate === null) throw new Error(`목표 할인율은 0 초과 ${Math.round(MAX_DIVIDEND_RATE * 100)}% 이하여야 합니다.`);
  if (budget === null) throw new Error('주간 예산은 0원 이상이어야 합니다.');
  await Promise.all([
    saveSetting(AOV_KEY, aov),
    saveSetting(DIVIDEND_RATE_KEY, rate),
    saveSetting(DIVIDEND_BUDGET_KEY, budget),
  ]);
  return loadDividendPolicy();
}
