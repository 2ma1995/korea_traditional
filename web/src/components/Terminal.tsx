'use client';

import { useEffect, useMemo, useState } from 'react';
import InfoTab from '@/components/InfoTab';
import KospiQuote, { type KospiView } from '@/components/KospiQuote';
import Ladder, { bidKey, shopUrl, type BidState } from '@/components/Ladder';
import PickPanel from '@/components/PickPanel';
import ProductPhoto from '@/components/ProductPhoto';
import TapeTab from '@/components/TapeTab';
import type { DiscountTier } from '@/data/indicators';
import type { MarketHours, PickWindow, ProductBook, Tick } from '@/lib/orderbook';
import { useSavedPick } from '@/lib/pickStore';
import { settle } from '@/lib/settlement';
import type { Tape } from '@/lib/tape';
import { useLiveQuote } from '@/lib/useLiveQuote';
import styles from './Terminal.module.css';

/**
 * 빵장 터미널 — 화면 하나, 행동 하나. 증권 앱의 문법을 그대로 빌린다.
 *
 *   상태바        개장 · KOSPI · 오늘 한도 · [오늘 내 종목]
 *   관심상품      종목 리스트 — 이름 · 내 가격 · 정가대비
 *   종목 화면     내 종목 시세(실시간) · 큰 가격(=내 자리) · 호가|체결|정보 · 하단 [사기]
 *
 * 하루의 흐름
 *   ~09:00  종목 고르기 (잠김)          결과를 모르고 고른다 — 게임이 안 된다
 *   장중    내 빵값이 실시간으로 뜬다     증권 앱처럼 숫자가 움직인다
 *   15:30   확정
 *   20:00   빵장 개장 — 잔량 막대가 줄어든다
 *
 * 세 층
 *   1층  KOSPI 변동폭  →  오늘 열릴 칸의 개수
 *   2층  내 종목       →  그 중 내 자리. 더 깊은 칸은 나에게 닫힘
 *   3층  내 선택       →  싼데 적은 내 자리 vs 덜 싼데 많은 위 칸
 */

export interface MarketView {
  kospi: KospiView;
  absChangePct: number;
  changePct: number;
  tier: DiscountTier;
}

interface Props {
  books: ProductBook[];
  market: MarketView;
  hours: MarketHours;
  pickWindow: PickWindow;
  today: string;
  initialTape: Tape;
}

type Tab = 'book' | 'tape' | 'info';

const FLAVOR = { loss: '손절빵', gain: '익절빵', flat: '본전빵' } as const;
const won = (value: number) => value.toLocaleString('ko-KR');
const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
const REPORT_KEY = 'makji_reported';

/** 스파크라인 — 오늘 5분봉. 시작점 대비 위면 빨강, 아래면 파랑 */
function Spark({ series, up }: { series: number[]; up: boolean }) {
  if (series.length < 2) return null;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 120},${30 - ((v - min) / span) * 28 + 1}`).join(' ');
  return (
    <svg className={styles.spark} viewBox="0 0 120 32" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.5" />
    </svg>
  );
}

export default function Terminal({ books, market, hours, pickWindow, today, initialTape }: Props) {
  const firstInStock = books.find(book => book.product.inStock) ?? books[0];
  const [selectedNo, setSelectedNo] = useState(firstInStock.product.productNo);
  const [tab, setTab] = useState<Tab>('book');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [browse, setBrowse] = useState(false);
  const [tape, setTape] = useState(initialTape);
  const [bids, setBids] = useState<Record<string, BidState>>({});
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [pick, setPick] = useSavedPick(today);
  const { quote, flash } = useLiveQuote(pick?.symbol ?? null);

  /* ── 2층: 내 종목이 내 자리를 정한다 ── */
  const openTicks = books[0]?.ticks.length ?? 1;
  const pnl = quote?.changePct ?? null;
  const result = useMemo(() => (pick && pnl !== null ? settle(pnl, openTicks) : null), [pick, pnl, openTicks]);
  const seatIndex = result?.seatIndex ?? 0;
  const picked = pick !== null;

  /* ── 잔량: 서버 초기값 위에 5초 폴링과 내 체결 결과를 얹는다 ── */
  const remainingOf = (book: ProductBook, tick: Tick) => {
    if (tick.instant) return Infinity;
    const key = bidKey(book.product.productNo, tick.depth);
    const done = filled[key] ?? tick.filled;
    return Math.max(0, (tick.quantity ?? 0) - done);
  };

  /** 물량이 남아 실제로 살 수 있는 자리. 내 자리가 끝나면 한 칸 위로 */
  const effectiveSeatOf = (book: ProductBook) => {
    for (let i = Math.min(seatIndex, book.ticks.length - 1); i > 0; i--) {
      if (remainingOf(book, book.ticks[i]) > 0) return i;
    }
    return 0;
  };

  const book = books.find(item => item.product.productNo === selectedNo) ?? firstInStock;
  const effectiveSeat = effectiveSeatOf(book);
  const seatTick = book.ticks[effectiveSeat];
  const soldOut = !book.product.inStock;
  const off = book.product.price - seatTick.price;
  const seatRemaining = remainingOf(book, seatTick);

  /* 빵장이 열려 있으면 잔량을 5초마다 다시 읽는다 — 밤의 움직임은 물량이다 */
  useEffect(() => {
    if (!hours.open) return;
    let alive = true;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/fill', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        const json = await res.json();
        if (alive && json?.ok && json.filled) setFilled(json.filled);
      } catch { /* 마지막 값 유지 */ }
    };
    const timer = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [hours.open]);

  /* 체결 탭을 보고 있으면 집계도 10초마다 — 피드가 흐르는 느낌 */
  useEffect(() => {
    if (tab !== 'tape') return;
    let alive = true;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/tape', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        const json = await res.json();
        if (alive && json?.ok && json.tape) setTape(json.tape);
      } catch { /* */ }
    };
    const timer = setInterval(pull, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [tab]);

  /* 장이 닫히면 최종 자리를 집계에 한 번 보고한다. 보내는 것은 위로/자축/본전과 칸 번호뿐 */
  useEffect(() => {
    if (!result || quote?.marketOpen !== false) return;
    const key = `${today}:${result.side}:${result.seatIndex}`;
    try { if (window.localStorage.getItem(REPORT_KEY) === key) return; } catch { /* */ }
    (async () => {
      try {
        const res = await fetch('/api/tape', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ side: result.side, seat: result.seatIndex }),
        });
        const json = await res.json();
        if (json?.ok) {
          setTape(json.tape);
          try { window.localStorage.setItem(REPORT_KEY, key); } catch { /* */ }
        }
      } catch { /* 집계는 부가 정보다 */ }
    })();
  }, [result, quote?.marketOpen, today]);

  function choose(productNo: number) {
    setSelectedNo(productNo);
    setView('detail');
    setTab('book');
  }

  /** 걸기 — 선착순 즉시 체결. 서버가 수량·개장·오늘 폭을 다시 계산한다 */
  async function bid(tick: Tick) {
    const key = bidKey(book.product.productNo, tick.depth);
    const before = remainingOf(book, tick);
    setBids(prev => ({ ...prev, [key]: { status: 'busy', slot: null, remaining: before } }));
    try {
      const res = await fetch('/api/fill', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo: book.product.productNo, depth: tick.depth }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '체결에 실패했습니다.');
      setBids(prev => ({ ...prev, [key]: { status: json.filled ? 'filled' : 'missed', slot: json.slot ?? null, remaining: json.remaining ?? 0 } }));
      setFilled(prev => ({ ...prev, [key]: (json.quantity ?? tick.quantity ?? 0) - (json.remaining ?? 0) }));
    } catch {
      setBids(prev => ({ ...prev, [key]: { status: 'missed', slot: null, remaining: before } }));
    }
  }

  const showPicker = !picked && !browse;
  const up = (pnl ?? 0) >= 0;

  return (
    <div className={styles.terminal} data-view={view}>
      {/* ── 상태바 ── */}
      <div className={styles.bar}>
        <span className={styles.status} data-open={hours.open}>
          <i className={styles.dot} aria-hidden="true" />
          {hours.reason === 'test' ? <>빵장 개장 <small>· 테스트 상시</small></> : hours.open ? '빵장 개장' : '빵장 휴장'}
          <small>{hours.nowLabel}</small>
        </span>
        <KospiQuote initial={market.kospi} compact />
        <span className={styles.limit}>오늘 한도 <b>−{Math.round(market.tier.rate * 100)}%</b> · {market.tier.label}</span>
        <span className={styles.account}>
          {pick ? (
            <span className={styles.accountBadge} data-side={result?.side ?? 'flat'}>
              {pick.name}
              {pnl !== null && <b key={flash?.seq ?? 'i'} className={flash ? (flash.dir === 'up' ? styles.flashUp : styles.flashDown) : ''}>{signed(pnl)}</b>}
              {result && <>· {result.title}</>}
            </span>
          ) : (
            <button type="button" className={styles.accountBtn} onClick={() => { setBrowse(false); setView('detail'); }}>오늘 내 종목 고르기</button>
          )}
        </span>
      </div>

      <div className={styles.body}>
        {/* ── 관심상품 ── */}
        <aside className={styles.rail} aria-label="관심상품">
          <div className={styles.railHead}><span>관심상품</span><span>{picked ? '내 가격' : '오늘 가격'}</span></div>
          <ul className={styles.list}>
            {books.map(item => {
              const tick = item.ticks[effectiveSeatOf(item)];
              return (
                <li key={item.product.productNo}>
                  <button type="button" className={styles.item} aria-current={item.product.productNo === book.product.productNo}
                    data-soldout={!item.product.inStock} onClick={() => choose(item.product.productNo)}>
                    <span className={styles.thumb}><ProductPhoto productNo={item.product.productNo} name={item.product.name} /></span>
                    <span>
                      <span className={styles.itemName}>{item.product.name}</span>
                      <span className={styles.itemSub}>{item.product.inStock ? `정가 ${won(item.product.price)}` : '품절'}</span>
                    </span>
                    <span className={styles.itemPrice}>
                      <strong>{won(tick.price)}</strong>
                      <span>▼ {Math.round(tick.depth * 100)}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── 종목 화면 ── */}
        <section className={styles.stage} aria-label={`${book.product.name} 호가`}>
          <button type="button" className={styles.back} onClick={() => setView('list')}>← 관심상품</button>

          {showPicker ? (
            <PickPanel window={pickWindow} onPick={next => { setPick(next); setTab('book'); }} onBrowse={() => setBrowse(true)} />
          ) : (
            <>
              <header className={styles.head}>
                <div className={styles.headTop}>
                  {result && <span className={styles.flavor} data-side={result.side}>{FLAVOR[result.side]}</span>}
                  <h2>{book.product.name}</h2>
                  {soldOut && <span className={styles.soldout}>품절</span>}
                </div>

                <div className={styles.priceRow}>
                  <strong key={flash?.seq ?? 'init'} className={`${styles.bigPrice} ${flash ? (flash.dir === 'up' ? styles.flashUp : styles.flashDown) : ''}`}>
                    {won(seatTick.price)}
                  </strong>
                  <span className={styles.change}>▼ {won(off)} ({Math.round(seatTick.depth * 100)}%)</span>
                  <span className={styles.listPrice}>정가 {won(book.product.price)}원</span>
                </div>

                {pick ? (
                  <div className={styles.stock}>
                    <span className={styles.stockName}>오늘 내 종목 · {pick.name}</span>
                    {pnl !== null && <span className={styles.stockChg} data-side={up ? 'gain' : 'loss'}>{up ? '▲' : '▼'} {Math.abs(pnl).toFixed(2)}%</span>}
                    {quote && <Spark series={quote.series} up={up} />}
                    <span className={styles.lock}>
                      {quote?.marketOpen === false ? '15:30 확정' : quote?.marketOpen ? '장중 · 실시간' : '시세 확인 중'}
                      {pickWindow.reason === 'test'
                        ? <> · <button type="button" className={styles.relink} onClick={() => setPick(null)}>다시 고르기 (테스트)</button></>
                        : ' · 바꿀 수 없음'}
                    </span>
                  </div>
                ) : (
                  <p className={styles.priceNote}>
                    누구나 바로 살 수 있는 가격입니다. <button type="button" className={styles.relink} onClick={() => setBrowse(false)}>오늘 내 종목을 고르면</button> 자리가 내려갑니다.
                  </p>
                )}
                {picked && (
                  <p className={styles.priceNote}>
                    {effectiveSeat < seatIndex
                      ? <><b>내 자리 물량이 끝나</b> 한 칸 위 가격입니다.</>
                      : effectiveSeat === 0
                        ? <>오늘 내 종목 움직임이 작아 <b>맨 위 칸</b>이 내 자리입니다.</>
                        : <><b>내 자리</b>입니다 — 남음 {seatRemaining}. 먼저 사는 사람부터.</>}
                  </p>
                )}
              </header>

              <div className={styles.tabs} role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>호가</button>
                <button type="button" role="tab" aria-selected={tab === 'tape'} onClick={() => setTab('tape')}>체결 {tape.total > 0 && tape.total}</button>
                <button type="button" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')}>정보</button>
              </div>

              <div className={styles.panel} role="tabpanel">
                {tab === 'book' && (
                  <Ladder book={book} seatIndex={seatIndex} effectiveSeat={effectiveSeat} picked={picked} open={hours.open}
                    remainingOf={tick => remainingOf(book, tick)} bids={bids} onBid={bid} />
                )}
                {tab === 'tape' && <TapeTab tape={tape} ticks={books[0]?.ticks ?? []} />}
                {tab === 'info' && (
                  <InfoTab kospi={market.kospi.value} kospiLive={market.kospi.live} changePct={market.changePct}
                    absChangePct={market.absChangePct} tier={market.tier} hours={hours} />
                )}
              </div>

              <div className={styles.action}>
                {effectiveSeat === 0 ? (
                  <a className={styles.buy} href={shopUrl(book.product.productNo)} target="_blank" rel="noopener noreferrer" aria-disabled={soldOut || !hours.open}>
                    {won(seatTick.price)}원에 바로 구매
                    <small>{soldOut ? '품절' : !hours.open ? '휴장' : '수량 제한 없음'}</small>
                  </a>
                ) : (
                  <button type="button" className={styles.buy} disabled={soldOut || !hours.open || seatRemaining <= 0 || bids[bidKey(book.product.productNo, seatTick.depth)]?.status === 'busy'}
                    onClick={() => bid(seatTick)}>
                    {won(seatTick.price)}원에 사기
                    <small>{soldOut ? '품절' : !hours.open ? '휴장' : `내 자리 · 남음 ${seatRemaining}`}</small>
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
