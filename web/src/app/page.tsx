import Market from '@/components/Market';
import MarketIntro from '@/components/MarketIntro';
import { PRODUCTS } from '@/data/products';
import { loadFilled } from '@/lib/fills';
import { fetchKospiHistory, getMarketSnapshot } from '@/lib/market';
import { buildToday } from '@/lib/offers';
import { OPEN_AT } from '@/lib/orderbook';
import { loadTiers } from '@/lib/settings';
import { bidState } from '@/lib/bidRight';
import { currentRound, loadIpoCounts } from '@/lib/ipo';
import { loadSkuSignals } from '@/lib/skuSignals';
import { applyStock, fetchStock } from '@/lib/stock';

/**
 * 빵장 — 서버는 오늘의 재료를 모아 넘기기만 한다.
 *   시세(코스피 마감 + 당일 5분봉) · 구간 · 오늘 나간 수량 · 공모주 회차
 * 화면 순서와 상호작용은 Market(클라이언트)에 있다.
 */
export default async function BreadMarketPage() {
  const now = new Date();
  const [market, tiers, filled, intraday, stock, signals] = await Promise.all([
    getMarketSnapshot(now),
    loadTiers(),
    loadFilled(now),
    fetchKospiHistory('1d'),
    fetchStock(),
    loadSkuSignals(now),
  ]);
  /* 재고는 자사몰에서 받아온다 — products.ts의 값은 마지막 안전망이다.
     손으로 적어둔 값이 열흘 묵어 생지를 품절로 걸러낸 적이 있다. */
  const products = applyStock(PRODUCTS, stock);
  const today = buildToday(market, tiers, filled, now, products, signals);

  /* 이번 공모 회차. 평소엔 품절 상품 재입고 공모, 이분이지엔 절기 신제품 공모다.
     후보가 재고에서 나오므로 재고를 받은 뒤에 세운다 (lib/ipo) */
  const round = currentRound(now, products.filter(product => !product.inStock));
  const [ipoCounts, mine] = await Promise.all([loadIpoCounts(round), bidState(now)]);

  /* 대문이 뭐라고 말할지 — Market.tsx의 phase와 같은 규칙이다.
     거기는 폴링한 marketOpen을, 여기는 서버 스냅샷을 쓴다. 문이 열려 있는
     3.4초 사이에 장이 닫히는 경계는 무시해도 되는 오차다. */
  const introPhase = market.kospiMarketOpen
    ? 'live'
    : today.hours.open ? 'open'
    : today.hours.reason === 'before' ? 'locked'
    : 'closed';

  return (
    <main id="main-content">
      <MarketIntro
        phase={introPhase}
        theme={today.mood.theme}
        changePct={today.changePct}
        rate={today.rate}
        openAt={OPEN_AT}
      >
      <Market
        today={today}
        tiers={tiers}
        round={round}
        ipo={{ ...ipoCounts, ...mine }}
        points={intraday?.points ?? []}
        kospi={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live, marketOpen: market.kospiMarketOpen }}
      />
      </MarketIntro>
    </main>
  );
}
