'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import styles from '@/app/landing.module.css';

/**
 * 오늘의 할인 대상 목록.
 *
 * 배치를 개수로 정하지 않고 **남은 높이를 재서** 정한다. 이 패널은 왼쪽(코스피·날씨·환율)과
 * 같은 격자 칸이라 높이가 왼쪽에 의해 정해지고, 제품 수는 절기와 품절 상황에 따라 바뀐다.
 * 개수로 규칙을 박아두면 왼쪽 내용이 바뀌는 순간 어긋난다.
 *
 *   한 줄에 하나로 다 들어가면  → 그대로 둔다 (사진·가격이 크게 보인다)
 *   넘치면                    → 한 줄에 둘로 접는다
 *   둘로도 넘치면              → 들어가는 만큼만 두고 「전체보기」로 공식몰에 보낸다
 *
 * 품절은 목록에서 빼지 않고 뒤로 보낸다 — 빼면 "왜 세 종뿐이지"가 되고,
 * 남겨두면 "네 종 중 세 종 판매중"이라는 사실이 그대로 읽힌다.
 */

const won = (n: number) => n.toLocaleString('ko-KR');

/** 「전체보기」가 향하는 곳 — 막지 공식몰 전체상품 */
const SHOP_URL = 'https://makji.kr/product/list.html?cate_no=24';

/**
 * 한 줄 높이(px). landing.module.css의 .featuredBread에서 나온다.
 *   사진 54 + 위아래 여백 13×2 + 구분선 1 = 81
 *
 * 재지 않고 상수로 두는 이유 — 줄 높이를 "지금 그려진 배치"에서 재면
 * 2열에서 잰 높이로 "1열에 들어가나"를 판정하게 되어 2열에 고착된다.
 * 가용 높이만 재고 줄 높이는 고정하면 같은 높이에 항상 같은 답이 나온다.
 * (.featuredBread의 값을 바꾸면 이 상수도 같이 바꿔야 한다)
 */
const ROW_HEIGHT = 81;

export interface DiscountRow {
  productNo: number;
  name: string;
  price: number;
  /** 할인가. 품절이면 없다 */
  finalPrice?: number;
  soldOut: boolean;
}

interface Layout {
  columns: 1 | 2;
  /** 화면에 둘 개수 */
  cap: number;
}

export default function DiscountList({ rows, targetCount, onSale }: { rows: DiscountRow[]; targetCount: number; onSale: number }) {
  const boxRef = useRef<HTMLDivElement>(null);

  // 첫 렌더는 1열·전부다. 이 상태를 재야 "1열로 넣으면 넘치는가"를 알 수 있다.
  // 넘치는 부분은 box의 overflow: hidden이 가려서 깜빡임으로 보이지 않는다.
  const [layout, setLayout] = useState<Layout>({ columns: 1, cap: rows.length });

  const measure = useCallback(() => {
    const available = boxRef.current?.clientHeight ?? 0;
    if (available <= 0) return;

    // 한 열에 들어가는 줄 수. 최소 한 줄은 보장한다.
    const perColumn = Math.max(1, Math.floor(available / ROW_HEIGHT));

    const next: Layout =
      rows.length <= perColumn
        ? { columns: 1, cap: rows.length }
        : { columns: 2, cap: Math.min(rows.length, perColumn * 2) };

    // 같은 값이면 상태를 건드리지 않는다 — 아래 ResizeObserver와 맞물려 무한 루프가 될 수 있다
    setLayout(prev => (prev.columns === next.columns && prev.cap === next.cap ? prev : next));
  }, [rows.length]);

  /**
   * 칸 높이가 바뀔 때마다 다시 잰다.
   *
   * 창 크기뿐 아니라 **이 컴포넌트가 만든 변화**도 칸 높이를 바꾼다 —
   * 「전체보기」 버튼이 뜨면 목록 칸이 그 높이만큼 줄고, 사라지면 다시 늘어난다.
   * 한 번만 재면 버튼이 뜬 순간의 좁은 높이로 판정한 채 멈춰서 2열에 고착된다.
   */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure]);

  const shown = rows.slice(0, layout.cap);
  const hidden = rows.length - shown.length;

  return (
    <div className={styles.featuredList}>
      <p className={styles.featuredLabel}>
        <span>오늘의 할인 대상</span>
        <span>{targetCount}종 중 {onSale}종 판매중</span>
      </p>

      <div className={styles.featuredBox} ref={boxRef}>
        <ul data-columns={layout.columns}>
          {shown.map(row => (
            <li key={row.productNo} className={`${styles.featuredBread} ${row.soldOut ? styles.soldOutBread : ''}`}>
              <ProductPhoto productNo={row.productNo} name={row.name} />
              <div>
                <strong>{row.name}</strong>
                {row.soldOut ? (
                  <p>{won(row.price)}원 <span className={styles.soldOutTag}>품절</span></p>
                ) : (
                  <p>{won(row.finalPrice ?? row.price)}원 <del>{won(row.price)}원</del></p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {hidden > 0 && (
        <a className={styles.moreButton} href={SHOP_URL} target="_blank" rel="noopener noreferrer">
          전체보기 <span aria-hidden="true">↗</span>
        </a>
      )}

      {onSale === 0 && <p className={styles.soldOut}>오늘 할인 대상 빵이 모두 품절되었습니다.</p>}
    </div>
  );
}
