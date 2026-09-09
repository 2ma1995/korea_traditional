import { SEASONAL_INGREDIENTS } from '@/data/seasonalIngredients';

/**
 * 국산 농산물 소매 시세 — 공공데이터포털
 * 한국농수산식품유통공사(aT) 전국 공영도매시장 실시간 경매정보
 *
 *   GET https://apis.data.go.kr/B552845/recent/price
 *
 * 소매(se_nm='소매') 레코드만 쓴다. 중도매 가격은 소비자 체감과 거리가 멀다.
 *
 * ⚠️ 이 API에는 단종된 품종의 오래된 레코드가 그대로 남아 있다.
 *    (예: 델라웨어 포도 조사일 2011년, 톰슨 호주 2019년)
 *    반드시 조사일 필터를 걸어야 한다. 안 걸면 15년 전 가격으로 할인율을 계산하게 된다.
 */

const ENDPOINT = 'https://apis.data.go.kr/B552845/recent/price';
const REVALIDATE_SECONDS = 3600; // 1시간 — 원본이 일 단위 갱신이라 더 자주 부를 이유가 없다
const MAX_AGE_DAYS = 30; // 조사일이 이보다 오래된 레코드는 버린다

interface RawItem {
  ctgry_nm: string;
  item_cd: string;
  item_nm: string;
  vrty_nm: string;
  grd_nm: string;
  se_nm: string;
  unit: string;
  unit_sz: string;
  exmn_ymd: string;
  exmn_dd_prc: string;
  dd1_bfr_prc: string | null;
  ww1_bfr_prc: string | null;
  mm1_bfr_prc: string | null;
  yy1_bfr_prc: string | null;
}

export interface ProducePrice {
  /** SeasonalIngredient.code */
  code: string;
  /** 품종명 (캠벨얼리, 홍로 …) */
  variety: string;
  /** 조사일 가격 (원) */
  price: number;
  /** 단위 표시 — "1kg", "10개" */
  unitLabel: string;
  /** 전일 대비 등락률 (%) */
  changeDayPct: number | null;
  /** 전월 대비 등락률 (%) — 제철 신호로는 이쪽이 훨씬 강하다 */
  changeMonthPct: number | null;
  /** 조사일 YYYY-MM-DD */
  examDate: string;
}

/**
 * data.go.kr 인증키는 Encoding/Decoding 두 형태로 발급된다.
 * Encoding 키(%2F 등 포함)를 다시 인코딩하면 이중 인코딩으로 인증에 실패하므로,
 * 이미 인코딩된 키인지 판별해서 그대로 쓴다.
 */
function encodeServiceKey(raw: string) {
  return /%[0-9A-Fa-f]{2}/.test(raw) ? raw : encodeURIComponent(raw);
}

function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctChange(current: number, before: number | null): number | null {
  if (before === null || before === 0) return null;
  return Number((((current - before) / before) * 100).toFixed(1));
}

/** YYYYMMDD → Date */
function parseYmd(ymd: string): Date | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  );
}

function daysBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

/**
 * 재료별 최신 소매 시세를 가져온다.
 * 키가 없거나 호출이 실패하면 빈 Map을 반환한다 — 화면은 "시세 없음"으로 뜨고 죽지 않는다.
 */
export async function fetchProducePrices(now = new Date()): Promise<Map<string, ProducePrice>> {
  const raw = process.env.DATA_GO_KR_KEY?.trim();
  const result = new Map<string, ProducePrice>();
  if (!raw) return result;

  let items: RawItem[];
  try {
    const url =
      `${ENDPOINT}?serviceKey=${encodeServiceKey(raw)}` +
      `&pageNo=1&numOfRows=1000&returnType=json`;
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return result;

    const json = await res.json();
    const list = json?.response?.body?.items?.item;
    if (!Array.isArray(list)) return result;
    items = list as RawItem[];
  } catch {
    return result;
  }

  for (const ing of SEASONAL_INGREDIENTS) {
    const candidates = items
      .filter((r) => r.item_nm === ing.itemName && r.se_nm === '소매')
      .filter((r) => {
        const d = parseYmd(r.exmn_ymd);
        return d !== null && daysBetween(now, d) <= MAX_AGE_DAYS;
      })
      .sort((a, b) => b.exmn_ymd.localeCompare(a.exmn_ymd));

    const row = candidates[0];
    if (!row) continue;

    const price = toNumber(row.exmn_dd_prc);
    if (price === null) continue;

    const ymd = row.exmn_ymd;
    result.set(ing.code, {
      code: ing.code,
      variety: row.vrty_nm,
      price,
      unitLabel: `${row.unit_sz}${row.unit}`,
      changeDayPct: pctChange(price, toNumber(row.dd1_bfr_prc)),
      changeMonthPct: pctChange(price, toNumber(row.mm1_bfr_prc)),
      examDate: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    });
  }

  return result;
}
