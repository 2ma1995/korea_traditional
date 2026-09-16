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
 */

export interface FillResult {
  filled: boolean;
  /** 이 시도 뒤 남은 수량 */
  remaining: number;
  /** 체결됐다면 몇 번째였나 */
  slot: number | null;
}

/** "productNo:depth" → 오늘 체결 수. 클라이언트가 그대로 받아 잔량을 계산한다 */
export async function loadFilledCounts(at: Date = new Date()): Promise<Record<string, number>> {
  const db = supabase();
  if (!db) return {};

  const { data, error } = await db
    .from('fills')
    .select('product_no, depth')
    .eq('day', seoulDateString(at));

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as { product_no: number; depth: number | string }[]) {
    const key = `${row.product_no}:${Number(row.depth).toFixed(3)}`;
    counts[key] = (counts[key] ?? 0) + 1;
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
  if (!db) return 0;
  const { count } = await db
    .from('fills')
    .select('id', { count: 'exact', head: true })
    .eq('day', day)
    .eq('product_no', productNo)
    .eq('depth', depth.toFixed(3));
  return count ?? 0;
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
): Promise<FillResult> {
  const db = supabase();
  const day = seoulDateString(at);
  if (!db) return { filled: false, remaining: quantity, slot: null };

  for (let attempt = 0; attempt < 2; attempt++) {
    const filled = await countFilled(productNo, depth, day);
    if (filled >= quantity) return { filled: false, remaining: 0, slot: null };

    const slot = filled + 1;
    const { error } = await db
      .from('fills')
      .insert({ day, product_no: productNo, depth: depth.toFixed(3), slot });

    if (!error) return { filled: true, remaining: quantity - slot, slot };
    if (error.code !== '23505') throw new Error(`체결 저장 실패: ${error.message}`);
    /* unique 위반 — 누가 먼저 잡았다. 다시 센다 */
  }

  return { filled: false, remaining: 0, slot: null };
}
