'use client';

import { useEffect } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { Mood, TodayOffer } from '@/lib/offers';
import styles from './Market.module.css';

/**
 * 빵 하나의 상세 — 바텀시트. 행동은 여기서 한 번.
 * 장중엔 "지금 기준 예상"이고 구매는 확정 뒤에만(테스트 모드 제외). 20시 전엔 🔒.
 */
export interface Bid { status: 'busy' | 'filled' | 'missed'; slot: number | null }

interface Props {
  offer: TodayOffer;
  mood: Mood;
  changePct: number;
  rate: number;
  estimate: boolean;
  remaining: number;
  bid: Bid | undefined;
  watching: number;
  canBuy: boolean;
  lockNote: string;
  onBuy: () => void;
  onWatch: () => void;
  onUnwatch: () => void;
  onClose: () => void;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const shopUrl = (no: number) => `https://makji.kr/product/detail.html?product_no=${no}`;

export default function OfferSheet({ offer, mood, changePct, rate, estimate, remaining, bid, watching, canBuy, lockNote, onBuy, onWatch, onUnwatch, onClose }: Props) {
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
          {watching > 0 && <> · 🔔 알림 설정</>}
        </p>

        {bid?.status === 'filled' && (
          <p className={styles.sheetNote}>
            <b>예약됐습니다 · {bid.slot}번째.</b>{' '}
            <a href={shopUrl(offer.product.productNo)} target="_blank" rel="noopener noreferrer">자사몰에서 결제하기 ↗</a>
            <br />오늘 가격 적용은 쿠폰이 필요해 기업 확인 중입니다.
          </p>
        )}
        {bid?.status === 'missed' && (
          <p className={styles.sheetNote}><b>한발 늦었어요.</b> 오늘 이 빵은 다 나갔습니다. ♡에 담아두면 내일 먼저 보입니다.</p>
        )}

        <div className={styles.sheetActions}>
          {watching > 0
            ? <button type="button" className={styles.ghost} onClick={onUnwatch}><b>🔔 알림 설정됨 ✓</b><small>더 할인할 때 알려드려요</small></button>
            : <button type="button" className={styles.ghost} onClick={onWatch}><b>🔔 알림받기</b><small>더 할인할 때 구매하기</small></button>}
          <button type="button" className={styles.primary}
            disabled={!canBuy || remaining <= 0 || bid?.status === 'busy' || bid?.status === 'filled'} onClick={onBuy}>
            {bid?.status === 'busy' ? '예약 중…' : bid?.status === 'filled' ? '예약 완료' : !canBuy ? lockNote : remaining <= 0 ? '오늘 물량 끝' : `${won(offer.price)}원에 구매하기`}
          </button>
        </div>
        <p className={styles.sheetFine}>알림은 내 관심빵으로 저장됩니다. 실제 발송(푸시·문자)은 준비 중이에요.</p>
      </div>
    </div>
  );
}
