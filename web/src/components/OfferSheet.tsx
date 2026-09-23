'use client';

import { useEffect, useRef, useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import { priceAt, type Mood, type TodayOffer } from '@/lib/offers';
import { shopProductUrl } from '@/lib/shop';
import styles from './Market.module.css';

/**
 * 빵 하나의 상세 — 바텀시트. 행동은 여기서 한 번.
 * 장중엔 "지금 기준 예상"이고 구매는 확정 뒤에만(테스트 모드 제외). 20시 전엔 🔒.
 *
 * 예약은 **자리 하나**다. 고른 자사몰 옵션이 곧 결제 금액이고, 개수만큼 반복하지
 * 않는다 — 한 사람당 한 자리이기 때문이다(0015). 서른 자리를 한 사람이 다섯 개
 * 먹으면 선착순이라는 말이 뜻을 잃는다.
 * 담은 개수(♥)는 포트폴리오 비중으로만 쓴다. 몇 개를 살지는 자사몰에서 정한다.
 */
export interface Bid {
  status: 'busy' | 'filled' | 'missed';
  unit?: string | null;
  depth?: number;
  settled?: 'open' | 'paid';
  slot: number | null;
  /** 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 — 화면에 밝힌다 */
  stored?: boolean;
  /** 오늘 가격으로 결제할 할인코드. 발급에 실패하면 null이다(예약은 그대로) */
  coupon?: { code: string; rate: number; expiresOn?: string } | null;
  /** 실패했다면 서버가 말한 이유. 없으면 '물량이 끝났다'는 뜻이다 */
  error?: string;
  /** 결제 기한(ISO). 이 시각까지 결제하지 않으면 자리가 반납된다 */
  expiresAt?: string | null;
  /**
   * 할인이 **실제로** 어떻게 전달됐는가.
   *   price   자사몰 판매가가 이미 내려가 있다
   *   coupon  코드를 받았다
   *   none    둘 다 아니다 — 자사몰에선 정가로 보인다
   */
  delivery?: 'price' | 'coupon' | 'none';
}

interface Props {
  offer: TodayOffer;
  mood: Mood;
  changePct: number;
  rate: number;
  estimate: boolean;
  remaining: number;
  bid: Bid | undefined;
  /** 관심(알림)에 담아둔 개수 */
  watching: number;
  canBuy: boolean;
  lockNote: string;
  /**
   * 공모 청약권을 아직 쓰지 않았는가.
   *
   * 구매가 체결된 그 순간이 공모로 넘어가는 유일한 전환 시점이다. 그 자리에서
   * 안내하지 않으면 청약권을 얻은 사실을 아무도 모른 채 자사몰로 나가버린다.
   */
  canBid: boolean;
  /** 시트를 닫고 NEXT 섹션으로 데려간다 */
  onNext: () => void;
  onBuy: () => void;
  /** 스테퍼 — 목표 수량으로 맞춘다 */
  onQty: (qty: number) => void;
  /** 고른 자사몰 옵션의 품목코드. 선택지가 없는 상품이면 null */
  unit: string | null;
  onUnit: (code: string) => void;
  onClose: () => void;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const shopUrl = shopProductUrl;

export default function OfferSheet({ offer, mood, changePct, rate, estimate, remaining, bid, watching, canBuy, lockNote, canBid, unit, onNext, onBuy, onQty, onUnit, onClose }: Props) {
  /* 고른 단위가 곧 결제 금액이다. 선택지가 없는 상품은 기본가 그대로 */
  const picked = offer.units.find(u => u.code === unit) ?? offer.units[0] ?? null;
  const booked = bid?.status === 'filled';
  const discount = booked ? bid.depth ?? rate : rate;
  const unitPrice = booked
    ? priceAt(offer.product.price, discount).price + priceAt((picked?.listPrice ?? offer.product.price) - offer.product.price, discount).price
    : picked?.price ?? offer.price;
  const unitList = picked?.listPrice ?? offer.product.price;
  /* 예약은 한 자리다 — 개수만큼 반복하지 않는다(0015: 한 사람당 한 자리).
     그래서 값도 고른 옵션 하나의 값이다. 아래 스테퍼의 개수는 포트폴리오 비중일 뿐,
     결제 금액과 상관이 없다 — 화면에도 그렇게 적는다 */
  const payPrice = unitPrice;
  const payList = unitList;
  /* 실제로 살 수 있는 수. 옵션마다 자리를 따로 세므로(0015) 고른 옵션 기준이다 —
     자사몰 재고와 오늘 연 자리 중 작은 쪽을 offers가 이미 계산해 둔다 */
  const stockLeft = picked ? picked.allotment : remaining;
  const sheet = useRef<HTMLDivElement>(null);
  const [copyError, setCopyError] = useState(false);
  const [copied, setCopied] = useState(false);

  /* 결제 기한 카운트다운. 자리를 붙들 수 있는 시간이 눈에 보여야 결제로 이어진다.
     남은 시간을 상태로 두지 않고 '지금'만 흘려보낸 뒤 렌더에서 뺀다 —
     effect 안에서 setState를 직접 부르지 않기 위해서다. */
  const deadline = bid?.expiresAt ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  const remainMs = deadline ? Math.max(0, new Date(deadline).getTime() - now) : null;
  const mmssNow = remainMs === null ? null
    : `${String(Math.floor(remainMs / 60000)).padStart(2, '0')}:${String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0')}`;
  /* 두 모드가 같이 쓰는 카운트다운 */
  const clock = mmssNow && (
    <span className={styles.couponClock} data-urgent={remainMs !== null && remainMs < 10 * 60_000}>
      {remainMs === 0
        ? '결제 안내 기한이 지났습니다. 자사몰 주문 내역에서 결제 여부를 확인해 주세요.'
        : <>⏳ <b>{mmssNow}</b> 남았습니다 · 안내 기한 · 결제 여부는 자사몰 주문 내역에서 확인</>}
    </span>
  );
  const pct = Math.round(discount * 100);
  const up = changePct >= 0;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const controls = sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${offer.product.name} 상세`} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetGrip} aria-hidden="true" />
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="닫기">✕</button>

        <div className={styles.sheetHero}>
          <span className={styles.sheetPhoto}><ProductPhoto productNo={offer.product.productNo} name={offer.product.name} /></span>
          <div>
            {offer.badges.length > 0 && <p className={styles.sheetBadges}>{offer.badges.join(' · ')}</p>}
            <h3>{offer.product.name}</h3>
            <p className={styles.sheetPrice}>
              <strong>{won(payPrice)}원</strong>
              {payPrice < payList && <><del>{won(payList)}원</del><span>−{won(payList - payPrice)}원 ({pct}%)</span></>}
            </p>
            {estimate && <p className={styles.estimate}>지금 기준 예상 · 15:30 종가로 확정</p>}
          </div>
        </div>

        <dl className={styles.why}>
          <dt>왜 이 가격이에요?</dt>
          <dd>
            <span data-side={mood.side}>{up ? '▲' : '▼'} 국장 {Math.abs(changePct).toFixed(2)}%</span>
            <i>→</i>
            <span data-side={mood.side}>{mood.title}</span>
            <i>→</i>
            <span>{pct > 0 ? `이 빵 ${pct}% 할인` : '오늘은 정가 판매'}</span>
          </dd>
        </dl>

        {/* 고른 옵션 기준으로 센다. 전에는 옵션 재고를 모두 더한 값을 보여줘서
            "오늘 90개 한정"이 나왔는데, 90개의 빵이 아니라 90묶음이라 뜻이 애매했다.
            자사몰 재고와 오늘 물량 중 작은 쪽이 실제로 살 수 있는 수다 */}
        <p className={styles.sheetStock}>
          {offer.saved === 0 ? (offer.product.inStock ? '오늘은 자사몰에서 정가로 구매할 수 있어요.' : '현재 품절된 상품이에요.') : picked
            ? <>{picked.label} · <b>{stockLeft > 0 ? `남음 ${stockLeft}` : '오늘 물량 끝'}</b></>
            : <>오늘 {offer.allotment}건 한정 · <b>{remaining > 0 ? `남음 ${remaining}` : '오늘 물량 끝'}</b></>}
          {watching > 0 && <> · ♥ 관심빵</>}
        </p>

        {/* 자사몰이 파는 단위를 그대로 고르게 한다. 빵장에서만 통하는 개수를 받으면
            (예전의 "− 11 +") 화면 금액과 결제 금액이 어긋나고, 손님이 자사몰에서
            옵션을 손수 조합해야 한다. 이름은 자사몰 표기를 손대지 않고 쓴다 —
            축이 수량인지 맛인지 구성인지 상품마다 다르다 */}
        {offer.units.length > 0 && (
          <fieldset className={styles.units}>
            <legend>어떤 걸로 하시겠어요?</legend>
            {offer.units.map(u => (
              <label key={u.code} className={styles.unit} data-picked={u.code === picked?.code} data-out={!u.sellable}>
                <input type="radio" name={`unit-${offer.product.productNo}`} value={u.code}
                  checked={u.code === picked?.code} disabled={!u.sellable || bid?.status === 'busy' || bid?.status === 'filled'}
                  onChange={() => onUnit(u.code)} />
                <span className={styles.unitName}>{u.label}</span>
                <span className={styles.unitPrice}>
                  {u.sellable ? <><b>{won(u.price)}원</b>{u.listPrice > u.price && <del>{won(u.listPrice)}원</del>}</> : '품절'}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {booked && (
          <>
            <p className={styles.sheetNote}>
              <b>{bid.settled === 'paid' ? '결제 확인된 예약입니다.' : '예약 완료 · 결제 완료와는 달라요.'}</b>{picked && <> · {picked.label}</>}
              {bid.stored === false && <><br />⚠️ 저장소가 연결되지 않아 이번 서버 세션의 메모리에만 기록됩니다.</>}
            </p>

            {/* 설계도 최상단의 문제를 여기서 끝낸다 — "싸다고 보여주고 정가로 보낸다".
                자사몰은 정가 그대로 두고, 오늘 폭만큼의 코드를 손님에게 준다. */}
            {/* 할인을 어떻게 주느냐에 따라 할 말이 다르다.
                price — 자사몰 값이 이미 내려가 있다. 손님은 아무것도 안 해도 된다
                coupon — 코드를 옮겨 적어야 한다 */}
            {remainMs === 0 || bid.settled === 'paid' ? (
              <p className={styles.sheetNote}>{bid.settled === 'paid' ? '다시 결제하지 말고 자사몰 주문 내역을 확인해 주세요.' : clock}</p>
            ) : bid.delivery === 'price' ? (
              <div className={styles.couponBox}>
                <span className={styles.couponLabel}>자사몰에서 최종 결제 금액을 확인해 주세요</span>
                <span className={styles.couponFine}>
                  예약 안내 금액은 <b>{won(payPrice)}원</b>{picked && <> ({picked.label})</>}입니다.
                  자사몰에서 같은 옵션을 선택하고 최종 금액을 확인해 주세요.
                </span>
                {clock}
              </div>
            ) : bid.coupon ? (
              <div className={styles.couponBox}>
                <span className={styles.couponLabel}>오늘 가격으로 결제할 코드</span>
                <div className={styles.couponRow}>
                  <code>{bid.coupon.code}</code>
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(bid.coupon!.code); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>
                    {copied ? '복사됨 ✓' : '복사'}
                  </button>
                </div>
                <span className={styles.couponFine} role="status">{copyError && '복사하지 못했어요. 코드를 직접 선택해 복사해 주세요. '}{offer.product.name} 전용 · 결제할 때 입력하세요</span>
                {clock}
              </div>
            ) : (
              /* 할인을 전달할 수단이 없다. 자리는 잡혔지만 자사몰에선 정가다.
                 이 사실을 감추면 손님이 정가로 결제한다 */
              <div className={styles.couponBox} data-warn="true">
                <span className={styles.couponLabel}>⚠️ 자사몰에서는 아직 정가로 보입니다</span>
                <span className={styles.couponFine}>
                  <b>자리는 잡혔습니다.</b> 다만 오늘 가격을 적용할 준비가 안 돼 있어,
                  지금 결제하시면 정가 {won(payList)}원으로 결제됩니다.
                  잠시 뒤 다시 확인해 주세요.
                </span>
                {clock}
              </div>
            )}

            {canBid && (
              <button type="button" className={styles.toNext} onClick={onNext}>
                <b>🗳 청약권 1장이 생겼어요</b>
                <small>다음에 나올 빵을 내가 고를 수 있습니다 <span aria-hidden="true">→</span></small>
              </button>
            )}
          </>
        )}
        {bid?.status === 'missed' && (
          <p className={styles.sheetNote}>{bid.error ?? '오늘 예약 물량이 끝났어요. 관심빵에 담아두고 다음 장을 확인해 주세요.'}</p>
        )}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghost} aria-pressed={watching > 0}
            onClick={() => onQty(watching > 0 ? 0 : 1)}>
            {watching > 0 ? '♥ 관심 해제' : '♡ 관심 담기'}
          </button>
          {booked ? (
            <a className={styles.primary} href={shopUrl(offer.product.productNo)} target="_blank" rel="noopener noreferrer">
              {remainMs === 0 || bid.settled === 'paid' ? '자사몰에서 주문 확인 ↗' : bid.delivery === 'none' || (!bid.delivery && !bid.coupon) ? '자사몰 정가 확인 ↗' : '자사몰에서 결제 이어가기 ↗'}
            </a>
          ) : offer.saved === 0 ? (
            <a className={styles.primary} href={shopUrl(offer.product.productNo)} target="_blank" rel="noopener noreferrer">자사몰에서 {offer.product.inStock ? '상품 보기' : '재입고 확인'} ↗</a>
          ) : <button type="button" className={styles.primary}
            disabled={!canBuy || stockLeft <= 0 || (picked !== null && !picked.sellable) || bid?.status === 'busy'} onClick={onBuy}>
            {bid?.status === 'busy' ? '예약 중…' : !canBuy ? lockNote : stockLeft <= 0 ? '오늘 물량 끝'
              : `${won(payPrice)}원에 예약하기`}
          </button>}
        </div>
        <p className={styles.sheetFine}>구매 수량과 최종 금액은 막지몰에서 확인해 주세요.<br />창을 닫아도 내 포트폴리오에서 구매를 이어갈 수 있어요.</p>
      </div>
    </div>
  );
}
