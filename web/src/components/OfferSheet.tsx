'use client';

import { useEffect, useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { Mood, TodayOffer } from '@/lib/offers';
import { shopProductUrl } from '@/lib/shop';
import styles from './Market.module.css';

/**
 * 빵 하나의 상세 — 바텀시트. 행동은 여기서 한 번.
 * 장중엔 "지금 기준 예상"이고 구매는 확정 뒤에만(테스트 모드 제외). 20시 전엔 🔒.
 *
 * 관심(알림)에 담아둔 수량이 곧 살 개수다 — 버튼에 개수와 그만큼의 총액을 적고,
 * 구매를 누르면 그 수량만큼 예약한다. 담아두지 않았으면 1개로 본다.
 */
export interface Bid {
  status: 'busy' | 'filled' | 'missed';
  slot: number | null;
  /** 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 — 화면에 밝힌다 */
  stored?: boolean;
  /** 오늘 가격으로 결제할 할인코드. 발급에 실패하면 null이다(예약은 그대로) */
  coupon?: { code: string; rate: number; expiresOn: string } | null;
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
  /** 실제로 살 개수 — watching이 0이면 1 */
  qty: number;
  canBuy: boolean;
  lockNote: string;
  /**
   * 왼쪽 버튼이 무엇이 되는가.
   *   'watch' — 오늘의 할인 빵에서 열었을 때. 아직 안 담은 빵이니 먼저 담게 한다
   *   'qty'   — 내 포트폴리오에서 열었을 때. 이미 담은 빵이니 개수를 조절한다
   */
  left: 'watch' | 'qty';
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

export default function OfferSheet({ offer, mood, changePct, rate, estimate, remaining, bid, watching, qty, canBuy, lockNote, left, canBid, unit, onNext, onBuy, onQty, onUnit, onClose }: Props) {
  /* 고른 단위가 곧 결제 금액이다. 선택지가 없는 상품은 기본가 그대로 */
  const picked = offer.units.find(u => u.code === unit) ?? offer.units[0] ?? null;
  const payPrice = picked?.price ?? offer.price;
  const payList = picked?.listPrice ?? offer.product.price;
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
        ? '⏳ 기한이 지났습니다 — 자리가 반납됩니다'
        : <>⏳ <b>{mmssNow}</b> 남았습니다 · 이 안에 결제하지 않으면 자리가 반납됩니다</>}
    </span>
  );
  const pct = Math.round(rate * 100);
  const up = changePct >= 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${offer.product.name} 상세`} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetGrip} aria-hidden="true" />
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="닫기">✕</button>

        <div className={styles.sheetHero}>
          <span className={styles.sheetPhoto}><ProductPhoto productNo={offer.product.productNo} name={offer.product.name} /></span>
          <div>
            {offer.badges.length > 0 && <p className={styles.sheetBadges}>{offer.badges.join(' · ')}</p>}
            <h3>{offer.product.name}</h3>
            <p className={styles.sheetPrice}>
              <strong>{won(offer.price)}원</strong>
              <del>{won(offer.product.price)}원</del>
              <span>−{won(offer.saved)}원 ({pct}%)</span>
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
            <span>모든 빵 {pct}% 할인</span>
          </dd>
        </dl>

        <p className={styles.sheetStock}>
          오늘 {offer.allotment}개 한정 · <b>{remaining > 0 ? `남음 ${remaining}` : '오늘 물량 끝'}</b>
          {watching > 0 && <> · 🔔 알림 {watching}개</>}
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
                  checked={u.code === picked?.code} disabled={!u.sellable}
                  onChange={() => onUnit(u.code)} />
                <span className={styles.unitName}>{u.label}</span>
                <span className={styles.unitPrice}>
                  {u.sellable ? <><b>{won(u.price)}원</b>{u.listPrice > u.price && <del>{won(u.listPrice)}원</del>}</> : '품절'}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {bid?.status === 'filled' && (
          <>
            <p className={styles.sheetNote}>
              <b>예약됐습니다 · {bid.slot}번째.</b>{picked && <> · {picked.label}</>}
              {bid.stored === false && <><br />⚠️ 저장소가 연결되지 않아 이번 서버 세션의 메모리에만 기록됩니다.</>}
            </p>

            {/* 설계도 최상단의 문제를 여기서 끝낸다 — "싸다고 보여주고 정가로 보낸다".
                자사몰은 정가 그대로 두고, 오늘 폭만큼의 코드를 손님에게 준다. */}
            {/* 할인을 어떻게 주느냐에 따라 할 말이 다르다.
                price — 자사몰 값이 이미 내려가 있다. 손님은 아무것도 안 해도 된다
                coupon — 코드를 옮겨 적어야 한다 */}
            {bid.delivery === 'price' ? (
              <div className={styles.couponBox}>
                <span className={styles.couponLabel}>오늘 가격이 이미 적용돼 있습니다</span>
                <span className={styles.couponFine}>
                  막지몰에서 <b>{won(payPrice)}원</b> 그대로 결제하시면 됩니다 —
                  코드 입력도, 회원가입도 필요 없습니다.
                </span>
                {clock}
              </div>
            ) : bid.coupon ? (
              <div className={styles.couponBox}>
                <span className={styles.couponLabel}>오늘 가격으로 결제할 코드</span>
                <div className={styles.couponRow}>
                  <code>{bid.coupon.code}</code>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(bid.coupon!.code); setCopied(true); }}>
                    {copied ? '복사됨 ✓' : '복사'}
                  </button>
                </div>
                <span className={styles.couponFine}>{offer.product.name} 전용 · 결제할 때 입력하세요</span>
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

            <a className={styles.primary} href={shopUrl(offer.product.productNo)} target="_blank" rel="noopener noreferrer">
              {bid.delivery === 'none' ? '자사몰에서 정가로 결제하기 ↗' : '이 가격으로 자사몰에서 결제하기 ↗'}
            </a>
            {canBid && (
              <button type="button" className={styles.toNext} onClick={onNext}>
                <b>🗳 청약권 1장이 생겼어요</b>
                <small>다음에 나올 빵을 내가 고를 수 있습니다 <span aria-hidden="true">→</span></small>
              </button>
            )}
          </>
        )}
        {bid?.status === 'missed' && (
          <p className={styles.sheetNote}><b>한발 늦었어요.</b> 오늘 이 빵은 다 나갔습니다. ♡에 담아두면 내일 먼저 보입니다.</p>
        )}

        <div className={styles.sheetActions}>
          {left === 'qty' ? (
            <div className={styles.stepper}>
              <button type="button" onClick={() => onQty(qty - 1)} disabled={qty <= 1} aria-label="개수 줄이기">−</button>
              <b aria-live="polite">{qty}개</b>
              <button type="button" onClick={() => onQty(qty + 1)} disabled={qty >= remaining} aria-label="개수 늘리기">+</button>
            </div>
          ) : (
            <button type="button" className={styles.ghost} aria-pressed={watching > 0}
              onClick={() => onQty(watching > 0 ? 0 : 1)}>
              {watching > 0 ? '♥ 관심 담김' : '♡ 관심 담기'}
            </button>
          )}
          <button type="button" className={styles.primary}
            disabled={!canBuy || remaining <= 0 || bid?.status === 'busy' || bid?.status === 'filled'} onClick={onBuy}>
            {bid?.status === 'busy' ? '예약 중…' : bid?.status === 'filled' ? '예약 완료' : !canBuy ? lockNote : remaining <= 0 ? '오늘 물량 끝'
              : `${won(payPrice)}원에 구매하기`}
          </button>
        </div>
        <p className={styles.sheetFine}>개수는 <b>내 관심빵</b>에 저장돼 포트폴리오 비중이 됩니다. 담아둔 빵이 할인되는 날 알림을 받으시려면 <b>내 빵 포트폴리오</b>에서 켜 주세요.</p>
      </div>
    </div>
  );
}
