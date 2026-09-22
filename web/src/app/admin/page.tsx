import type { Metadata } from 'next';
import AdminConsole, { type PlanSummary } from '@/components/AdminConsole';
import AdminLogin from '@/components/AdminLogin';
import Cafe24Panel from '@/components/Cafe24Panel';
import { isAdmin } from '@/lib/adminAuth';
import TierSettings from '@/components/TierSettings';
import IpoSettings from '@/components/IpoSettings';
import DividendSettings from '@/components/DividendSettings';
import IpoRounds from '@/components/IpoRounds';
import { loadAllotment, loadDividendPolicy, loadIpoEnabled, MAX_DIVIDEND_RATE } from '@/lib/appSettings';
import { listRounds } from '@/lib/ipo';
import { loadProductLinks, loadTiers } from '@/lib/settings';
import { fetchStock } from '@/lib/stock';
import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';

/* 검색엔진에 올리지 않는다. 로그인이 붙기 전까지는 주소를 아는 사람만 들어온다. */
export const metadata: Metadata = {
  title: '관리자 · 막지 절기상점',
  description: '출품 검수와 할인안 승인.',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  /* 서버에서 막는다. 화면만 감추면 API 주소를 직접 부르는 순간 뚫린다. */
  if (!(await isAdmin())) {
    return <main id="main-content" className="page-width inner-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ADMIN · 내부용</span>
          <h1>관리자 <em>확인.</em></h1>
        </div>
      </header>
      <AdminLogin />
    </main>;
  }

  /* 구간과 연결표는 관리자가 바꾸는 값이라 DB에서 읽는다. 비어 있으면 코드 기본값. */
  const [market, tiers, links, ipo, dividend, allotment, stock] = await Promise.all([
    getMarketSnapshot(new Date()),
    loadTiers(),
    loadProductLinks(),
    loadIpoEnabled(),
    loadDividendPolicy(),
    loadAllotment(),
    fetchStock(),
  ]);
  const seasons = await listRounds();
  const daily = buildDailyPlan(market, undefined, tiers);
  /* 즉시구매 칸의 폭 = 가장 얕은 구간. 자사몰에 반영하는 기본값이다. */
  const instantDepth = Math.min(...tiers.map(tier => tier.rate));
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
      /* 카페24에서 읽어온 값. 관리자 화면은 보여주기만 하고 바꾸지 않는다 */
      stock: stock.quantity[item.product.productNo] ?? null,
      options: (stock.options[item.product.productNo] ?? []).map(o => ({ label: o.label, quantity: o.quantity })),
    })),
    soldOutCount: daily.soldOut.length,
  };

  return <main id="main-content" className="page-width inner-page">
    <header className="page-heading">
      <div>
        <span className="eyebrow">ADMIN · 내부용</span>
        <h1>검수와 <em>승인.</em></h1>
        <p>오늘의 호가 범위를 확인하고 자사몰에 반영합니다.</p>
      </div>
    </header>
    <AdminConsole plan={plan} links={links} maxRate={MAX_DISCOUNT_RATE} instantDepth={instantDepth} allotment={allotment} />
    <TierSettings initial={tiers} maxRate={MAX_DISCOUNT_RATE} />
    <IpoSettings initial={ipo.value} stored={ipo.stored} />
    <DividendSettings initial={dividend} maxRate={MAX_DIVIDEND_RATE} />
    <IpoRounds initial={seasons.rounds} stored={seasons.stored} />
    <Cafe24Panel links={links} />
  </main>;
}
