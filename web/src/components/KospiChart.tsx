'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscountTier } from '@/data/indicators';
import { moodFor, priceAt } from '@/lib/offers';
import { depthFor } from '@/lib/orderbook';
import type { KospiLive as Live } from '@/lib/useKospiLive';
import styles from './Market.module.css';

/**
 * 코스피 차트 — 1일 · 1개월 · 1년.
 *
 * 색은 기분(자축/위로)이 아니라 **방향**이다: 오르면 빨강, 내리면 파랑 (한국 증시 관례).
 * 선 아래를 같은 색으로 옅게 채운다 — 이게 없으면 주식 차트로 읽히지 않는다.
 *
 * 점을 누르면(또는 올리면) 그 시점의 시세·등락률과 함께 **"그날이었다면 내 관심빵이
 * 얼마였을지"**를 보여준다. 등락률 → 폭 → 가격은 오늘 규칙과 같은 함수를 쓴다.
 * 그래서 차트가 구경거리가 아니라 "내 빵값이 시장을 어떻게 따라왔나"를 훑는 도구가 된다.
 */

export type Range = '1d' | '1mo' | '1y';
type Phase = 'live' | 'locked' | 'open' | 'closed';
interface Pt { t: number; v: number }
interface Hist { points: Pt[]; prevClose: number | null }

interface Props {
  k: Live;
  phase: Phase;
  tiers: DiscountTier[];
  /** 툴팁에 보여줄 빵 — 내 관심 1위, 없으면 오늘 TOP 1 */
  bread: { name: string; emoji: string; listPrice: number } | null;
  drawMs: number;
}

const W = 640, H = 210, PL = 10, PR = 10, PT = 30, PB = 30;
const BARS = 78;
const RANGES: { key: Range; label: string }[] = [{ key: '1d', label: '1일' }, { key: '1mo', label: '1개월' }, { key: '1y', label: '1년' }];
const fmt = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const won = (n: number) => n.toLocaleString('ko-KR');
const kstDate = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '');
const kstMonth = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric' }).replace(' ', '');
const intradayLabel = (i: number) => { const m = 9 * 60 + i * 5; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

export default function KospiChart({ k, phase, tiers, bread, drawMs }: Props) {
  const [range, setRange] = useState<Range>('1d');
  const [hist, setHist] = useState<Partial<Record<Range, Hist>>>({});
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setDrawn(true), reduce ? 0 : drawMs);
    return () => clearTimeout(t);
  }, [drawMs]);

  /* 1개월·1년은 눌렀을 때 한 번만 받아온다 */
  useEffect(() => {
    if (range === '1d' || hist[range]) return;
    let alive = true;
    fetch(`/api/kospi/series?range=${range}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive && j?.ok) setHist(h => ({ ...h, [range]: { points: j.points, prevClose: j.prevClose } })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [range, hist]);

  const prevClose1d = k.value / (1 + k.changePct / 100);
  const points: Pt[] = range === '1d' ? k.series.map((v, i) => ({ t: i, v })) : (hist[range]?.points ?? []);
  const prevClose = range === '1d' ? prevClose1d : (hist[range]?.prevClose ?? points[0]?.v ?? null);
  const n = points.length;
  const has = n >= 2;
  const up = range === '1d' ? k.changePct >= 0 : has ? points[n - 1].v >= points[0].v : true;
  const dir = up ? 'up' : 'down';

  const vals = points.map(p => p.v);
  const lo0 = has ? Math.min(...vals, ...(range === '1d' && prevClose ? [prevClose] : [])) : 0;
  const hi0 = has ? Math.max(...vals, ...(range === '1d' && prevClose ? [prevClose] : [])) : 1;
  const pad = (hi0 - lo0) * 0.06 || 1;
  const lo = lo0 - pad, hi = hi0 + pad, span = hi - lo;
  const x = (i: number) => range === '1d' ? PL + (Math.min(i, BARS) / BARS) * (W - PL - PR) : PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = has ? `M${x(0).toFixed(1)},${(H - PB).toFixed(1)} L${line.replace(/ /g, ' L')} L${x(n - 1).toFixed(1)},${(H - PB).toFixed(1)} Z` : '';
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  const anchor = (i: number) => (x(i) < W * 0.2 ? 'start' : x(i) > W * 0.8 ? 'end' : 'middle');

  /* 점 하나의 등락률 — 이전 점 대비. 첫 점은 기간 직전 종가 대비 */
  const pctAt = (i: number) => { const base = i > 0 ? points[i - 1].v : prevClose ?? points[0].v; return base ? ((points[i].v / base) - 1) * 100 : 0; };
  const active = pinned ?? hover;
  const tip = active !== null && points[active] ? (() => {
    const p = points[active]; const pct = pctAt(active); const mood = moodFor(pct); const rate = depthFor(Math.abs(pct), tiers).rate;
    const price = bread ? priceAt(bread.listPrice, rate) : null;
    return { p, pct, mood, rate, price, label: range === '1d' ? intradayLabel(active) : kstDate(p.t), xPct: (x(active) / W) * 100 };
  })() : null;

  const idxFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect || !has) return null;
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    const f = (xr - PL) / (W - PL - PR);
    const i = range === '1d' ? Math.round(f * BARS) : Math.round(f * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  };

  /* x축 라벨 */
  const axis: { i: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = range === '1d'
    ? [{ i: 0, label: '09:00', anchor: 'start' }, { i: 36, label: '12:00', anchor: 'middle' }, { i: BARS, label: '15:30', anchor: 'end' }]
    : has ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].map((i, j) => ({ i, label: range === '1y' ? kstMonth(points[i].t) : kstDate(points[i].t).slice(3), anchor: j === 0 ? 'start' : j === 3 ? 'end' : 'middle' as const })) : [];
  const xAt = (i: number) => range === '1d' ? PL + (i / BARS) * (W - PL - PR) : x(i);

  return (
    <div className={styles.chartWrap} data-dir={dir}>
      <div className={styles.rangeTabs} role="tablist" aria-label="기간">
        {RANGES.map(r => <button key={r.key} type="button" role="tab" aria-selected={range === r.key} onClick={() => { setRange(r.key); setPinned(null); setHover(null); }}>{r.label}</button>)}
      </div>

      {has ? (
        <div className={styles.chartBox}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden="true"
            onPointerMove={e => setHover(idxFromEvent(e))} onPointerLeave={() => setHover(null)}
            onClick={e => { const i = idxFromEvent(e as unknown as React.PointerEvent<SVGSVGElement>); setPinned(prev => (prev === i ? null : i)); }}>
            <defs>
              <linearGradient id={`fill-${dir}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={up ? 'var(--up)' : 'var(--down)'} stopOpacity=".28" />
                <stop offset="100%" stopColor={up ? 'var(--up)' : 'var(--down)'} stopOpacity="0" />
              </linearGradient>
            </defs>
            {prevClose && range === '1d' && (
              <>
                <line x1={PL} x2={W - PR} y1={y(prevClose)} y2={y(prevClose)} className={styles.baseline} />
                <text x={W - PR} y={y(prevClose) - 5} className={styles.axis} textAnchor="end">어제 종가 {fmt(prevClose)}</text>
              </>
            )}
            <path d={area} className={styles.area} fill={`url(#fill-${dir})`} data-done={drawn} />
            <polyline points={line} pathLength={1} className={styles.line} data-done={drawn} style={{ animationDuration: `${drawMs}ms` }} />
            {drawn && (
              <>
                <circle cx={x(iMax)} cy={y(points[iMax].v)} r="2.5" className={styles.extDot} />
                <text x={x(iMax)} y={y(points[iMax].v) - 9} className={styles.ext} textAnchor={anchor(iMax)}>최고 {fmt(points[iMax].v)}</text>
                <circle cx={x(iMin)} cy={y(points[iMin].v)} r="2.5" className={styles.extDot} />
                <text x={x(iMin)} y={y(points[iMin].v) + 15} className={styles.ext} textAnchor={anchor(iMin)}>최저 {fmt(points[iMin].v)}</text>
                <circle cx={x(n - 1)} cy={y(points[n - 1].v)} r="5" className={styles.dot} data-live={phase === 'live' && range === '1d'} />
              </>
            )}
            {tip && (
              <>
                <line x1={x(active!)} x2={x(active!)} y1={PT - 6} y2={H - PB} className={styles.guide} />
                <circle cx={x(active!)} cy={y(tip.p.v)} r="6" className={styles.hoverDot} />
              </>
            )}
            {axis.map(a => <text key={a.label + a.i} x={xAt(a.i)} y={H - 8} className={styles.axis} textAnchor={a.anchor}>{a.label}</text>)}
          </svg>

          {tip && (
            <div className={styles.tipBox} style={{ left: `${tip.xPct}%` }} data-flip={tip.xPct > 62} role="status">
              <b>{tip.label}</b>
              <span>시세 <strong>{fmt(tip.p.v)}</strong> <em className={tip.pct >= 0 ? styles.up : styles.down}>{tip.pct >= 0 ? '▲' : '▼'} {Math.abs(tip.pct).toFixed(2)}%</em></span>
              {bread && tip.price && (
                <span className={styles.tipBread}>
                  {bread.emoji} {bread.name} <strong>{won(tip.price.price)}원</strong>
                  <small>{tip.mood.title} · 정가 {won(bread.listPrice)} · −{won(tip.price.saved)}</small>
                </span>
              )}
              {range !== '1d' && <small className={styles.tipHint}>그날 마감 등락률 기준으로 계산한 값</small>}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.noSeries}>{range === '1d' ? '당일 흐름을 받지 못했습니다.' : '불러오는 중…'}</div>
      )}
    </div>
  );
}
