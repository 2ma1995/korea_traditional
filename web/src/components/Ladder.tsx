'use client';

import type { ProductBook, Tick } from '@/lib/orderbook';
import styles from './Terminal.module.css';

/**
 * 호가창 — 증권 앱의 호가 탭.
 *
 * 열: 가격 · 정가대비 · 잔량(막대) · 액션. 증권 호가창의 매수잔량 막대를
 * 그대로 빌렸다 — 숫자보다 막대가 "얼마 안 남았다"를 빨리 전한다.
 *
 * 내 자리(seatIndex)보다 비싼 칸은 그리지 않는다. 대신 맨 위에 한 줄로 접어
 * "그 위로 N칸 — 오늘은 닫힘"만 남긴다. 사다리가 어디서 시작하는지는 보이되
 * 나에게 의미 없는 가격이 화면을 차지하지 않게.
 *
 * 걸기(bid)는 선착순 즉시 체결이다(A안). 누른 순간 되거나 안 된다.
 */

export interface BidState {
  status: 'filled' | 'missed' | 'busy';
  slot: number | null;
  remaining: number;
}

interface Props {
  book: ProductBook;
  seatIndex: number;
  settled: boolean;
  open: boolean;
  bids: Record<string, BidState>;
  onBid: (tick: Tick) => void;
}

const won = (value: number) => value.toLocaleString('ko-KR');
export const bidKey = (productNo: number, depth: number) => `${productNo}:${depth.toFixed(3)}`;

/** 자사몰 상품 상세. productNo가 makji.kr의 실제 상품번호다 */
export const shopUrl = (productNo: number) =>
  `https://makji.kr/product/detail.html?product_no=${productNo}`;

export default function Ladder({ book, seatIndex, settled, open, bids, onBid }: Props) {
  const { product, ticks } = book;
  const soldOut = !product.inStock;
  const seat = Math.min(seatIndex, Math.max(0, ticks.length - 1));
  const visible = ticks.slice(seat);
  const hidden = ticks.slice(0, seat);

  const lastFilled = Object.entries(bids)
    .filter(([key]) => key.startsWith(`${product.productNo}:`))
    .map(([, state]) => state)
    .find(state => state.status !== 'busy');

  return (
    <>
      <div className={styles.ladder} role="table" aria-label={`${product.name} 호가`}>
        <div className={styles.colHead} role="row">
          <span>가격</span><span>정가대비</span><span>남은 수량</span><span>주문</span>
        </div>

        {hidden.length > 0 && (
          <div className={styles.above}>
            <span>▲ {won(hidden[0].price)}원 ~ {won(hidden[hidden.length - 1].price)}원 · {hidden.length}칸</span>
            <span>내 자리 위 — 오늘은 닫힘</span>
          </div>
        )}

        {visible.map((tick, index) => {
          const isSeat = index === 0;
          const key = bidKey(product.productNo, tick.depth);
          const bid = bids[key];
          const quantity = tick.quantity ?? 0;
          const remaining = bid ? bid.remaining : Math.max(0, quantity - tick.filled);
          const ratio = quantity > 0 ? remaining / quantity : 0;
          const disabled = soldOut || !open || remaining <= 0 || bid?.status === 'busy';

          return (
            <div key={tick.depth} className={styles.row} role="row" data-seat={isSeat && settled} data-instant={isSeat}>
              <span className={styles.rPrice}>{won(tick.price)}</span>
              <span className={styles.rDepth}>−{Math.round(tick.depth * 100)}%</span>

              <span className={styles.rQty}>
                {isSeat ? (
                  <small style={{ textAlign: 'left', minWidth: 0 }}>{settled ? '오늘 1회' : '수량 제한 없음'}</small>
                ) : (
                  <>
                    <span className={styles.meter} aria-hidden="true"><i style={{ width: `${Math.round(ratio * 100)}%` }} /></span>
                    <small>{remaining > 0 ? `남음 ${remaining} / ${quantity}` : '물량 없음'}</small>
                  </>
                )}
              </span>

              <span className={styles.rEnd}>
                {isSeat ? (
                  <span className={styles.rTag}>{settled ? <b>내 정산가</b> : '바로 구매'} · 아래 버튼</span>
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

      {lastFilled?.status === 'filled' && (
        <p className={styles.fillNote}>
          <b>체결됐습니다.</b> 이 칸의 {lastFilled.slot}번째입니다.{' '}
          <a href={shopUrl(product.productNo)} target="_blank" rel="noopener noreferrer">자사몰에서 결제하기 ↗</a>
          <br />체결가 적용은 <b>쿠폰 발급</b>이 필요해 기업 확인 중입니다. 지금은 예약만 확정됩니다.
        </p>
      )}
      {lastFilled?.status === 'missed' && (
        <p className={styles.fillNote}>
          <b>한발 늦었습니다.</b> 이 가격 물량이 끝났습니다.
          <br />내일 같은 가격 <b>우선권</b>을 드립니다 — 발급 기능은 준비 중입니다.
        </p>
      )}

      <p className={styles.hint}>
        맨 위 칸은 수량을 기다리지 않고 바로 삽니다. 아래 칸은 한정 수량이라 먼저 건 사람부터 체결됩니다.
        {!open && ' 지금은 빵장이 닫혀 있어 걸 수 없습니다.'}
      </p>
    </>
  );
}
