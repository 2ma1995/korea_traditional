import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';
import { getProduct, setProductPrice } from '@/lib/cafe24';
import { getMarketSnapshot, seoulDateString } from '@/lib/market';
import { rateFor } from '@/lib/offers';
import { loadProductLinks, loadTiers } from '@/lib/settings';
import { applyStock, fetchStock } from '@/lib/stock';
import { discountDelivery } from '@/lib/discountDelivery';
import { supabase } from '@/lib/supabase';

/**
 * 자사몰 가격 동기화 — 오늘의 폭을 카페24 판매가에 반영하고, 자정에 되돌린다.
 *
 * 왜 필요한가: 화면은 8,470원인데 자사몰로 넘기면 11,000원이었다. 우리에게 결제가
 * 없어 판매는 카페24가 하는데, 오늘 가격을 카페24에 반영하지 않으니 "싸다고 보여주고
 * 정가로 보내는" 상태였다. 시트에 "오늘 가격 적용은 쿠폰이 필요해 기업 확인 중"이라고
 * 적어 두었지만, 그건 설명이지 해결이 아니다.
 *
 * 쿠폰을 안 쓰는 이유: 카페24 쿠폰은 회원 계정에 발급되는 구조다. 이 서비스에는
 * 로그인이 없어 특정인에게 줄 수가 없다. 판매가를 직접 바꾸면 회원도 쿠폰도 필요 없고,
 * RFP가 요구하는 "카페24 상품가 업데이트"와도 정확히 같다.
 *
 *   15:30  국장 마감 → 크론 → 판매가 변경 (원가는 daily_plans에 저장)
 *   24:00  크론 → 원가 복원
 *
 * ⚠️ 전원에게 같은 가격이 걸린다. 그래서 "선착순 30개 할인"은 이 방식에서 성립하지
 *    않는다. 한정 수량의 뜻을 다시 정해야 한다(팀공유_빵장_설계도.md §9-2).
 *
 * ⚠️ 원가는 여기 적어두는 것이 유일한 기록이다. 카페24는 이전 값을 보관해 주지
 *    않는다. 저장이 실패하면 반영을 하지 않는다 — 되돌릴 수 없는 변경을 만들지 않는다.
 */

/**
 * 안전 스위치.
 *
 * **기업 승인 전에는 켜지 않는다.** 물어야 할 것은 한 문장이다 —
 * "15:30~24:00 동안 자사몰 판매가를 API로 바꾸고 자정에 되돌려도 됩니까?"
 *
 * 승인이 오면 이 값을 true로 바꾸거나 PRICE_SYNC=on 환경변수를 넣는다.
 * 꺼져 있으면 크론이 돌아도 아무것도 바꾸지 않고 계산 결과만 돌려준다(dryRun).
 */
export const PRICE_SYNC_ENABLED = false;

/* 'coupon' 모드에서는 판매가를 건드리지 않는다 — 코드로 깎는데 값까지 내리면
   할인이 두 번 먹는다(lib/discountDelivery) */
const enabled = () => discountDelivery() === 'price' && (PRICE_SYNC_ENABLED || process.env.PRICE_SYNC === 'on');

/* 10원 단위 절사 — 화면·publish 라우트와 같은 규칙이어야 한다. Math.round를 먼저 거치는 이유 — 21000 * (1 - 0.3)이 IEEE754에서
   14699.999999999998이 되어 그냥 내리면 14,690원이 된다. 30% 할인인데 10원이 더
   깎인 값이다. 90개 조합 중 8개에서 이렇게 어긋났다. */
const floorTo10 = (won: number) => Math.floor(Math.round(won) / 10) * 10;

export interface SyncItem {
  productNo: number;
  name: string;
  cafe24ProductNo: number;
  rate: number;
  /** 바꾸기 전 자사몰 판매가. 복원의 근거 */
  originalPrice: string;
  newPrice: string;
}

export interface SyncReport {
  action: 'publish' | 'restore';
  date: string;
  /** 스위치가 꺼져 있으면 true — 계산만 하고 아무것도 바꾸지 않았다 */
  dryRun: boolean;
  rate: number;
  changePct: number;
  applied: SyncItem[];
  skipped: { productNo: number; name: string; reason: string }[];
  note: string | null;
}

/** 오늘 어떤 빵에 얼마를 걸어야 하는가 — 화면과 같은 규칙으로 계산한다 */
async function todayPlan(at: Date) {
  const [market, tiers, stock] = await Promise.all([getMarketSnapshot(at), loadTiers(), fetchStock()]);
  const { rate } = rateFor(market.kospi.changePct, tiers);
  const products = applyStock(PRODUCTS, stock).filter(product => product.inStock);
  return { rate: Math.min(rate, MAX_DISCOUNT_RATE), changePct: market.kospi.changePct, products };
}

/**
 * 오늘의 폭을 자사몰에 반영한다.
 *
 * 할인은 products.ts의 정가가 아니라 **자사몰의 현재 판매가**를 기준으로 건다.
 * 그 사이 기업이 가격을 바꿨을 수 있어서다.
 */
export async function publishToday(at: Date = new Date()): Promise<SyncReport> {
  const date = seoulDateString(at);
  const { rate, changePct, products } = await todayPlan(at);
  const report: SyncReport = {
    action: 'publish', date, dryRun: !enabled(), rate, changePct,
    applied: [], skipped: [], note: null,
  };

  if (!enabled()) {
    report.note = '스위치가 꺼져 있어 계산만 했습니다 (PRICE_SYNC_ENABLED / PRICE_SYNC=on). 기업 승인 전에는 켜지 않습니다.';
    report.applied = await planOnly(products, rate);
    return report;
  }

  const links = await loadProductLinks();
  for (const product of products) {
    /* products.ts의 productNo는 makji.kr의 실제 카페24 상품번호다. 연결표는
       상품번호가 다른 체험몰을 위한 우회로다 */
    const cafe24No = links[product.productNo] ?? product.productNo;
    try {
      const before = await getProduct(cafe24No);
      const target = floorTo10(Number(before.price) * (1 - rate));
      const after = await setProductPrice(cafe24No, target);
      report.applied.push({
        productNo: product.productNo,
        name: product.name,
        cafe24ProductNo: cafe24No,
        rate,
        originalPrice: before.price,
        newPrice: after.price,
      });
    } catch (cause) {
      report.skipped.push({
        productNo: product.productNo,
        name: product.name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  /* 원가는 여기 적어둔 것이 유일한 기록이다 — 저장이 실패하면 복원할 방법이 없다 */
  const saved = await record(date, rate, changePct, report.applied, report.skipped.length);
  if (!saved) {
    report.note = `⚠️ 자사몰은 바꿨지만 원가 기록 저장에 실패했습니다 — 자동 복원이 안 됩니다. 관리자 화면에서 손으로 되돌려야 합니다: ${report.applied.map(i => `${i.name} ${i.originalPrice}`).join(' · ')}`;
  }
  return report;
}

/**
 * 자정 — 원가로 되돌린다.
 *
 * daily_plans에 적어둔 originalPrice를 그대로 쓴다. 기록이 없으면 아무것도 하지
 * 않는다 — 추측으로 가격을 쓰지 않는다.
 */
export async function restoreToday(at: Date = new Date()): Promise<SyncReport> {
  const date = seoulDateString(at);
  const report: SyncReport = {
    action: 'restore', date, dryRun: !enabled(), rate: 0, changePct: 0,
    applied: [], skipped: [], note: null,
  };

  const db = supabase();
  if (!db) { report.note = '저장소가 없어 복원할 기록을 읽지 못했습니다.'; return report; }

  const { data, error } = await db
    .from('daily_plans')
    .select('items, rate')
    .eq('plan_date', date)
    .maybeSingle();

  if (error || !data) { report.note = `${date}에 반영한 기록이 없습니다 — 되돌릴 것이 없습니다.`; return report; }

  const items = (data.items ?? []) as SyncItem[];
  report.rate = Number(data.rate ?? 0);
  if (!items.length) { report.note = '반영 기록이 비어 있습니다.'; return report; }

  if (!enabled()) {
    report.note = '스위치가 꺼져 있어 계산만 했습니다.';
    report.applied = items;
    return report;
  }

  for (const item of items) {
    try {
      const after = await setProductPrice(item.cafe24ProductNo, Number(item.originalPrice));
      report.applied.push({ ...item, newPrice: after.price });
    } catch (cause) {
      report.skipped.push({
        productNo: item.productNo,
        name: item.name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  await db.from('daily_plans')
    .update({ status: report.skipped.length ? 'failed' : 'draft', cafe24_note: `자정 복원 ${report.applied.length}건` })
    .eq('plan_date', date);

  return report;
}

/** 스위치가 꺼져 있을 때 — 바꾸지 않고 "무엇을 바꿀 것인가"만 만든다 */
async function planOnly(products: Product[], rate: number): Promise<SyncItem[]> {
  return products.map(product => ({
    productNo: product.productNo,
    name: product.name,
    cafe24ProductNo: product.productNo,
    rate,
    originalPrice: String(product.price),
    newPrice: String(floorTo10(product.price * (1 - rate))),
  }));
}

async function record(
  date: string,
  rate: number,
  changePct: number,
  applied: SyncItem[],
  skipped: number,
): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db.from('daily_plans').upsert({
    plan_date: date,
    rate,
    kospi_change: changePct,
    headline: `자동 반영 · 전 상품 ${Math.round(rate * 100)}%`,
    reason: `KOSPI ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
    items: applied,
    status: applied.length ? 'published' : 'failed',
    approved_at: new Date().toISOString(),
    approved_by: 'cron',
    cafe24_note: skipped ? `건너뜀 ${skipped}건` : null,
  }, { onConflict: 'plan_date' });
  return !error;
}
