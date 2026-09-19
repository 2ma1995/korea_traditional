import { loadFilledWindow } from '@/lib/fills';
import { seoulDateString } from '@/lib/market';
import type { SkuSignal, SkuSignals } from '@/lib/skuAdjust';
import { loadWatchCounts } from '@/lib/watches';

/**
 * SKU 신호 — 수요·재고 보정에 넣을 값을 서버에서 모은다.
 *
 * ① 수요 (관심 → 구매전환)
 *    관심 담기가 서버에 남는다(lib/watches). 전환율은 같은 창의
 *    체결 건수 ÷ 관심 건수다. 담아만 두고 안 사는 빵일수록 낮게 나오고,
 *    그 빵이 최대 3%p 더 깎인다.
 *
 *    분모·분자의 단위를 맞춰 둔 것이 중요하다. 둘 다 '날짜별 건수'다 —
 *    사흘에 걸쳐 담은 사람은 관심 3이고 사흘에 걸쳐 산 사람은 체결 3이다.
 *    표본이 모자라면(MIN_DEMAND_SAMPLE) skuAdjust가 보정 0을 준다.
 *
 * ② 재고 (현재 재고 ÷ 최근 일평균 판매)
 *    products.inStock은 품절 여부(boolean)라 분자인 '재고 수량'이 없다.
 *    대신 그날 푼 물량(DAILY_ALLOTMENT)을 공급량으로 보고, 최근 7일 체결 속도로 나눈다.
 *    "오늘 푼 30개가 이 속도면 며칠치인가"가 되어 v5의 커버일수와 같은 뜻이 된다.
 *    → 카페24 재고 연동이 붙으면 분자를 실재고로 바꾸면 된다.
 *
 * ⚠️ 창에서 오늘을 빼는 이유가 둘이다.
 *    하나는 장이 열린 지 얼마 안 된 오늘 수치가 판매속도를 왜곡해서다.
 *    다른 하나가 더 중요한데 — 오늘 담긴 관심이 오늘 폭을 바꾸면, 화면이
 *    그린 가격과 api/fill이 다시 계산한 폭이 몇 분 사이에 어긋난다. 그러면
 *    화면 가격 그대로 누른 예약이 "오늘 폭이 아닙니다"로 전부 튕긴다.
 *    폭은 하루 동안 움직이지 않아야 한다.
 */

/** 판매속도를 재는 창 — IBM Days of Supply와 같은 7일. 수요 전환율도 같은 창을 쓴다 */
const SPEED_WINDOW_DAYS = 7;

const dayBefore = (at: Date, days: number) => {
  const d = new Date(at);
  d.setDate(d.getDate() - days);
  return d;
};

/**
 * 최근 7일 기록으로 SKU별 신호를 만든다.
 *
 * 체결은 예약이지 결제가 아니다. 실제 구매는 자사몰에서 일어나므로 판매속도의
 * 대리값이다 — 카페24 주문 연동 전까지 쓰는 근사치다.
 */
export async function loadSkuSignals(at: Date = new Date(), allotment = 30): Promise<SkuSignals> {
  const from = seoulDateString(dayBefore(at, SPEED_WINDOW_DAYS));
  const today = seoulDateString(at);

  const [sold, watched] = await Promise.all([
    loadFilledWindow(from, today),
    loadWatchCounts(from, today),
  ]);

  /* 두 쪽을 합쳐서 돈다. 체결만 보고 돌면 **한 번도 안 팔린 빵이 빠진다** —
     담아만 두고 아무도 안 산 빵이야말로 수요 보정이 겨냥하는 대상인데 그 빵이
     신호 없이 통과해 보정 0을 받는다 */
  const productNos = new Set([...Object.keys(sold), ...Object.keys(watched)].map(Number));

  const signals: SkuSignals = {};
  for (const no of productNos) {
    const fills = sold[no] ?? 0;
    const sample = watched[no] ?? 0;
    const perDay = fills / SPEED_WINDOW_DAYS;
    const signal: SkuSignal = {
      /* 관심이 하나도 없으면 전환율을 낼 수 없다. 0으로 두면 "아무도 안 산 빵"과
         "아무도 안 본 빵"이 같아져서, 안 본 빵까지 최대 보정을 받는다 */
      conversion: sample > 0 ? fills / sample : null,
      demandSample: sample,
      coverDays: perDay > 0 ? allotment / perDay : null,
    };
    signals[no] = signal;
  }
  return signals;
}
