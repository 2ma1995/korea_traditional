'use client';

import { useEffect, useState } from 'react';
import Donut, { type Slice } from '@/components/Donut';
import Flip from '@/components/Flip';
import InfoTab from '@/components/InfoTab';
import KospiLive, { DRAW_MS, type Phase } from '@/components/KospiLive';
import type { KospiView } from '@/components/KospiQuote';
import OfferSheet, { type Bid } from '@/components/OfferSheet';
import Portfolio from '@/components/Portfolio';
import ProductPhoto from '@/components/ProductPhoto';
import type { DiscountTier } from '@/data/indicators';
import { moodFor, priceAt, type TodayMarket, type TodayOffer } from '@/lib/offers';
import { depthFor, OPEN_HOUR } from '@/lib/orderbook';
import { usePortfolio } from '@/lib/portfolioStore';
import { useKospiLive } from '@/lib/useKospiLive';
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
  series: number[];
  kospi: KospiView;
  tiers: DiscountTier[];
}

type Sort = 'saved' | 'popular';
const TOP = 3;
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

export default function Market({ today, series, kospi, tiers }: Props) {
  const k = useKospiLive({ value: kospi.value, changePct: kospi.changePct, marketOpen: kospi.marketOpen, live: kospi.live, series });
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [bids, setBids] = useState<Record<number, Bid>>({});
  const [sort, setSort] = useState<Sort>('saved');
  const [selected, setSelected] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showSoldOut, setShowSoldOut] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [alarm, setAlarm] = useState(false);
  const { portfolio, add, remove } = usePortfolio();

  /* ── KOSPI 상태 → 아래로 전파 ── */
  const liveOn = k.marketOpen === true;
  const mood = moodFor(k.changePct);
  const rate = depthFor(Math.abs(k.changePct), tiers).rate;         // 장중엔 '지금 기준 예상'
  const test = today.hours.reason === 'test';
  const phase: Phase = liveOn ? 'live' : today.hours.open ? 'open' : today.hours.reason === 'before' ? 'locked' : 'closed';
  const canBuy = today.hours.open && (phase !== 'live' || test);
  const lockNote = phase === 'live' ? '15:30 확정 후 살 수 있어요' : phase === 'locked' ? `🔒 ${OPEN_HOUR}:00 공개` : phase === 'closed' ? `내일 ${OPEN_HOUR}시에 열려요` : '휴장';
  const openAt = `${String(OPEN_HOUR).padStart(2, '0')}:00`;

  /* 표시 가격은 실시간 폭으로. 실제 예약은 서버 확정 폭(today.rate)으로 간다 */
  const offers: TodayOffer[] = today.offers.map(o => ({ ...o, ...priceAt(o.product.price, rate) }));

  const base = series.length < 2 ? 0 : DRAW_MS + 150;
  const reveal = (step: number) => ({ ['--d' as string]: `${base + step * 90}ms` });

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

  const filledOf = (o: TodayOffer) => filled[key(o.product.productNo, today.rate)] ?? o.filled;
  const remainingOf = (o: TodayOffer) => Math.max(0, o.allotment - filledOf(o));

  async function buy(offer: TodayOffer) {
    const no = offer.product.productNo;
    setBids(prev => ({ ...prev, [no]: { status: 'busy', slot: null } }));
    try {
      const res = await fetch('/api/fill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productNo: no, depth: today.rate }) });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '실패');
      setBids(prev => ({ ...prev, [no]: { status: json.filled ? 'filled' : 'missed', slot: json.slot ?? null } }));
      setFilled(prev => ({ ...prev, [key(no, today.rate)]: (json.quantity ?? offer.allotment) - (json.remaining ?? 0) }));
    } catch {
      setBids(prev => ({ ...prev, [no]: { status: 'missed', slot: null } }));
    }
  }

  const sorted = [...offers].sort((a, b) => sort === 'popular' ? filledOf(b) - filledOf(a) || b.saved - a.saved : b.saved - a.saved || b.product.price - a.product.price);
  const top = sorted.slice(0, TOP), rest = sorted.slice(TOP);
  const ranking = offers.map(o => ({ o, n: filledOf(o) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
  const selectedOffer = offers.find(o => o.product.productNo === selected) ?? null;

  /* ── MY ── */
  const entries = Object.entries(portfolio).map(([no, qty]) => ({ no: Number(no), qty })).sort((a, b) => b.qty - a.qty);
  const pfTotal = entries.reduce((a, b) => a + b.qty, 0);
  const actions = pfTotal;
  const nameOf = (no: number) => offers.find(o => o.product.productNo === no)?.product.name ?? today.soldOut.find(p => p.productNo === no)?.name ?? `#${no}`;
  const slices: Slice[] = entries.map(e => {
    const o = offers.find(x => x.product.productNo === e.no);
    return { no: e.no, name: nameOf(e.no), emoji: EMOJI[e.no] ?? '🍞', share: Math.round((e.qty / pfTotal) * 100), today: Boolean(o), price: o?.price };
  });
  const hit = entries.map(e => offers.find(o => o.product.productNo === e.no)).find((o): o is TodayOffer => Boolean(o));
  const hitShare = hit ? Math.round(((portfolio[hit.product.productNo] ?? 0) / pfTotal) * 100) : 0;
  /* 차트 툴팁에 보여줄 빵들 — 내 관심빵 전부(오늘 빵장에 있는 것, 비중 순, 최대 4), 없으면 오늘 TOP 1 */
  const watched = entries.map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o)).slice(0, 4);
  const chartBreads = (watched.length ? watched : sorted.slice(0, 1)).map(o => ({ name: o.product.name, emoji: EMOJI[o.product.productNo] ?? '🍞', listPrice: o.product.price }));

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const listRow = (offer: TodayOffer, idx: number) => {
    const no = offer.product.productNo, remaining = remainingOf(offer), n = portfolio[no] ?? 0;
    const sub = [offer.badges.join(' · ') || offer.product.label.split('/')[0].trim(), remaining < offer.allotment ? (remaining > 0 ? `남음 ${remaining}` : '오늘 물량 끝') : null, n > 0 ? `♡ ${n}` : null].filter(Boolean).join(' · ');
    return (
      <li key={no} className={styles.pop} style={{ animationDelay: `${idx * 40}ms` }}>
        <button type="button" className={styles.row} onClick={() => setSelected(no)}>
          <span className={styles.thumb}><ProductPhoto productNo={no} name={offer.product.name} /></span>
          <span className={styles.rowMain}><b>{offer.product.name}</b><small>{sub}</small></span>
          <span className={styles.rowPrice}><strong><RollingPrice from={offer.product.price} to={offer.price} delay={200 + idx * 120} />원</strong><small><del>{won(offer.product.price)}</del><em>−{won(offer.saved)}</em></small></span>
          <span className={styles.chev} aria-hidden="true">›</span>
        </button>
      </li>
    );
  };

  return (
    <div className={styles.page} data-side={mood.side}>
      {/* ══ MARKET ══ */}
      <KospiLive k={k} mood={mood} rate={rate} phase={phase} openAt={openAt} test={test} tiers={tiers} breads={chartBreads} />

      {/* ══ TODAY ══ */}
      <section id="today" className={`${styles.card} ${styles.reveal}`} style={reveal(0)} aria-label="오늘의 빵장">
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>🔔 TODAY&apos;S BREAD MARKET</span><span className={styles.theme}>{mood.theme}</span></div>
        <header className={styles.cardHead}>
          <h2>{phase === 'live' ? '지금 예상되는 오늘의 할인 TOP 3' : '오늘의 할인 TOP 3'} <small>{offers.length}종 · 각 {offers[0]?.allotment ?? 30}개</small></h2>
          <div className={styles.sort} role="group" aria-label="정렬">
            <button type="button" aria-pressed={sort === 'saved'} onClick={() => setSort('saved')}>할인순</button>
            <button type="button" aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>인기순</button>
          </div>
        </header>

        <ul className={styles.top3}>
          {top.map((o, i) => {
            const no = o.product.productNo, remaining = remainingOf(o);
            return (
              <li key={no} className={styles.reveal} style={reveal(1 + i)}>
                <button type="button" className={styles.topCard} style={{ ['--ph' as string]: `${i * 5}s` }} onClick={() => setSelected(no)}>
                  <span className={styles.medal}>{MEDAL[i]}</span>
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
              </li>
            );
          })}
        </ul>

        {rest.length > 0 && !showAll && <button type="button" className={styles.expand} onClick={() => setShowAll(true)}>오늘의 빵장 전체보기 ({offers.length}종) →</button>}
        {showAll && <ul className={styles.list}>{rest.map((o, i) => listRow(o, i))}</ul>}
        {showAll && today.soldOut.length > 0 && (
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
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>♡ MY BREAD PORTFOLIO</span>{pfTotal > 0 && <span className={styles.theme}>관심빵 {entries.length}종</span>}</div>

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
        ) : actions < 3 ? (
          <div className={styles.building}>
            <div className={styles.buildRing} style={{ ['--p' as string]: actions / 3 }}><span>생성 중</span><b>{actions} / 3</b></div>
            <div>
              <span className={styles.eyebrow}>첫 관심 데이터</span>
              <h3>{EMOJI[entries[0].no] ?? '🍞'} {nameOf(entries[0].no)}</h3>
              <p>조금만 더 관심을 남기면 나의 구성비가 공개됩니다.</p>
              <div className={styles.emptyBtns} data-single="true">
                <button type="button" className={styles.ghost} onClick={() => scrollTo('today')}>♡ 빵 둘러보기</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.sub}>내가 관심을 보인 빵으로 만든 포트폴리오</p>
            <Donut slices={slices} />
            {hit ? (
              <div className={styles.hitCard} data-side={mood.side}>
                <span className={styles.eyebrow}>🎯 TODAY</span>
                <h3>회원님 관심빵 중 「{hit.product.name}」이 오늘 할인 라인에 들어왔어요</h3>
                <dl>
                  <div><dt>내 관심 비중</dt><dd>{hitShare}%</dd></div>
                  <div><dt>정상가</dt><dd>{won(hit.product.price)}원</dd></div>
                  <div><dt>{phase === 'live' ? '지금 예상' : '오늘 가격'}</dt><dd>{won(hit.price)}원</dd></div>
                </dl>
                {phase === 'locked' ? (
                  <div className={styles.hitLock}>
                    <span>오늘 할인 확정 ✓ · 가격 공개까지 {openAt}</span>
                    <button type="button" className={styles.ghost} onClick={() => setAlarm(true)} disabled={alarm}>{alarm ? '알림 예약됨 · 발송은 준비 중' : '🔔 OPEN 알림 받기'}</button>
                  </div>
                ) : (
                  <button type="button" className={styles.primary} onClick={() => setSelected(hit.product.productNo)}>{phase === 'live' ? '지금 예상 가격 확인 →' : '오늘 가격 확인 →'}</button>
                )}
              </div>
            ) : (
              <p className={styles.callout}>오늘은 내 관심빵이 빵장에 없어요. 들어오면 여기서 먼저 보입니다.</p>
            )}
            <button type="button" className={styles.expand} onClick={() => setPfOpen(v => !v)} aria-expanded={pfOpen}>내 포트폴리오 {pfOpen ? '접기 ▴' : '→'}</button>
            {pfOpen && <div className={styles.pop}><Portfolio offers={offers} /></div>}
          </>
        )}
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
          remaining={remainingOf(selectedOffer)} bid={bids[selectedOffer.product.productNo]} watching={portfolio[selectedOffer.product.productNo] ?? 0}
          canBuy={canBuy} lockNote={lockNote}
          onBuy={() => buy(selectedOffer)} onWatch={() => add(selectedOffer.product.productNo)} onUnwatch={() => remove(selectedOffer.product.productNo)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
