import Market from '@/components/Market';
import { PRODUCTS } from '@/data/products';
import { loadFilled } from '@/lib/fills';
import { currentRound, loadIpoCounts } from '@/lib/ipo';
import { fetchSymbolQuote, getMarketSnapshot } from '@/lib/market';
import { buildToday } from '@/lib/offers';
import { loadTiers } from '@/lib/settings';

/**
 * 빵장 — 서버는 오늘의 재료를 모아 넘기기만 한다.
 *   시세(코스피 마감 + 당일 5분봉) · 구간 · 오늘 나간 수량 · 공모주 회차
 * 화면 순서와 상호작용은 Market(클라이언트)에 있다.
 */
export default async function BreadMarketPage() {
  const now = new Date();
  const round = currentRound(now);
  const [market, tiers, filled, ipoCounts, intraday] = await Promise.all([
    getMarketSnapshot(now),
    loadTiers(),
    loadFilled(now),
    loadIpoCounts(round),
    fetchSymbolQuote('^KS11'),
  ]);
  const today = buildToday(market, tiers, filled, now, PRODUCTS);

  return (
    <main id="main-content">
      <Market
        today={today}
        tiers={tiers}
        series={intraday?.series ?? []}
        kospi={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live, marketOpen: market.kospiMarketOpen }}
        ipo={{ round, counts: ipoCounts }}
      />
    </main>
  );
}
