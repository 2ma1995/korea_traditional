import type { Metadata } from 'next';
import Link from 'next/link';
import BreadBuilder, { type BuilderBread } from '@/components/BreadBuilder';
import ProductPhoto from '@/components/ProductPhoto';
import { PRODUCTS } from '@/data/products';
import { isInSeason, SEASONAL_INGREDIENTS } from '@/data/seasonalIngredients';
import { buildCampaign } from '@/lib/campaign';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { fetchProducePrices, type ProducePrice } from '@/lib/produceApi';
import { currentTerm, nextTerm } from '@/lib/solarTerm';

export const metadata: Metadata = { title: '나만의 절기상 · 막지', description: '막지의 빵 위에 제철 재료를 올려 나만의 절기상을 차려보세요.' };

export default async function EventPage() {
  const today = new Date();
  const [market, produce] = await Promise.all([getMarketSnapshot(today), fetchProducePrices(today)]);
  const plan = buildDailyPlan(market);
  const term = currentTerm(today);
  const upcoming = nextTerm(today);
  const campaign = buildCampaign(term, plan, produce, today);
  const breads: BuilderBread[] = PRODUCTS.filter((p) => p.inStock).map((p) => ({ productNo: p.productNo, name: p.name, price: p.price, baseRate: p.glutenFree === plan.targetGlutenFree ? plan.rate : 0 }));
  // Pairing remains available even when the produce price API is unavailable.
  const month = today.getMonth() + 1;
  const seasonal = SEASONAL_INGREDIENTS.filter((i) => isInSeason(i, month));
  const priceMap: Record<string, ProducePrice> = Object.fromEntries(produce);

  return <main id="main-content" className="page-width inner-page">
    <header className="page-heading"><div><span className="eyebrow">MAKE YOUR SEASONAL TABLE</span><h1>나만의 <em>절기상.</em></h1><p>빵 하나, 제철 한 조각. 오늘의 취향을 차려보세요.</p></div><div className="heading-seal"><span>이번 절기</span><strong>{term.ko}</strong><small>{term.hanja} · D–{upcoming.daysLeft}</small></div></header>
    <ol className="steps-strip"><li><span>01</span> 마음에 드는 빵 고르기</li><li><span>02</span> 제철 재료 얹어보기</li><li><span>03</span> 나의 조합 공유하기</li></ol>
    <div className="builder-layout" id="bread-builder">
      <BreadBuilder breads={breads} ingredients={seasonal} prices={priceMap} termName={term.ko} month={month} />
      <aside className="builder-aside"><section className="season-story"><span className="eyebrow">A NOTE ON THE SEASON</span><h2>{term.ko},<br />계절의 한 페이지.</h2><p>{term.food}</p>{term.rationale && <p>{term.rationale}</p>}<div className="story-pairing"><span>이번 절기 페어링 아이디어</span><strong>{term.productIdea}</strong></div><Link href="/archive" className="text-link">절기 이야기 더 보기 <span>↗</span></Link></section><section className="aside-product"><ProductPhoto productNo={campaign.product.productNo} name={campaign.product.name} /><div><span className="eyebrow">TODAY’S PICK</span><h3>{campaign.product.name}</h3><p>{campaign.finalPrice.toLocaleString('ko-KR')}원 <span className="text-hong">{Math.round(campaign.rate * 100)}%</span></p><a href={campaign.shopUrl} target="_blank" rel="noopener noreferrer" className="text-link">공식몰에서 상품 보기 ↗</a></div></section></aside>
    </div>
    <p className="fine-print builder-notice">제철 재료는 페어링 제안이며 판매 상품에 포함되지 않습니다. 재료를 선택해도 빵 가격은 바뀌지 않습니다.{produce.size === 0 && ' 현재 재료 시세를 불러올 수 없어 가격 정보 없이 조합을 체험할 수 있습니다.'} 이벤트 가격은 시연용 계산이며 실제 구매 혜택은 공식몰에서 확인해주세요.</p>
    <section className="inline-invitation"><div><span className="eyebrow">TASTES BETTER TOGETHER</span><h2>다른 사람들은 어떻게 차렸을까요?</h2><p>모두의 절기상에서 새로운 조합을 만나보세요.</p></div><Link href="/contest" className="button button-primary">모두의 절기상 <span>↗</span></Link></section>
  </main>;
}
