import { supabase } from '@/lib/supabase';
import { seoulDateString } from '@/lib/market';

/**
 * 관심 담기 기록 — 수요 보정(+3%p)의 분모.
 *
 * 화면에서 빵을 관심에 담는 순간 하루 한 번 여기에 남는다. 담아만 두고 안 사는
 * 빵을 찾아 가격 반응을 시험하는 것이 수요 보정이고(skuAdjust), 그 분모가
 * 여기서 나온다. 분자는 fills다.
 *
 * ⚠️ 저장소가 없으면 메모리로 받는다 — fills·ipo와 같은 방식이다.
 *    표가 없다고 기록을 버리면 로컬에서는 이 기능을 아예 확인할 수 없다.
 *    서버가 사는 동안만 유지되고, 닿았는지 여부(stored)를 결과에 실어
 *    화면이 밝힐 수 있게 한다.
 */

/* ── 메모리 폴백. 키는 "날짜:상품", 값은 그날 담은 방문자들 ── */
const memory = new Map<string, Set<string>>();
const memKey = (day: string, productNo: number) => `${day}:${productNo}`;

/**
 * 표가 없는 오류인가. fills.ts와 같은 판정이다 —
 * PGRST205는 PostgREST 스키마 캐시에 표가 없을 때, 42P01은 Postgres의
 * undefined_table이다. 둘 다 "아직 마이그레이션(0007)을 안 돌렸다"는 뜻이라
 * 터뜨리지 않고 메모리로 받는다.
 */
const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

export interface WatchResult {
  /** 이번 호출로 새로 세었는가. 오늘 이미 담은 빵이면 false */
  counted: boolean;
  /** 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 */
  stored: boolean;
}

/** 메모리에 한 명 올린다 */
function watchInMemory(productNo: number, visitor: string, day: string): WatchResult {
  const key = memKey(day, productNo);
  const seen = memory.get(key) ?? new Set<string>();
  const counted = !seen.has(visitor);
  seen.add(visitor);
  memory.set(key, seen);
  return { counted, stored: false };
}

/**
 * 관심 담기를 기록한다.
 *
 * 같은 사람이 같은 날 같은 빵을 여러 번 담아도 한 번만 센다. unique 위반(23505)은
 * 오류가 아니라 "이미 센 사람"이라는 뜻이라 그대로 성공으로 돌린다.
 */
export async function recordWatch(
  productNo: number,
  visitor: string,
  at: Date = new Date(),
): Promise<WatchResult> {
  const day = seoulDateString(at);
  const db = supabase();
  if (!db) return watchInMemory(productNo, visitor, day);

  const { error } = await db.from('watches').insert({ day, product_no: productNo, visitor });
  if (!error) return { counted: true, stored: true };
  /* 표가 아직 없다 — 마이그레이션 전이다. 기록을 버리지 않고 메모리로 받는다 */
  if (missingTable(error.code)) return watchInMemory(productNo, visitor, day);
  /* 오늘 이미 담은 빵이다. 분모는 그대로 두는 것이 맞다 */
  if (error.code === '23505') return { counted: false, stored: true };
  throw new Error(`관심 기록 실패: ${error.message}`);
}

/** [from, to) 구간에 이 사람이 한 번이라도 담았나. 주간 활동점수의 관심 항목 */
export async function watchedInWindow(visitor: string, from: string, to: string): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { count, error } = await db
    .from('watches')
    .select('id', { count: 'exact', head: true })
    .eq('visitor', visitor)
    .gte('day', from)
    .lt('day', to);
  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * [from, to) 구간에 상품별로 몇 명이 담았나.
 *
 * 경계가 반열림인 이유 — 호출부(skuSignals)가 to에 '오늘'을 넣어 오늘을 뺀다.
 * 오늘 담긴 것이 오늘 가격을 바꾸면 장중에 폭이 흔들려서, 화면 가격으로 누른
 * 예약이 api/fill에서 전부 튕긴다.
 */
export async function loadWatchCounts(from: string, to: string): Promise<Record<number, number>> {
  const db = supabase();
  if (!db) return memoryCounts(from, to);

  const { data, error } = await db
    .from('watches')
    .select('product_no')
    .gte('day', from)
    .lt('day', to);

  if (error || !data) return memoryCounts(from, to);

  const counts: Record<number, number> = {};
  for (const row of data as { product_no: number }[]) {
    counts[row.product_no] = (counts[row.product_no] ?? 0) + 1;
  }
  return counts;
}

/** 메모리에 쌓인 것을 같은 구간으로 센다. 날짜 문자열이 YYYY-MM-DD라 사전순 비교가 곧 날짜순이다 */
function memoryCounts(from: string, to: string): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const [key, visitors] of memory) {
    const cut = key.indexOf(':');
    const day = key.slice(0, cut);
    if (day < from || day >= to) continue;
    const no = Number(key.slice(cut + 1));
    counts[no] = (counts[no] ?? 0) + visitors.size;
  }
  return counts;
}
