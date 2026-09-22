import { shopListUrl } from '@/lib/shop';
import { PRODUCTS, type Product } from '@/data/products';
import { adminApi, cafe24Config } from '@/lib/cafe24';
import { seoulDateString } from '@/lib/market';
import { supabase } from '@/lib/supabase';

/**
 * 재고 — 지금 자사몰에서 살 수 있는가.
 *
 * 왜 만들었나: 재고를 products.ts에 손으로 적어두었더니 열흘 지난 값이 남아
 * 냉동생지(21,000원, 재고품 중 최고가)를 계속 품절로 걸러냈다. 할인 금액이
 * 가장 큰 상품이 화면에서 통째로 빠져 있었고, 아무도 몰랐다.
 *
 * 세 단계로 본다.
 *   1. 카페24 Admin API  — 권한 있는 값. CAFE24_* 환경변수 + OAuth 인증 필요
 *   2. 자사몰 진열 목록   — 인증 없이 되는 값. 손님이 보는 것과 같다
 *   3. products.ts 상수  — 둘 다 안 되면 마지막으로 쓴다
 *
 * 2번을 두는 이유: 1번은 서버에 환경변수와 인증이 있어야 동작한다. 그게 없는
 * 동안에도 재고는 맞아야 한다. 어차피 알고 싶은 것은 "손님이 지금 자사몰에서
 * 살 수 있는가"이고, 진열 목록이 바로 그 답이다.
 *
 * 어느 단계가 쓰였는지는 /api/stock 에서 확인한다.
 */

/** 재고는 분 단위로 바뀌지 않는다. 5분 물고 있는다 */
const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;

/** 전체상품 목록. 상품 10종이 한 번에 다 나온다 — 상세 페이지를 10번 부르지 않는다 */
const SHOP_LIST = shopListUrl;

/** 카페24가 봇 취급하지 않도록. 목록 HTML이 UA에 따라 달라진다 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type StockSource = 'cafe24' | 'shop' | 'code';

/**
 * 자사몰이 실제로 파는 단위 — 옵션 하나.
 *
 * 빵장이 "− 1 +"로 아무 개수나 받던 것을 이걸로 바꾼다. 자사몰에 없는 단위를 팔면
 * 화면 금액과 결제 금액이 어긋나고(11개 = 46,970원 vs 40,730원), 손님이 자사몰에서
 * 옵션을 손수 조합해야 한다.
 *
 * 옵션 축은 상품마다 다르다 — 수량(1/3/5개)인 것도, 맛(피칸/초코)인 것도,
 * 구성(1box/2box)인 것도, 아예 없는 것도 있다. 그래서 뜻을 해석하지 않고
 * 자사몰 이름을 그대로 보여준다.
 */
export interface ShopOption {
  /** 카페24 품목코드. 재고 조정이 이 단위로 간다 */
  code: string;
  /** 자사몰에 적힌 그대로 — "3개", "피칸", "베스트 SET(햄치즈+라즈베리 슈크림)(2개)" */
  label: string;
  /** 정가에 더해지는 금액(원). 할인은 화면이 건다 */
  add: number;
  /** 이 옵션의 재고. 재고관리를 안 켰으면 null — "0개"와 "말한 적 없음"은 다르다 */
  quantity: number | null;
  /** 지금 살 수 있는가 */
  sellable: boolean;
}

export interface StockReport {
  /** productNo → 지금 살 수 있는가 */
  map: Record<number, boolean>;
  /**
   * productNo → 카페24가 관리 중인 실재고 수량.
   *
   * 재고관리를 켠(use_inventory='T') 상품만 들어온다. 안 켠 상품은 아예 없고,
   * 그러면 호출부가 코드 기본값(DAILY_ALLOTMENT)으로 떨어진다 —
   * 카페24가 0을 말한 것과 "말한 적 없는 것"은 다르다.
   */
  quantity: Record<number, number>;
  /**
   * productNo → 자사몰 옵션. 옵션이 하나뿐인(=선택지가 없는) 상품은 빈 배열이다.
   *
   * add는 **정가 기준 추가금**이다. 15:30 반영이 돌고 나면 카페24가 들고 있는 값은
   * 이미 깎인 값이라, 그대로 쓰면 화면이 두 번 깎는다. 그래서 오늘 반영 기록
   * (daily_plans)에 적어둔 원가로 덮어쓴다 — lib/priceSync가 거기 남긴다.
   */
  options: Record<number, ShopOption[]>;
  source: StockSource;
  /** 조회 시각 (epoch ms) */
  at: number;
  /** 앞 단계가 왜 실패했는지. 성공했으면 null */
  note: string | null;
}

/* ── 1순위: 카페24 Admin API ──────────────────────────────────── */

interface Cafe24Variant {
  variant_code?: string;
  options?: { name?: string; value?: string }[] | null;
  additional_amount?: string;
  quantity?: number;
  use_inventory?: string;
  selling?: string;
  display?: string;
}

interface Cafe24ListItem {
  product_no: number;
  selling: string;
  display: string;
  variants?: Cafe24Variant[];
}

/**
 * 살 수 있는가.
 *
 * 판매중(selling)·진열(display)이 먼저다. 다만 재고관리를 켠 상품은 수량이 0이
 * 되어도 selling이 'T'로 남고 품절 배지만 붙는다 — 그래서 옵션 수량도 본다.
 * embed=variants가 비어 오면(권한·버전 차이) 판매중·진열만으로 판단한다.
 */
function sellable(product: Cafe24ListItem): boolean {
  if (product.selling !== 'T' || product.display !== 'T') return false;
  const managed = (product.variants ?? []).filter(variant => variant.use_inventory === 'T');
  if (!managed.length) return true;
  return managed.some(variant => (variant.quantity ?? 0) > 0);
}

/**
 * 재고관리를 켠 옵션들의 수량 합. 안 켰으면 null —
 * 그때는 우리가 정한 기본값을 쓴다(카페24가 "0개"라고 말한 게 아니다).
 */
function managedQuantity(product: Cafe24ListItem): number | null {
  const managed = (product.variants ?? []).filter(variant => variant.use_inventory === 'T');
  if (!managed.length) return null;
  return managed.reduce((sum, variant) => sum + (variant.quantity ?? 0), 0);
}

/**
 * 옵션 목록. 선택지가 하나뿐이면 빈 배열 — 고를 것이 없으면 화면에 띄울 이유가 없다.
 *
 * 이름은 손대지 않는다. 축이 수량인지 맛인지 구성인지 상품마다 달라서, 해석하려 들면
 * "3개 set"과 "2box"와 "4가지맛 SET (4개)"를 전부 다르게 잘못 읽는다.
 */
function shopOptions(product: Cafe24ListItem): ShopOption[] {
  const variants = product.variants ?? [];
  if (variants.length < 2) return [];
  return variants
    .filter(variant => variant.variant_code)
    .map(variant => ({
      code: variant.variant_code as string,
      label: (variant.options ?? []).map(o => o?.value ?? '').filter(Boolean).join(' · '),
      add: Number(variant.additional_amount) || 0,
      quantity: variant.use_inventory === 'T' ? (variant.quantity ?? 0) : null,
      /* 재고관리를 안 켠 옵션은 수량으로 막지 않는다 — 카페24가 0이라 말한 게 아니다 */
      sellable: variant.display !== 'F' && variant.selling !== 'F'
        && (variant.use_inventory !== 'T' || (variant.quantity ?? 0) > 0),
    }))
    .filter(option => option.label);
}

/**
 * 오늘 반영해둔 원가 추가금으로 덮어쓴다.
 *
 * 15:30 반영이 돌면 카페24의 추가금은 이미 깎인 값이다. 화면은 정가에 할인을 걸어
 * 보여주므로, 그 값을 그대로 쓰면 두 번 깎여 자사몰보다 싸게 적힌다.
 * priceSync가 daily_plans에 원가를 적어두니 그것으로 되돌려 읽는다.
 * 기록이 없으면(반영 전) 카페24 값이 곧 원가다.
 */
async function withOriginalSurcharge(options: Record<number, ShopOption[]>, at: Date) {
  const db = supabase();
  if (!db) return options;
  const { data, error } = await db
    .from('daily_plans')
    .select('items')
    .eq('plan_date', seoulDateString(at))
    .maybeSingle();
  if (error || !data?.items) return options;

  const original = new Map<string, number>();
  for (const item of data.items as { variants?: { code: string; originalAmount: string }[] }[]) {
    for (const v of item.variants ?? []) original.set(v.code, Number(v.originalAmount) || 0);
  }
  if (!original.size) return options;

  for (const list of Object.values(options)) {
    for (const option of list) {
      const was = original.get(option.code);
      if (was !== undefined) option.add = was;
    }
  }
  return options;
}

async function fromCafe24(at: Date): Promise<{ map: Record<number, boolean>; quantity: Record<number, number>; options: Record<number, ShopOption[]> } | null> {
  if (!cafe24Config()) return null;
  const nos = PRODUCTS.map(product => product.productNo).join(',');
  const data = await adminApi<{ products?: Cafe24ListItem[] }>(
    `/api/v2/admin/products?product_no=${nos}&limit=100&embed=variants`,
  );
  const list = data?.products;
  if (!Array.isArray(list) || !list.length) return null;

  const map: Record<number, boolean> = {};
  const quantity: Record<number, number> = {};
  const options: Record<number, ShopOption[]> = {};
  for (const product of list) {
    map[product.product_no] = sellable(product);
    const q = managedQuantity(product);
    if (q !== null) quantity[product.product_no] = q;
    const opts = shopOptions(product);
    if (opts.length) options[product.product_no] = opts;
  }
  return { map, quantity, options: await withOriginalSurcharge(options, at) };
}

/* ── 2순위: 자사몰 진열 목록 ───────────────────────────────────── */

/**
 * 목록 HTML의 품절 배지.
 *
 * 카페24는 상품 칸마다 이렇게 찍는다.
 *   <a name="anchorBoxName_33"><div class="sold_out displaynone"><span></span>   ← 판매중
 *   <a name="anchorBoxName_29"><div class="sold_out "><span>SOLD OUT</span>      ← 품절
 * displaynone이 붙어 있으면 배지를 숨긴 것이니 판매중이다.
 *
 * ⚠️ 상세 페이지에 있는 `aSoldoutDisplay = {"33":"품절"}`은 상태가 아니라
 *    품절일 때 쓸 문구다. 이걸 상태로 읽어서 생지를 열흘간 품절로 두었다.
 */
const BADGE = /name="anchorBoxName_(\d+)"[^>]*>\s*<div class="sold_out( displaynone)?\s*"/g;

function parseShopList(html: string): Record<number, boolean> | null {
  const map: Record<number, boolean> = {};
  for (const match of html.matchAll(BADGE)) {
    map[Number(match[1])] = Boolean(match[2]);
  }
  /* 구조 검사. 마크업이 바뀌면 배지를 하나도 못 읽고 전부 품절로 보일 수 있다 —
     값이 아니라 "몇 개를 찾았는지"로 판단한다. 8할을 못 찾으면 읽지 못한 것이다. */
  const found = PRODUCTS.filter(product => product.productNo in map).length;
  if (found < Math.ceil(PRODUCTS.length * 0.8)) return null;
  return map;
}

async function fromShop(): Promise<Record<number, boolean> | null> {
  const response = await fetch(SHOP_LIST, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: TTL_MS / 1000 },
  });
  if (!response.ok) throw new Error(`목록 응답 ${response.status}`);
  return parseShopList(await response.text());
}

/* ── 조회 ─────────────────────────────────────────────────────── */

let cached: { at: number; report: StockReport } | null = null;
let inFlight: Promise<StockReport> | null = null;

function keep(report: StockReport): StockReport {
  cached = { at: report.at, report };
  return report;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 160);

export async function fetchStock(at: Date = new Date()): Promise<StockReport> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.report;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const notes: string[] = [];
    try {
      try {
        const api = await fromCafe24(at);
        if (api) return keep({ map: api.map, quantity: api.quantity, options: api.options, source: 'cafe24', at: Date.now(), note: null });
        notes.push(cafe24Config() ? '카페24: 응답에 상품이 없음' : '카페24: 환경변수 없음');
      } catch (error) {
        notes.push(`카페24: ${reason(error)}`);
      }

      try {
        const shop = await fromShop();
        /* 진열 목록 HTML은 품절 배지만 읽는다 — 수량은 알 수 없다 */
        /* HTML에서는 옵션을 못 읽는다 — 선택지 없이 단일 구매로 떨어진다 */
        if (shop) return keep({ map: shop, quantity: {}, options: {}, source: 'shop', at: Date.now(), note: notes.join(' · ') || null });
        notes.push('자사몰: 목록에서 품절 배지를 못 읽음');
      } catch (error) {
        notes.push(`자사몰: ${reason(error)}`);
      }

      /* 실패도 5분 물고 있는다 — 외부가 죽었을 때 매 요청마다 재시도하지 않게 */
      return keep({
        map: Object.fromEntries(PRODUCTS.map(product => [product.productNo, product.inStock])),
        quantity: {},
        options: {},
        source: 'code',
        at: Date.now(),
        note: notes.join(' · '),
      });
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** 조회한 재고를 상품 목록에 덮어쓴다. 모르는 상품은 코드 값을 그대로 둔다. */
export function applyStock(products: Product[], report: StockReport): Product[] {
  return products.map(product => {
    const live = report.map[product.productNo];
    const quantity = report.quantity[product.productNo];
    const inStock = live === undefined ? product.inStock : live;
    /* 수량은 카페24가 말해준 상품만 붙는다. 없으면 필드를 만들지 않아
       호출부가 코드 기본값(DAILY_ALLOTMENT)으로 떨어진다 */
    const options = report.options[product.productNo];
    if (inStock === product.inStock && quantity === undefined && !options) return product;
    return {
      ...product,
      inStock,
      ...(quantity === undefined ? {} : { allotment: quantity }),
      ...(options ? { options } : {}),
    };
  });
}
