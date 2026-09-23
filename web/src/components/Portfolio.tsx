'use client';

import ProductPhoto from '@/components/ProductPhoto';
import type { TodayOffer } from '@/lib/offers';
import type { Bid } from '@/components/OfferSheet';
import { usePortfolio } from '@/lib/portfolioStore';
import styles from './Market.module.css';

interface Props {
  offers: TodayOffer[];
  entries: { no: number; qty: number; at: number }[];
  bids: Record<number, Bid>;
  onPick: (productNo: number) => void;
  /** 이 빵에 지금 고른 자사몰 옵션 — Market이 상태를 들고 있다 */
  unitOf: (offer: TodayOffer) => string | null;
  onUnit: (productNo: number, code: string) => void;
  /** 고른 옵션으로 한 번에 예약한다 */
  onBuyAll: (list: TodayOffer[]) => void;
  bulk: { busy: boolean; done: number; missed: number; error?: string } | null;
}

const won = (n: number) => n.toLocaleString('ko-KR');

/**
 * 내 관심 빵 — 담아둔 것을 한 번에 예약한다.
 *
 * 결제까지 묶어주지는 못한다. 자사몰 장바구니는 손님 브라우저 세션에 붙어 있고,
 * 로그인이 없는 우리 서비스는 그 세션을 모른다 — 체험몰에서 담기를 쏴봤지만
 * isLogin:F로 거절당했다(2026-09-23). 상품 링크에 옵션을 미리 붙이는 것도 안 된다.
 * 그래서 "예약은 한 번에, 결제는 빵마다"가 지금 할 수 있는 최선이다.
 *
 * 그래도 값어치가 있다 — 선착순이라, 옵션을 고르며 시간을 쓰는 사이 물량이 나가면
 * 안 된다. 자리를 먼저 잡아두고 결제하러 가는 순서가 맞다.
 */
export default function Portfolio({ offers, entries, bids, onPick, unitOf, onUnit, onBuyAll, bulk }: Props) {
  const { setQty } = usePortfolio();
  const rows = entries.map(entry => ({ ...entry, offer: offers.find(o => o.product.productNo === entry.no) }));
  const discounted = rows.filter(row => row.offer && row.offer.saved > 0);
  const reserved = rows.find(row => bids[row.no]?.status === 'filled');
  const next = reserved ?? discounted[0] ?? rows[0];
  /* 아직 안 잡았고 오늘 살 수 있는 빵만 일괄 예약 대상이다.
     옵션이 없는 빵(units가 빈 배열)도 대상이다 — some()으로만 거르면 통째로 빠진다 */
  const bookable = discounted
    .map(row => row.offer!)
    .filter(offer => bids[offer.product.productNo]?.status !== 'filled')
    .filter(offer => offer.units.length === 0 || offer.units.some(u => u.sellable))
    .filter(offer => offer.allotment - offer.filled > 0);
  const bookableTotal = bookable.reduce((sum, offer) => {
    const code = unitOf(offer);
    return sum + (offer.units.find(u => u.code === code)?.price ?? offer.price);
  }, 0);

  if (!rows.length) return <p className={styles.empty}>관심빵을 담으면 여기에서 예약과 결제를 이어갈 수 있어요.</p>;

  return <>
    <div className={styles.topPick}>
      <span className="eyebrow">내 관심빵 {rows.length}종 · 오늘 할인 {discounted.length}종</span>
      <p>담아둔 빵의 옵션을 확인하고, 막지몰에서 구매하세요.</p>
    </div>
    <ul className={styles.pfList}>
      {rows.map(row => {
        const name = row.offer?.product.name ?? `상품 #${row.no}`;
        const booked = bids[row.no]?.status === 'filled';
        return <li key={row.no} className={styles.pfRow}>
          <span className={styles.thumb}><ProductPhoto productNo={row.no} name={name} /></span>
          <span className={styles.pfName}>
            <button type="button" className={styles.pfNameBtn} onClick={() => onPick(row.no)}><b>{name}</b></button>
            <span>{booked ? '예약한 빵 · 구매 이어가기' : !row.offer?.product.inStock ? '현재 품절' : row.offer.saved > 0 ? `오늘 ${won(row.offer.price)}원부터 · 옵션별 확인` : '오늘 할인 대상 아님 · 정가 판매'}</span>
          </span>
          <span className={styles.pfCtl}>
            {/* 옵션은 여기서 고른다. 자사몰 링크에 옵션을 미리 붙일 수 없어서
                손님은 막지몰에서 한 번 더 고르게 되는데, 적어도 무엇을 예약했는지는
                여기서 정해진다 — 안 물어보면 첫 옵션으로 제멋대로 잡힌다 */}
            {!booked && row.offer && row.offer.units.length > 0 && (
              <select className={styles.pfUnit} value={unitOf(row.offer) ?? ''}
                aria-label={`${name} 옵션`}
                onChange={event => onUnit(row.no, event.target.value)}>
                {row.offer.units.map(u => (
                  <option key={u.code} value={u.code} disabled={!u.sellable}>
                    {u.label}{u.sellable ? ` · ${won(u.price)}원` : ' · 품절'}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className={styles.link} onClick={() => onPick(row.no)} aria-label={`${name} ${booked ? '결제 안내' : '옵션 확인'}`}>
              {booked ? '결제 안내' : '자세히'}
            </button>
            <button type="button" onClick={() => setQty(row.no, 0)} aria-label={`${name} 관심 해제`}>×</button>
          </span>
        </li>;
      })}
    </ul>
    <div className={styles.buyAll}>
      {bookable.length > 0 ? (
        <button type="button" className={styles.primary} disabled={bulk?.busy}
          onClick={() => onBuyAll(bookable)}>
          {bulk?.busy ? '예약 중…' : `${bookable.length}종 한 번에 예약 · ${won(bookableTotal)}원`}
        </button>
      ) : next && (
        <button type="button" className={styles.primary} onClick={() => onPick(next.no)}>
          {reserved ? '예약한 빵 결제 이어가기' : '관심빵 자세히 보기'}
        </button>
      )}
      {bulk && !bulk.busy && (bulk.done > 0 || bulk.missed > 0) && (
        <p className={styles.buyAllNote}>
          {bulk.done > 0 && <><b>{bulk.done}종 예약됐습니다.</b> 빵을 눌러 결제 안내를 확인하세요. </>}
          {/* 실패 이유를 서버가 말한 그대로 쓴다. 예전에는 무엇이 막았든
              "물량이 끝났습니다"라고만 해서, 장이 닫힌 것도 품절로 보였다 */}
          {bulk.missed > 0 && <>{bulk.missed}종은 예약하지 못했습니다 — {bulk.error ?? '오늘 물량이 끝났습니다.'}</>}
        </p>
      )}
      <p className={styles.buyAllNote}>
        예약은 한 번에 되지만 <b>결제는 빵마다 막지몰에서</b> 하셔야 합니다 —
        자사몰 장바구니에 대신 담아드릴 수가 없습니다.
      </p>
    </div>
    <p className={styles.hint}>관심 목록은 이 브라우저에 저장됩니다. 알림은 아래 알림 설정에서 별도로 켜 주세요.</p>
  </>;
}
