'use client';

import { useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { ProductBook } from '@/lib/orderbook';
import styles from './OrderBook.module.css';

/**
 * 상품 하나의 호가창 — 3층 구조의 맨 위 층.
 *
 * 맨 위 칸은 언제나 바로 살 수 있는 칸이다. 수량을 기다리지 않아도 되고
 * 자사몰로 바로 나간다 — 주식을 모르는 손님도 이 칸만 쓰면 되고,
 * 아무도 빈손으로 나가지 않는다.
 *
 * 정산을 마친 손님은 그 칸이 **내 자리(seatIndex)** 로 내려온다. 내 자리보다
 * 비싼 칸은 아예 그리지 않는다 — 오늘 그 손님의 호가창은 내 가격에서 시작한다.
 * 내 자리 아래 칸들은 한정 수량이라 '도전'으로 남는다.
 *
 * 왜 아래 칸을 남기나. 손실이 만드는 감정은 무력감이고, 그 반대는 통제감이다.
 * 슬픔을 줄이는 것은 구매 자체가 아니라 **고르는 행위**라는 연구가 있다
 * ("The benefits of retail therapy", Rick 외, Journal of Consumer Psychology).
 * 가격을 정해서 주기만 하면 그 기제가 없다. 그래서 고를 여지를 남긴다.
 *
 * 체결 엔진(선착순·제한시간 결제)은 다음 단계라 지금은 고른 값을 화면에서
 * 확인하는 데까지만 동작한다. 화면에 그 사실을 밝힌다.
 */

interface Props {
  book: ProductBook;
  /** 빵장이 닫혀 있으면 주문을 받지 않는다 */
  open: boolean;
  /** 내 자리. 정산 전에는 0 — 기본 호가창과 같다 */
  seatIndex?: number;
  /** 정산을 마쳤는가. 맨 위 칸의 성격이 달라진다 (누구나 → 나에게 1회) */
  settled?: boolean;
  /**
   * 오늘 이 손님의 하루. 상품 이름 옆에 붙는 별명을 정한다.
   *
   * 감정을 손님이 직접 말하게 하면 허들이 된다. 제품이 대신 말해주면
   * 고르는 행위만으로 오늘 하루가 인정된다 — 비용은 이름 한 줄이다.
   */
  flavor?: 'gain' | 'loss' | 'flat' | null;
}

const FLAVOR_NAME: Record<'gain' | 'loss' | 'flat', string> = {
  loss: '손절빵',
  gain: '익절빵',
  flat: '본전빵',
};

const won = (value: number) => value.toLocaleString('ko-KR');

/** 자사몰 상품 상세로 바로 보낸다. productNo가 makji.kr의 실제 상품번호다. */
const shopUrl = (productNo: number) =>
  `https://makji.kr/product/detail.html?product_no=${productNo}`;

export default function OrderBook({ book, open, seatIndex = 0, settled = false, flavor = null }: Props) {
  const { product, ticks } = book;
  const [picked, setPicked] = useState<number | null>(null);

  const soldOut = !product.inStock;
  /* 내 자리보다 비싼 칸은 오늘 이 손님에게 의미가 없다 */
  const seat = Math.min(seatIndex, Math.max(0, ticks.length - 1));
  const visible = ticks.slice(seat);

  return (
    <article className={styles.book} data-soldout={soldOut}>
      <div className={styles.photo}>
        <ProductPhoto productNo={product.productNo} name={product.name} />
      </div>

      <div className={styles.head}>
        <h3>
          {flavor && <em className={styles.flavor} data-side={flavor}>{FLAVOR_NAME[flavor]}</em>}
          {product.name}
        </h3>
        <p className={styles.list}>
          정가 {won(product.price)}원
          {soldOut && <span className={styles.badge}>품절</span>}
        </p>
      </div>

      <ul className={styles.ticks}>
        {visible.map((tick, index) => {
          const isSeat = index === 0;
          const disabled = soldOut || !open || (!isSeat && (tick.quantity ?? 0) <= 0);

          return (
            <li
              key={tick.depth}
              className={styles.tick}
              data-instant={isSeat}
              data-seat={isSeat && settled}
              data-picked={picked === index}
            >
              <span className={styles.price}>
                {won(tick.price)}원
                {isSeat && settled && <em className={styles.seatTag}>내 정산가</em>}
              </span>
              <span className={styles.depth}>−{Math.round(tick.depth * 100)}%</span>
              <span className={styles.qty}>
                {isSeat
                  ? settled ? '오늘 1회' : '수량 제한 없음'
                  : (tick.quantity ?? 0) > 0 ? `남음 ${tick.quantity}` : '물량 없음'}
              </span>
              {isSeat
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

      {picked !== null && visible[picked] && (
        <p className={styles.note}>
          {won(visible[picked].price)}원에 걸었습니다. 물량이 {visible[picked].quantity}개뿐이라
          먼저 건 사람부터 체결됩니다.
          <br />
          <b>체결 처리는 아직 구현 전입니다</b> — 실제 서비스에서는 체결 알림과 제한시간 결제 링크가 옵니다.
        </p>
      )}
    </article>
  );
}
