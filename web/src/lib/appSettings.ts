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

export const AOV_KEY = 'dividend_aov';
export const DIVIDEND_RATE_KEY = 'dividend_rate';
export const DIVIDEND_BUDGET_KEY = 'dividend_budget';

/** 상품가 분포(1,500~42,000원)와 배송비를 감안한 임시값. 실측 붙으면 교체한다 */
export const AOV_DEFAULT = 20000;
/** 평일 할인 기대값 약 15%의 3분의 2. 평일이 유리한 날이 연 192일(78%)이 되는 지점 */
export const DIVIDEND_RATE_DEFAULT = 0.10;
export const DIVIDEND_BUDGET_DEFAULT = 500000;

const asMoney = (max: number) => (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= max ? Math.round(raw) : null;

const asRate = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= MAX_DIVIDEND_RATE ? raw : null;

export const loadAov = () => loadSetting(AOV_KEY, AOV_DEFAULT, asMoney(1_000_000));
export const loadDividendRate = () => loadSetting(DIVIDEND_RATE_KEY, DIVIDEND_RATE_DEFAULT, asRate);
export const loadDividendBudget = () => loadSetting(DIVIDEND_BUDGET_KEY, DIVIDEND_BUDGET_DEFAULT, asMoney(100_000_000));

export interface DividendPolicy {
  aov: number;
  rate: number;
  budget: number;
  /** 3점(만점) 유저가 한 주에 받는 최대 배당 */
  weeklyMax: number;
  /** 점수별 지급액 — 1·2·3점. 만점의 50 / 80 / 100% */
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
    tiers: [step(0.5), step(0.8), weeklyMax],
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
