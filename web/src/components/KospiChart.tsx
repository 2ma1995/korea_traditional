'use client';

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import type { DiscountTier } from '@/data/indicators';
import { moodFor, priceAt, rateFor } from '@/lib/offers';
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

export type Range = '1d' | '5d' | '1mo' | '3mo' | '1y';
type Phase = 'live' | 'locked' | 'open' | 'closed';
interface Pt { t: number; v: number }
interface Hist { points: Pt[]; prevClose: number | null }

export interface ChartBread { no: number; name: string; emoji: string; listPrice: number }

interface Props {
  k: Live;
  phase: Phase;
  tiers: DiscountTier[];
  /** 툴팁·가격 곡선에 쓸 빵들 — 내 관심빵(오늘 빵장에 있는 것) */
  breads: ChartBread[];
  /** 관심빵이 없는가 — 안내만 띄운다 */
  noWatch: boolean;
  drawMs: number;
}

const W = 640, H = 210, PL = 10, PR = 10, PT = 30, PB = 30;
/* 정규장 09:00~15:30 — 1일 x축은 봉 개수가 아니라 이 시각 범위로 잡는다.
   네이버 분봉은 1분 단위 393점이고 마지막이 15:32라 개수 가정이 통하지 않는다. */
const OPEN_MIN = 9 * 60, CLOSE_MIN = 15 * 60 + 30, DAY_SPAN = CLOSE_MIN - OPEN_MIN;
/** epoch 초 → KST 그날의 분(0~1439). KST는 UTC+9라 오프셋만 더하면 된다 */
const kstMinute = (sec: number) => Math.floor((sec + 32_400) / 60) % 1440;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const RANGES: { key: Range; label: string }[] = [
  { key: '1d', label: '1일' }, { key: '5d', label: '1주' }, { key: '1mo', label: '1달' },
  { key: '3mo', label: '3달' }, { key: '1y', label: '1년' },
];
const fmt = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const won = (n: number) => n.toLocaleString('ko-KR');
const kstDate = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '');
const kstMonth = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric' }).replace(' ', '');
/** 1주(30분봉)는 날짜 + 시각이 같이 있어야 어느 날 어느 때인지 읽힌다 */
const kstDayTime = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(/\s+/g, ' ');
const kstDay = (sec: number) => new Date(sec * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).replace(/\s+/g, '');


export default function KospiChart({ k, phase, tiers, breads, noWatch, drawMs }: Props) {
  const [range, setRange] = useState<Range>('1d');
  /* 보는 대상 — null이면 코스피, 숫자면 그 빵의 가격 곡선 */
  const [viewNo, setViewNo] = useState<number | null>(null);
  const view = breads.find(b => b.no === viewNo) ?? null;
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
  const points: Pt[] = range === '1d' ? k.points : (hist[range]?.points ?? []);
  const prevClose = range === '1d' ? prevClose1d : (hist[range]?.prevClose ?? points[0]?.v ?? null);
  const n = points.length;
  const has = n >= 2;
  const up = range === '1d' ? k.changePct >= 0 : has ? points[n - 1].v >= points[0].v : true;
  const dir = up ? 'up' : 'down';

  /* 각 점의 등락률 — 이전 점 대비. 첫 점은 기간 직전 종가 대비 */
  const pctOf = (i: number) => {
    const base = i > 0 ? points[i - 1].v : prevClose ?? points[0]?.v;
    return base ? ((points[i].v / base) - 1) * 100 : 0;
  };
  /** 빵을 고르면 지수 대신 그 빵의 그날 가격을 그린다 */
  const valueAt = (i: number) => view ? priceAt(view.listPrice, rateFor(pctOf(i), tiers).rate).price : points[i].v;
  const vals = points.map((_, i) => valueAt(i));
  const guide = view ? view.listPrice : prevClose;   // 빵이면 정가선, 지수면 어제 종가선
  const showGuide = Boolean(guide) && (view !== null || range === '1d');
  const lo0 = has ? Math.min(...vals, ...(showGuide && guide ? [guide] : [])) : 0;
  const hi0 = has ? Math.max(...vals, ...(showGuide && guide ? [guide] : [])) : 1;
  const pad = (hi0 - lo0) * 0.06 || 1;
  const lo = lo0 - pad, hi = hi0 + pad, span = hi - lo;
  /* 1일은 배열 인덱스가 아니라 점의 바 위치(t)로 x를 잡는다 — 종가 점이 15:30에 놓이도록 */
  /* 1일은 실제 시각으로 자리를 잡는다 — 09:00이 왼쪽 끝, 15:30이 오른쪽 끝.
     장중엔 지나온 만큼만 선이 차고, 마감 뒤엔 15:30까지 꽉 찬다. */
  const dayFrac = (t: number) => Math.max(0, Math.min(1, (kstMinute(t) - OPEN_MIN) / DAY_SPAN));
  const x = (i: number) => range === '1d'
    ? PL + dayFrac(points[i]?.t ?? 0) * (W - PL - PR)
    : PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);
  const line = points.map((_, i) => `${x(i).toFixed(1)},${y(valueAt(i)).toFixed(1)}`).join(' ');
  const area = has ? `M${x(0).toFixed(1)},${(H - PB).toFixed(1)} L${line.replace(/ /g, ' L')} L${x(n - 1).toFixed(1)},${(H - PB).toFixed(1)} Z` : '';
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  const fmtV = (v: number) => view ? `${won(v)}원` : fmt(v);
  const anchor = (i: number) => (x(i) < W * 0.2 ? 'start' : x(i) > W * 0.8 ? 'end' : 'middle');

  /* 점 하나의 등락률 — 이전 점 대비. 첫 점은 기간 직전 종가 대비 */
  const pctAt = pctOf;
  const active = pinned ?? hover;
  const tip = active !== null && points[active] ? (() => {
    const p = points[active]; const pct = pctAt(active); const mood = moodFor(pct); const rate = rateFor(pct, tiers).rate;
    const list = view ? [view, ...breads.filter(b => b.no !== view.no)] : breads;
    const rows = noWatch && !view ? [] : list.map(b => ({ ...b, ...priceAt(b.listPrice, rate) }));
    /* 마지막 봉은 종가다 — 15:00봉이지만 담고 있는 값은 15:30 마감가 */
    const label = range === '1d'
      ? (active === n - 1 && phase !== 'live' ? `${hhmm(Math.min(kstMinute(p.t), CLOSE_MIN))} 마감` : hhmm(kstMinute(p.t)))
      : range === '5d' ? kstDayTime(p.t) : kstDate(p.t);
    return { p, pct, mood, rate, rows, label, xPct: (x(active) / W) * 100 };
  })() : null;

  /* 툴팁이 차트 밖으로 나가면 화면 끝에서 잘린다. 그려진 뒤 실제 크기를 재서
     차트 안으로 밀어 넣는다 — nowrap이라 관심빵이 많을수록 가로로 길어진다 */
  const tipRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = tipRef.current, wrap = boxRef.current;
    if (!box || !wrap) return;
    box.style.marginLeft = '0px';
    const b = box.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    let dx = 0;
    if (b.right > w.right - 4) dx = w.right - 4 - b.right;
    if (b.left + dx < w.left + 4) dx = w.left + 4 - b.left;
    if (dx) box.style.marginLeft = `${dx}px`;
  });

  const idxFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect || !has) return null;
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    const f = (xr - PL) / (W - PL - PR);
    if (range === '1d') {
      const want = OPEN_MIN + f * DAY_SPAN; let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(kstMinute(points[i].t) - want) < Math.abs(kstMinute(points[best].t) - want)) best = i;
      return best;
    }
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  };

  /* x축 라벨 */
  const axis: { i: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = range === '1d'
    ? [{ i: OPEN_MIN, label: '09:00', anchor: 'start' }, { i: 12 * 60, label: '12:00', anchor: 'middle' }, { i: CLOSE_MIN, label: phase === 'live' ? '15:30' : '15:30 마감', anchor: 'end' }]
    : has ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].map((i, j) => ({
        i,
        label: range === '1y' || range === '3mo' ? kstMonth(points[i].t) : kstDay(points[i].t),
        anchor: j === 0 ? 'start' : j === 3 ? 'end' : 'middle' as const,
      })) : [];
  /* 1일 축 라벨의 i는 '분'이다 */
  const xAt = (i: number) => range === '1d'
    ? PL + Math.max(0, Math.min(1, (i - OPEN_MIN) / DAY_SPAN)) * (W - PL - PR)
    : x(i);

  return (
    <div className={styles.chartWrap} data-dir={dir}>
      {breads.length > 0 && (
        <div className={styles.tabLine}>
          <span className={styles.tabLabel}>종목</span>
          <div className={styles.viewTabs} role="tablist" aria-label="보는 대상">
            <button type="button" role="tab" aria-selected={view === null} onClick={() => setViewNo(null)}>📈 코스피</button>
            {breads.map(b => (
              <button key={b.no} type="button" role="tab" aria-selected={view?.no === b.no} onClick={() => setViewNo(b.no)}>{b.emoji} {b.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.rangeRow}>
        <div className={styles.tabLine}>
          <span className={styles.tabLabel}>기간</span>
          <div className={styles.rangeTabs} role="tablist" aria-label="기간">
            {RANGES.map(r => <button key={r.key} type="button" role="tab" aria-selected={range === r.key} onClick={() => { setRange(r.key); setPinned(null); setHover(null); }}>{r.label}</button>)}
          </div>
        </div>
        <span className={styles.chartHint}>
          {noWatch
            ? <>🔔 <b>알림받기</b>로 관심빵을 담으면, 그 빵의 <b>가격 곡선</b>을 볼 수 있어요</>
            : view
              ? <><b>{view.name}</b>의 가격 곡선 · 점을 누르면 그날 가격이 보여요</>
              : <>위에서 빵을 고르면 <b>그 빵의 가격 곡선</b>이 보여요</>}
        </span>
      </div>

      {has ? (
        <div ref={boxRef} className={styles.chartBox}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden="true"
            onPointerMove={e => setHover(idxFromEvent(e))} onPointerLeave={() => setHover(null)}
            onClick={e => { const i = idxFromEvent(e as unknown as React.PointerEvent<SVGSVGElement>); setPinned(prev => (prev === i ? null : i)); }}>
            <defs>
              <linearGradient id={`fill-${dir}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--dir)" stopOpacity=".28" />
                <stop offset="100%" stopColor="var(--dir)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {showGuide && guide && (
              <>
                <line x1={PL} x2={W - PR} y1={y(guide)} y2={y(guide)} className={styles.baseline} />
                <text x={W - PR} y={y(guide) - 5} className={styles.axis} textAnchor="end">{view ? `정가 ${won(guide)}원` : `어제 종가 ${fmt(guide)}`}</text>
              </>
            )}
            <path d={area} className={styles.area} fill={`url(#fill-${dir})`} data-done={drawn} />
            <polyline points={line} pathLength={1} className={styles.line} data-done={drawn} style={{ animationDuration: `${drawMs}ms` }} />
            {drawn && (
              <>
                <circle cx={x(iMax)} cy={y(vals[iMax])} r="2.5" className={styles.extDot} />
                <text x={x(iMax)} y={y(vals[iMax]) - 9} className={styles.ext} textAnchor={anchor(iMax)}>{view ? '가장 비쌌던' : '최고'} {fmtV(vals[iMax])}</text>
                <circle cx={x(iMin)} cy={y(vals[iMin])} r="2.5" className={styles.extDot} />
                <text x={x(iMin)} y={y(vals[iMin]) + 15} className={styles.ext} textAnchor={anchor(iMin)}>{view ? '가장 쌌던' : '최저'} {fmtV(vals[iMin])}</text>
                <circle cx={x(n - 1)} cy={y(vals[n - 1])} r="5" className={styles.dot} data-live={phase === 'live' && range === '1d'} />
              </>
            )}
            {tip && (
              <>
                <line x1={x(active!)} x2={x(active!)} y1={PT - 6} y2={H - PB} className={styles.guide} />
                <circle cx={x(active!)} cy={y(valueAt(active!))} r="6" className={styles.hoverDot} />
              </>
            )}
            {axis.map(a => <text key={a.label + a.i} x={xAt(a.i)} y={H - 8} className={styles.axis} textAnchor={a.anchor}>{a.label}</text>)}
          </svg>

          {phase !== 'live' && (
            <span className={styles.closedMark} aria-hidden="true">장 마감</span>
          )}
          {tip && (
            <div ref={tipRef} className={styles.tipBox} style={{ left: `${tip.xPct}%` }} data-flip={tip.xPct > 62} role="status">
              <b>{tip.label}</b>
              <span>{view ? '코스피' : '시세'} <strong>{fmt(tip.p.v)}</strong> <em className={tip.pct >= 0 ? styles.up : styles.down}>{tip.pct >= 0 ? '▲' : '▼'} {Math.abs(tip.pct).toFixed(2)}%</em></span>
              {tip.rows.length > 0 && (
                <div className={styles.tipBreads}>
                  <small>기본 할인 {Math.round(tip.rate * 100)}%</small>
                  {tip.rows.map(r => (
                    <span key={r.name} className={styles.tipBread}>
                      <span>{r.emoji} {r.name}</span>
                      <strong>{won(r.price)}원</strong>
                      <small>−{won(r.saved)}</small>
                    </span>
                  ))}
                </div>
              )}
              {range !== '1d' && <small className={styles.tipHint}>그날 마감 등락률 기준으로 계산한 값</small>}
              {noWatch && <div className={styles.tipBreads}><small>🔔 알림받기로 관심빵을 담으면 여기 그날 내 빵값이 보여요</small></div>}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.noSeries}>{range === '1d' ? '당일 흐름을 받지 못했습니다.' : '불러오는 중…'}</div>
      )}
    </div>
  );
}
