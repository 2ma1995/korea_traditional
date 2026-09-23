import { supabase } from '@/lib/supabase';
import { seoulDateString } from '@/lib/market';
import type { FilledLookup } from '@/lib/orderbook';

/**
 * 한정 호가 체결 — 선착순 즉시 (A안).
 *
 * "이 가격에 걸기"는 누른 순간 되거나 안 된다. 남은 수량이 있으면 체결,
 * 없으면 미체결이고 내일 우선권 안내로 넘어간다.
 *
 * 체결은 예약 확정이다. 실제 결제는 자사몰에서 하고, 체결가 적용은 카페24
 * 쿠폰 발급이 필요하다(기업 확인 대기). 그 전까지는 화면에 그 사실을 밝힌다.
 *
 * ⚠️ 저장소가 없으면 메모리로 받는다.
 *
 * 예전에는 `if (!db) return { filled: false }` 였다. 그래서 Supabase가 없거나
 * fills 표가 아직 만들어지지 않으면 **모든 구매가 미체결**로 떨어지고, 화면은
 * 그것을 "한발 늦었어요, 오늘 이 빵은 다 나갔습니다"로 말했다. 품절이 아니라
 * 저장소에 닿지 못한 것인데 손님에게는 품절이라고 거짓말을 한 셈이다.
 * 로컬 테스트도 불가능했다.
 *
 * market.ts·ipo.ts와 같은 방식으로 메모리 폴백을 둔다. 서버 인스턴스가 사는
 * 동안만 유지되고, 닿았는지 여부(stored)를 결과에 실어 화면이 밝힐 수 있게 한다.
 */

/* ── 메모리 폴백. 키는 "날짜:상품:폭" ── */
const memory = new Map<string, number>();
/* 저장소가 없을 때 쓰는 메모리 키. 옵션까지 넣어야 DB와 같은 단위로 센다(0015) */
const memKey = (day: string, productNo: number, depth: number, unit: string | null = null) =>
  `${day}:${productNo}:${depth.toFixed(3)}:${unit ?? ''}`;

/**
 * 표가 없는 오류인가.
 *
 * PostgREST는 스키마 캐시에 표가 없으면 PGRST205를 준다
 * ("Could not find the table 'public.fills' in the schema cache").
 * 42P01은 Postgres의 undefined_table이다. 둘 다 "아직 마이그레이션을 안 돌렸다"는
 * 뜻이므로 예외로 터뜨리지 않고 메모리로 받는다. 그 밖의 오류는 진짜 문제라 던진다.
 */
const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';
/** 열이 없다 — 0012를 아직 안 돌렸다는 뜻이다. 기한 없이 예전처럼 동작한다 */
const missingColumn = (code?: string) => code === '42703' || code === 'PGRST204';

/** 0012를 돌렸는가. 한 번 확인하면 들고 있는다 — 매 요청마다 두 번 물어볼 이유가 없다 */
/* 자리를 몇 칸까지 밀어 올려 볼 것인가. 물량(보통 30)보다 넉넉히 두되 무한은 아니다 —
   진짜로 다 찬 경우에는 quantity에서 먼저 걸려 나가므로 이 값에 닿지 않는다 */
const MAX_ATTEMPTS = 60;

let hasExpiry: boolean | null = null;
/** 0013(fills.unit) 전인 DB를 만나면 false가 되어, 품목 없이 예전처럼 넣는다 */
let hasUnit: boolean | null = null;
/* 0017(fills.ip_hash) 전인 DB면 false — IP 한도 없이 예전처럼 넣는다 */
let hasIp: boolean | null = null;
/**
 * 결제 기한 — 예약하고 이만큼 안에 결제하지 않으면 자리를 반납한다.
 *
 * 왜 1시간인가. 예약이 결제가 아니라서, 안 살 사람이 자리를 붙들면 살 사람이
 * 못 산다. 카페24 재고까지 줄이면 그 손해가 자사몰로 나간다.
 * 자정까지 기다리면 늦은 예약은 8시간을 묶는다 — 선착순이 이름뿐이 된다.
 */
export const HOLD_MINUTES = 60;

/** 기한은 빵장 마감(24:00 KST)을 넘지 않는다 — 닫힌 뒤에 결제할 곳이 없다 */
export function expiryFor(at: Date = new Date()): Date {
  const hold = new Date(at.getTime() + HOLD_MINUTES * 60_000);
  const seoulMidnight = new Date(`${seoulDateString(at)}T00:00:00+09:00`);
  const close = new Date(seoulMidnight.getTime() + 24 * 60 * 60_000);
  return hold < close ? hold : close;
}

export interface FillResult {
  filled: boolean;
  /** 이 시도 뒤 남은 수량 */
  remaining: number;
  /** 체결됐다면 몇 번째였나 */
  slot: number | null;
  /** 이 사람이 오늘 이 빵을 이미 잡고 있다 — 새 자리를 주지 않는다(0015) */
  already?: boolean;
  /** 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 */
  stored: boolean;
  /** 결제 기한(ISO). 이 시각까지 결제하지 않으면 자리를 반납한다 */
  expiresAt: string | null;
  /** 예약 줄의 id. 발급한 할인코드를 붙일 때 쓴다 */
  id: number | null;
  /** 같은 IP가 이 빵을 이미 여러 자리 쥐고 있다(0017) */
  limited?: boolean;
}

/** 방문자 쿠키로 확인한 본인의 오늘 예약만 돌려준다. */
export interface MyReservation {
  productNo: number;
  depth: number;
  unit: string | null;
  slot: number | null;
  stored: boolean;
  expiresAt: string | null;
  settled: 'open' | 'paid';
  coupon: { code: string; rate: number } | null;
}

// ponytail: 저장소 없는 개발 세션에서만 유지. 운영 복원은 fills 테이블을 사용한다.
const memoryReservations = new Map<string, MyReservation>();

export async function loadMyReservations(visitor: string | null, at: Date = new Date()): Promise<MyReservation[]> {
  if (!visitor) return [];
  const day = seoulDateString(at);
  const prefix = `${day}:${visitor}:`;
  const fallback = () => [...memoryReservations].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value);
  const db = supabase();
  if (!db) return fallback();
  const { data, error } = await db.from('fills')
    .select('product_no, depth, unit, slot, expires_at, settled, coupon_code')
    .eq('visitor', visitor).eq('day', day).neq('settled', 'expired');
  if (error) {
    if (missingTable(error.code) || missingColumn(error.code)) return fallback();
    throw new Error('예약 내역을 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.');
  }
  return (data ?? []).map(row => ({
    productNo: row.product_no, depth: Number(row.depth), unit: row.unit ?? null,
    slot: row.slot, stored: true, expiresAt: row.expires_at,
    settled: row.settled === 'paid' ? 'paid' : 'open',
    coupon: row.coupon_code ? { code: row.coupon_code, rate: Number(row.depth) } : null,
  }));
}

/** "productNo:depth" → 오늘 체결 수. 클라이언트가 그대로 받아 잔량을 계산한다 */
export async function loadFilledCounts(at: Date = new Date()): Promise<Record<string, number>> {
  const day = seoulDateString(at);
  const db = supabase();
  if (!db) return memoryCounts(day);

  const base = db.from('fills').select('product_no, depth').eq('day', day);
  /* 반납된 줄은 빼고 센다 — 그 자리는 다시 팔 수 있다 */
  const { data, error } = await (hasExpiry === false ? base : base.neq('settled', 'expired'));

  if (error) {
    /* 0012 전이면 settled 열이 없다. 기한 없이 예전처럼 전부 센다 */
    if (missingColumn(error.code) && hasExpiry !== false) { hasExpiry = false; return loadFilledCounts(at); }
    return memoryCounts(day);
  }
  if (!data) return memoryCounts(day);
  hasExpiry ??= true;

  const counts: Record<string, number> = {};
  for (const row of data as { product_no: number; depth: number | string }[]) {
    const key = `${row.product_no}:${Number(row.depth).toFixed(3)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * 오늘 자사몰 재고에서 이미 빠진 예약 수 — 상품별, 옵션별.
 *
 * 한도는 min(자사몰 재고, 관리자 상한) - 잡힌 자리다. 그런데 결제된 예약은
 * 카페24 재고에서 한 번, 잡힌 자리에서 또 한 번 빠진다 — 재고 10개에 셋이 사면
 * 7 - 3 = 4자리만 남았다. 빠진 만큼 재고에 되돌려 더해야 한 번만 센다(lib/stock.withSold).
 *
 * INVENTORY_SYNC=on이면 예약하는 순간 재고를 깎으므로 열린 예약도 이미 빠진 것이다.
 *
 * ponytail: 결제됐어도 기한이 지나 정산되기 전(최대 1시간)은 'open'이라 여기 안 잡힌다.
 *           그동안은 한 자리 적게 보인다 — 더 팔지 않는 쪽으로 틀린다.
 */
export async function loadSoldCounts(at: Date = new Date()): Promise<Record<number, { total: number; byUnit: Record<string, number> }>> {
  const db = supabase();
  if (!db || hasExpiry === false) return {};
  const states = process.env.INVENTORY_SYNC === 'on' ? ['paid', 'open'] : ['paid'];
  const query = db.from('fills').select(hasUnit === false ? 'product_no' : 'product_no, unit')
    .eq('day', seoulDateString(at)).in('settled', states);
  const { data, error } = await query;
  if (error) {
    if (missingColumn(error.code) && hasUnit !== false) { hasUnit = false; return loadSoldCounts(at); }
    return {};
  }
  const sold: Record<number, { total: number; byUnit: Record<string, number> }> = {};
  for (const row of (data ?? []) as unknown as { product_no: number; unit?: string | null }[]) {
    const entry = sold[row.product_no] ??= { total: 0, byUnit: {} };
    entry.total += 1;
    if (row.unit) entry.byUnit[row.unit] = (entry.byUnit[row.unit] ?? 0) + 1;
  }
  return sold;
}

export interface WeekReport {
  /** 체결이 하루라도 있었던 날 수 */
  tradedDays: number;
  /** 구간 전체 체결 건수 */
  fills: number;
  /** 체결에 걸린 폭의 평균 (0.18 = 18%) */
  avgDepth: number;
  /** 가장 깊었던 날 — 그날 최대 폭 */
  deepest: { day: string; depth: number } | null;
  /** 가장 많이 나간 상품 */
  topProduct: { productNo: number; count: number } | null;
}

/**
 * 이번 주 빵장 결산 — 주말 화면이 쓴다.
 *
 * 개인 기록이 아니라 시장 전체 기록이다. 0010이 fills.visitor를 붙여 누가 샀는지는
 * 알 수 있게 됐지만(바로 아래 boughtInWindow가 그걸 쓴다), 여기서 쓰지 않는 것은
 * "내 수익률"보다 "이번 주 시장"이 주식시장 주간 결산이라는 은유에 맞아서다.
 */
export async function loadWeekReport(from: string, to: string): Promise<WeekReport> {
  const empty: WeekReport = { tradedDays: 0, fills: 0, avgDepth: 0, deepest: null, topProduct: null };
  const db = supabase();
  if (!db) return empty;

  const { data, error } = await db
    .from('fills')
    .select('day, product_no, depth')
    .gte('day', from)
    .lt('day', to);

  if (error || !data || !data.length) return empty;

  const rows = (data as { day: string; product_no: number; depth: number | string }[])
    .map(r => ({ day: r.day, productNo: r.product_no, depth: Number(r.depth) }));

  const days = new Set(rows.map(r => r.day));
  const byProduct = new Map<number, number>();
  const deepestByDay = new Map<string, number>();
  let depthSum = 0;

  for (const r of rows) {
    depthSum += r.depth;
    byProduct.set(r.productNo, (byProduct.get(r.productNo) ?? 0) + 1);
    deepestByDay.set(r.day, Math.max(deepestByDay.get(r.day) ?? 0, r.depth));
  }

  const top = [...byProduct.entries()].sort((a, b) => b[1] - a[1])[0];
  const deep = [...deepestByDay.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    tradedDays: days.size,
    fills: rows.length,
    avgDepth: depthSum / rows.length,
    deepest: deep ? { day: deep[0], depth: deep[1] } : null,
    topProduct: top ? { productNo: top[0], count: top[1] } : null,
  };
}

/**
 * [from, to) 구간에 이 사람이 한 번이라도 샀나. 주간 활동점수의 구매 항목.
 *
 * 기한 넘겨 반납된 예약(settled='expired')은 세지 않는다. 눌러만 두고 결제를 안 한
 * 사람에게 구매 점수를 주면, 배당이 "산 사람"이 아니라 "누른 사람"에게 나간다.
 * 0012 이전 DB에는 settled 열이 없어 그때는 조건 없이 센다(hasExpiry).
 */
export async function boughtInWindow(visitor: string, from: string, to: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const base = db
    .from('fills')
    .select('id', { count: 'exact', head: true })
    .eq('visitor', visitor)
    .gte('day', from)
    .lt('day', to);
  const { count, error } = await (hasExpiry === false ? base : base.neq('settled', 'expired'));
  if (error) {
    if (missingColumn(error.code) && hasExpiry !== false) { hasExpiry = false; return boughtInWindow(visitor, from, to); }
    return false;
  }
  hasExpiry ??= true;
  return (count ?? 0) > 0;
}

/** 메모리에 쌓인 오늘 체결 수를 화면이 쓰는 "상품:폭" 형태로 */
function memoryCounts(day: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, n] of memory) {
    if (!key.startsWith(`${day}:`)) continue;
    const [, productNo, depth] = key.split(':');
    const group = `${productNo}:${depth}`;
    counts[group] = (counts[group] ?? 0) + n;
  }
  return counts;
}

/**
 * [from, to) 구간에 상품별로 몇 건이 체결됐나. 수요 전환율의 분자이고,
 * 판매속도(재고 보정)의 재료이기도 하다 — 둘 다 skuSignals가 쓴다.
 *
 * 저장소가 없으면 메모리로 센다. 여기서 빈 값을 주면 Supabase 없는 로컬에서는
 * 수요·재고 보정이 늘 0이라 확인할 방법이 없다.
 */
/**
 * 예약 줄에 발급한 할인코드를 붙인다.
 *
 * 코드는 예약이 잡힌 뒤에 발급되므로(api/fill) insert 시점에는 모른다.
 * 나중에 "이 예약이 결제됐나"를 이 코드로 확인한다(lib/settle).
 */
export async function attachCoupon(id: number, code: string): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db.from('fills').update({ coupon_code: code }).eq('id', id);
}

export async function loadFilledWindow(from: string, to: string): Promise<Record<number, number>> {
  const db = supabase();
  if (!db) return memoryWindow(from, to);

  const { data, error } = await db
    .from('fills')
    .select('product_no')
    .gte('day', from)
    .lt('day', to);

  if (error || !data) return memoryWindow(from, to);

  const counts: Record<number, number> = {};
  for (const row of data as { product_no: number }[]) {
    counts[row.product_no] = (counts[row.product_no] ?? 0) + 1;
  }
  return counts;
}

/** 메모리 키는 "날짜:상품:폭"이다. 날짜가 YYYY-MM-DD라 사전순 비교가 곧 날짜순이다 */
function memoryWindow(from: string, to: string): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const [key, n] of memory) {
    const [day, no] = key.split(':');
    if (day < from || day >= to) continue;
    counts[Number(no)] = (counts[Number(no)] ?? 0) + n;
  }
  return counts;
}

/** 오늘 상품·칸별 체결 수. 서버가 호가표를 만들 때 쓴다 */
export async function loadFilled(at: Date = new Date()): Promise<FilledLookup> {
  const counts = await loadFilledCounts(at);
  return (productNo, depth) => counts[`${productNo}:${depth.toFixed(3)}`] ?? 0;
}

/** 지금 살아 있는 예약 수. 반납된 줄은 안 센다 — 그 자리는 다시 팔 수 있다 */
/**
 * 이 칸에 몇 자리가 나갔나.
 *
 * 옵션까지 보고 센다(0015). 자사몰 재고가 품목마다 따로라, 상품 전체로 세면
 * "1개 30 · 3개 30 · 5개 30"인 빵에서 서른 명이 모두 '5개'를 골라도 통과한다.
 * 옵션이 없는 상품은 unit이 null이고, 그때는 null인 줄만 센다.
 */
/** 지금 쥐고 있는 slot 번호들. 반납한 줄은 slot이 null이라(0012) 빠진다 */
async function takenSlots(productNo: number, depth: number, day: string, unit: string | null = null): Promise<Set<number>> {
  const db = supabase();
  if (!db) return new Set();
  let base = db.from('fills').select('slot')
    .eq('day', day).eq('product_no', productNo).eq('depth', depth.toFixed(3))
    .not('slot', 'is', null);
  if (hasUnit !== false) base = unit ? base.eq('unit', unit) : base.is('unit', null);
  const { data, error } = await base;
  if (error && missingColumn(error.code) && hasUnit !== false) {
    /* 0013·0015 전인 DB다. 옵션 없이 예전처럼 센다 */
    hasUnit = false;
    return takenSlots(productNo, depth, day, unit);
  }
  return new Set((data ?? []).map((r: { slot: number }) => r.slot));
}

/** 메모리로 한 자리 잡는다. 수량이 남아 있으면 체결이다 */
function fillInMemory(productNo: number, depth: number, quantity: number, day: string, unit: string | null = null, visitor: string | null = null): FillResult {
  const visitorKey = `${day}:${visitor}:${productNo}`;
  if (visitor && memoryReservations.has(visitorKey)) {
    return { filled: false, remaining: 0, slot: null, stored: false, expiresAt: null, id: null, already: true };
  }
  const key = memKey(day, productNo, depth, unit);
  const filled = memory.get(key) ?? 0;
  if (filled >= quantity) return { filled: false, remaining: 0, slot: null, stored: false, expiresAt: null, id: null };
  const slot = filled + 1;
  memory.set(key, slot);
  if (visitor) memoryReservations.set(visitorKey, {
    productNo, depth, unit, slot, stored: false, expiresAt: null, settled: 'open', coupon: null,
  });
  /* 메모리 폴백에는 기한이 없다 — 저장소가 없으면 반납 처리도 못 한다 */
  return { filled: true, remaining: quantity - slot, slot, stored: false, expiresAt: null, id: null };
}

/**
 * 체결을 시도한다.
 *
 * 비어 있는 가장 작은 slot을 넣는다. 같은 순간 다른 사람이 같은 slot을 넣으면
 * unique 위반(23505)으로 한 명이 튕기고, 튕긴 쪽은 **다음 빈 칸으로 올라가** 다시 넣는다.
 *
 * 튕길 때마다 다시 세면 안 된다. 밀린 사람들이 같은 값을 읽어 또 같은 자리로 몰리고,
 * 두 번 만에 포기하게 해두면 자리가 남았는데 아무도 못 들어간다 —
 * 쉰 명이 서른 자리에 달려들 때 열두 명만 통과하던 것이 그 때문이었다
 * (scripts/race-test.mjs로 잡았다).
 *
 * 자리는 **옵션마다** 따로 센다(0015). 자사몰 재고가 품목 단위라, 상품 전체로
 * 세면 서른 명이 모두 '5개'를 골라도 통과한다.
 *
 * 같은 사람이 같은 날 같은 빵을 두 번 잡지는 못한다(0015). 화면은 버튼을 잠그지만
 * 서버에 방어가 없어, 같은 요청을 두 번 보내면 자리 둘을 먹고 있었다.
 *
 * @param quantity 이 칸의 오늘 배정 수량 — 서버가 계산한 값만 넣는다
 */
export async function tryFill(
  productNo: number,
  depth: number,
  quantity: number,
  at: Date = new Date(),
  /* 주간 활동점수의 구매 항목을 사람 단위로 세려면 누가 샀는지가 필요하다(0010).
     없으면 null로 들어간다 — 선착순 경합은 (day, product_no, depth, slot)이 막으므로
     표식이 없어도 체결 자체는 그대로 동작한다 */
  visitor: string | null = null,
  /* 자사몰 품목코드. 재고는 품목 단위로 세므로, 반납할 때 되돌릴 대상도 이것이다(0013) */
  unit: string | null = null,
  /* 접속 IP의 해시와 한 IP가 한 빵에 쥘 수 있는 자리 수. 방문자 쿠키는 지우면 새로
     생겨서, 쿠키 없이 서른 번 부르면 서른 자리가 결제 없이 다 찼다. 자리처럼
     (day, product_no, ip_hash, ip_seq) unique로 막아 동시에 쏴도 못 넘는다(0017) */
  ip: { hash: string; limit: number } | null = null,
): Promise<FillResult> {
  const db = supabase();
  const day = seoulDateString(at);
  if (!db) return fillInMemory(productNo, depth, quantity, day, unit, visitor);
  let ipSeq = 1;

  /* 처음 한 번만 세고, 부딪히면 다음 자리로 한 칸씩 올라간다.
     매번 다시 세면 경합에 밀린 사람들이 같은 자리로 또 몰려 아무도 못 들어간다 */
  /* 빈 번호를 아래부터 채운다. "채워진 수 + 1"로 잡으면 반납으로 생긴 구멍
     (30자리 중 3번이 비면 29+1=30번만 노린다)을 영영 못 채운다 */
  const taken = await takenSlots(productNo, depth, day, unit);
  const free: number[] = [];
  for (let n = 1; n <= quantity; n++) if (!taken.has(n)) free.push(n);
  let next = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slot = free[next];
    if (slot === undefined) return { filled: false, remaining: 0, slot: null, stored: true, expiresAt: null, id: null };

    const expires = expiryFor(at);
    const row: Record<string, unknown> = { day, product_no: productNo, depth: depth.toFixed(3), slot, visitor };
    if (hasUnit !== false && unit) row.unit = unit;
    /* 0012 전이면 열이 없다 — 기한 없이 예전처럼 넣는다 */
    if (hasExpiry !== false) row.expires_at = expires.toISOString();
    if (ip && hasIp !== false) { row.ip_hash = ip.hash; row.ip_seq = ipSeq; }

    const { data, error } = await db.from('fills').insert(row).select('id').single();

    if (!error) {
      hasExpiry ??= true;
      return {
        filled: true, remaining: free.length - next - 1, slot, stored: true,
        expiresAt: hasExpiry === false ? null : expires.toISOString(),
        id: (data as { id: number } | null)?.id ?? null,
      };
    }
    if (missingColumn(error.code) && hasUnit !== false && unit) { hasUnit = false; continue; }
    if (missingColumn(error.code) && hasExpiry !== false) { hasExpiry = false; continue; }
    if (missingColumn(error.code) && ip && hasIp !== false) { hasIp = false; continue; }
    /* 표가 아직 없다 — 마이그레이션 전이다. 품절이라 거짓말하지 않고 메모리로 받는다 */
    if (missingTable(error.code)) return fillInMemory(productNo, depth, quantity, day, unit, visitor);
    if (error.code !== '23505') throw new Error(`체결 저장 실패: ${error.message}`);
    /* 한 사람 한 자리(0015)에 걸린 것이면 다시 세도 소용없다 — 이미 잡고 있다.
       다시 세면 매번 새 slot을 만들어 두 번 튕기고 "물량 끝"이라 거짓말한다 */
    if (/fills_one_per_visitor/.test(`${error.message} ${error.details ?? ''}`)) {
      return { filled: false, remaining: free.length - next, slot: null, stored: true, expiresAt: null, id: null, already: true };
    }
    /* 이 IP가 쓴 번호다 — 다음 번호로. 한도를 넘으면 자리가 남아도 안 준다 */
    if (/fills_ip_seq/.test(`${error.message} ${error.details ?? ''}`)) {
      ipSeq += 1;
      if (ip && ipSeq > ip.limit) return { filled: false, remaining: free.length - next, slot: null, stored: true, expiresAt: null, id: null, limited: true };
      continue;
    }
    /* 자리 경합 — 누가 먼저 잡았다. 그 자리는 이제 확실히 찼으니 다음 칸으로 올라간다.
       여기서 다시 세면 밀린 사람들이 같은 값을 읽어 또 같은 자리로 몰린다 —
       쉰 명이 서른 자리에 달려들 때 열두 명만 들어가던 것이 그 때문이었다 */
    next += 1;
  }

  return { filled: false, remaining: 0, slot: null, stored: true, expiresAt: null, id: null };
}
