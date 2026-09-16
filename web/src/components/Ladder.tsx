'use client';

import type { ProductBook, Tick } from '@/lib/orderbook';
import styles from './Terminal.module.css';

/**
 * 호가창 — 증권 앱의 호가 탭.
 *
 * 열: 가격 · 정가대비 · 잔량(막대) · 주문. 증권 호가창의 매수잔량 막대를
 * 그대로 빌렸다 — 숫자보다 막대가 "얼마 안 남았다"를 빨리 전한다.
 *
 * 세 가지 상태가 있다.
 *   open    내 자리보다 얕은(비싼) 칸. 물량이 많고 확실하다. 누구나 걸 수 있다
 *   seat    내 자리. 내 종목이 정한 오늘 가장 깊은 칸. 물량이 적어 경쟁이 있다
 *   closed  내 자리보다 깊은 칸. 오늘 나에겐 닫혀 있다 — 더 크게 움직인 날 열린다
 *
 * 그래서 선택이 생긴다: 싼데 4개(내 자리) vs 덜 싼데 12개(확실). 그 선택이 3층이다.
 * 내 자리 물량이 끝나면 한 칸 위로 자동으로 올라간다(Terminal의 effectiveSeat).
 *
 * 걸기는 선착순 즉시 체결이다(A안). 누른 순간 되거나 안 된다.
 */

export interface BidState {
  status: 'filled' | 'missed' | 'busy';
  slot: number | null;
  remaining: number;
}

interface Props {
  book: ProductBook;
  /** 내 종목이 정한 자리 (물량 소진 전 원래 자리) */
  seatIndex: number;
  /** 물량이 남아 실제로 살 수 있는 자리 */
  effectiveSeat: number;
  picked: boolean;
  open: boolean;
  remainingOf: (tick: Tick) => number;
  bids: Record<string, BidState>;
  onBid: (tick: Tick) => void;
}

const won = (value: number) => value.toLocaleString('ko-KR');
export const bidKey = (productNo: number, depth: number) => `${productNo}:${depth.toFixed(3)}`;
export const shopUrl = (productNo: number) =>
  `https://makji.kr/product/detail.html?product_no=${productNo}`;

export default function Ladder({ book, seatIndex, effectiveSeat, picked, open, remainingOf, bids, onBid }: Props) {
  const { product, ticks } = book;
  const soldOut = !product.inStock;

  const mine = Object.entries(bids)
    .filter(([key]) => key.startsWith(`${product.productNo}:`))
    .map(([, state]) => state)
    .find(state => state.status !== 'busy');

  return (
    <>
      <div className={styles.ladder} role="table" aria-label={`${product.name} 호가`}>
        <div className={styles.colHead} role="row">
          <span>가격</span><span>정가대비</span><span>남은 수량</span><span>주문</span>
        </div>

        {ticks.map((tick, index) => {
          const state = index > seatIndex ? 'closed' : index === effectiveSeat ? 'seat' : 'open';
          const key = bidKey(product.productNo, tick.depth);
          const bid = bids[key];
          const quantity = tick.quantity ?? 0;
          const remaining = tick.instant ? Infinity : remainingOf(tick);
          const ratio = quantity > 0 ? Math.min(1, remaining / quantity) : 0;
          const disabled = soldOut || !open || remaining <= 0 || bid?.status === 'busy';

          return (
            <div key={tick.depth} className={styles.row} role="row" data-state={state} data-instant={tick.instant}>
              <span className={styles.rPrice}>{won(tick.price)}</span>
              <span className={styles.rDepth}>−{Math.round(tick.depth * 100)}%</span>

              <span className={styles.rQty}>
                {tick.instant ? (
                  <small style={{ textAlign: 'left', minWidth: 0 }}>수량 제한 없음</small>
                ) : (
                  <>
                    <span className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
                    <small>{remaining > 0 ? `남음 ${remaining} / ${quantity}` : '물량 없음'}</small>
                  </>
                )}
              </span>

              <span className={styles.rEnd}>
                {state === 'closed' ? (
                  <span className={styles.rTag}>{picked ? '더 큰 하루에 열림' : '종목을 고르면 열림'}</span>
                ) : state === 'seat' ? (
                  <span className={styles.rTag}><b>내 자리</b> · 아래 버튼</span>
                ) : tick.instant ? (
                  <a className={styles.bid} href={shopUrl(product.productNo)} target="_blank" rel="noopener noreferrer" aria-disabled={soldOut}>
                    바로 구매 ↗
                  </a>
                ) : (
                  <button
                    type="button"
                    className={styles.bid}
                    data-state={bid?.status}
                    disabled={disabled && bid?.status !== 'filled'}
                    onClick={() => bid?.status !== 'filled' && onBid(tick)}
                  >
                    {bid?.status === 'busy' ? '체결 중…'
                      : bid?.status === 'filled' ? `체결 · ${bid.slot}번째`
                      : bid?.status === 'missed' ? '물량 끝'
                      : remaining <= 0 ? '물량 없음'
                      : '이 가격에 걸기'}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {mine?.status === 'filled' && (
        <p className={styles.fillNote}>
          <b>체결됐습니다.</b> 이 칸의 {mine.slot}번째입니다.{' '}
          <a href={shopUrl(product.productNo)} target="_blank" rel="noopener noreferrer">자사몰에서 결제하기 ↗</a>
          <br />체결가 적용은 <b>쿠폰 발급</b>이 필요해 기업 확인 중입니다. 지금은 예약만 확정됩니다.
        </p>
      )}
      {mine?.status === 'missed' && (
        <p className={styles.fillNote}>
          <b>한발 늦었습니다.</b> 이 가격 물량이 끝났습니다. 자리가 한 칸 위로 올라갔습니다.
          <br />내일 같은 가격 <b>우선권</b>을 드립니다 — 발급 기능은 준비 중입니다.
        </p>
      )}

      <p className={styles.hint}>
        {picked
          ? '내 자리는 물량이 적어 먼저 건 사람부터 체결됩니다. 위 칸은 물량이 많고 확실합니다 — 어디서 살지는 내 선택입니다.'
          : '종목을 고르면 내 자리가 내려가고 아래 칸이 열립니다. 고르지 않아도 맨 위 칸은 누구나 삽니다.'}
        {!open && ' 지금은 빵장이 닫혀 있어 걸 수 없습니다.'}
      </p>
    </>
  );
}
