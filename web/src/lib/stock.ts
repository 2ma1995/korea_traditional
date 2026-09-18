import { PRODUCTS, type Product } from '@/data/products';
import { adminApi, cafe24Config } from '@/lib/cafe24';

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
const SHOP_LIST = 'https://makji.kr/product/list.html?cate_no=24';

/** 카페24가 봇 취급하지 않도록. 목록 HTML이 UA에 따라 달라진다 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type StockSource = 'cafe24' | 'shop' | 'code';

export interface StockReport {
  /** productNo → 지금 살 수 있는가 */
  map: Record<number, boolean>;
  source: StockSource;
  /** 조회 시각 (epoch ms) */
  at: number;
  /** 앞 단계가 왜 실패했는지. 성공했으면 null */
  note: string | null;
}

/* ── 1순위: 카페24 Admin API ──────────────────────────────────── */

interface Cafe24Variant {
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

async function fromCafe24(): Promise<Record<number, boolean> | null> {
  if (!cafe24Config()) return null;
  const nos = PRODUCTS.map(product => product.productNo).join(',');
  const data = await adminApi<{ products?: Cafe24ListItem[] }>(
    `/api/v2/admin/products?product_no=${nos}&limit=100&embed=variants`,
  );
  const list = data?.products;
  if (!Array.isArray(list) || !list.length) return null;
  return Object.fromEntries(list.map(product => [product.product_no, sellable(product)]));
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

export async function fetchStock(): Promise<StockReport> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.report;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const notes: string[] = [];
    try {
      try {
        const api = await fromCafe24();
        if (api) return keep({ map: api, source: 'cafe24', at: Date.now(), note: null });
        notes.push(cafe24Config() ? '카페24: 응답에 상품이 없음' : '카페24: 환경변수 없음');
      } catch (error) {
        notes.push(`카페24: ${reason(error)}`);
      }

      try {
        const shop = await fromShop();
        if (shop) return keep({ map: shop, source: 'shop', at: Date.now(), note: notes.join(' · ') || null });
        notes.push('자사몰: 목록에서 품절 배지를 못 읽음');
      } catch (error) {
        notes.push(`자사몰: ${reason(error)}`);
      }

      /* 실패도 5분 물고 있는다 — 외부가 죽었을 때 매 요청마다 재시도하지 않게 */
      return keep({
        map: Object.fromEntries(PRODUCTS.map(product => [product.productNo, product.inStock])),
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
    return live === undefined || live === product.inStock ? product : { ...product, inStock: live };
  });
}
