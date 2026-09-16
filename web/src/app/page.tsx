import Terminal from '@/components/Terminal';
import { PRODUCTS } from '@/data/products';
import { loadFilled } from '@/lib/fills';
import { getMarketSnapshot } from '@/lib/market';
import { buildBreadMarket, pickWindow } from '@/lib/orderbook';
import { loadTiers } from '@/lib/settings';
import { loadTape } from '@/lib/tape';

/**
 * 빵장 — 증권 앱 한 화면.
 *
 * 서버는 오늘의 재료를 모아 넘기기만 한다: 시세 · 구간 · 체결 수 · 집계.
 * 화면 구성과 상호작용은 전부 Terminal(클라이언트)에 있다.
 *
 *   1층  KOSPI 변동폭  →  오늘 열릴 호가 칸의 개수 (한도)
 *   2층  내 하루       →  그 칸들 중 내 자리
 *   3층  내가 고른 호가 →  최종 가격
 */
export default async function BreadMarketPage() {
  const now = new Date();
  const [market, tiers, tape, filled] = await Promise.all([
    getMarketSnapshot(now),
    loadTiers(),
    loadTape(now),
    loadFilled(now),
  ]);
  const book = buildBreadMarket(market, tiers, now, PRODUCTS, filled);

  return (
    <main id="main-content">
      <Terminal
        books={book.books}
        market={{
          kospi: {
            value: market.kospi.value,
            changePct: market.kospi.changePct,
            live: market.kospi.live,
            marketOpen: market.kospiMarketOpen,
          },
          absChangePct: book.absChangePct,
          changePct: book.changePct,
          tier: book.tier,
        }}
        hours={book.hours}
        pickWindow={pickWindow(now)}
        today={tape.day}
        initialTape={tape}
      />
    </main>
  );
}
