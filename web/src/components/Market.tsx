'use client';

import { useEffect, useState } from 'react';
import Donut, { type Slice } from '@/components/Donut';
import Flip from '@/components/Flip';
import InfoTab from '@/components/InfoTab';
import IpoTab, { type IpoView } from '@/components/IpoTab';
import KospiLive, { DRAW_MS, type Phase } from '@/components/KospiLive';
import type { KospiView } from '@/components/KospiQuote';
import OfferSheet, { type Bid } from '@/components/OfferSheet';
import Portfolio from '@/components/Portfolio';
import ProductPhoto from '@/components/ProductPhoto';
import type { DiscountTier } from '@/data/indicators';
import type { IpoRound } from '@/lib/ipo';
import { moodFor, priceAt, rateFor, type TodayMarket, type TodayOffer } from '@/lib/offers';
import { withSkuBonus } from '@/lib/skuAdjust';
import { OPEN_AT } from '@/lib/orderbook';
import { qtyOf, usePortfolio, useStableHoldings } from '@/lib/portfolioStore';
import { useKospiLive, type Point } from '@/lib/useKospiLive';
import styles from './Market.module.css';

/**
 * 빵장 — 스크롤하며 답하는 질문 넷.
 *
 *   MARKET   지금 시장은 어떻게 움직이지?     KOSPI LIVE 히어로
 *   TODAY    그래서 오늘 뭐가 싸지?           할인 TOP 3 카드 → 시트
 *   MY       그중 내가 좋아하는 것도 싸지?    도넛 포트폴리오 + 적중 카드
 *   (NEXT · BREAD IPO는 화면에서 뺐다. 코드는 IpoTab·lib/ipo에 남아 있다)
 *
 * KOSPI의 상태 변화가 아래로 전파된다. 장중엔 방향이 뒤집히면 "지금 마감한다면"
 * 라인·TOP 3 가격·적중 카드가 같이 바뀌고, 마감하면 CLOSED로, 20시 전엔 🔒로.
 */

interface Props {
  today: TodayMarket;
  points: Point[];
  kospi: KospiView;
  tiers: DiscountTier[];
  /** 이번 공모 회차 — 서버가 오늘 날짜와 품절 목록으로 정한다 */
  round: IpoRound;
  ipo: IpoView;
}

type Sort = 'popular' | 'watched';
const MEDAL = ['🥇', '🥈', '🥉'];
const EMOJI: Record<number, string> = { 29: '🍰', 33: '🥖', 19: '🍮', 23: '🍰', 31: '🍞', 32: '🥐', 28: '🧁', 25: '🥐', 27: '🥪', 30: '🧁' };
const won = (n: number) => n.toLocaleString('ko-KR');
const key = (no: number, rate: number) => `${no}:${rate.toFixed(3)}`;

/**
 * 정가에서 오늘 가격으로 굴러 내려오는 숫자.
 * "BREAD MARKET OPEN 카운트다운처럼 가격도 바뀌는 게 보이면 좋겠다" — 카드가 뜬 뒤
 * 0.9초 동안 10원 단위로 내려온다. 폭이 실시간으로 바뀌면(장중) 다시 굴러간다.
 */
const ROLL_EVERY_MS = 10_000;
function RollingPrice({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { const t0 = window.setTimeout(() => setV(to), 0); return () => clearTimeout(t0); }
    let raf = 0;
    /* 한 번 굴리고 끝내지 않는다 — 카운트다운처럼 10초마다 정가에서 다시 내려온다 */
    const roll = () => {
      const start = performance.now();
      const step = (now: number) => {
        const kk = Math.min(1, (now - start) / 900);
        setV(Math.round((from + (to - from) * (1 - Math.pow(1 - kk, 3))) / 10) * 10);
        if (kk < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const t = window.setTimeout(roll, delay);
    const loop = window.setInterval(roll, ROLL_EVERY_MS);
    return () => { clearTimeout(t); clearInterval(loop); cancelAnimationFrame(raf); };
  }, [from, to, delay]);
  return <Flip value={won(v)} />;
}

export default function Market({ today, points, kospi, tiers, round, ipo: initialIpo }: Props) {
  const k = useKospiLive({ value: kospi.value, changePct: kospi.changePct, marketOpen: kospi.marketOpen, live: kospi.live, points });
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [bids, setBids] = useState<Record<number, Bid>>({});
  const [sort, setSort] = useState<Sort>('popular');
  const [selected, setSelected] = useState<number | null>(null);
  /* 시트 왼쪽 버튼이 갈린다 — 할인 목록에서 열면 '관심 담기', 포트폴리오에서 열면 개수 조절 */
  const [sheetFrom, setSheetFrom] = useState<'list' | 'portfolio'>('list');
  const openFromList = (no: number) => { setSheetFrom('list'); setSelected(no); };
  const openFromPortfolio = (no: number) => { setSheetFrom('portfolio'); setSelected(no); };
  const [bulk, setBulk] = useState<{ busy: boolean; done: number; missed: number } | null>(null);
  const [showSoldOut, setShowSoldOut] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { portfolio, setQty } = usePortfolio();
  const [ipo, setIpo] = useState(initialIpo);

  /* ── KOSPI 상태 → 아래로 전파 ── */
  const liveOn = k.marketOpen === true;
  const mood = moodFor(k.changePct);
  const live = rateFor(k.changePct, tiers);                         // 장중엔 '지금 기준 예상'
  const rate = live.rate;
  const test = today.hours.reason === 'test';
  const phase: Phase = liveOn ? 'live' : today.hours.open ? 'open' : today.hours.reason === 'before' ? 'locked' : 'closed';
  const canBuy = today.hours.open && (phase !== 'live' || test);
  const lockNote = phase === 'live' ? `${OPEN_AT} 확정과 함께 열려요` : phase === 'locked' ? `🔒 ${OPEN_AT} 공개` : phase === 'closed' ? `내일 ${OPEN_AT}에 열려요` : '휴장';
  const openAt = OPEN_AT;

  /* 표시 가격은 실시간 폭으로. 실제 예약은 서버 확정 폭(today.rate)으로 간다 */
  /* 장중 '지금 기준 예상'도 빵마다 갈린다 — 서버가 계산한 SKU 보정을 실시간 폭 위에 얹는다.
     o.rate(서버 확정 폭)는 그대로 둔다. 예약과 잔량 조회가 그 값을 키로 쓴다 */
  const offers: TodayOffer[] = today.offers.map(o => ({
    ...o,
    ...priceAt(o.product.price, withSkuBonus(rate, o.demandBonus, o.inventoryBonus)),
  }));

  const base = points.length < 2 ? 0 : DRAW_MS + 150;
  const reveal = (step: number) => ({ ['--d' as string]: `${base + step * 90}ms` });
  /* 등장 애니메이션 지연은 상품마다 고정한다.
     정렬 순서(i)로 주면 인기순↔관심순을 오갈 때 --d가 바뀌고, .reveal의 기본값이
     opacity:0이라 이미 끝난 애니메이션이 '시작 전'으로 되돌아가 카드가 깜빡였다. */
  const revealOrder = new Map(today.offers.map((o, idx) => [o.product.productNo, idx]));

  useEffect(() => {
    if (!today.hours.open) return;
    let alive = true;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/fill', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        const json = await res.json();
        if (alive && json?.ok && json.filled) setFilled(json.filled);
      } catch { /* */ }
    };
    const timer = setInterval(pull, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, [today.hours.open]);

  const filledOf = (o: TodayOffer) => filled[key(o.product.productNo, o.rate)] ?? o.filled;
  const remainingOf = (o: TodayOffer) => Math.max(0, o.allotment - filledOf(o));

  /** 한 종을 예약한다. 성공 여부를 돌려준다 — 포트폴리오 일괄 구매가 결과를 센다 */
  async function buy(offer: TodayOffer): Promise<boolean> {
    const no = offer.product.productNo;
    setBids(prev => ({ ...prev, [no]: { status: 'busy', slot: null } }));
    try {
      const res = await fetch('/api/fill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productNo: no, depth: offer.rate }) });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '실패');
      setBids(prev => ({ ...prev, [no]: { status: json.filled ? 'filled' : 'missed', slot: json.slot ?? null, stored: json.stored } }));
      setFilled(prev => ({ ...prev, [key(no, offer.rate)]: (json.quantity ?? offer.allotment) - (json.remaining ?? 0) }));
      /* 구매가 체결되면 서버가 공모 청약권을 발급한다(lib/bidRight).
         아직 오늘 청약하지 않았다면 NEXT의 버튼이 지금 열린다 */
      if (json.filled) setIpo(prev => (prev.bidFor ? prev : { ...prev, canBid: true }));
      return Boolean(json.filled);
    } catch {
      setBids(prev => ({ ...prev, [no]: { status: 'missed', slot: null } }));
      return false;
    }
  }

  /* 인기순 = 오늘 많이 산 순, 관심순 = 내가 알림 걸어둔 순. 동률이면 할인 금액 큰 순 */
  /**
   * 관심빵을 담은 수량만큼 예약한다. 성공·실패 개수를 세어 한 번에 알린다.
   * 순서대로 보낸다 — 같은 칸을 동시에 밀어 넣으면 서버 경합만 늘고, 몇 개라 느리지 않다.
   * 한 빵에서 물량이 끝나면 남은 수량은 더 시도하지 않고 실패로 센다.
   */
  /** 시트에서 한 빵을 산다 — 관심에 담아둔 수량만큼 예약한다(안 담았으면 1개) */
  async function buyPicked(offer: TodayOffer) {
    const qty = Math.max(1, qtyOf(portfolio, offer.product.productNo));
    for (let i = 0; i < qty; i++) {
      const ok = await buy(offer);
      if (!ok) break;
    }
  }

  async function buyAll(list: { offer: TodayOffer; qty: number }[]) {
    setBulk({ busy: true, done: 0, missed: 0 });
    let done = 0, missed = 0;
    for (const { offer, qty } of list) {
      for (let i = 0; i < qty; i++) {
        const ok = await buy(offer);
        if (ok) { done += 1; continue; }
        missed += qty - i;
        break;
      }
    }
    setBulk({ busy: false, done, missed });
  }

  const sorted = [...offers].sort((a, b) => sort === 'watched'
    ? qtyOf(portfolio, b.product.productNo) - qtyOf(portfolio, a.product.productNo) || b.saved - a.saved
    : filledOf(b) - filledOf(a) || b.saved - a.saved);
  const ranking = offers.map(o => ({ o, n: filledOf(o) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
  const selectedOffer = offers.find(o => o.product.productNo === selected) ?? null;

  /* ── MY ── */
  /* 마운트 시점 순서를 고정한다 — 수량을 바꿀 때 줄·조각이 튀지 않게 */
  const entries = useStableHoldings(portfolio);
  const pfTotal = entries.reduce((a, b) => a + b.qty, 0);
  /* 하나만 담아도 도넛을 보여준다. '3개부터'는 성급한 판정을 막자는 안이었지만, 담았는데 안 보이는 게 더 이상하다 */
  const actions = pfTotal;
  const nameOf = (no: number) => offers.find(o => o.product.productNo === no)?.product.name ?? today.soldOut.find(p => p.productNo === no)?.name ?? `#${no}`;
  const slices: Slice[] = entries.map(e => {
    const o = offers.find(x => x.product.productNo === e.no);
    return { no: e.no, name: nameOf(e.no), emoji: EMOJI[e.no] ?? '🍞', share: Math.round((e.qty / pfTotal) * 100), today: Boolean(o), price: o?.price };
  });
  const hits = entries.map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o));
  /* 차트 툴팁에 보여줄 빵들 — 내 관심빵(오늘 빵장에 있는 것, 비중 순, 최대 3).
     없으면 빵을 보여주지 않고 "알림받기로 담아라" 안내만 한다 */
  const watched = entries.map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o)).slice(0, 3);
  const chartBreads = watched.map(o => ({ no: o.product.productNo, name: o.product.name, emoji: EMOJI[o.product.productNo] ?? '🍞', listPrice: o.product.price }));
  const tierLabel = live.tier.label;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={styles.page} data-side={mood.side}>
      {/* ══ MARKET ══ */}
      <KospiLive k={k} mood={mood} rate={rate} phase={phase} openAt={openAt} tiers={tiers} breads={chartBreads} noWatch={watched.length === 0} tierLabel={tierLabel} base={live.base} bonus={live.bonus} />

      {/* ══ TODAY ══ */}
      <section id="today" className={`${styles.card} ${styles.reveal}`} style={reveal(0)} aria-label="오늘의 할인 빵">
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>🔔 TODAY&apos;S BREAD MARKET</span><span className={styles.theme}>{mood.theme}</span></div>
        <header className={styles.cardHead}>
          <h2>{phase === 'live' ? '지금 예상되는 오늘의 할인 빵' : '오늘의 할인 빵'} <small>{offers.length}종 · 각 {offers[0]?.allotment ?? 30}개 · 전부 {Math.round(rate * 100)}%</small></h2>
          <div className={styles.sort} role="group" aria-label="정렬">
            <button type="button" aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>인기순</button>
            <button type="button" aria-pressed={sort === 'watched'} onClick={() => setSort('watched')}>관심순</button>
          </div>
        </header>

        <ul className={styles.grid}>
          {sorted.map((o, i) => {
            const no = o.product.productNo, remaining = remainingOf(o), n = qtyOf(portfolio, no);
            const ranked = sort === 'popular' ? filledOf(o) > 0 : n > 0;
            return (
              <li key={no} className={`${styles.reveal} ${styles.cell}`} style={reveal(1 + (revealOrder.get(no) ?? i))}>
                <button type="button" className={styles.topCard} style={{ ['--ph' as string]: `${i * 5}s` }} onClick={() => openFromList(no)}>
                  {ranked && i < 3 && <span className={styles.medal}>{MEDAL[i]}</span>}
                  <span className={styles.topPhoto}><ProductPhoto productNo={no} name={o.product.name} /></span>
                  <b>{o.product.name}</b>
                  <span className={styles.topPrice}>
                    <strong><RollingPrice from={o.product.price} to={o.price} delay={base + (1 + i) * 90 + 500} />원</strong>
                    <del>{won(o.product.price)}원</del>
                  </span>
                  {phase === 'locked' ? (
                    <small>🔒 {openAt} 공개</small>
                  ) : (
                    <>
                      <span className={styles.topMeter} aria-hidden="true"><i style={{ width: `${Math.round((remaining / o.allotment) * 100)}%` }} data-low={remaining <= o.allotment * 0.2} /></span>
                      <small>{remaining > 0 ? `남음 ${remaining} / ${o.allotment}` : '오늘 물량 끝'}{phase === 'live' ? ' · 지금 기준 예상' : ''}</small>
                    </>
                  )}
                </button>
                {/* 카드 전체가 이미 버튼이라 안에 넣을 수 없다. 형제로 두고 위에 얹는다 */}
                <button
                  type="button"
                  className={styles.watch}
                  aria-pressed={n > 0}
                  aria-label={`${o.product.name} 관심 ${n > 0 ? '해제' : '담기'}`}
                  onClick={() => setQty(no, n > 0 ? 0 : 1)}
                >
                  {n > 0 ? '♥' : '♡'}
                </button>
              </li>
            );
          })}
        </ul>

        {today.soldOut.length > 0 && (
          <>
            <button type="button" className={styles.more} onClick={() => setShowSoldOut(v => !v)} aria-expanded={showSoldOut}>품절 {today.soldOut.length}종 {showSoldOut ? '접기 ▴' : '보기 ▾'}</button>
            {showSoldOut && (
              <ul className={styles.list} data-muted="true">
                {today.soldOut.map(p => (
                  <li key={p.productNo}><div className={styles.row}>
                    <span className={styles.thumb}><ProductPhoto productNo={p.productNo} name={p.name} /></span>
                    <span className={styles.rowMain}><b>{p.name}</b><small>품절 — 오늘 빵장에 없음</small></span>
                    <span className={styles.rowPrice}><small><del>{won(p.price)}</del></small></span>
                  </div></li>
                ))}
              </ul>
            )}
          </>
        )}

        <dl className={styles.roles}>
          <div><dt>할인 폭</dt><dd>오늘 KOSPI <b>변동폭</b> 기준</dd></div>
          <div><dt>할인 라인·기분</dt><dd>KOSPI <b>방향</b> 기준</dd></div>
          <div><dt>수량</dt><dd>상품별 <b>재고</b> 기준</dd></div>
        </dl>
      </section>

      {ranking.length > 0 && (
        <section className={`${styles.card} ${styles.reveal}`} style={reveal(5)} aria-label="오늘 많이 산 빵">
          <header className={styles.cardHead}><h2>오늘 많이 산 빵 <small>10초마다 갱신</small></h2></header>
          <ol className={styles.rankList}>{ranking.map(({ o, n }, i) => <li key={o.product.productNo}><i>{i + 1}</i><b>{o.product.name}</b><small>{n}개 · 남음 {remainingOf(o)}</small></li>)}</ol>
        </section>
      )}

      {/* ══ MY ══ */}
      <section id="foryou" className={`${styles.card} ${styles.reveal}`} style={reveal(6)} aria-label="내 빵 포트폴리오">
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>♡ MY BREAD PORTFOLIO</span>{pfTotal > 0 && <span className={styles.theme}>관심빵 {entries.length}종{hits.length > 0 && ` · 오늘 ${hits.length}종 할인`}</span>}</div>

        {actions === 0 ? (
          <div className={styles.emptyBox}>
            <p className={styles.emptyLead}>아직</p>
            <h2>나의 빵 취향을 알아가는 중</h2>
            <div className={styles.paths}><span>♡ 관심</span><span>🛒 장바구니</span></div>
            <p className={styles.arrowDown}>↓<br /><b>MY PORTFOLIO</b></p>
            <p>마음에 드는 빵을 고르면 나만의 포트폴리오가 만들어집니다.</p>
            <div className={styles.emptyBtns} data-single="true">
              <button type="button" className={styles.ghost} onClick={() => scrollTo('today')}>♡ 빵 둘러보기</button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.sub}>내가 관심을 보인 빵으로 만든 포트폴리오</p>
            <Donut slices={slices} onPick={openFromPortfolio} />
            <button type="button" className={styles.expand} onClick={() => setPfOpen(v => !v)} aria-expanded={pfOpen}>내 포트폴리오 {pfOpen ? '접기 ▴' : '→'}</button>
            {pfOpen && <div className={styles.pop}><Portfolio offers={offers} entries={entries} onBuyAll={buyAll} bulk={bulk} onPick={openFromPortfolio} /></div>}
          </>
        )}
      </section>

      {/* ══ NEXT — 다음에 나올 빵 ══
           내 것을 다 본 사람에게 마지막 질문이 이어진다:
           MARKET(지금 국장) → TODAY(오늘 살 빵) → MY(내 것) → NEXT(다음에 나올 빵)
           탭이 아니라 스크롤 순서 안에 둔다 — 탭으로 빼면 처음 온 사람은 영영 못 본다. */}
      <section id="next" className={`${styles.card} ${styles.reveal}`} style={reveal(7)} aria-label="다음 절기빵 공모">
        <IpoTab round={round} view={ipo} onChange={setIpo} />
      </section>

      <p className={`${styles.fine} ${styles.reveal}`} style={reveal(8)}>
        {today.kospiLive ? '' : '⚠️ 코스피 수집에 실패해 샘플 값입니다. '}
        한정 수량은 코드 기본값({offers[0]?.allotment ?? 30}개)이고 관리자 입력은 다음 단계입니다.
        {test && <> <b>지금은 테스트로 24시간 열어두었습니다</b> — 원래는 {openAt}~24:00.</>}
        {' '}<button type="button" className={styles.link} onClick={() => setInfoOpen(v => !v)} aria-expanded={infoOpen}>오늘 가격은 어떻게 정해지나 {infoOpen ? '▴' : '→'}</button>
      </p>
      {infoOpen && <section className={`${styles.card} ${styles.pop}`} aria-label="정보"><InfoTab today={today} /></section>}

      {selectedOffer && (
        <OfferSheet offer={selectedOffer} mood={mood} changePct={k.changePct} rate={rate} estimate={phase === 'live'}
          remaining={remainingOf(selectedOffer)} bid={bids[selectedOffer.product.productNo]} watching={qtyOf(portfolio, selectedOffer.product.productNo)}
          qty={Math.max(1, qtyOf(portfolio, selectedOffer.product.productNo))}
          canBuy={canBuy} lockNote={lockNote}
          left={sheetFrom === 'portfolio' ? 'qty' : 'watch'}
          canBid={ipo.canBid && !ipo.bidFor}
          onNext={() => { setSelected(null); scrollTo('next'); }}
          onBuy={() => buyPicked(selectedOffer)} onQty={next => setQty(selectedOffer.product.productNo, next)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
