import { seoulDateString } from '@/lib/market';
import type { SkuSignal, SkuSignals } from '@/lib/skuAdjust';
import { supabase } from '@/lib/supabase';

/**
 * SKU 신호 — 수요·재고 보정에 넣을 값을 서버에서 모은다.
 *
 * 기획안 v5는 두 가지를 요구하는데, 지금 있는 데이터가 거기까지 닿지 않는다.
 * 없는 값을 지어내지 않고 null로 두면, skuAdjust가 콜드스타트 규칙대로 보정 0을 준다.
 *
 * ① 수요 (관심·장바구니 → 구매전환)
 *    관심 목록은 portfolioStore가 브라우저 localStorage에만 쓴다. 서버로 오지 않으니
 *    전체 고객 집계를 낼 수가 없다. conversion은 지금 항상 null이다.
 *    → 켜려면 관심 담기를 서버에 기록하는 작업이 먼저다.
 *
 * ② 재고 (현재 재고 ÷ 최근 일평균 판매)
 *    products.inStock은 품절 여부(boolean)라 분자인 '재고 수량'이 없다.
 *    대신 그날 푼 물량(DAILY_ALLOTMENT)을 공급량으로 보고, 최근 7일 체결 속도로 나눈다.
 *    "오늘 푼 30개가 이 속도면 며칠치인가"가 되어 v5의 커버일수와 같은 뜻이 된다.
 *    → 카페24 재고 연동이 붙으면 분자를 실재고로 바꾸면 된다.
 */

/** 판매속도를 재는 창 — IBM Days of Supply와 같은 7일 */
const SPEED_WINDOW_DAYS = 7;

const dayBefore = (at: Date, days: number) => {
  const d = new Date(at);
  d.setDate(d.getDate() - days);
  return d;
};

/**
 * 최근 7일 체결 기록으로 SKU별 신호를 만든다.
 *
 * 체결은 예약이지 결제가 아니다. 실제 구매는 자사몰에서 일어나므로 판매속도의
 * 대리값이다 — 카페24 주문 연동 전까지 쓰는 근사치다.
 */
export async function loadSkuSignals(at: Date = new Date(), allotment = 30): Promise<SkuSignals> {
  const db = supabase();
  if (!db) return {};

  const from = seoulDateString(dayBefore(at, SPEED_WINDOW_DAYS));
  const today = seoulDateString(at);

  /* 오늘은 빼고 센다 — 장이 열린 지 얼마 안 된 오늘 수치가 속도를 왜곡한다 */
  const { data, error } = await db
    .from('fills')
    .select('product_no')
    .gte('day', from)
    .lt('day', today);

  if (error || !data) return {};

  const sold: Record<number, number> = {};
  for (const row of data as { product_no: number }[]) {
    sold[row.product_no] = (sold[row.product_no] ?? 0) + 1;
  }

  const signals: SkuSignals = {};
  for (const [key, count] of Object.entries(sold)) {
    const perDay = count / SPEED_WINDOW_DAYS;
    const signal: SkuSignal = {
      /* 관심 데이터가 서버에 없다 — 위 주석 ① 참고 */
      conversion: null,
      demandSample: 0,
      coverDays: perDay > 0 ? allotment / perDay : null,
    };
    signals[Number(key)] = signal;
  }
  return signals;
}
