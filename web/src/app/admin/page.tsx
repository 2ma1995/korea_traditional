import type { Metadata } from 'next';
import AdminConsole, { type PlanSummary } from '@/components/AdminConsole';
import AdminLogin from '@/components/AdminLogin';
import { isAdmin } from '@/lib/adminAuth';
import TierSettings from '@/components/TierSettings';
import IpoSettings from '@/components/IpoSettings';
import DividendPayout from '@/components/DividendPayout';
import DividendSettings from '@/components/DividendSettings';
import IpoRounds from '@/components/IpoRounds';
import { ALLOTMENT_DEFAULT, allotmentFor, loadAllotments, loadDividendPolicy, loadIpoEnabled, MAX_DIVIDEND_RATE } from '@/lib/appSettings';
import { listRounds } from '@/lib/ipo';
import { loadProductLinks, loadTiers } from '@/lib/settings';
import { PRODUCTS } from '@/data/products';
import { applyStock, fetchStock } from '@/lib/stock';
import { MAX_DISCOUNT_RATE } from '@/data/indicators';
import { buildToday, priceAt } from '@/lib/offers';
import { loadSkuSignals } from '@/lib/skuSignals';
import { getMarketSnapshot } from '@/lib/market';
import { payoutMode } from '@/lib/cafe24';

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
  const [market, tiers, links, ipo, dividend, allotments, stock] = await Promise.all([
    getMarketSnapshot(new Date()),
    loadTiers(),
    loadProductLinks(),
    loadIpoEnabled(),
    loadDividendPolicy(),
    loadAllotments(),
    fetchStock(),
  ]);
  const seasons = await listRounds();
  const today = buildToday(market, tiers, undefined, new Date(), applyStock(PRODUCTS, stock), await loadSkuSignals(), allotments.value);
  /* 즉시구매 칸의 폭 = 가장 얕은 구간. 자사몰에 반영하는 기본값이다. */
  const instantDepth = Math.min(...tiers.map(tier => tier.rate));
  const plan: PlanSummary = {
    date: today.date,
    headline: today.mood.copy,
    reason: today.mood.theme,
    rate: today.rate,
    items: today.offers.map(item => ({
      productNo: item.product.productNo,
      name: item.product.name,
      price: item.product.price,
      finalPrice: item.price,
      rate: item.rate,
      /* 카페24에서 읽어온 값. 관리자 화면은 보여주기만 하고 바꾸지 않는다 */
      stock: stock.quantity[item.product.productNo] ?? null,
      /* 이 빵에 정한 물량. 정한 적 없으면 기본값이 뜬다 */
      allotment: allotmentFor(allotments.value, item.product.productNo),
      options: (stock.options[item.product.productNo] ?? []).map(o => ({
        code: o.code, label: o.label, quantity: o.quantity, add: o.add,
        /* 이 옵션에만 따로 정한 값이 있으면 그것 — 없으면 undefined로 두어
           화면이 빵 값으로 떨어지게 한다(allotmentFor와 같은 순서) */
        allotment: allotments.value[`${item.product.productNo}:${o.code}`],
      })),
      sellable: stock.map[item.product.productNo] ?? item.product.inStock,
    })),
    /* 오늘 목록에 없는 빵 — 관리자가 '+'로 넣을 수 있다 */
    pool: applyStock(PRODUCTS, stock)
      .filter(product => !today.offers.some(item => item.product.productNo === product.productNo))
      .map(product => ({
        productNo: product.productNo,
        name: product.name,
        price: product.price,
        finalPrice: priceAt(product.price, instantDepth).price,
        rate: instantDepth,
        stock: stock.quantity[product.productNo] ?? null,
        options: (stock.options[product.productNo] ?? []).map(o => ({
          code: o.code, label: o.label, quantity: o.quantity, add: o.add,
          allotment: allotments.value[`${product.productNo}:${o.code}`],
        })),
        allotment: allotmentFor(allotments.value, product.productNo),
        sellable: stock.map[product.productNo] ?? product.inStock,
      })),
    soldOutCount: today.soldOut.length,
  };

  return <main id="main-content" className="page-width inner-page">
    <header className="page-heading">
      <div>
        <span className="eyebrow">ADMIN · 내부용</span>
        <h1>검수와 <em>승인.</em></h1>
        <p>오늘의 호가 범위를 확인하고 자사몰에 반영합니다.</p>
      </div>
      <a href="/" target="_blank" rel="noopener noreferrer">빵장 화면 확인 ↗</a>
    </header>
    <AdminConsole plan={plan} links={links} maxRate={MAX_DISCOUNT_RATE} allotmentDefault={ALLOTMENT_DEFAULT} />
    <TierSettings initial={tiers} maxRate={MAX_DISCOUNT_RATE} />
    <DividendSettings initial={dividend} maxRate={MAX_DIVIDEND_RATE} />
    <DividendPayout mode={payoutMode()} />
    {/* 공모 관련은 한데 모은다. 회차 관리는 공모주를 켰을 때만 — 꺼둔 기능의 폼이
        화면 절반을 차지하면, 오늘 할 일(가격 반영)이 그만큼 아래로 밀린다 */}
    <IpoSettings initial={ipo.value} stored={ipo.stored} />
    {ipo.value && <IpoRounds initial={seasons.rounds} stored={seasons.stored} />}
  </main>;
}
