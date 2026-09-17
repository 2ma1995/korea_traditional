'use client';

import ProductPhoto from '@/components/ProductPhoto';
import type { TodayOffer } from '@/lib/offers';
import { usePortfolio } from '@/lib/portfolioStore';
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
  /** 표시 순서 — Market이 고정해서 넘긴다. 수량을 바꿀 때 줄이 튀지 않게 */
  entries: { no: number; qty: number; at: number }[];
  /** 담은 수량만큼 예약한다. Market이 실제 요청을 보낸다 */
  onBuyAll?: (list: { offer: TodayOffer; qty: number }[]) => void;
  /** 예약 진행·결과 — Market이 들고 있다 */
  bulk?: { busy: boolean; done: number; missed: number } | null;
  /** 한 빵만 보고 싶을 때 */
  onPick?: (productNo: number) => void;
}

const won = (n: number) => n.toLocaleString('ko-KR');

export default function Portfolio({ offers, entries, onBuyAll, bulk, onPick }: Props) {
  const { add, remove } = usePortfolio();
  const total = entries.reduce((a, b) => a + b.qty, 0);
  const rows = entries.map(e => ({ ...e, offer: offers.find(o => o.product.productNo === e.no) }));
  const top = rows[0];
  /* 오늘 빵장에 있는 관심빵을 담은 수량만큼 산다고 치면 — 정가 합, 오늘 가격 합, 아끼는 금액 */
  const inToday = rows.filter(r => r.offer).map(r => ({ offer: r.offer!, qty: r.qty }));
  const units = inToday.reduce((a, r) => a + r.qty, 0);
  const totalList = inToday.reduce((a, r) => a + r.offer.product.price * r.qty, 0);
  const totalToday = inToday.reduce((a, r) => a + r.offer.price * r.qty, 0);
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
          <span className="eyebrow">오늘 내 관심빵 할인 총액 · {inToday.length}종 {units}개</span>
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
                {row.offer && onPick
                  ? <button type="button" className={styles.pfNameBtn} onClick={() => onPick(row.no)}><b>{name}</b></button>
                  : <b>{name}</b>}
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

      {inToday.length > 0 && onBuyAll && (
        <div className={styles.buyAll}>
          <button type="button" className={styles.primary} disabled={bulk?.busy} onClick={() => onBuyAll(inToday)}>
            {bulk?.busy ? '예약 중…' : `포트폴리오 구매하기 · ${units}개 ${won(totalToday)}원`}
          </button>
          {bulk && !bulk.busy && (bulk.done > 0 || bulk.missed > 0) && (
            <p className={styles.buyAllNote}>
              {bulk.done > 0 && <><b>{bulk.done}개 예약됐습니다.</b> 자사몰에서 결제해 주세요. </>}
              {bulk.missed > 0 && <>{bulk.missed}개는 오늘 물량이 끝났습니다.</>}
              <br />오늘 가격 적용은 쿠폰이 필요해 기업 확인 중입니다.
            </p>
          )}
        </div>
      )}

      <p className={styles.hint}>
        비중은 담은 수로 정합니다. 브라우저에만 저장되고 서버로 가지 않습니다.
        <b> 알림 발송은 다음 단계</b> — 지금은 여기서 확인합니다.
      </p>
    </>
  );
}
