import { PRODUCTS, type Product } from '@/data/products';
import { isInSeason, SEASONAL_INGREDIENTS, type SeasonalIngredient } from '@/data/seasonalIngredients';
import type { DailyPlan } from './discount';
import type { ProducePrice } from './produceApi';
import type { SolarTerm } from '@/data/solarTerms';

/**
 * 메타 광고 랜딩용 오늘의 캠페인.
 *
 * ★ AI 콘텐츠 생성 금지 제약 대응
 *   문구를 새로 "생성"하지 않는다. 기업 승인을 받은 문형(템플릿)에
 *   절기명·품목명·수치만 끼워 넣는다. 가격·시세는 브랜드 콘텐츠가 아니므로
 *   승인 큐를 거치지 않아도 된다.
 *
 * 아래 문형은 기업 승인 대상이고, 승인 후에는 값만 매일 바뀐다.
 */

export interface Campaign {
  /** 광고 소재 헤드라인 */
  headline: string;
  /** 서브카피 */
  subline: string;
  /** 주인공 재료 (없을 수 있음) */
  hero: { ingredient: SeasonalIngredient; price: ProducePrice } | null;
  /** 주인공 제품 */
  product: Product;
  /** 최종가 */
  finalPrice: number;
  /** 총 할인율 */
  rate: number;
  /** 쿠폰 코드 */
  couponCode: string;
  /** 근거 문장 — "왜 오늘 이 가격인가" */
  reasons: string[];
  /** 자사몰 딥링크 (UTM 포함) */
  shopUrl: string;
}

const SHOP_BASE = 'https://makji.kr/product/detail.html';

function floorTo10(n: number) {
  return Math.floor(n / 10) * 10;
}

/** 절기명을 쿠폰 코드로 — 한글이 URL에 섞이지 않게 황경 값을 쓴다 */
function couponFor(term: SolarTerm, date: string) {
  return `MAKJI${term.longitude}${date.slice(5, 7)}${date.slice(8, 10)}`;
}

function utm(productNo: number, campaign: string) {
  const params = new URLSearchParams({
    product_no: String(productNo),
    utm_source: 'meta',
    utm_medium: 'cpc',
    utm_campaign: 'breadmarket',
    utm_content: campaign,
  });
  return `${SHOP_BASE}?${params.toString()}`;
}

export function buildCampaign(
  term: SolarTerm,
  plan: DailyPlan,
  produce: Map<string, ProducePrice>,
  date: Date,
): Campaign {
  const month = date.getMonth() + 1;

  // 주인공 재료 = 제철이면서 전월 대비 가장 많이 내린 것
  const candidates = SEASONAL_INGREDIENTS.map((ing) => ({ ing, price: produce.get(ing.code) }))
    .filter(
      (x): x is { ing: SeasonalIngredient; price: ProducePrice } =>
        Boolean(x.price) && x.price!.changeMonthPct !== null,
    )
    .filter((x) => isInSeason(x.ing, month))
    .sort((a, b) => (a.price.changeMonthPct ?? 0) - (b.price.changeMonthPct ?? 0));

  const top = candidates[0];
  const hero = top && (top.price.changeMonthPct ?? 0) < 0 ? { ingredient: top.ing, price: top.price } : null;

  // 주인공 제품 = 오늘 할인 대상 중 판매 가능한 것. 없으면 판매 중인 아무 제품.
  const product =
    plan.items[0]?.product ?? PRODUCTS.find((p) => p.inStock) ?? PRODUCTS[0];

  const rate = plan.items[0] ? plan.rate : 0;
  const finalPrice = floorTo10(product.price * (1 - rate));

  const reasons: string[] = [];
  if (hero) {
    const drop = Math.abs(hero.price.changeMonthPct ?? 0).toFixed(1);
    reasons.push(
      `${hero.ingredient.name} 소매가가 한 달 전보다 ${drop}% 내렸습니다 (공영도매시장 소매 시세)`,
    );
  }
  if (term.anchor && term.food) {
    reasons.push(`${term.ko}는 ${term.food}`);
  }
  reasons.push(
    plan.targetGlutenFree
      ? '코스피가 올라 밀가루를 쓰지 않은 글루텐프리 라인을 할인합니다'
      : '코스피가 내려 부담을 덜어드리는 가격으로 준비했습니다',
  );

  const headline = hero
    ? `${term.ko}, ${hero.ingredient.name}가 한 달 새 ${Math.abs(hero.price.changeMonthPct ?? 0).toFixed(0)}% 내렸습니다`
    : `${term.ko}, 오늘의 빵시장`;

  const subline = hero
    ? `${product.name} 위에 ${hero.ingredient.name}를 올려보세요`
    : `오늘은 ${product.name}입니다`;

  return {
    headline,
    subline,
    hero,
    product,
    finalPrice,
    rate,
    couponCode: couponFor(term, plan.date),
    reasons,
    shopUrl: utm(product.productNo, `${plan.date}_${term.ko}`),
  };
}
