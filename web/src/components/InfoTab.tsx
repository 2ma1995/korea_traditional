'use client';

import type { DiscountTier } from '@/data/indicators';
import { CLOSE_HOUR, OPEN_HOUR, type MarketHours } from '@/lib/orderbook';
import styles from './Terminal.module.css';

/**
 * 정보 탭 — 증권 앱의 종목정보 자리.
 * 오늘 가격이 어떻게 정해졌는지, 코스피 기준값, 규칙, 공식몰 링크.
 */

interface Props {
  kospi: number;
  kospiLive: boolean;
  changePct: number;
  absChangePct: number;
  tier: DiscountTier;
  hours: MarketHours;
}

export default function InfoTab({ kospi, kospiLive, changePct, absChangePct, tier, hours }: Props) {
  return (
    <>
      <div className={styles.gauge}>
        <div>
          <span>오늘의 코스피</span>
          <strong>{kospi.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <small>{changePct >= 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`} 전일 대비{kospiLive ? '' : ' · 샘플 값'}</small>
        </div>
        <div>
          <span>오늘 변동폭</span>
          <strong>{absChangePct.toFixed(2)}%</strong>
          <small>{tier.label} · 방향 아닌 크기</small>
        </div>
        <div>
          <span>오늘 정산 한도</span>
          <strong data-down="true">−{Math.round(tier.rate * 100)}%</strong>
          <small>변동폭 {tier.minAbsChange}% 이상 구간</small>
        </div>
      </div>

      <ol className={styles.rules}>
        <li><b>15:30</b> 주식장 마감 — 오늘 KOSPI가 <b>{absChangePct.toFixed(2)}%</b> 움직였습니다</li>
        <li>움직인 크기가 <b>{tier.label}</b> 구간이라 정산 한도가 <b>정가 −{Math.round(tier.rate * 100)}%</b>까지 열렸습니다</li>
        <li>그 한도 안에서 <b>오늘 내 종목</b>이 내 자리를 정합니다 — 내렸으면 위로가, 올랐으면 자축가. 종목은 <b>09:00 전에</b> 고르고 바꿀 수 없습니다</li>
        <li><b>{OPEN_HOUR}:00</b> 개장 — 싼데 적은 <b>내 자리</b>와 덜 싼데 많은 <b>위 칸</b> 중 어디서 살지는 내가 고릅니다. 못 잡으면 다음날 우선권</li>
      </ol>

      <p className={styles.note}>
        시장은 오르든 내리든 같은 규칙입니다. 시장이 정하는 것은 <b>오늘 얼마나 크게 정산할 수 있는지</b>까지이고,
        그 안에서 어디에 앉을지는 내 종목이, 어디서 살지는 내 선택이 정합니다.
        빵장은 {OPEN_HOUR}:00–{CLOSE_HOUR}:00에 열리고, 주식시장이 쉬는 날은 빵장도 쉽니다.
      </p>

      {hours.reason === 'test' && (
        <p className={styles.warn}>
          지금은 <b>테스트를 위해 24시간 열어두었습니다.</b> 원래는 {OPEN_HOUR}:00–{CLOSE_HOUR}:00에만 열립니다.
          가격별 한정 수량은 아직 코드 기본값이며, 체결가 적용(쿠폰)은 기업 확인 중입니다.
        </p>
      )}

      <a className={styles.shopLink} href="https://makji.kr/product/list.html?cate_no=24" target="_blank" rel="noopener noreferrer">
        정가로 바로 사기 — 막지 공식몰 <span aria-hidden="true">↗</span>
      </a>
    </>
  );
}
