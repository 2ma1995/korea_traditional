import KospiQuote from '@/components/KospiQuote';
import MyDesk from '@/components/MyDesk';
import { ALWAYS_OPEN, buildBreadMarket, CLOSE_HOUR, OPEN_HOUR } from '@/lib/orderbook';
import { getMarketSnapshot } from '@/lib/market';
import { loadTiers } from '@/lib/settings';
import { loadTape } from '@/lib/tape';
import styles from './breadmarket.module.css';

/**
 * 빵장 — 단일 화면. 세 층이 위에서 아래로 그대로 놓인다.
 *
 *   1층  오늘 KOSPI가 얼마나 움직였나  →  오늘 열릴 칸의 개수 (한도)
 *   2층  오늘 내 하루가 어땠나         →  그 칸들 중 내 자리
 *   3층  그 자리에서 어디까지 내려갈까  →  최종 가격
 *
 * 1층은 방향을 쓰지 않는다 — 크기만 본다. 규칙이 하나로 줄고, 연속 상승장에서
 * 같은 상품군만 반복 할인되는 문제가 사라진다.
 *
 * 2층이 이 화면의 무게중심이다. 코스피 1.8%는 손님과 상관없는 남의 일이지만
 * 내 오늘 손익은 내 일이다. 손님이 움직이는 이유를 2층에 두고, 코스피는
 * 1층에서 한도만 정하게 남겼다 — "금융시장 데이터가 가격 기준"이라는 요구는
 * 1층이 그대로 충족한다.
 */

const REASON_TEXT: Record<string, string> = {
  before: `아직 열리지 않았습니다. 매일 ${OPEN_HOUR}시에 엽니다.`,
  after: '오늘 빵장은 닫혔습니다.',
  holiday: '주식시장이 쉬는 날은 빵장도 쉽니다.',
};

export default async function BreadMarketPage() {
  const now = new Date();
  const [market, tiers, tape] = await Promise.all([
    getMarketSnapshot(now),
    loadTiers(),
    loadTape(now),
  ]);
  const book = buildBreadMarket(market, tiers, now);

  return <main id="main-content" className="page-width inner-page">
    <header className={styles.hero}>
      <div>
        <span className="eyebrow">MAKJI BREAD MARKET</span>
        <h1>장이 끝나면,<br /><em>빵장이 열립니다.</em></h1>
        <p>
          오늘 얼마를 벌었든 잃었든, 그 하루를 빵 한 봉지로 정산해 드립니다.
          시장이 오늘 열어둔 범위 안에서, 당신의 하루가 당신의 가격을 정합니다.
        </p>
      </div>

      <div className={styles.clock} data-open={book.hours.open}>
        <span className={styles.clockLabel}>
          {book.hours.reason === 'test' ? '테스트 · 상시 개장' : book.hours.open ? '개장 중' : '휴장'}
        </span>
        <strong>{OPEN_HOUR}:00 – {CLOSE_HOUR}:00</strong>
        <small>
          {book.hours.reason === 'test'
            ? `지금 ${book.hours.nowLabel} · 테스트를 위해 시간 제한을 꺼두었습니다`
            : book.hours.open
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
        <span>오늘 열린 정산 한도</span>
        <strong className={styles.depth}>정가 −{Math.round(book.tier.rate * 100)}%</strong>
        <small>변동폭 {book.tier.minAbsChange}% 이상 구간</small>
      </div>
    </section>

    <p className="demo-note">
      {market.kospi.live
        ? '코스피는 실제 시세입니다.'
        : '⚠️ 코스피 수집에 실패해 샘플 값이 표시되고 있습니다. 실제 시세가 아닙니다.'}
      {ALWAYS_OPEN && <> <b>지금은 테스트를 위해 24시간 열어두었습니다</b> — 원래는 20:00~24:00, 주식시장이 쉬는 날은 빵장도 쉽니다.</>}
      {' '}가격별 한정 수량은 아직 코드 기본값이며, 관리자가 직접 입력하는 화면은 다음 단계입니다.
      한정 호가의 체결 처리도 구현 전이라 <b>지금은 맨 위 칸만 실제로 구매까지 이어집니다.</b>
    </p>

    <MyDesk
      books={book.books}
      open={book.hours.open}
      today={tape.day}
      limitRate={book.tier.rate}
      initialTape={tape}
    />

    <section className={styles.rule}>
      <h2>오늘 가격이 이렇게 정해졌습니다</h2>
      <ol>
        <li>
          <strong>15:30</strong> 주식장 마감 — 오늘 KOSPI가 <b>{book.absChangePct.toFixed(2)}%</b> 움직였습니다
          {book.changePct >= 0 ? ` (+${book.changePct.toFixed(2)}%)` : ` (${book.changePct.toFixed(2)}%)`}
        </li>
        <li>
          움직인 크기가 <b>{book.tier.label}</b> 구간이라 오늘 정산 한도가 <b>정가 −{Math.round(book.tier.rate * 100)}%</b>까지 열렸습니다
        </li>
        <li>그 한도 안에서 <b>오늘 당신의 하루</b>가 당신의 자리를 정합니다 — 잃었으면 위로가, 벌었으면 자축가</li>
        <li><strong>{OPEN_HOUR}:00</strong> 개장 — 그 자리에서 더 내려갈지는 <b>당신이 고릅니다</b>. 못 잡으면 다음날 우선권을 받습니다</li>
      </ol>
      <p className={styles.ruleNote}>
        시장은 오르든 내리든 같은 규칙입니다. 방향이 아니라 <b>얼마나 움직였는지</b>만 봅니다.
        시장이 정하는 것은 <b>오늘 얼마나 크게 정산할 수 있는지</b>까지이고,
        그 안에서 어디에 앉을지는 당신의 하루가, 마지막 한 칸은 당신의 선택이 정합니다.
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
