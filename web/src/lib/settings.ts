import { DISCOUNT_TIERS, MAX_DISCOUNT_RATE, type DiscountTier } from '@/data/indicators';
import { supabase } from '@/lib/supabase';

/**
 * 운영 설정 — 관리자가 화면에서 바꾸는 값.
 *
 * 코드 상수는 기본값이자 폴백이다. DB가 비었거나 닿지 못하면 코드 값으로 돌아간다.
 * 설정이 없다고 해서 할인이 0%가 되거나 화면이 비면 안 된다 — 손님이 먼저 본다.
 */

/** 등락률 하한이 큰 것부터. tierFor()가 처음 만나는 구간을 쓴다. */
const sortTiers = (tiers: DiscountTier[]) =>
  [...tiers].sort((a, b) => b.minAbsChange - a.minAbsChange);

export async function loadTiers(): Promise<DiscountTier[]> {
  const db = supabase();
  if (!db) return DISCOUNT_TIERS;

  const { data, error } = await db
    .from('discount_tiers')
    .select('min_abs_change, rate, label');

  if (error || !data?.length) return DISCOUNT_TIERS;

  return sortTiers(data.map(row => ({
    minAbsChange: Number(row.min_abs_change),
    rate: Number(row.rate),
    label: row.label,
  })));
}

/**
 * 티어 통째로 교체. 구간 몇 개를 지우는 것도 편집이므로 지우고 다시 넣는다.
 * 상한(MAX_DISCOUNT_RATE)은 기업 확인값이라 여기서 막는다 — 화면을 우회해 들어와도 뚫리지 않게.
 */
export async function saveTiers(tiers: DiscountTier[]): Promise<void> {
  const db = supabase();
  if (!db) throw new Error('저장소가 연결되지 않았습니다.');
  if (!tiers.length) throw new Error('구간이 최소 하나는 있어야 합니다.');

  for (const tier of tiers) {
    if (!Number.isFinite(tier.minAbsChange) || tier.minAbsChange < 0) {
      throw new Error('등락률 하한은 0 이상이어야 합니다.');
    }
    if (!Number.isFinite(tier.rate) || tier.rate <= 0 || tier.rate > MAX_DISCOUNT_RATE) {
      throw new Error(`할인율은 0보다 크고 ${Math.round(MAX_DISCOUNT_RATE * 100)}% 이하여야 합니다 (기업 확인 상한).`);
    }
  }

  const { error: wipe } = await db.from('discount_tiers').delete().gte('min_abs_change', 0);
  if (wipe) throw new Error(`구간 삭제 실패: ${wipe.message}`);

  const { error } = await db.from('discount_tiers').insert(
    tiers.map(tier => ({
      min_abs_change: tier.minAbsChange,
      rate: tier.rate,
      label: tier.label || '구간',
    })),
  );
  if (error) throw new Error(`구간 저장 실패: ${error.message}`);
}

/** 우리 productNo → 자사몰 product_no */
export async function loadProductLinks(): Promise<Record<number, number>> {
  const db = supabase();
  if (!db) return {};
  const { data, error } = await db.from('product_links').select('product_no, cafe24_product_no');
  if (error || !data) return {};
  return Object.fromEntries(data.map(row => [row.product_no, row.cafe24_product_no]));
}

export async function saveProductLink(productNo: number, cafe24ProductNo: number): Promise<void> {
  const db = supabase();
  if (!db) throw new Error('저장소가 연결되지 않았습니다.');
  const { error } = await db
    .from('product_links')
    .upsert({ product_no: productNo, cafe24_product_no: cafe24ProductNo }, { onConflict: 'product_no' });
  if (error) throw new Error(`연결 저장 실패: ${error.message}`);
}

export async function removeProductLink(productNo: number): Promise<void> {
  const db = supabase();
  if (!db) throw new Error('저장소가 연결되지 않았습니다.');
  const { error } = await db.from('product_links').delete().eq('product_no', productNo);
  if (error) throw new Error(`연결 삭제 실패: ${error.message}`);
}
