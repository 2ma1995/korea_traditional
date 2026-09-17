'use client';

import { useState } from 'react';
import styles from './Market.module.css';

/**
 * 관심빵 도넛 — 포트폴리오라는 금융 메타포에 맞는 모양.
 *
 * 가운데엔 숫자 하나를 크게 넣지 않는다 — 그러면 한 빵의 지표처럼 보인다.
 * "MY PORTFOLIO · 관심빵 N종"만 두고 구성비는 오른쪽 범례가 말한다.
 * 오늘 빵장에 있는(할인 대상) 조각만 진하게, 품절은 흐리게. 올리면 툴팁.
 */

export interface Slice { no: number; name: string; emoji: string; share: number; today: boolean; price?: number }

const R = 44, C = 2 * Math.PI * R;
/* 조각별 색 — 같은 초록에 투명도만 다르면 구분이 안 된다. 브랜드 팔레트에서 여섯 */
export const PALETTE = ['#2d493d', '#a34835', '#8d7955', '#2b5f8a', '#6b8f71', '#c98b5e'];

export default function Donut({ slices }: { slices: Slice[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const active = slices.find(s => s.no === hover) ?? null;
  /* 각 조각의 시작 위치를 미리 계산한다 — 렌더 중 변수 재할당은 React가 막는다 */
  const arcs = slices.reduce<{ s: Slice; len: number; offset: number }[]>((acc, s) => {
    const len = (s.share / 100) * C;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    return [...acc, { s, len, offset }];
  }, []);

  return (
    <div className={styles.donutWrap}>
      <div className={`${styles.donutBox} ${styles.donutIn}`}>
        <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label="내 관심빵 구성비">
          <circle cx="60" cy="60" r={R} className={styles.donutTrack} />
          {arcs.map(({ s, len, offset }, i) => (
            <circle key={s.no} cx="60" cy="60" r={R} className={styles.donutSeg} data-today={s.today} data-hover={hover === s.no}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} style={{ stroke: PALETTE[i % PALETTE.length] }}
              onMouseEnter={() => setHover(s.no)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        <div className={styles.donutCenter}>
          <span>MY<br />PORTFOLIO</span>
          <b>관심빵 {slices.length}종</b>
        </div>
        {active && (
          <div className={styles.tip} role="tooltip">
            <b>{active.emoji} {active.name}</b>
            <span>내 관심 비중 {active.share}%</span>
            <span>{active.today ? '오늘 할인 대상 ✓' : '오늘은 품절'}</span>
          </div>
        )}
      </div>
      <ul className={styles.legend}>
        {slices.map((s, i) => (
          <li key={s.no} data-today={s.today} onMouseEnter={() => setHover(s.no)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{s.emoji} {s.name}</span><b>{s.share}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
