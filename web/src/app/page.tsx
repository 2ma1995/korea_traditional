import Link from 'next/link';
import Market from '@/components/Market';
import MarketIntro from '@/components/MarketIntro';
import { PRODUCTS } from '@/data/products';
import { weekWindow, weeklyScoreFor } from '@/lib/dividend';
import { loadFilled, loadSoldCounts, loadWeekReport, reservationsInWindow } from '@/lib/fills';
import { fetchKospiHistory, getMarketSnapshot, seoulDateString } from '@/lib/market';
import { buildToday, priceAt } from '@/lib/offers';
import { isWeekend, nextOpenLabel, OPEN_AT } from '@/lib/orderbook';
import { isAdmin } from '@/lib/adminAuth';
import { loadTiers } from '@/lib/settings';
import { bidState } from '@/lib/bidRight';
import { loadAllotments, loadDividendPolicy, loadIpoEnabled } from '@/lib/appSettings';
import { currentRound, loadIpoCounts } from '@/lib/ipo';
import { loadSkuSignals } from '@/lib/skuSignals';
import { currentVisitorId } from '@/lib/visitor';
import { recordVisit } from '@/lib/visits';
import { applyStock, fetchStock, withSold } from '@/lib/stock';
import { payoutMode } from '@/lib/cafe24';
import { activeCoupon, linkedMember, payoutFor, walletBalance } from '@/lib/payout';

/**
 * 빵장 — 서버는 오늘의 재료를 모아 넘기기만 한다.
 *   시세(코스피 마감 + 당일 5분봉) · 구간 · 오늘 나간 수량 · 공모주 회차
 * 화면 순서와 상호작용은 Market(클라이언트)에 있다.
 */
export default async function BreadMarketPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const now = new Date();
  /* 관리자 미리보기 — 평일에도 휴장일 화면을 본다(발표 시연). 로그인한 관리자 브라우저에서만 먹고
     화면만 바뀐다. 예약은 닫힌 장처럼 막히고, 쿠폰 쓰기는 서버(lib/payout.redeem)가 진짜 휴장일인지 다시 본다 */
  const asked = (await searchParams).preview;
  const preview = (asked === 'weekend' || asked === 'holiday') && (await isAdmin()) ? asked : null;
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
  if (preview && today.hours.reason !== 'holiday') {
    today.hours = { open: false, reason: 'holiday', nowLabel: today.hours.nowLabel,
      closedFor: preview === 'weekend' ? '주말' : '공휴일', nextOpen: nextOpenLabel(seoulDateString(now)) };
  }
  const weekend = preview ? preview === 'weekend' : isWeekend(now);

  /* 휴장일(주말·공휴일)에는 가격이 움직이지 않는다. 대신 이번 주 빵장이 어땠는지를 보여준다.
     fills에 visitor가 없어 개인 기록은 못 만든다 — 시장 전체 결산으로 쓴다.
     평일에는 쓰지 않으므로 그때만 조회한다.
     배당은 토요일에 주는 것이라 점수는 주말에만 — 수요일 공휴일에 반쪽 주의 배당액을 띄우지 않는다 */
  const holiday = today.hours.reason === 'holiday';
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  /* 아이디를 먼저 안다 — 점수의 '빵장에서 구매'를 그 아이디의 자사몰 주문으로 센다 */
  const member = holiday && payoutMode() ? await linkedMember(visitor) : null;
  const [week, score] = holiday
    ? await Promise.all([
        loadWeekReport(seoulDateString(weekAgo), seoulDateString(now)),
        weekend ? weeklyScoreFor(visitor, now, member) : null,
      ])
    : [null, null];
  /* 배당금은 휴장일에 정가로 살 때 쓴다 — 평일 휴장일(추석)에도 통장은 보여준다 */
  const wallet = holiday && payoutMode()
    ? {
        mode: payoutMode()!, member,
        balance: payoutMode() === 'wallet' ? await walletBalance(member, now) : 0,
        coupon: payoutMode() === 'wallet' ? await activeCoupon(member) : null,
      }
    : null;

  /* 휴장일 결산 — 이번 주 내 빵장. 예약 수와 아낀 금액(정가 − 예약한 폭의 값, 옵션 추가금 포함),
     이번 주 배당이 지급됐는지, 등급별 금액. 결제 확인은 주문 연동 전이라 예약 기준이다 */
  const thisWeek = weekWindow(now);
  const [myFills, payout, policy] = holiday
    ? await Promise.all([reservationsInWindow(visitor, thisWeek.from, thisWeek.to), payoutFor(member, now), loadDividendPolicy()])
    : [[], null, null];
  const myWeek = holiday
    ? {
        count: myFills.length,
        saved: myFills.reduce((sum, row) => {
          const product = products.find(p => p.productNo === row.productNo);
          if (!product) return sum;
          const add = row.unit ? product.options?.find(o => o.code === row.unit)?.add ?? 0 : 0;
          return sum + priceAt(product.price, row.depth).saved + priceAt(add, row.depth).saved;
        }, 0),
        weekend,
        payout,
        tiers: policy?.tiers ?? null,
      }
    : null;

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
      {preview && (
        <p className="preview-banner" role="status">
          관리자 미리보기 · <b>{preview === 'weekend' ? '주말(DIVIDEND DAY)' : '평일 휴장일'}</b> 화면이에요. 손님에게는 보이지 않아요.{' '}
          <Link href={preview === 'weekend' ? '/?preview=holiday#week' : '/?preview=weekend#week'}>{preview === 'weekend' ? '평일 휴장판 보기' : '주말판 보기'}</Link>
          {' · '}<Link href="/">미리보기 끄기</Link>
        </p>
      )}
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
        wallet={wallet}
        score={score}
        myWeek={myWeek}
        round={round}
        ipo={{ ...ipoCounts, ...mine }}
        ipoOn={ipoOn.value && round !== null}
        points={intraday?.points ?? []}
        kospi={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live, marketOpen: market.kospiMarketOpen, updatedAt: market.kospi.updatedAt }}
      />
      </MarketIntro>
    </main>
  );
}
