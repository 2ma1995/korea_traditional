import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { PRODUCTS, type Product } from '@/data/products';
import { getProduct, getVariants, setProductPrice, setVariantAmount } from '@/lib/cafe24';
import { getMarketSnapshot, seoulDateString } from '@/lib/market';
import { rateFor } from '@/lib/offers';
import { marketHours } from '@/lib/orderbook';
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

/**
 * 지금 자사몰 판매가가 실제로 오늘 폭으로 바뀌고 있는가.
 *
 * 화면이 "오늘 가격이 이미 적용돼 있습니다"라고 말해도 되는지 판단하는 값이다.
 * 의도(DISCOUNT_DELIVERY=price)와 실제(PRICE_SYNC=on)는 다르다 — 의도만 보고
 * 말하면 값은 정가인데 싸다고 말하는 꼴이 된다. 이 서비스가 계속 싸워온 문제다.
 */
export const priceSyncActive = enabled;

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
  /**
   * 같이 깎은 옵션 추가금. 실제로 바꾼 것만 들어간다 — 복원의 근거다.
   *
   * 0011 이전 기록에는 이 열이 없다. 그때 걸어둔 할인을 복원할 때 undefined가
   * 되어야 하므로 선택값이다(restoreToday에서 ?? []로 받는다).
   */
  variants?: { code: string; originalAmount: string; newAmount: string }[];
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

  const result = await applyPrices(date, products.map(product => ({ product, rate })), {
    rate, changePct,
    headline: `자동 반영 · 전 상품 ${Math.round(rate * 100)}%`,
    reason: `KOSPI ${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
    approvedBy: 'cron',
  });
  report.applied = result.applied;
  report.skipped = result.skipped;
  report.note = result.refused ?? result.note;
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
      /* 추가금을 먼저 되돌리든 나중이든 상관없지만, 하나라도 실패하면 그 상품은
         건너뜀으로 간다 — 판매가만 정가로 돌아가고 추가금이 깎인 채 남으면
         내일 할인이 그 위에서 또 걸린다 */
      for (const v of item.variants ?? []) {
        await setVariantAmount(item.cafe24ProductNo, v.code, Number(v.originalAmount));
      }
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

export interface PlanMeta { rate: number; changePct: number | null; headline: string; reason: string | null; approvedBy: string | null }

/**
 * 판매가를 바꾸고 원가를 적는다 — 15:30 크론과 관리자 버튼이 같이 쓴다.
 *
 * 두 가지를 지킨다.
 *  ① 오늘 이미 바꿔둔 기록이 있으면 손대지 않는다. 두 번 누르거나 버튼과 크론이
 *     겹치면, 이미 깎인 값을 "원가"로 읽고 또 깎은 뒤 그 값으로 기록을 덮어써서
 *     진짜 원가가 사라졌다.
 *  ② 원가를 **바꾸기 전에** 적는다. 바꾼 뒤에 적으면 그 사이 함수가 끊겼을 때
 *     (maxDuration) 가격은 내려갔는데 되돌릴 근거가 없다. 먼저 적어둔 것을 못
 *     바꿨다면 자정 복원이 같은 값을 한 번 더 쓸 뿐이라 해가 없다.
 *
 *
 * ①은 오늘 줄을 'approved'(반영 중)로 먼저 잡은 쪽만 진행한다(claimDay). 버튼과 크론이
 * 같은 초에 들어와도 한쪽은 insert가 기본키에 걸리거나 updated_at 비교에서 진다.
 * ②는 옵션 추가금도 마찬가지다 — 목표 금액까지 적어둔 뒤에 판매가·추가금을 바꾼다.
 */
export async function applyPrices(
  date: string,
  rows: { product: Product; rate: number }[],
  meta: PlanMeta,
): Promise<{ applied: SyncItem[]; skipped: SyncReport['skipped']; note: string | null; refused?: string }> {
  const skipped: SyncReport['skipped'] = [];
  /* 휴장일에는 바꾸지 않는다. 빵장이 안 열리는 날이고, 주말엔 되돌리는 자정 크론도
     돌지 않아 할인가가 그대로 남는다. 15:30 크론은 이미 건너뛰는데 관리자 버튼이 뚫려 있었다 */
  const hours = marketHours();
  if (hours.reason === 'holiday') {
    return { applied: [], skipped, note: null, refused: `오늘은 ${hours.closedFor ?? '휴장일'}이라 반영하지 않습니다. 다음 장 ${hours.nextOpen ?? ''}에 반영하세요.` };
  }
  const db = supabase();
  if (!db) return { applied: [], skipped, note: null, refused: '저장소가 없어 원가를 적을 수 없습니다 — 되돌릴 수 없는 변경은 하지 않습니다.' };

  const refused = await claimDay(date, meta);
  if (refused) return { applied: [], skipped, note: null, refused };

  const links = await loadProductLinks();
  const recorded: SyncItem[] = [];
  const applied: SyncItem[] = [];
  let saved = true;

  for (const { product, rate } of rows) {
    /* products.ts의 productNo는 makji.kr의 실제 카페24 상품번호다. 연결표는
       상품번호가 다른 체험몰을 위한 우회로다 */
    const cafe24No = links[product.productNo] ?? product.productNo;
    try {
      /* 할인은 자사몰의 현재 판매가를 기준으로 건다 — 그 사이 기업이 가격을 바꿨을 수 있다 */
      const before = await getProduct(cafe24No);
      const target = floorTo10(Number(before.price) * (1 - rate));
      /* 옵션 추가금도 같은 비율로 깎는다 — 판매가만 깎으면 많이 살수록 할인율이 떨어진다
         (4,500원을 5% 깎아도 5개 옵션이면 실효 1.2%). 추가금 0인 기본 품목은 건너뛴다.
         조회가 실패하면 추가금 없이 판매가만 간다 — 예외로 멈추면 그 상품 전체를 못 건다 */
      const variants = (await getVariants(cafe24No).catch(() => []))
        .filter(v => Number.isFinite(Number(v.additional_amount)) && Number(v.additional_amount) > 0)
        .map(v => ({ code: v.variant_code, originalAmount: v.additional_amount, newAmount: String(floorTo10(Number(v.additional_amount) * (1 - rate))) }));
      const item: SyncItem = {
        productNo: product.productNo, name: product.name, cafe24ProductNo: cafe24No, rate,
        originalPrice: before.price, newPrice: String(target), variants,
      };
      /* 바꾸기 전에 원가(판매가·추가금 모두)를 적는다. 못 바꾼 것까지 적혀 있어도
         자정 복원이 같은 값을 한 번 더 쓸 뿐이라 해가 없다 */
      recorded.push(item);
      if (!(await record(date, meta, recorded, skipped.length))) {
        recorded.pop();
        saved = false;
        skipped.push({ productNo: product.productNo, name: product.name, reason: '원가 기록 저장 실패 — 바꾸지 않았습니다' });
        continue;
      }
      const after = await setProductPrice(cafe24No, target);
      item.newPrice = after.price;
      for (const v of variants) {
        try {
          v.newAmount = (await setVariantAmount(cafe24No, v.code, Number(v.newAmount))).additional_amount;
        } catch {
          /* 이 품목만 정가로 남는다. 나머지는 계속 깎는다 — 하나 때문에 전부 멈추면
             이미 내려간 판매가와 더 어긋난다 */
        }
      }
      applied.push(item);
    } catch (cause) {
      skipped.push({
        productNo: product.productNo,
        name: product.name,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  /* 실제로 바뀐 값까지 담아 마무리한다. 하나도 못 바꿨으면 'failed'로 남긴다 —
     'approved'(반영 중)로 두면 5분 동안 아무도 다시 못 건다 */
  if (!(await record(date, meta, recorded, skipped.length))) saved = saved && !recorded.length;
  const note = saved ? null
    : `⚠️ 원가 기록 일부를 저장하지 못했습니다. 자정 복원이 빠뜨릴 수 있으니 확인하세요: ${applied.map(i => `${i.name} ${i.originalPrice}`).join(' · ')}`;
  return { applied, skipped, note };
}

/** 반영 중 표시가 이보다 오래됐고 적힌 원가가 없으면, 끊긴 실행으로 보고 다시 잡는다 */
const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * 오늘 반영을 한 곳만 하게 잡는다. 잡으면 null, 못 잡으면 거절 사유.
 *
 * 줄이 없으면 insert로 잡는다 — 동시에 둘이 넣으면 기본키(plan_date)가 한쪽을 막는다.
 * 줄이 있으면 비어 있을 때만(복원 끝 draft / 원가 없는 failed / 끊긴 approved)
 * updated_at이 읽은 그대로일 때 덮어쓴다 — 그 사이 누가 먼저 잡았으면 0줄이 바뀐다.
 */
export async function claimDay(date: string, meta: PlanMeta): Promise<string | null> {
  const db = supabase();
  if (!db) return '저장소가 없어 원가를 적을 수 없습니다 — 되돌릴 수 없는 변경은 하지 않습니다.';
  const claim = {
    plan_date: date, rate: meta.rate, kospi_change: meta.changePct, headline: `${meta.headline} · 반영 중`,
    reason: meta.reason, items: [], status: 'approved', approved_at: new Date().toISOString(), approved_by: meta.approvedBy,
  };
  const { error } = await db.from('daily_plans').insert(claim);
  if (!error) return null;
  if (error.code !== '23505') return `오늘 기록을 잡지 못했습니다: ${error.message}`;

  const { data: existing } = await db.from('daily_plans').select('status, items, updated_at, approved_at').eq('plan_date', date).maybeSingle();
  if (!existing) return '오늘 기록이 방금 바뀌었습니다. 잠시 뒤 다시 누르세요.';
  const empty = !((existing.items as unknown[] | null) ?? []).length;
  /* 끊겼는지는 approved_at으로 본다 — 반영 중에는 상품마다 record()가 갱신한다.
     updated_at은 트리거가 어떤 수정에도 지금 시각으로 덮어써 기준이 못 된다 */
  const stale = Date.now() - new Date((existing.approved_at as string | null) ?? 0).getTime() > STALE_CLAIM_MS;
  if (existing.status === 'approved' && empty && !stale) return '다른 곳(버튼 또는 15:30 크론)에서 지금 반영하고 있습니다.';
  const free = existing.status === 'draft' || (empty && (existing.status === 'failed' || existing.status === 'approved'));
  /* 원가가 적혀 있으면 아직 깎인 상태다 — 다시 걸면 깎인 값을 원가로 잃는다 */
  if (!free) return `${date}에는 이미 판매가를 바꿔두었습니다. 자정 복원 전에 다시 걸면 깎인 값을 원가로 잃습니다.`;

  const { data: won } = await db.from('daily_plans').update(claim)
    .eq('plan_date', date).eq('updated_at', existing.updated_at as string).select('plan_date');
  return won?.length ? null : '다른 곳에서 동시에 반영을 시작했습니다.';
}

async function record(date: string, meta: PlanMeta, items: SyncItem[], skipped: number): Promise<boolean> {
  const db = supabase();
  if (!db) return false;
  const { error } = await db.from('daily_plans').upsert({
    plan_date: date,
    rate: meta.rate,
    kospi_change: meta.changePct,
    headline: meta.headline,
    reason: meta.reason,
    items,
    status: items.length ? 'published' : 'failed',
    approved_at: new Date().toISOString(),
    approved_by: meta.approvedBy,
    cafe24_note: skipped ? `건너뜀 ${skipped}건` : null,
  }, { onConflict: 'plan_date' });
  return !error;
}
