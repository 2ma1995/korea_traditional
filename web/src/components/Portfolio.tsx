'use client';

import ProductPhoto from '@/components/ProductPhoto';
import type { TodayOffer } from '@/lib/offers';
import { sortHoldings, usePortfolio } from '@/lib/portfolioStore';
import styles from './Market.module.css';

/**
 * 내 관심 빵 — 포트폴리오 탭.
 *
 * 담은 수가 비중이 된다. 비중 1위 빵의 오늘 가격을 맨 위에서 말해준다 —
 * "네 포트폴리오에서 비중이 가장 큰 스콘이 오늘 −570원".
 * 알림 발송은 다음 단계라 지금은 여기서 확인한다.
 */

interface Props {
  offers: TodayOffer[];
}

const won = (n: number) => n.toLocaleString('ko-KR');

export default function Portfolio({ offers }: Props) {
  const { portfolio, add, remove } = usePortfolio();
  /* 수량 많은 순 → 같으면 최근에 담은 순 */
  const entries = sortHoldings(portfolio);
  const total = entries.reduce((a, b) => a + b.qty, 0);
  const rows = entries.map(e => ({ ...e, offer: offers.find(o => o.product.productNo === e.no) }));
  const top = rows[0];
  /* 오늘 빵장에 있는 관심빵을 1개씩 산다고 치면 — 정가 합, 오늘 가격 합, 아끼는 금액 */
  const inToday = rows.filter(r => r.offer).map(r => r.offer!);
  const totalList = inToday.reduce((a, o) => a + o.product.price, 0);
  const totalToday = inToday.reduce((a, o) => a + o.price, 0);
  const totalSaved = totalList - totalToday;
  const soldOutCount = rows.length - inToday.length;

  if (!rows.length) {
    return (
      <p className={styles.empty}>
        아직 담은 빵이 없습니다. 오늘의 빵에서 <b>관심</b>을 누르면 여기에 비중으로 쌓입니다.
        <br />비중 1위 빵이 오늘 얼마인지, 내일 여기서 바로 보입니다.
      </p>
    );
  }

  return (
    <>
      {inToday.length > 0 && (
        <div className={styles.topPick}>
          <span className="eyebrow">오늘 내 관심빵 할인 총액 · {inToday.length}종 1개씩</span>
          <h3>다 사면 <b>−{won(totalSaved)}원</b> 아낍니다</h3>
          <p>정가 {won(totalList)}원 → 오늘 {won(totalToday)}원{soldOutCount > 0 ? ` · 품절 ${soldOutCount}종 제외` : ''}</p>
          {top?.offer && (
            <p className={styles.topSub}>비중 1위 {top.offer.product.name} · 비중 {Math.round((top.qty / total) * 100)}% · 오늘 {won(top.offer.price)}원 (−{won(top.offer.saved)}) · 남음 {Math.max(0, top.offer.allotment - top.offer.filled)}</p>
          )}
        </div>
      )}
      {inToday.length === 0 && top && (
        <div className={styles.topPick}>
          <span className="eyebrow">비중 1위</span>
          <h3>오늘은 품절이라 빵장에 없습니다</h3>
          <p>들어오면 여기서 먼저 보입니다.</p>
        </div>
      )}

      <ul className={styles.pfList}>
        {rows.map(row => {
          const share = Math.round((row.qty / total) * 100);
          const name = row.offer?.product.name ?? `상품 #${row.no}`;
          return (
            <li key={row.no} className={styles.pfRow}>
              <span className={styles.thumb}>
                <ProductPhoto productNo={row.no} name={name} />
              </span>
              <span className={styles.pfName}>
                <b>{name}</b>
                <span>{row.offer ? `오늘 ${won(row.offer.price)}원 · −${won(row.offer.saved)}원` : '오늘 품절'}</span>
              </span>
              <span className={styles.pfShare}>
                <i style={{ width: `${share}%` }} />
                <b>{share}%</b>
              </span>
              <span className={styles.pfCtl}>
                <button type="button" onClick={() => remove(row.no)} aria-label="비중 줄이기">−</button>
                <b>{row.qty}</b>
                <button type="button" onClick={() => add(row.no)} aria-label="비중 늘리기">+</button>
              </span>
            </li>
          );
        })}
      </ul>

      <p className={styles.hint}>
        비중은 담은 수로 정합니다. 브라우저에만 저장되고 서버로 가지 않습니다.
        <b> 알림 발송은 다음 단계</b> — 지금은 여기서 확인합니다.
      </p>
    </>
  );
}
