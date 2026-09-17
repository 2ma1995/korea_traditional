'use client';

import { useEffect, useState } from 'react';
import Flip from '@/components/Flip';
import KospiChart from '@/components/KospiChart';
import type { DiscountTier } from '@/data/indicators';
import type { Mood } from '@/lib/offers';
import type { KospiLive as Live } from '@/lib/useKospiLive';
import styles from './Market.module.css';

/**
 * TODAY'S MARKET — 상태가 실제로 변하는 LIVE 히어로.
 *
 * 장중     ● LIVE 점이 뛰고, 지수는 값이 바뀔 때 굴러가고, 차트 끝이 이어지고,
 *          아래 틱이 흐른다. "지금 마감한다면 「테마」"는 방향이 뒤집히면 같이 바뀐다.
 * 마감 후  같은 자리에서 CLOSED로. 차트는 멈추지만 다른 것이 움직인다 —
 *          오늘의 기록 티커, 15:30→00:00 진행 바, 카운트다운 숫자 롤링, 확정 도장.
 *
 * 차트는 KospiChart가 그린다 (1일·1개월·1년, 점 클릭 → 그날 내 빵값).
 */

export type Phase = 'live' | 'locked' | 'open' | 'closed';

interface Props {
  k: Live;
  mood: Mood;
  rate: number;
  phase: Phase;
  openAt: string;
  test: boolean;
  tiers: DiscountTier[];
  bread: { name: string; emoji: string; listPrice: number } | null;
}

export const DRAW_MS = 1600;
const fmt = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* KST 시각 계산기들 — 마감 후에도 화면이 '어디로 가는지' 말해야 해서 넷이다 */
const kstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
const atToday = (h: number, m: number) => (kst: Date) => { const d = new Date(kst); d.setHours(h, m, 0, 0); return d; };
const atMidnight = (kst: Date) => { const d = new Date(kst); d.setHours(24, 0, 0, 0); return d; };
/** 다음 거래일 09:00 — 주말은 건너뛴다. 공휴일 달력은 아직 없다 */
const nextLive = (kst: Date) => {
  const d = new Date(kst); d.setHours(9, 0, 0, 0);
  if (d <= kst) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};

function useCountdown(target: (kst: Date) => Date, on: boolean) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const kst = kstNow();
      const ms = target(kst).getTime() - kst.getTime();
      if (ms <= 0) { setLeft(null); return; }
      const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4), s = Math.floor((ms % 6e4) / 1000);
      setLeft(`${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`);
    };
    const t0 = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 1000);
    return () => { clearTimeout(t0); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target은 모듈 상수 계산기라 안정적이다
  }, [on]);
  return on ? left : null;
}

/** 15:30 장 마감 → 00:00 CLOSE 사이 지금 위치. 30초마다 움직인다 */
function Timeline() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const tick = () => {
      const kst = kstNow(); const start = atToday(15, 30)(kst).getTime(); const end = atMidnight(kst).getTime();
      setPct(Math.max(0, Math.min(1, (kst.getTime() - start) / (end - start))));
    };
    const t0 = window.setTimeout(tick, 0); const t = window.setInterval(tick, 30000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  return (
    <div className={styles.timeline} aria-hidden="true">
      <span>15:30 장 마감</span>
      <div className={styles.tlTrack}><i style={{ width: `${pct * 100}%` }} /><b style={{ left: `${pct * 100}%` }} /></div>
      <span>00:00 CLOSE</span>
    </div>
  );
}

export default function KospiLive({ k, mood, rate, phase, openAt, test, tiers, bread }: Props) {
  const [oh, om] = openAt.split(':').map(Number);
  const toClose = useCountdown(atToday(15, 30), phase === 'live');
  const toOpen = useCountdown(atToday(oh, om), phase === 'locked');
  const toEnd = useCountdown(atMidnight, phase === 'open');
  const toLive = useCountdown(nextLive, phase === 'closed');

  const up = k.changePct >= 0;
  const prevClose = k.value / (1 + k.changePct / 100);
  const diff = k.value - prevClose;
  const s = k.series;
  const has = s.length >= 2;
  const iMax = has ? s.indexOf(Math.max(...s)) : 0, iMin = has ? s.indexOf(Math.min(...s)) : 0;

  /* 마감 뒤 티커 — 오늘의 기록이 흐른다. 전부 실제 값이다 */
  const facts = has ? [
    `마감 ${fmt(k.value)}`,
    `어제보다 ${up ? '+' : ''}${fmt(diff)} (${Math.abs(k.changePct).toFixed(2)}%)`,
    `최고 ${fmt(s[iMax])}`, `최저 ${fmt(s[iMin])}`,
    `오늘의 라인 ${mood.theme}`, `모든 빵 ${Math.round(rate * 100)}% 할인`,
    phase === 'open' ? '00:00 CLOSE' : phase === 'locked' ? `${openAt} OPEN` : '다음 거래일 09:00 LIVE',
  ] : [];

  return (
    <section className={styles.hero} data-phase={phase} data-dir={up ? 'up' : 'down'} aria-label="오늘의 시장">
      <div className={styles.heroLine}>
        <span className={styles.eyebrow}>TODAY&apos;S MARKET · 코스피</span>
        <span className={styles.liveTag} data-live={phase === 'live'}>
          <i aria-hidden="true" />KOSPI {phase === 'live' ? 'LIVE' : 'CLOSED'}
        </span>
      </div>

      <div className={styles.quoteRow}>
        <div>
          <strong key={k.seq} className={`${styles.index} ${k.dir === 'up' ? styles.rollUp : k.dir === 'down' ? styles.rollDown : ''}`}>{fmt(k.value)}</strong>
          <span className={styles.diff}>
            어제보다 <b className={up ? styles.up : styles.down}>{up ? '+' : ''}{fmt(diff)} ({Math.abs(k.changePct).toFixed(2)}%)</b>
            <i>|</i>{phase === 'live' ? '실시간' : '15:30 마감'}
          </span>
        </div>
        <span className={`${styles.pct} ${up ? styles.up : styles.down}`}>{up ? '▲' : '▼'} {Math.abs(k.changePct).toFixed(2)}%</span>
      </div>

      <KospiChart k={k} phase={phase} tiers={tiers} bread={bread} drawMs={DRAW_MS} />

      {phase === 'live' && k.ticks.length > 0 && (
        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerTrack}>
            {[...k.ticks, ...k.ticks].map((t, i) => (
              <span key={i} className={t.dir === 'up' ? styles.up : styles.down}>{t.t} {fmt(t.v)} {t.dir === 'up' ? '▲' : '▼'}</span>
            ))}
          </div>
        </div>
      )}
      {phase !== 'live' && facts.length > 0 && (
        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerTrack}>
            {[...facts, ...facts].map((f, i) => <span key={i} className={styles.fact}>{f}</span>)}
          </div>
        </div>
      )}
      {(phase === 'open' || phase === 'locked') && <Timeline />}

      {phase === 'live' ? (
        <div className={styles.verdict} key={mood.side}>
          <div className={styles.verdictPop}>
            <span className={styles.eyebrow}>지금 마감한다면</span>
            <h1>「{mood.theme.replace(/^\S+\s/, '')}」<small>오늘의 할인 라인 · 모든 빵 {Math.round(rate * 100)}%</small></h1>
          </div>
          {toClose && (
            <div className={styles.count}>
              <span>최종 결정까지</span>
              <strong><Flip value={toClose} /></strong>
              <small>※ 15:30 종가 기준으로 확정</small>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.verdict}>
          <div>
            <span className={styles.eyebrow}>오늘은 {k.changePct > 0 ? '상승' : k.changePct < 0 ? '하락' : '보합'} 마감</span>
            <h1>{mood.theme}<span className={styles.stamp}>확정 ✓</span><small>오늘의 할인 라인 · 모든 빵 {Math.round(rate * 100)}%</small></h1>
          </div>
          <div className={styles.count}>
            <span>BREAD MARKET {phase === 'open' ? 'OPEN' : phase === 'locked' ? `OPEN · ${openAt}` : 'CLOSED'}</span>
            {phase === 'locked' && <><strong><Flip value={toOpen ?? '-- : -- : --'} /></strong><small>가격 공개까지</small></>}
            {phase === 'open' && <><strong><Flip value={toEnd ?? '-- : -- : --'} /></strong><small>오늘 빵장 마감까지 · 00:00 CLOSE{test ? ' · 테스트 상시' : ''}</small></>}
            {phase === 'closed' && <><strong><Flip value={toLive ?? '-- : -- : --'} /></strong><small>다음 거래일 09:00 LIVE까지</small></>}
          </div>
        </div>
      )}
    </section>
  );
}
