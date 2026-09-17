'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * KOSPI LIVE — 히어로가 쓰는 단일 폴러.
 *
 * 장중엔 다섯이 같이 움직여야 '라이브'로 읽힌다: 점이 뛰고, 숫자가 굴러가고,
 * 선 끝이 이어지고, 아래 틱이 흐르고, 방향이 바뀌면 "지금 마감한다면" 라인이 바뀐다.
 * 그 재료를 한 곳에서 만든다. KospiQuote가 따로 폴링하던 것을 여기로 모았다 —
 * 같은 화면에서 둘이 각각 부르면 네이버 호출이 두 배다.
 *
 *   /api/kospi         1초 (장중·탭 보일 때). 값이 바뀔 때만 틱을 남긴다
 *   /api/kospi/series  60초. 5분봉이 새로 생기면 선이 한 칸 늘어난다
 *
 * 장이 닫히면(marketOpen === false) 둘 다 멈춘다. 탭으로 돌아올 때 한 번 다시 확인한다.
 */

export interface Tick { t: string; v: number; dir: 'up' | 'down' }
/** 당일 분봉 한 점 — t는 epoch 초(KST 기준 시각), v는 지수 */
export interface Point { t: number; v: number }

export interface KospiLive {
  value: number;
  changePct: number;
  marketOpen: boolean | null;
  live: boolean;
  points: Point[];
  ticks: Tick[];
  /** 값이 바뀔 때마다 +1. 숫자 롤링 애니메이션 키 */
  seq: number;
  dir: 'up' | 'down' | null;
}

/* 30초 — 매초 굴러가는 숫자는 정신없다는 지적. 장중 코스피는 30초에 한 번 바뀐다 */
const TICK_MS = 30_000, SERIES_MS = 60_000, TIMEOUT_MS = 5000, KEEP = 10;
const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function useKospiLive(initial: Omit<KospiLive, 'ticks' | 'seq' | 'dir'>): KospiLive {
  const [state, setState] = useState<KospiLive>({ ...initial, ticks: [], seq: 0, dir: null });
  const last = useRef(initial.value);

  useEffect(() => {
    let alive = true, inFlight = false;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let seriesTimer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (inFlight || !alive || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch('/api/kospi', { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return;
        const next = await res.json();
        if (!alive || next?.ok !== true || typeof next.value !== 'number') return;
        const changed = next.value !== last.current;
        const dir: 'up' | 'down' | null = changed ? (next.value > last.current ? 'up' : 'down') : null;
        last.current = next.value;
        setState(prev => {
          /* 마지막 분봉의 값만 갈아끼운다 — 새 분이 되면 60초 폴링이 점을 추가한다 */
          const points = prev.points.length
            ? [...prev.points.slice(0, -1), { ...prev.points[prev.points.length - 1], v: next.value }]
            : prev.points;
          const ticks = changed && dir ? [{ t: clock.format(new Date()), v: next.value, dir }, ...prev.ticks].slice(0, KEEP) : prev.ticks;
          return {
            ...prev, value: next.value, changePct: next.changePct, live: next.live,
            marketOpen: typeof next.marketOpen === 'boolean' ? next.marketOpen : null,
            points, ticks, seq: changed ? prev.seq + 1 : prev.seq, dir: dir ?? prev.dir,
          };
        });
        if (next.marketOpen === false) stop();
      } catch { /* 마지막 값 유지 */ } finally { inFlight = false; }
    };

    const pullSeries = async () => {
      if (!alive || document.hidden) return;
      try {
        const res = await fetch('/api/kospi/series', { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
        const json = await res.json();
        if (alive && json?.ok && Array.isArray(json.points) && json.points.length) setState(prev => ({ ...prev, points: json.points }));
      } catch { /* */ }
    };

    const start = () => {
      if (!tickTimer) tickTimer = setInterval(tick, TICK_MS);
      if (!seriesTimer) seriesTimer = setInterval(pullSeries, SERIES_MS);
    };
    const stop = () => {
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      if (seriesTimer) { clearInterval(seriesTimer); seriesTimer = null; }
    };

    tick(); start();
    const onVisible = () => { if (!document.hidden) { start(); tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return state;
}
