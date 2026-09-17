/**
 * 시장 데이터 수집.
 *
 * 인증키가 필요 없는 소스만 쓴다 — 외부 데이터 예산 팀당 $50 제약을 지킨다.
 *
 *   코스피              네이버 금융 폴링 API (무지연) → 실패 시 Yahoo ^KS11 폴백
 *   원/달러 환율        Yahoo Finance (비공식 엔드포인트, 키 없음) — 화면 표시용
 *   서울 날씨           Open-Meteo (키 없음, 비상업 무료) — 화면 표시용
 *
 * 할인율을 정하는 것은 코스피 하나다. 환율·날씨는 "오늘의 시장" 화면을 채우는
 * 부가 정보이고 계산에 관여하지 않는다. 원자재(코코아·밀·설탕·옥수수) 수집과
 * 원가 지수는 폐기했다 — 원가를 가격 근거로 쓰지 않기로 확정했다.
 *
 * 주의: Yahoo Finance는 비공식 엔드포인트다. 데모·발표에는 문제없지만
 *       실서비스 전환 시 공공데이터포털 공식 API로 교체해야 한다.
 *
 * 모든 호출은 실패해도 샘플로 폴백한다. 발표 중 네트워크가 끊겨도 화면은 뜬다.
 */

const REVALIDATE_SECONDS = 60; // 1분 — 페이지 스냅샷
/** 폴링 응답을 공유하는 시간. 화면 갱신 주기와 같게 둔다 */
const TICK_TTL_MS = 1000;

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
  /** WMO 날씨 코드 (Open-Meteo). 아이콘 선택에 쓴다. 실패 시 null */
  weatherCode: number | null;
  /** 낮인가. 해/달 아이콘을 가른다 */
  isDay: boolean;
  /** 원/달러 최근 한 달 종가. 스파크라인용. 실패 시 빈 배열 */
  fxSeries: number[];
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
 * 페이지 렌더는 1분 캐시로 외부 API 호출을 아낀다.
 *
 * 초단위 폴링(/api/kospi)은 여기서 캐시를 끄고, 대신 fetchKospiTick이
 * 직접 1초를 물고 있는다. Next의 fetch 캐시는 라우트 핸들러에서 동작하지
 * 않는 것을 실측했다 (fetchKospiTick 주석 참고).
 */
function cacheOption(tick: boolean) {
  return tick
    ? ({ cache: 'no-store' } as const)
    : ({ next: { revalidate: REVALIDATE_SECONDS } } as const);
}

interface YahooQuote extends Quote {
  /** 기간 내 종가. 빈 값(휴장)은 걸러낸다 */
  series: number[];
  /** series와 같은 길이의 epoch(초). 차트 툴팁의 날짜에 쓴다 */
  timestamps: number[];
  /** Yahoo가 주는 기간 직전 종가. 첫 점의 등락률 계산에 쓴다 */
  chartPreviousClose: number | null;
}

async function fetchYahoo(symbol: string, tick = false, range = '5d', interval = '1d'): Promise<YahooQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      ...cacheOption(tick),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const value = meta?.regularMarketPrice;
    const changePct = meta?.regularMarketChangePercent;
    if (typeof value !== 'number' || typeof changePct !== 'number') return null;

    const closes: unknown[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const stamps: unknown[] = json?.chart?.result?.[0]?.timestamp ?? [];
    /* 종가와 시각을 짝으로 걸러야 한다 — 따로 걸러내면 휴장·결측에서 어긋난다 */
    const series: number[] = [], timestamps: number[] = [];
    closes.forEach((c, i) => {
      if (typeof c === 'number' && Number.isFinite(c)) { series.push(c); timestamps.push(Number(stamps[i]) || 0); }
    });
    const cpc = meta?.chartPreviousClose;

    const t = meta?.regularMarketTime;
    return {
      value: Number(value.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      live: true,
      updatedAt: typeof t === 'number' ? t * 1000 : null,
      series,
      timestamps,
      chartPreviousClose: typeof cpc === 'number' ? cpc : null,
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
async function fetchNaverKospi(tick = false): Promise<(Quote & { marketOpen: boolean }) | null> {
  try {
    const res = await fetch(
      'https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI',
      {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' },
        ...cacheOption(tick),
      },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const d = json?.datas?.[0];
    const value = Number(d?.closePriceRaw);
    const ratio = Number(d?.fluctuationsRatioRaw);
    if (!Number.isFinite(value) || !Number.isFinite(ratio)) return null;

    // ⚠️ fluctuationsRatioRaw는 부호를 가지고 온다 — 하락일에 "-2.01"로 온다.
    //    (2026-09-11 실측. 예전 주석은 "부호가 없다"고 잘못 적혀 있었고,
    //     그 가정으로 음수에 -1을 곱해 하락일이 상승으로 뒤집혔다.)
    //    부호는 compareToPreviousPrice를 믿고, 크기는 절댓값만 쓴다.
    //    이러면 원본이 부호를 주든 안 주든 결과가 같다.
    // 코드 1=상한 2=상승 3=보합 4=하한 5=하락
    const code = String(d?.compareToPreviousPrice?.code ?? '');
    const sign = code === '4' || code === '5' ? -1 : code === '3' ? 0 : 1;

    const traded = d?.localTradedAt ? Date.parse(d.localTradedAt) : NaN;

    return {
      value: Number(value.toFixed(2)),
      changePct: Number((Math.abs(ratio) * sign).toFixed(2)),
      live: true,
      updatedAt: Number.isFinite(traded) ? traded : null,
      marketOpen: d?.marketStatus === 'OPEN',
    };
  } catch {
    return null;
  }
}

interface SeoulWeather {
  tempC: number;
  /** WMO 코드 — 0 맑음, 3 흐림, 61 비, 71 눈 … */
  weatherCode: number | null;
  isDay: boolean;
}

async function fetchSeoulWeather(): Promise<SeoulWeather | null> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780' +
        '&current=temperature_2m,weather_code,is_day&timezone=Asia%2FSeoul',
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const t = json?.current?.temperature_2m;
    if (typeof t !== 'number') return null;

    const code = json?.current?.weather_code;
    return {
      tempC: Math.round(t),
      weatherCode: typeof code === 'number' ? code : null,
      // is_day는 1/0으로 온다. 값이 없으면 낮으로 본다
      isDay: json?.current?.is_day !== 0,
    };
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

/* ------------------------------------------------------------------ */
/* 초단위 폴링 — 1초 공유 캐시                                          */
/* ------------------------------------------------------------------ */

/**
 * 왜 직접 캐시를 만들었나.
 *
 * 화면은 1초마다 /api/kospi를 부른다. 이 함수가 그때마다 네이버를 부르면
 * 호출량이 "보고 있는 탭 수 × 초당 1회"가 된다 — 탭 하나가 시간당 3,600회,
 * 접속자가 30명이면 10.8만회다. 비공식 엔드포인트에 그 정도를 보내면
 * 스크래핑으로 보여 차단당한다.
 *
 * Next의 fetch 캐시(next.revalidate)로 묶으려 했으나 라우트 핸들러에서
 * 동작하지 않았다. 프로덕션 빌드에서 요청 22회를 보냈는데 네이버 호출이
 * 21회 나갔고, dynamic='force-dynamic'을 떼도, fetchCache='default-cache'를
 * 붙여도 같았다. 그래서 프레임워크에 맡기지 않고 여기서 1초를 물고 있는다.
 *
 * 두 가지를 같이 막는다.
 *   cached   — 1초 안에 다시 물으면 같은 값을 준다
 *   inFlight — 캐시가 빈 순간에 요청이 몰려도 호출은 하나만 나간다.
 *              이게 없으면 30명이 동시에 들어온 첫 순간에 30번 호출된다.
 *
 * 한계 — 서버 인스턴스마다 따로 물고 있으므로, 인스턴스가 N개면 초당 N회다.
 * 그래도 "탭 수만큼"과는 차원이 다르다.
 */
let cachedTick: { at: number; tick: KospiTick | null } | null = null;
let inFlightTick: Promise<KospiTick | null> | null = null;

export async function fetchKospiTick(): Promise<KospiTick | null> {
  if (cachedTick && Date.now() - cachedTick.at < TICK_TTL_MS) return cachedTick.tick;
  if (inFlightTick) return inFlightTick;

  inFlightTick = (async () => {
    try {
      const naver = await fetchNaverKospi(true);
      const quote = naver ?? (await fetchYahoo('^KS11', true));
      const tick: KospiTick | null = quote
        ? { ...quote, marketOpen: naver?.marketOpen ?? null, fetchedAt: Date.now() }
        : null;
      // 실패(null)도 1초 물고 있는다 — 외부가 죽었을 때 재시도 폭주를 막는다
      cachedTick = { at: Date.now(), tick };
      return tick;
    } finally {
      inFlightTick = null;
    }
  })();

  return inFlightTick;
}

export async function getMarketSnapshot(date = new Date()): Promise<MarketSnapshot> {
  const dateStr = toDateString(date);
  const seed = seedFrom(dateStr);

  const [naverKospi, yahooKospi, fx, weather] = await Promise.all([
    fetchNaverKospi(),
    fetchYahoo('^KS11'),
    // 환율은 한 달치를 받는다 — 스파크라인에 5일은 너무 짧다
    fetchYahoo('KRW=X', false, '1mo'),
    fetchSeoulWeather(),
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

  return {
    date: dateStr,
    kospi: kospi ?? fallback(1, 2800, 120),
    fxUsdKrw: fx ?? fallback(2, 1380, 30),
    tempC: weather?.tempC ?? Math.round(18 + rand(seed, 7) * 16),
    tempLive: weather !== null,
    weatherCode: weather?.weatherCode ?? null,
    isDay: weather?.isDay ?? true,
    fxSeries: fx?.series ?? [],
    fetchedAt: Date.now(),
    kospiMarketOpen: naverKospi?.marketOpen ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* 개별 종목 시세 — 관심 종목 경로                                      */
/* ------------------------------------------------------------------ */

/**
 * 관심 종목 한 개의 오늘 등락률.
 *
 * 손님이 종목을 고를 때만 불린다(초당 폴링이 아니다). 그래도 같은 종목을
 * 여러 명이 동시에 고를 수 있어 30초 공유 캐시를 둔다 — 비공식 엔드포인트라
 * 호출량은 아낄수록 좋고, 종목 등락률은 30초 안에 자리를 바꿀 만큼 변하지 않는다.
 *
 * Next의 fetch 캐시는 라우트 핸들러에서 동작하지 않는 것을 이 저장소에서
 * 이미 실측했다(fetchKospiTick 주석). 그래서 여기서도 직접 물고 있는다.
 */
/**
 * 5초 — 장중에 내 빵값이 뛰는 걸 보여주려면 30초는 너무 느렸다.
 * 화면이 5초마다 물어도 같은 종목은 서버가 5초에 한 번만 외부에 나간다.
 */
const SYMBOL_TTL_MS = 5_000;

/** 오늘 분봉 종가까지 포함한 종목 시세. 스파크라인용 */
export interface SymbolQuote extends Quote {
  series: number[];
}

const symbolCache = new Map<string, { at: number; quote: SymbolQuote | null }>();

export async function fetchSymbolQuote(symbol: string): Promise<SymbolQuote | null> {
  const hit = symbolCache.get(symbol);
  if (hit && Date.now() - hit.at < SYMBOL_TTL_MS) return hit.quote;

  /* 1일 5분봉 — 장중엔 오늘 흐름, 장 마감 후엔 마지막 거래일 흐름이 온다 */
  const raw = await fetchYahoo(symbol, true, '1d', '5m');
  const quote: SymbolQuote | null = raw
    ? { value: raw.value, changePct: raw.changePct, live: raw.live, updatedAt: raw.updatedAt, series: raw.series }
    : null;

  // 실패(null)도 캐시한다 — 외부가 죽었을 때 재시도가 몰리지 않게 한다
  symbolCache.set(symbol, { at: Date.now(), quote });
  return quote;
}

/**
 * KST 기준 오늘 날짜 (YYYY-MM-DD).
 *
 * toDateString()은 서버 로컬 시간을 쓴다. Vercel은 UTC라서 빵장이 열려 있는
 * 20:00~24:00 KST 중 일부가 전날로 기록될 수 있다. 날짜로 묶는 집계는 이걸 쓴다.
 */
export function seoulDateString(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return parts; // en-CA는 YYYY-MM-DD로 준다
}

/* ------------------------------------------------------------------ */
/* 코스피 기간 차트 — 1일 · 1개월 · 1년                                 */
/* ------------------------------------------------------------------ */

export type KospiRange = '1d' | '5d' | '1mo' | '3mo' | '1y';
export interface HistoryPoint { t: number; v: number }
export interface KospiHistory { points: HistoryPoint[]; prevClose: number | null }

/* 짧은 기간은 자주, 긴 기간은 드물게 다시 받는다 */
const HIST_TTL_MS: Record<KospiRange, number> = { '1d': 30_000, '5d': 60_000, '1mo': 60_000, '3mo': 300_000, '1y': 300_000 };
/* [range, interval] — 1주는 30분봉이라 하루 안 흐름도 남는다 */
const HIST_ARGS: Record<KospiRange, [string, string]> = {
  '1d': ['1d', '5m'], '5d': ['5d', '30m'], '1mo': ['1mo', '1d'], '3mo': ['3mo', '1d'], '1y': ['1y', '1d'],
};
const histCache = new Map<KospiRange, { at: number; data: KospiHistory | null }>();

/**
 * 기간별 코스피 종가 + 시각. 차트의 1일/1개월/1년 탭이 쓴다.
 * 점을 누르면 그날 등락률로 "그날이었다면 내 관심빵이 얼마였을지"를 보여주는 데 쓴다.
 */
/**
 * 당일 분봉 — 네이버 모바일 차트 API.
 *
 * Yahoo ^KS11 분봉은 15:00봉에서 끊긴다(5m·1m·15m 모두). 장은 15:30에 끝나므로
 * 15:05~15:30이 통째로 없고, 그래서 선이 15:00에서 멈추거나 억지로 이어야 했다.
 * 네이버는 09:00~15:32를 1분 단위로 전부 준다(마지막 값이 종가와 일치).
 *
 * ⚠️ 비공식 엔드포인트다. Referer가 필요하고, 실서비스 전환 시 금융위 지수시세정보
 *    API로 교체해야 한다. 실패하면 Yahoo 5분봉으로 폴백한다(그때는 15:00까지만 나온다).
 */
async function fetchNaverIntraday(): Promise<KospiHistory | null> {
  try {
    const res = await fetch('https://api.stock.naver.com/chart/domestic/index/KOSPI?periodType=day', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com/' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rows = json?.priceInfos;
    if (!Array.isArray(rows) || !rows.length) return null;

    /* localDateTime은 'YYYYMMDDHHmmss' (KST). epoch 초로 바꾼다 */
    const points: HistoryPoint[] = [];
    for (const row of rows) {
      const d = String(row?.localDateTime ?? '');
      const v = Number(row?.currentPrice);
      if (d.length < 12 || !Number.isFinite(v)) continue;
      const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:${d.slice(10, 12)}:00+09:00`;
      const t = Date.parse(iso);
      if (Number.isFinite(t)) points.push({ t: Math.floor(t / 1000), v });
    }
    if (points.length < 2) return null;
    /* 전일 종가는 이 응답에 없다 — 실시간 틱의 등락률로 되돌려 계산한다 */
    const tick = await fetchNaverKospi(true);
    const prevClose = tick ? tick.value / (1 + tick.changePct / 100) : null;
    return { points, prevClose };
  } catch {
    return null;
  }
}

export async function fetchKospiHistory(range: KospiRange): Promise<KospiHistory | null> {
  const hit = histCache.get(range);
  if (hit && Date.now() - hit.at < HIST_TTL_MS[range]) return hit.data;

  let data: KospiHistory | null = null;
  /* 당일은 네이버(15:30까지), 기간은 Yahoo 일봉 */
  if (range === '1d') data = await fetchNaverIntraday();
  if (!data) {
    const [r, interval] = HIST_ARGS[range];
    const raw = await fetchYahoo('^KS11', true, r, interval);
    data = raw ? { points: raw.series.map((v, i) => ({ t: raw.timestamps[i], v })), prevClose: raw.chartPreviousClose } : null;
  }
  histCache.set(range, { at: Date.now(), data });
  return data;
}
