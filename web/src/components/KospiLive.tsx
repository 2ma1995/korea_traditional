'use client';

import { useEffect, useState } from 'react';
import Flip from '@/components/Flip';
import KospiChart, { type ChartBread } from '@/components/KospiChart';
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
  /** 구간 기본 폭 — 하락장 보정 전 */
  base: number;
  /** 하락 마감이라 얹은 폭. 0이면 이유 줄에 안 쓴다 */
  bonus: number;
  phase: Phase;
  openAt: string;
  tiers: DiscountTier[];
  /** 차트 툴팁에 보여줄 빵들 — 내 관심빵 전부(오늘 빵장에 있는 것), 없으면 대표 빵 */
  breads: ChartBread[];
  noWatch: boolean;
  /** 오늘 변동폭 구간 이름 — "작은 움직임" */
  tierLabel: string;
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
      /* 초까지, 매초. 시간이 내려가는 게 보여야 한다 — 코스피·수량 폴링만 30초다 */
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

export default function KospiLive({ k, mood, rate, base, bonus, phase, openAt, tiers, breads, noWatch, tierLabel }: Props) {
  /* 내린 날은 "구간 20% + 하락장 3%p"로 쪼개 보여준다 — 23%가 어디서 왔는지 */
  const why = bonus > 0
    ? <>{tierLabel} {Math.round(base * 100)}% <b className={styles.down}>+ 하락장 {Math.round(bonus * 100)}%p</b></>
    : <>{tierLabel}</>;
  const [oh, om] = openAt.split(':').map(Number);
  const toClose = useCountdown(atToday(15, 30), phase === 'live');
  const toOpen = useCountdown(atToday(oh, om), phase === 'locked');
  const toEnd = useCountdown(atMidnight, phase === 'open');
  const toLive = useCountdown(nextLive, phase === 'closed');

  const up = k.changePct >= 0;
  const prevClose = k.value / (1 + k.changePct / 100);
  const diff = k.value - prevClose;
  const s = k.points.map(p => p.v);
  const has = s.length >= 2;
  const iMax = has ? s.indexOf(Math.max(...s)) : 0, iMin = has ? s.indexOf(Math.min(...s)) : 0;

  /* 마감 뒤 티커 — 오늘의 기록이 흐른다. 전부 실제 값이고, 색은 증시 관례대로
     오르면 빨강·내리면 파랑. 회색 한 톤이면 주식 느낌이 빠진다 */
  const dirTone = up ? 'up' : 'down';
  const facts: { t: string; tone: 'up' | 'down' | 'mood' | 'ink' | 'muted' }[] = has ? [
    { t: `마감 ${fmt(k.value)} ${up ? '▲' : '▼'}`, tone: dirTone },
    { t: `어제보다 ${up ? '+' : ''}${fmt(diff)} (${Math.abs(k.changePct).toFixed(2)}%)`, tone: dirTone },
    { t: `최고 ${fmt(s[iMax])} ▲`, tone: 'up' },
    { t: `최저 ${fmt(s[iMin])} ▼`, tone: 'down' },
    { t: `오늘의 라인 ${mood.theme}`, tone: 'mood' },
    { t: `모든 빵 ${Math.round(rate * 100)}% 할인`, tone: 'ink' },
    { t: phase === 'open' ? '00:00 CLOSE' : phase === 'locked' ? `${openAt} OPEN` : '다음 거래일 09:00 LIVE', tone: 'muted' },
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

      <KospiChart k={k} phase={phase} tiers={tiers} breads={breads} noWatch={noWatch} drawMs={DRAW_MS} />

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
        <div className={styles.factsTicker} aria-label="오늘의 기록">
          <div className={styles.factsTrack}>
            <div className={styles.factsSet}>
              {facts.map((f, i) => <span key={i} className={styles.fact} data-tone={f.tone}>{f.t}</span>)}
            </div>
            {/* 흐름이 끊기지 않게 한 벌 더 — 동작 줄이기에서는 숨긴다 */}
            <div className={styles.factsSet} aria-hidden="true">
              {facts.map((f, i) => <span key={i} className={styles.fact} data-tone={f.tone}>{f.t}</span>)}
            </div>
          </div>
        </div>
      )}

      {/* 카운트다운 — 그래프 아래 가운데. 상태는 위, 무엇까지 남은 시간인지는 숫자 왼쪽에 */}
      <div className={styles.countCenter}>
        <span className={styles.marketTag} data-open={phase === 'open'}>
          <i aria-hidden="true" />
          {phase === 'live' ? 'BREAD MARKET · 15:30 OPEN'
            : phase === 'locked' ? `BREAD MARKET OPEN · ${openAt}`
            : phase === 'open' ? 'BREAD MARKET OPEN'
            : 'BREAD MARKET CLOSED'}
        </span>
        <span className={styles.countRow}>
          <small>{phase === 'live' ? '확정까지' : phase === 'locked' ? '개장까지' : phase === 'open' ? '마감까지' : '다음 LIVE까지'}</small>
          <strong><Flip value={(phase === 'live' ? toClose : phase === 'locked' ? toOpen : phase === 'open' ? toEnd : toLive) ?? '-- : -- : --'} /></strong>
        </span>
      </div>

      {phase === 'live' ? (
        <div className={styles.verdict} key={mood.side}>
          <div className={styles.verdictPop}>
            <span className={styles.eyebrow}>지금 마감한다면</span>
            <h1>모든 빵 <b>{Math.round(rate * 100)}%</b> 할인</h1>
            <p className={styles.why1}>국장 <b className={up ? styles.up : styles.down}>{up ? '▲' : '▼'} {Math.abs(k.changePct).toFixed(2)}%</b> · {why} → {mood.theme} — {mood.copy.split(/(?<=\.)\s+/)[0]}</p>
          </div>
        </div>
      ) : (
        <div className={styles.verdict}>
          <div>
            <span className={styles.eyebrow}>오늘은 {k.changePct > 0 ? '상승' : k.changePct < 0 ? '하락' : '보합'} 마감<span className={styles.stamp}>확정 ✓</span></span>
            <h1>오늘 모든 빵 <b>{Math.round(rate * 100)}%</b> 할인</h1>
            <p className={styles.why1}>국장 <b className={up ? styles.up : styles.down}>{up ? '▲' : '▼'} {Math.abs(k.changePct).toFixed(2)}%</b> · {why} → {mood.theme} — {mood.copy.split(/(?<=\.)\s+/)[0]}</p>
          </div>
        </div>
      )}

      {/* 규칙 한 줄.
          "왜 코스피냐"는 손님이 이해해야 할 질문이 아니다 — 우천 할인에 "비가 왜
          가격과 상관있냐"고 묻는 사람은 없다. 규칙이 명확하고 매일 확인할 수 있으면
          그걸로 충분하다. 인과는 발표에서 기업·심사자에게 쓴다.
          현직자: "'국장은 이랬는데 빵장은 어떨까' 정도의 기대감만 심어주면 충분하다." */}
      <p className={styles.rule}>
        <b>많이 흔들린 날</b>일수록 싸집니다 · <b>내린 날</b>은 더 싸집니다
      </p>
    </section>
  );
}
