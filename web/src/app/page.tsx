import KospiQuote from '@/components/KospiQuote';
import OrderBook from '@/components/OrderBook';
import { buildBreadMarket, CLOSE_HOUR, OPEN_HOUR } from '@/lib/orderbook';
import { getMarketSnapshot } from '@/lib/market';
import { loadTiers } from '@/lib/settings';
import styles from './breadmarket.module.css';

/**
 * 빵장 — 단일 화면.
 *
 * 주식장이 끝나면 오늘 KOSPI가 얼마나 움직였는지 확정된다. 그 크기가 오늘 열릴
 * 최저호가를 정하고, 손님은 열린 범위 안에서 원하는 가격에 건다.
 *
 * 방향(올랐나 내렸나)은 쓰지 않는다 — 크기만 본다. 규칙이 하나로 줄고,
 * 연속 상승장에서 같은 상품군만 반복 할인되는 문제가 사라진다.
 */

const won = (value: number) => value.toLocaleString('ko-KR');

const REASON_TEXT: Record<string, string> = {
  before: `아직 열리지 않았습니다. 매일 ${OPEN_HOUR}시에 엽니다.`,
  after: '오늘 빵장은 닫혔습니다.',
  holiday: '주식시장이 쉬는 날은 빵장도 쉽니다.',
};

export default async function BreadMarketPage() {
  const now = new Date();
  const [market, tiers] = await Promise.all([getMarketSnapshot(now), loadTiers()]);
  const book = buildBreadMarket(market, tiers, now);

  return <main id="main-content" className="page-width inner-page">
    <header className={styles.hero}>
      <div>
        <span className="eyebrow">MAKJI BREAD MARKET</span>
        <h1>장이 끝나면,<br /><em>빵장이 열립니다.</em></h1>
        <p>
          오늘 시장이 크게 움직였다면, 빵을 살 수 있는 가격도 크게 움직입니다.
          열린 범위 안에서 원하는 가격에 거세요.
        </p>
      </div>

      <div className={styles.clock} data-open={book.hours.open}>
        <span className={styles.clockLabel}>{book.hours.open ? '개장 중' : '휴장'}</span>
        <strong>{OPEN_HOUR}:00 – {CLOSE_HOUR}:00</strong>
        <small>
          {book.hours.open
            ? `지금 ${book.hours.nowLabel} · 자정에 닫힙니다`
            : REASON_TEXT[book.hours.reason] ?? ''}
        </small>
      </div>
    </header>

    <section className={styles.gauge} aria-label="오늘의 시장 기준">
      <div className={styles.gaugeItem} data-quote="true">
        <KospiQuote
          initial={{
            value: market.kospi.value,
            changePct: market.kospi.changePct,
            live: market.kospi.live,
            marketOpen: market.kospiMarketOpen,
          }}
        />
      </div>

      <div className={styles.gaugeItem}>
        <span>오늘 변동폭</span>
        <strong className={styles.abs}>{book.absChangePct.toFixed(2)}%</strong>
        <small>{book.tier.label} · 부호를 보지 않고 크기만 봅니다</small>
      </div>

      <div className={styles.gaugeItem}>
        <span>오늘 열린 최저호가</span>
        <strong className={styles.depth}>정가 −{Math.round(book.tier.rate * 100)}%</strong>
        <small>
          변동폭 {book.tier.minAbsChange}% 이상 구간
        </small>
      </div>
    </section>

    <p className="demo-note">
      {market.kospi.live
        ? '코스피는 실제 시세입니다.'
        : '⚠️ 코스피 수집에 실패해 샘플 값이 표시되고 있습니다. 실제 시세가 아닙니다.'}
      {' '}가격별 한정 수량은 아직 코드 기본값이며, 관리자가 직접 입력하는 화면은 다음 단계입니다.
      한정 호가의 체결 처리도 구현 전이라 <b>지금은 즉시구매 칸만 실제로 구매까지 이어집니다.</b>
    </p>

    <section className={styles.boards} aria-label="상품별 호가창">
      {book.books.map(item => (
        <OrderBook key={item.product.productNo} book={item} open={book.hours.open} />
      ))}
    </section>

    <section className={styles.rule}>
      <h2>오늘 가격이 이렇게 정해졌습니다</h2>
      <ol>
        <li>
          <strong>15:30</strong> 주식장 마감 — 오늘 KOSPI가 <b>{book.absChangePct.toFixed(2)}%</b> 움직였습니다
          {book.changePct >= 0 ? ` (+${book.changePct.toFixed(2)}%)` : ` (${book.changePct.toFixed(2)}%)`}
        </li>
        <li>
          움직인 크기가 <b>{book.tier.label}</b> 구간이라 최저호가가 <b>정가 −{Math.round(book.tier.rate * 100)}%</b>까지 열렸습니다
        </li>
        <li>가격별 판매 수량은 <b>재고</b>가 정합니다. 싼 호가일수록 물량이 적습니다</li>
        <li><strong>{OPEN_HOUR}:00</strong> 개장 — 원하는 가격에 걸고, 못 잡으면 다음날 우선권을 받습니다</li>
      </ol>
      <p className={styles.ruleNote}>
        오르든 내리든 같은 규칙입니다. 방향이 아니라 <b>얼마나 움직였는지</b>만 봅니다.
        최저호가가 열렸다는 것은 모두가 그 가격에 살 수 있다는 뜻이 아니라,
        그 가격에 <b>도전할 수 있다</b>는 뜻입니다.
      </p>
    </section>

    <section className={styles.shop}>
      <div>
        <span className="eyebrow">MAKJI 공식몰</span>
        <h2>정가로 바로 사고 싶다면</h2>
        <p>빵장이 닫힌 시간에도 자사몰에서는 언제든 구매할 수 있습니다.</p>
      </div>
      <a
        className="button button-outline"
        href="https://makji.kr/product/list.html?cate_no=24"
        target="_blank"
        rel="noopener noreferrer"
      >막지 공식몰 <span aria-hidden="true">↗</span></a>
    </section>
  </main>;
}
