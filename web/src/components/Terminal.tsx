'use client';

import { useMemo, useState } from 'react';
import AccountSheet from '@/components/AccountSheet';
import InfoTab from '@/components/InfoTab';
import KospiQuote, { type KospiView } from '@/components/KospiQuote';
import Ladder, { bidKey, shopUrl, type BidState } from '@/components/Ladder';
import ProductPhoto from '@/components/ProductPhoto';
import TapeTab from '@/components/TapeTab';
import type { DiscountTier } from '@/data/indicators';
import type { MarketHours, ProductBook, Tick } from '@/lib/orderbook';
import { settle } from '@/lib/settlement';
import { useSavedSource } from '@/lib/settlementStore';
import type { Tape } from '@/lib/tape';
import styles from './Terminal.module.css';

/**
 * 빵장 터미널 — 화면 하나, 행동 하나.
 *
 * 증권 앱의 문법을 그대로 빌린다.
 *
 *   상태바        개장 여부 · KOSPI 시세 · 오늘 한도 · [내 계좌]
 *   관심상품      종목 리스트 — 이름 · 내 가격 · 정가대비
 *   종목 화면     큰 가격(=내 정산가) · 탭(호가 | 체결 | 정보) · 하단 고정 [바로 구매]
 *
 * 이전 화면은 히어로·게이지·시황·정산·호가창×10·규칙·공식몰이 세로로 쌓여
 * 랜딩 페이지에 도구가 묻힌 꼴이었다. 무슨 서비스인지 안 읽혔다.
 * 증권 앱은 종목 하나를 고르면 그 종목만 보인다. 여기도 그렇게 한다.
 *
 * '내 계좌' = 내 하루 정산. 증권 앱은 계좌가 있어야 매수가 되고,
 * 빵장은 내 하루를 넣어야 내 가격이 나온다. 안 넣어도 맨 위 칸으로 살 수 있다.
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
  today: string;
  initialTape: Tape;
}

type Tab = 'book' | 'tape' | 'info';

const FLAVOR = { loss: '손절빵', gain: '익절빵', flat: '본전빵' } as const;
const won = (value: number) => value.toLocaleString('ko-KR');
const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;

export default function Terminal({ books, market, hours, today, initialTape }: Props) {
  const firstInStock = books.find(book => book.product.inStock) ?? books[0];
  const [selectedNo, setSelectedNo] = useState(firstInStock.product.productNo);
  const [tab, setTab] = useState<Tab>('book');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [sheet, setSheet] = useState(false);
  const [tape, setTape] = useState(initialTape);
  const [bids, setBids] = useState<Record<string, BidState>>({});
  const [source, setSource] = useSavedSource(today);

  const openTicks = books[0]?.ticks.length ?? 1;
  const result = useMemo(() => (source ? settle(source.pnlPct, openTicks) : null), [source, openTicks]);
  const seatIndex = result?.seatIndex ?? 0;
  const settled = result !== null;

  const book = books.find(item => item.product.productNo === selectedNo) ?? firstInStock;
  const seatTick = book.ticks[Math.min(seatIndex, book.ticks.length - 1)];
  const soldOut = !book.product.inStock;
  const off = book.product.price - seatTick.price;

  /* 관심상품 리스트의 가격도 내 자리 기준이다 — 종목 리스트에 현재가가 뜨는 것처럼 */
  const seatPriceOf = (item: ProductBook) => item.ticks[Math.min(seatIndex, item.ticks.length - 1)];

  function pick(productNo: number) {
    setSelectedNo(productNo);
    setView('detail');
    setTab('book');
  }

  /**
   * 걸기 — 선착순 즉시 체결.
   * 서버가 수량·개장·오늘 열린 폭을 다시 계산하므로 여기서는 결과만 받아 그린다.
   */
  async function bid(tick: Tick) {
    const key = bidKey(book.product.productNo, tick.depth);
    const quantity = tick.quantity ?? 0;
    setBids(prev => ({ ...prev, [key]: { status: 'busy', slot: null, remaining: Math.max(0, quantity - tick.filled) } }));
    try {
      const res = await fetch('/api/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo: book.product.productNo, depth: tick.depth }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '체결에 실패했습니다.');
      setBids(prev => ({
        ...prev,
        [key]: { status: json.filled ? 'filled' : 'missed', slot: json.slot ?? null, remaining: json.remaining ?? 0 },
      }));
    } catch {
      /* 실패는 미체결로 보여준다. 다시 누르면 다시 시도된다 */
      setBids(prev => ({ ...prev, [key]: { status: 'missed', slot: null, remaining: Math.max(0, quantity - tick.filled) } }));
    }
  }

  return (
    <div className={styles.terminal} data-view={view}>
      {/* 상태바 */}
      <div className={styles.bar}>
        <span className={styles.status} data-open={hours.open}>
          <i className={styles.dot} aria-hidden="true" />
          {hours.reason === 'test' ? <>빵장 개장 <small>· 테스트 상시</small></> : hours.open ? '빵장 개장' : '빵장 휴장'}
          <small>{hours.nowLabel}</small>
        </span>
        <KospiQuote initial={market.kospi} compact />
        <span className={styles.limit}>오늘 한도 <b>−{Math.round(market.tier.rate * 100)}%</b> · {market.tier.label}</span>
        <span className={styles.account}>
          {result && source ? (
            <button type="button" className={styles.accountBadge} data-side={result.side} onClick={() => setSheet(true)}>
              {source.kind === 'symbol' ? source.name : '내 수익률'} <b>{signed(source.pnlPct)}</b> · {result.title}
            </button>
          ) : (
            <button type="button" className={styles.accountBtn} onClick={() => setSheet(true)}>내 하루 정산하기</button>
          )}
        </span>
      </div>

      <div className={styles.body}>
        {/* 관심상품 */}
        <aside className={styles.rail} aria-label="관심상품">
          <div className={styles.railHead}><span>관심상품</span><span>{settled ? '내 정산가' : '오늘 가격'}</span></div>
          <ul className={styles.list}>
            {books.map(item => {
              const tick = seatPriceOf(item);
              return (
                <li key={item.product.productNo}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={item.product.productNo === book.product.productNo}
                    data-soldout={!item.product.inStock}
                    onClick={() => pick(item.product.productNo)}
                  >
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

        {/* 종목 화면 */}
        <section className={styles.stage} aria-label={`${book.product.name} 호가`}>
          <button type="button" className={styles.back} onClick={() => setView('list')}>← 관심상품</button>

          <header className={styles.head}>
            <div className={styles.headTop}>
              {result && <span className={styles.flavor} data-side={result.side}>{FLAVOR[result.side]}</span>}
              <h2>{book.product.name}</h2>
              {soldOut && <span className={styles.soldout}>품절</span>}
            </div>
            <div className={styles.priceRow}>
              <strong className={styles.bigPrice}>{won(seatTick.price)}</strong>
              <span className={styles.change}>▼ {won(off)} ({Math.round(seatTick.depth * 100)}%)</span>
              <span className={styles.listPrice}>정가 {won(book.product.price)}원</span>
            </div>
            <p className={styles.priceNote}>
              {settled
                ? <><b>내 정산가</b>입니다 — 오늘 1회. 아래 칸은 한정 수량 도전입니다.</>
                : <>누구나 바로 살 수 있는 가격입니다. <b>내 하루를 정산</b>하면 자리가 내려갑니다.</>}
            </p>
          </header>

          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>호가</button>
            <button type="button" role="tab" aria-selected={tab === 'tape'} onClick={() => setTab('tape')}>체결 {tape.total > 0 && `${tape.total}`}</button>
            <button type="button" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')}>정보</button>
          </div>

          <div className={styles.panel} role="tabpanel">
            {tab === 'book' && (
              <Ladder book={book} seatIndex={seatIndex} settled={settled} open={hours.open} bids={bids} onBid={bid} />
            )}
            {tab === 'tape' && <TapeTab tape={tape} ticks={books[0]?.ticks ?? []} />}
            {tab === 'info' && (
              <InfoTab
                kospi={market.kospi.value}
                kospiLive={market.kospi.live}
                changePct={market.changePct}
                absChangePct={market.absChangePct}
                tier={market.tier}
                hours={hours}
              />
            )}
          </div>

          <div className={styles.action}>
            <a
              className={styles.buy}
              href={shopUrl(book.product.productNo)}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={soldOut || !hours.open}
            >
              {won(seatTick.price)}원에 바로 구매
              <small>{soldOut ? '품절' : !hours.open ? '휴장' : settled ? '내 정산가 · 오늘 1회' : '수량 제한 없음'}</small>
            </a>
          </div>
        </section>
      </div>

      <AccountSheet
        open={sheet}
        onClose={() => setSheet(false)}
        today={today}
        openTicks={openTicks}
        limitRate={market.tier.rate}
        source={source}
        setSource={next => { setSource(next); if (next) setSheet(false); }}
        onTape={setTape}
      />
    </div>
  );
}
