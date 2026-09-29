'use client';

import { useState } from 'react';
import styles from './Market.module.css';

/**
 * 관심빵 도넛 — 포트폴리오라는 금융 메타포에 맞는 모양.
 *
 * 포트폴리오 목록과 같은 단위로 그린다 — 옵션마다 한 조각이다. 휘낭시에 코코넛·피칸을
 * 담았으면 두 조각이고, 비중은 담은 개수로 센다.
 *
 * 가운데엔 숫자 하나를 크게 넣지 않는다 — 그러면 한 빵의 지표처럼 보인다.
 * "MY PORTFOLIO · 관심빵 N종"만 두고 구성비는 오른쪽 범례가 말한다.
 * 오늘 살 수 있는 조각만 진하게, 품절·할인 밖은 흐리게.
 *
 * 말풍선은 **조각에 올렸을 때만**, 도넛 왼쪽 빈칸에 띄운다(좁은 화면은 도넛 아래).
 * 범례 글자에 올려도 그래프는 움직이지 않는다 — 목록을 읽는 중에 조각이 번쩍이면 산만하다.
 *
 * 조각·범례를 누르면 그 빵·옵션의 상세 시트가 열린다 — 도넛이 통계가 아니라
 * "여기서 골라 사는" 자리가 된다. 오늘 살 수 없는 조각은 열지 않는다.
 */

export interface Slice {
  /** 포트폴리오 키 — "번호:품목코드" 또는 "번호" */
  key: string;
  no: number;
  unit: string | null;
  name: string;
  emoji: string;
  share: number;
  /** 오늘 살 수 있는가 — 할인 중이고 그 옵션을 팔고 있다 */
  today: boolean;
  price?: number;
  /** 오늘 살 수 없을 때 말풍선에 쓸 까닭 — 휴장 · 품절 · 할인 밖 */
  note: string;
}

const R = 44, C = 2 * Math.PI * R;
/* 첫 조각은 브랜드색. 나머지는 서로 구분되는 따뜻한 보조색이다. */
export const PALETTE = ['var(--brand)', '#8B3D35', '#827044', 'var(--ink)', '#C29862', '#A66C50'];
const won = (n: number) => n.toLocaleString('ko-KR');

export default function Donut({ slices, onPick }: { slices: Slice[]; onPick?: (productNo: number, unit: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ? slices.find(s => s.key === hover) ?? null : null;
  const breads = new Set(slices.map(s => s.no)).size;
  /* 각 조각의 시작 위치를 미리 계산한다 — 렌더 중 변수 재할당은 React가 막는다 */
  const arcs = slices.reduce<{ s: Slice; len: number; offset: number }[]>((acc, s) => {
    const len = (s.share / 100) * C;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    return [...acc, { s, len, offset }];
  }, []);

  return (
    <div className={styles.donutWrap}>
      {/* 말풍선 자리 — 넓은 화면에선 도넛 왼쪽 칸, 좁은 화면에선 도넛 아래에 뜬다 */}
      <div className={styles.tipSlot}>
        {active && (
          <div className={styles.tip} role="tooltip">
            <b>{active.emoji} {active.name}</b>
            <span>내 관심 비중 {active.share}%</span>
            <span>{active.today ? `오늘 할인${active.price ? ` · ${won(active.price)}원` : ''}${onPick ? ' · 눌러서 구매' : ''}` : active.note}</span>
          </div>
        )}
      </div>
      <div className={`${styles.donutBox} ${styles.donutIn}`}>
        <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label="내 관심빵 구성비">
          <circle cx="60" cy="60" r={R} className={styles.donutTrack} />
          {arcs.map(({ s, len, offset }, i) => (
            <circle key={s.key} cx="60" cy="60" r={R} className={styles.donutSeg} data-today={s.today} data-hover={hover === s.key}
              data-clickable={Boolean(onPick) && s.today}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} style={{ stroke: PALETTE[i % PALETTE.length] }}
              onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
              onClick={() => { if (s.today) onPick?.(s.no, s.unit); }} />
          ))}
        </svg>
        <div className={styles.donutCenter}>
          <span>MY<br />PORTFOLIO</span>
          <b>관심빵 {breads}종</b>
        </div>
      </div>
      <ul className={styles.legend}>
        {slices.map((s, i) => (
          <li key={s.key} data-today={s.today}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            {onPick && s.today
              ? <button type="button" className={styles.legendPick} onClick={() => onPick(s.no, s.unit)}>{s.emoji} {s.name}</button>
              : <span>{s.emoji} {s.name}</span>}
            <b>{s.share}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
