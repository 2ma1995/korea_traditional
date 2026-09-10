import { computeCostIndex } from './costIndex';

/**
 * 시장 데이터 수집.
 *
 * 인증키가 필요 없는 소스만 쓴다 — 외부 데이터 예산 팀당 $50 제약을 지킨다.
 *
 *   코스피              네이버 금융 폴링 API (무지연) → 실패 시 Yahoo ^KS11 폴백
 *   환율·원자재         Yahoo Finance (비공식 엔드포인트, 키 없음)
 *   서울 기온           Open-Meteo (키 없음, 비상업 무료)
 *
 * 주의: Yahoo Finance는 비공식 엔드포인트다. 데모·발표에는 문제없지만
 *       실서비스 전환 시 공공데이터포털 공식 API로 교체해야 한다.
 *
 * 모든 호출은 실패해도 샘플로 폴백한다. 발표 중 네트워크가 끊겨도 화면은 뜬다.
 */

const REVALIDATE_SECONDS = 60; // 1분 — 장중에 화면이 실제로 움직이는 게 보여야 한다

export interface Quote {
  value: number;
  changePct: number;
  /** 실제 API에서 받아온 값인가 */
  live: boolean;
  /** 원본 시세의 마지막 갱신 시각 (epoch ms). 장 마감 후에는 종가 시각이 남는다. */
  updatedAt: number | null;
}

export interface MarketSnapshot {
  /** YYYY-MM-DD */
  date: string;
  kospi: Quote;
  fxUsdKrw: Quote;
  /** 서울 현재 기온 (°C) */
  tempC: number;
  tempLive: boolean;
  commodities: {
    cocoa: Quote;
    wheat: Quote;
    sugar: Quote;
    corn: Quote;
  };
  /** 원료 바스켓 가중 원가 상승률 (%) — 가드레일용. 화면에는 노출하지 않는다. */
  costIndexPct: number;
  /** 원가 지수가 커버하는 원료 비중 (0~1) */
  costCoverage: number;
  /** 이 스냅샷을 만든 시각 (epoch ms) */
  fetchedAt: number;
  /** 한국 증시 개장 여부. 네이버 marketStatus 기준, 실패 시 null */
  kospiMarketOpen: boolean | null;
}

export function toDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ------------------------------------------------------------------ */
/* 샘플 폴백                                                            */
/* ------------------------------------------------------------------ */

function seedFrom(dateStr: string) {
  let h = 0;
  for (const ch of dateStr) h = (h * 31 + ch.charCodeAt(0)) % 100_000;
  return h;
}

function rand(seed: number, salt: number) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ------------------------------------------------------------------ */
/* 외부 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * 캐시 정책.
 *
 * 페이지 렌더는 1분 캐시로 외부 API 호출을 아끼고, 초단위 폴링(/api/kospi)은
 * 캐시를 건너뛰고 매번 새로 받아온다. 캐시를 태우면 폴링해도 같은 값만 돌아온다.
 */
function cacheOption(fresh: boolean) {
  return fresh
    ? ({ cache: 'no-store' } as const)
    : ({ next: { revalidate: REVALIDATE_SECONDS } } as const);
}

async function fetchYahoo(symbol: string, fresh = false): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      ...cacheOption(fresh),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const value = meta?.regularMarketPrice;
    const changePct = meta?.regularMarketChangePercent;
    if (typeof value !== 'number' || typeof changePct !== 'number') return null;

    const t = meta?.regularMarketTime;
    return {
      value: Number(value.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      live: true,
      updatedAt: typeof t === 'number' ? t * 1000 : null,
    };
  } catch {
    return null;
  }
}

/**
 * 코스피 — 네이버 금융 폴링 API.
 *
 * Yahoo 대비 장점: 응답에 delayTime: 0 (무지연)이 명시되고, marketStatus로
 * 장 개장 여부를 서버에서 직접 알 수 있다. 시각도 localTradedAt으로 정확히 온다.
 *
 * ⚠️ Yahoo와 마찬가지로 비공식 엔드포인트다. Referer 헤더가 필요하고,
 *    실서비스 전환 시에는 한국거래소 공식 데이터로 교체해야 한다.
 *    실패하면 Yahoo ^KS11로 폴백한다.
 */
async function fetchNaverKospi(fresh = false): Promise<(Quote & { marketOpen: boolean }) | null> {
  try {
    const res = await fetch(
      'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' },
        ...cacheOption(fresh),
      },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const d = json?.datas?.[0];
    const value = Number(d?.closePriceRaw);
    const ratio = Number(d?.fluctuationsRatioRaw);
    if (!Number.isFinite(value) || !Number.isFinite(ratio)) return null;

    // fluctuationsRatio는 부호가 없다. 방향은 compareToPreviousPrice로 판단한다.
    // 코드 1=상한 2=상승 3=보합 4=하한 5=하락
    const code = String(d?.compareToPreviousPrice?.code ?? '');
    const sign = code === '4' || code === '5' ? -1 : code === '3' ? 0 : 1;

    const traded = d?.localTradedAt ? Date.parse(d.localTradedAt) : NaN;

    return {
      value: Number(value.toFixed(2)),
      changePct: Number((ratio * sign).toFixed(2)),
      live: true,
      updatedAt: Number.isFinite(traded) ? traded : null,
      marketOpen: d?.marketStatus === 'OPEN',
    };
  } catch {
    return null;
  }
}

async function fetchSeoulTemp(): Promise<number | null> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m&timezone=Asia%2FSeoul',
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const t = json?.current?.temperature_2m;
    return typeof t === 'number' ? Math.round(t) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                            */
/* ------------------------------------------------------------------ */

/** 초단위 폴링으로 내려주는 코스피 한 틱 */
export interface KospiTick extends Quote {
  /** 네이버 marketStatus 기준 개장 여부. Yahoo 폴백이면 null */
  marketOpen: boolean | null;
  /** 이 틱을 받아온 시각 (epoch ms) */
  fetchedAt: number;
}

/**
 * 코스피만 캐시 없이 다시 받아온다 — /api/kospi 전용.
 *
 * 화면 전체를 다시 그리지 않고 시세 숫자만 갈아끼우기 위한 경로다.
 * 두 소스가 모두 실패하면 null을 돌려준다. 이때 클라이언트는
 * 마지막으로 성공한 값을 그대로 유지한다 (샘플 값으로 튀지 않는다).
 */
export async function fetchKospiTick(): Promise<KospiTick | null> {
  const naver = await fetchNaverKospi(true);
  const quote = naver ?? (await fetchYahoo('^KS11', true));
  if (!quote) return null;

  return {
    ...quote,
    marketOpen: naver?.marketOpen ?? null,
    fetchedAt: Date.now(),
  };
}

export async function getMarketSnapshot(date = new Date()): Promise<MarketSnapshot> {
  const dateStr = toDateString(date);
  const seed = seedFrom(dateStr);

  const [naverKospi, yahooKospi, fx, cocoa, wheat, sugar, corn, temp] = await Promise.all([
    fetchNaverKospi(),
    fetchYahoo('^KS11'),
    fetchYahoo('KRW=X'),
    fetchYahoo('CC=F'),
    fetchYahoo('ZW=F'),
    fetchYahoo('SB=F'),
    fetchYahoo('ZC=F'),
    fetchSeoulTemp(),
  ]);

  /** 실패 시 샘플로 채운다 */
  const fallback = (salt: number, base: number, spread: number): Quote => ({
    value: Number((base + (rand(seed, salt) - 0.5) * spread).toFixed(2)),
    changePct: Number(((rand(seed, salt + 50) - 0.5) * 4).toFixed(2)),
    live: false,
    updatedAt: null,
  });

  // 네이버가 무지연이라 1순위, 실패하면 Yahoo로 폴백한다
  const kospi = naverKospi ?? yahooKospi;

  const snapshot = {
    kospi: kospi ?? fallback(1, 2800, 120),
    fxUsdKrw: fx ?? fallback(2, 1380, 30),
    commodities: {
      cocoa: cocoa ?? fallback(3, 5900, 400),
      wheat: wheat ?? fallback(4, 745, 40),
      sugar: sugar ?? fallback(5, 18, 2),
      corn: corn ?? fallback(6, 530, 30),
    },
  };

  const cost = computeCostIndex({
    fx: snapshot.fxUsdKrw.changePct,
    cocoa: snapshot.commodities.cocoa.changePct,
    corn: snapshot.commodities.corn.changePct,
    wheat: snapshot.commodities.wheat.changePct,
  });

  return {
    date: dateStr,
    ...snapshot,
    tempC: temp ?? Math.round(18 + rand(seed, 7) * 16),
    tempLive: temp !== null,
    costIndexPct: cost.changePct,
    costCoverage: cost.coverage,
    fetchedAt: Date.now(),
    kospiMarketOpen: naverKospi?.marketOpen ?? null,
  };
}
