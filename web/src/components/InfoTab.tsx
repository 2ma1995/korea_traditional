'use client';

import type { TodayMarket } from '@/lib/offers';
import { CLOSE_HOUR, OPEN_AT } from '@/lib/orderbook';
import styles from './Tabs.module.css';

/**
 * 정보 탭 — 오늘 가격이 어떻게 정해졌는지, 그리고 양쪽이 얻는 것.
 *
 * 현직자: "이 프로젝트는 구매 유저 + 사업자 둘 다가 유저다. 1팀은 사업자 베네핏
 * 설득이 없었다 — '우리가 왜 할인을 줘야 하나'에 답이 없었다." 그 답을 화면에 둔다.
 */
export default function InfoTab({ today }: { today: TodayMarket }) {
  const pct = Math.round(today.rate * 100);
  return (
    <>
      <div className={styles.gauge}>
        <div>
          <span>오늘의 코스피</span>
          <strong>{today.kospi.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          <small>{today.changePct >= 0 ? `+${today.changePct.toFixed(2)}%` : `${today.changePct.toFixed(2)}%`} 전일 대비{today.kospiLive ? '' : ' · 샘플 값'}</small>
        </div>
        <div>
          <span>오늘 변동폭</span>
          <strong>{today.absChangePct.toFixed(2)}%</strong>
          <small>{today.tier.label} · 크기가 폭을 정합니다</small>
        </div>
        <div>
          <span>오늘의 기분</span>
          <strong data-down={today.mood.side === 'loss'}>{today.mood.title}</strong>
          <small>{today.mood.en} · 방향이 기분을 정합니다{today.bonusRate > 0 && <> · 하락 +{Math.round(today.bonusRate * 100)}%p</>}</small>
        </div>
      </div>

      <ol className={styles.rules}>
        <li><b>15:30</b> 국장 마감 — 오늘 KOSPI가 <b>{today.absChangePct.toFixed(2)}%</b> 움직였습니다</li>
        <li>움직인 크기가 <b>{today.tier.label}</b> 구간이라 오늘 폭은 <b>−{pct}%</b>. 크게 움직인 날일수록 폭이 큽니다</li>
        {today.bonusRate > 0 && (
          <li><b>하락 마감</b>이라 위로 몫을 더 얹습니다 — 기본 <b>{Math.round(today.baseRate * 100)}%</b> + 하락장 <b>{Math.round(today.bonusRate * 100)}%p</b> = <b>−{pct}%</b> (상한 38%)</li>
        )}
        <li>오르면 <b>자축가</b>(Celebrate), 내리면 <b>위로가</b>(Comfort). 시장이 어떻게 움직여도 빵장에선 즐거운 일이 생깁니다</li>
        <li><b>{OPEN_AT}</b> 개장 — 오늘의 빵을 한정 수량으로. 오늘 살지, 관심에 담고 다음에 살지는 내가 정합니다</li>
      </ol>

      <dl className={styles.ipoRules}>
        <div><dt>손님이 얻는 것</dt><dd>매일 다른 폭·다른 기분. 내 관심 빵이 언제 가장 싼지 보입니다. 공모주로 다음 빵을 내가 정합니다</dd></div>
        <div><dt>기업이 얻는 것</dt><dd>변동성 큰 날은 소비가 위축되는 날(한국은행·KCI) — <b>안 팔릴 날 재고를 돕니다.</b> 한정 수량으로 할인 총액에 상한. 공모주로 출시 전 수요를 봅니다</dd></div>
        <div><dt>요구사항</dt><dd>금융시장 데이터(KOSPI)가 가격 변경 기준 ✓ · 최대 할인 38% 상한 ✓ · 카페24 판매가 변경 연동 ✓</dd></div>
      </dl>

      <p className={styles.note}>
        빵장은 {OPEN_AT}–{CLOSE_HOUR}:00에 열리고, 주식시장이 쉬는 날은 빵장도 쉽니다.
        {today.hours.reason === 'test' && <> 지금은 <b>테스트를 위해 24시간</b> 열어두었습니다.</>}
      </p>

      <a className={styles.shopLink} href="https://makji.kr/product/list.html?cate_no=24" target="_blank" rel="noopener noreferrer">
        정가로 바로 사기 — 막지 공식몰 <span aria-hidden="true">↗</span>
      </a>
    </>
  );
}
