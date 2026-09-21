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
const memKey = (day: string, productNo: number, depth: number) => `${day}:${productNo}:${depth.toFixed(3)}`;

/**
 * 표가 없는 오류인가.
 *
 * PostgREST는 스키마 캐시에 표가 없으면 PGRST205를 준다
 * ("Could not find the table 'public.fills' in the schema cache").
 * 42P01은 Postgres의 undefined_table이다. 둘 다 "아직 마이그레이션을 안 돌렸다"는
 * 뜻이므로 예외로 터뜨리지 않고 메모리로 받는다. 그 밖의 오류는 진짜 문제라 던진다.
 */
const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

export interface FillResult {
  filled: boolean;
  /** 이 시도 뒤 남은 수량 */
  remaining: number;
  /** 체결됐다면 몇 번째였나 */
  slot: number | null;
  /** 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 */
  stored: boolean;
}

/** "productNo:depth" → 오늘 체결 수. 클라이언트가 그대로 받아 잔량을 계산한다 */
export async function loadFilledCounts(at: Date = new Date()): Promise<Record<string, number>> {
  const day = seoulDateString(at);
  const db = supabase();
  if (!db) return memoryCounts(day);

  const { data, error } = await db
    .from('fills')
    .select('product_no, depth')
    .eq('day', day);

  if (error || !data) return memoryCounts(day);

  const counts: Record<string, number> = {};
  for (const row of data as { product_no: number; depth: number | string }[]) {
    const key = `${row.product_no}:${Number(row.depth).toFixed(3)}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
 * 개인 기록이 아니라 시장 전체 기록이다. fills에는 visitor가 없어서 누가 샀는지
 * 모르기 때문이다(watches에는 있다). 그래서 "내 수익률"이 아니라 "이번 주 시장"으로
 * 쓴다 — 주식시장 주간 결산이라는 은유에는 오히려 이쪽이 맞는다.
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

/** [from, to) 구간에 이 사람이 한 번이라도 샀나. 주간 활동점수의 구매 항목 */
export async function boughtInWindow(visitor: string, from: string, to: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { count, error } = await db
    .from('fills')
    .select('id', { count: 'exact', head: true })
    .eq('visitor', visitor)
    .gte('day', from)
    .lt('day', to);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** 메모리에 쌓인 오늘 체결 수를 화면이 쓰는 "상품:폭" 형태로 */
function memoryCounts(day: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, n] of memory) {
    if (!key.startsWith(`${day}:`)) continue;
    counts[key.slice(day.length + 1)] = n;
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

async function countFilled(productNo: number, depth: number, day: string): Promise<number> {
  const db = supabase();
  if (!db) return memory.get(memKey(day, productNo, depth)) ?? 0;
  const { count } = await db
    .from('fills')
    .select('id', { count: 'exact', head: true })
    .eq('day', day)
    .eq('product_no', productNo)
    .eq('depth', depth.toFixed(3));
  return count ?? 0;
}

/** 메모리로 한 자리 잡는다. 수량이 남아 있으면 체결이다 */
function fillInMemory(productNo: number, depth: number, quantity: number, day: string): FillResult {
  const key = memKey(day, productNo, depth);
  const filled = memory.get(key) ?? 0;
  if (filled >= quantity) return { filled: false, remaining: 0, slot: null, stored: false };
  const slot = filled + 1;
  memory.set(key, slot);
  return { filled: true, remaining: quantity - slot, slot, stored: false };
}

/**
 * 체결을 시도한다.
 *
 * 채워진 수 + 1을 slot으로 넣는다. 같은 순간 다른 사람이 같은 slot을 넣으면
 * unique 위반(23505)으로 한 명이 튕기고, 튕긴 쪽은 다시 세서 한 번 더 시도한다.
 * 두 번째도 튕기면 그 사이 물량이 끝난 것으로 본다.
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
): Promise<FillResult> {
  const db = supabase();
  const day = seoulDateString(at);
  if (!db) return fillInMemory(productNo, depth, quantity, day);

  for (let attempt = 0; attempt < 2; attempt++) {
    const filled = await countFilled(productNo, depth, day);
    if (filled >= quantity) return { filled: false, remaining: 0, slot: null, stored: true };

    const slot = filled + 1;
    const { error } = await db
      .from('fills')
      .insert({ day, product_no: productNo, depth: depth.toFixed(3), slot, visitor });

    if (!error) return { filled: true, remaining: quantity - slot, slot, stored: true };
    /* 표가 아직 없다 — 마이그레이션 전이다. 품절이라 거짓말하지 않고 메모리로 받는다 */
    if (missingTable(error.code)) return fillInMemory(productNo, depth, quantity, day);
    if (error.code !== '23505') throw new Error(`체결 저장 실패: ${error.message}`);
    /* unique 위반 — 누가 먼저 잡았다. 다시 센다 */
  }

  return { filled: false, remaining: 0, slot: null, stored: true };
}
