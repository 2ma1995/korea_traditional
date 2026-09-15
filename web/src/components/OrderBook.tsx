'use client';

import { useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { ProductBook } from '@/lib/orderbook';
import styles from './OrderBook.module.css';

/**
 * 상품 하나의 호가창.
 *
 * 맨 위는 즉시구매다. 수량 제한이 없고 자사몰로 바로 나간다 —
 * 주식을 모르는 손님도 이 칸만 쓰면 되고, 아무도 빈손으로 나가지 않는다.
 *
 * 아래 칸은 한정 수량 예약이다. 체결 엔진(선착순·제한시간 결제)은 다음 단계라
 * 지금은 고른 값을 화면에서 확인하는 데까지만 동작한다. 화면에 그 사실을 밝힌다.
 */

interface Props {
  book: ProductBook;
  /** 빵장이 닫혀 있으면 주문을 받지 않는다 */
  open: boolean;
}

const won = (value: number) => value.toLocaleString('ko-KR');

/** 자사몰 상품 상세로 바로 보낸다. productNo가 makji.kr의 실제 상품번호다. */
const shopUrl = (productNo: number) =>
  `https://makji.kr/product/detail.html?product_no=${productNo}`;

export default function OrderBook({ book, open }: Props) {
  const { product, ticks } = book;
  const [picked, setPicked] = useState<number | null>(null);

  const soldOut = !product.inStock;

  return (
    <article className={styles.book} data-soldout={soldOut}>
      <div className={styles.photo}>
        <ProductPhoto productNo={product.productNo} name={product.name} />
      </div>

      <div className={styles.head}>
        <h3>{product.name}</h3>
        <p className={styles.list}>
          정가 {won(product.price)}원
          {soldOut && <span className={styles.badge}>품절</span>}
        </p>
      </div>

      <ul className={styles.ticks}>
        {ticks.map((tick, index) => {
          const disabled = soldOut || !open || (tick.quantity !== null && tick.quantity <= 0);
          return (
            <li key={tick.depth} className={styles.tick} data-instant={tick.instant} data-picked={picked === index}>
              <span className={styles.price}>{won(tick.price)}원</span>
              <span className={styles.depth}>−{Math.round(tick.depth * 100)}%</span>
              <span className={styles.qty}>
                {tick.instant ? '수량 제한 없음' : tick.quantity && tick.quantity > 0 ? `남음 ${tick.quantity}` : '물량 없음'}
              </span>
              {tick.instant
                ? <a
                    className={styles.buy}
                    href={shopUrl(product.productNo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={disabled}
                  >바로 구매</a>
                : <button
                    type="button"
                    className={styles.order}
                    disabled={disabled}
                    aria-pressed={picked === index}
                    onClick={() => setPicked(picked === index ? null : index)}
                  >{picked === index ? '선택됨' : '이 가격에 걸기'}</button>}
            </li>
          );
        })}
      </ul>

      {picked !== null && (
        <p className={styles.note}>
          {won(ticks[picked].price)}원에 걸었습니다. 물량이 {ticks[picked].quantity}개뿐이라
          먼저 건 사람부터 체결됩니다.
          <br />
          <b>체결 처리는 아직 구현 전입니다</b> — 실제 서비스에서는 체결 알림과 제한시간 결제 링크가 옵니다.
        </p>
      )}
    </article>
  );
}
