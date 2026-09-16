'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 내 종목 실시간 시세.
 *
 * 장중엔 5초마다 /api/quote를 불러 내 빵값이 뛰는 걸 보여준다. 증권 앱이
 * 살아 보이는 이유는 숫자가 움직이기 때문이고, 15:30 이후엔 아무것도 안 움직여서
 * 화면이 죽어 보였다. 장이 닫히면(marketOpen === false) 폴링을 멈추고,
 * 탭으로 돌아올 때 한 번 다시 확인한다 — KospiQuote와 같은 규칙이다.
 *
 * 서버가 종목당 5초 캐시를 물고 있어 접속자가 늘어도 외부 호출은 종목당 5초에 1회다.
 */

export interface LiveQuote {
  value: number;
  changePct: number;
  /** 오늘 5분봉 종가. 스파크라인용 */
  series: number[];
  /** 한국 증시 개장 여부. 모르면 null */
  marketOpen: boolean | null;
}

export interface Flash { dir: 'up' | 'down'; seq: number }

const POLL_MS = 5000;
const TIMEOUT_MS = 6000;

export function useLiveQuote(symbol: string | null): { quote: LiveQuote | null; flash: Flash | null } {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    last.current = null;

    const tick = async () => {
      if (inFlight || !alive || document.hidden) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, {
          cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const json = await res.json();
        if (!alive || !json?.ok) return;

        if (last.current !== null && json.changePct !== last.current) {
          const dir = json.changePct > last.current ? 'up' : 'down';
          setFlash(prev => ({ dir, seq: (prev?.seq ?? 0) + 1 }));
        }
        last.current = json.changePct;
        setQuote({
          value: json.value,
          changePct: json.changePct,
          series: Array.isArray(json.series) ? json.series : [],
          marketOpen: typeof json.marketOpen === 'boolean' ? json.marketOpen : null,
        });
        /* 장이 닫혔으면 멈춘다. 종가는 더 안 움직인다 */
        if (json.marketOpen === false && timer) { clearInterval(timer); timer = null; }
      } catch {
        /* 마지막 값을 유지한다 */
      } finally {
        inFlight = false;
      }
    };

    const start = () => { if (!timer) timer = setInterval(tick, POLL_MS); };
    tick();
    start();

    const onVisible = () => { if (!document.hidden) { start(); tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [symbol]);

  return { quote: symbol ? quote : null, flash };
}
