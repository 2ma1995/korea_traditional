import type { Metadata } from 'next';
import AdminConsole, { type PlanSummary } from '@/components/AdminConsole';
import { CURRENT_ENTRIES } from '@/data/contest';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';

/* 검색엔진에 올리지 않는다. 로그인이 붙기 전까지는 주소를 아는 사람만 들어온다. */
export const metadata: Metadata = {
  title: '관리자 · 막지 절기상점',
  description: '출품 검수와 할인안 승인.',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const market = await getMarketSnapshot(new Date());
  const daily = buildDailyPlan(market);
  const plan: PlanSummary = {
    date: daily.date,
    headline: daily.headline,
    reason: daily.reason,
    rate: daily.rate,
    items: daily.items.map(item => ({
      productNo: item.product.productNo,
      name: item.product.name,
      price: item.product.price,
      finalPrice: item.finalPrice,
    })),
    soldOutCount: daily.soldOut.length,
  };

  return <main id="main-content" className="page-width inner-page">
    <header className="page-heading">
      <div>
        <span className="eyebrow">ADMIN · 내부용</span>
        <h1>검수와 <em>승인.</em></h1>
        <p>멘션으로 들어온 출품을 확인하고, 오늘의 할인안을 게시합니다.</p>
      </div>
    </header>
    <AdminConsole entries={CURRENT_ENTRIES} plan={plan} />
  </main>;
}
