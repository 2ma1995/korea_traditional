'use client';

import { useId, useState } from 'react';
import styles from './FxSparkline.module.css';

/**
 * 원/달러 최근 한 달 추이.
 *
 * 값이 24개 남짓이라 축·눈금 없이 선만 그린다. 포인터를 올리면 가장 가까운 지점에
 * 점과 값이 붙는다. 터치에서는 hover가 없으므로 pointermove로 같은 동작을 받는다.
 *
 * 데이터가 2개 미만이면 그리지 않는다 — 점 하나로는 추세가 되지 않는다.
 */

const W = 260;
const H = 56;
const PAD = 4;

const won = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export default function FxSparkline({ series, label }: { series: number[]; label: string }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (series.length < 2) return null;

  const min = Math.min(...series);
  const max = Math.max(...series);
  // 전부 같은 값이면 0으로 나누게 되므로 가운데 선으로 눕힌다
  const span = max - min || 1;

  const xOf = (i: number) => PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const yOf = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');
  const area = `${line} L${xOf(series.length - 1).toFixed(1)} ${H} L${xOf(0).toFixed(1)} ${H} Z`;

  const rising = series[series.length - 1] >= series[0];
  const active = hover ?? series.length - 1;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    // xOf의 역산이다. 좌우 여백(PAD)을 빼지 않으면 끝쪽에서 한 칸씩 어긋난다.
    const viewX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.round(((viewX - PAD) / (W - PAD * 2)) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, index)));
  };

  return (
    <div className={styles.chart} data-rising={rising}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${label} 최근 한 달 추이. 최저 ${won(min)}원, 최고 ${won(max)}원.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} className={styles.line} />
        <line className={styles.cursor} x1={xOf(active)} y1="0" x2={xOf(active)} y2={H} />
        <circle className={styles.dot} cx={xOf(active)} cy={yOf(series[active])} r="3" />
      </svg>
      <div className={styles.legend}>
        <span>한 달 전</span>
        <b aria-live="polite">{won(series[active])}원</b>
        <span>오늘</span>
      </div>
    </div>
  );
}
