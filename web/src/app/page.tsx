import Market from '@/components/Market';
import MarketIntro from '@/components/MarketIntro';
import { PRODUCTS } from '@/data/products';
import { weeklyScoreFor } from '@/lib/dividend';
import { loadFilled, loadSoldCounts, loadWeekReport } from '@/lib/fills';
import { fetchKospiHistory, getMarketSnapshot, seoulDateString } from '@/lib/market';
import { buildToday } from '@/lib/offers';
import { isWeekend, OPEN_AT } from '@/lib/orderbook';
import { loadTiers } from '@/lib/settings';
import { bidState } from '@/lib/bidRight';
import { loadAllotments, loadIpoEnabled } from '@/lib/appSettings';
import { currentRound, loadIpoCounts } from '@/lib/ipo';
import { loadSkuSignals } from '@/lib/skuSignals';
import { currentVisitorId } from '@/lib/visitor';
import { recordVisit } from '@/lib/visits';
import { applyStock, fetchStock, withSold } from '@/lib/stock';

/**
 * 빵장 — 서버는 오늘의 재료를 모아 넘기기만 한다.
 *   시세(코스피 마감 + 당일 5분봉) · 구간 · 오늘 나간 수량 · 공모주 회차
 * 화면 순서와 상호작용은 Market(클라이언트)에 있다.
 */
export default async function BreadMarketPage() {
  const now = new Date();
  /* 출석 — 주간 활동점수의 세 항목 중 하나. 하루 1회만 세므로 매 렌더 호출해도 된다.
     서버 컴포넌트는 쿠키를 발급할 수 없어 이미 있는 표식만 읽는다. 실패해도 삼킨다 */
  const visitor = await currentVisitorId();
  if (visitor) await recordVisit(visitor, now);
  const [market, tiers, filled, intraday, stock, signals, allotments] = await Promise.all([
    getMarketSnapshot(now),
    loadTiers(),
    loadFilled(now),
    fetchKospiHistory('1d'),
    fetchStock(),
    loadSkuSignals(now),
    loadAllotments(),
  ]);
  /* 재고는 자사몰에서 받아온다 — products.ts의 값은 마지막 안전망이다.
     손으로 적어둔 값이 열흘 묵어 생지를 품절로 걸러낸 적이 있다. */
  const products = applyStock(PRODUCTS, withSold(stock, await loadSoldCounts(now)));
  const today = buildToday(market, tiers, filled, now, products, signals, allotments.value);

  /* 휴장일(주말·공휴일)에는 가격이 움직이지 않는다. 대신 이번 주 빵장이 어땠는지를 보여준다.
     fills에 visitor가 없어 개인 기록은 못 만든다 — 시장 전체 결산으로 쓴다.
     평일에는 쓰지 않으므로 그때만 조회한다.
     배당은 토요일에 주는 것이라 점수는 주말에만 — 수요일 공휴일에 반쪽 주의 배당액을 띄우지 않는다 */
  const holiday = today.hours.reason === 'holiday';
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [week, score] = holiday
    ? await Promise.all([
        loadWeekReport(seoulDateString(weekAgo), seoulDateString(now)),
        isWeekend(now) ? weeklyScoreFor(visitor, now) : null,
      ])
    : [null, null];

  /* 이번 공모 회차 — 관리자가 만든 회차 중 오늘 열려 있는 것. 없으면 null이고
     화면이 공모 섹션을 통째로 감춘다(lib/ipo). 절기 자동 편성은 2026-09-21에 걷어냈다. */
  const [round, mine, ipoOn] = await Promise.all([currentRound(now), bidState(now), loadIpoEnabled()]);
  const ipoCounts = round ? await loadIpoCounts(round) : { counts: {}, demo: 0, live: false };

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
        week={week}
        score={score}
        round={round}
        ipo={{ ...ipoCounts, ...mine }}
        ipoOn={ipoOn.value && round !== null}
        points={intraday?.points ?? []}
        kospi={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live, marketOpen: market.kospiMarketOpen }}
      />
      </MarketIntro>
    </main>
  );
}
