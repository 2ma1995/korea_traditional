'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/app/landing.module.css';

/**
 * 오늘의 코스피 — 1초 주기 실시간 시세.
 *
 * 서버에서 받은 스냅샷으로 첫 화면을 그리고(그래야 첫 페인트에 숫자가 비지 않는다),
 * 이후에는 /api/kospi를 1초마다 불러 숫자만 교체한다. router.refresh()로 페이지를
 * 다시 그리지 않으므로 스크롤·절기 연출·펼쳐둔 설명이 그대로 유지된다.
 *
 * 응답이 실패하면 아무것도 하지 않고 마지막 값을 유지한다. 네트워크가 잠깐
 * 끊겨도 화면에 "—"가 뜨거나 샘플 값으로 튀지 않는다.
 */

const POLL_MS = 1000;
/** 응답이 이 시간을 넘기면 포기한다. 멈춘 요청이 폴링을 막지 않게 한다 */
const POLL_TIMEOUT_MS = 5000;

export interface KospiView {
  value: number;
  changePct: number;
  live: boolean;
}

const fmt = (value: number) =>
  value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function KospiQuote({ initial }: { initial: KospiView }) {
  const [quote, setQuote] = useState<KospiView>(initial);

  // 값이 움직인 순간에만 잠깐 색을 준다. seq가 바뀔 때 key로 애니메이션을 다시 태운다.
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; seq: number } | null>(null);
  const lastValue = useRef(initial.value);

  useEffect(() => {
    let alive = true;
    let inFlight = false;

    const tick = async () => {
      // 이전 요청이 아직 안 끝났으면 건너뛴다. 요청이 쌓이면 서버가 느릴 때
      // 오래된 응답이 뒤늦게 도착해 숫자가 거꾸로 튄다.
      if (inFlight || !alive || document.hidden) return;
      inFlight = true;

      try {
        const res = await fetch('/api/kospi', {
          cache: 'no-store',
          signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
        });
        if (res.ok) {
          const next = await res.json();
          if (alive && next?.ok === true && typeof next.value === 'number') {
            if (next.value !== lastValue.current) {
              const dir = next.value > lastValue.current ? 'up' : 'down';
              lastValue.current = next.value;
              setFlash(prev => ({ dir, seq: (prev?.seq ?? 0) + 1 }));
            }
            setQuote({ value: next.value, changePct: next.changePct, live: next.live });
          }
        }
      } catch {
        // 폴링 실패는 조용히 넘긴다 — 마지막 값을 그대로 둔다
      } finally {
        inFlight = false;
      }
    };

    // 페이지 캐시(1분) 때문에 서버 스냅샷이 오래됐을 수 있어 즉시 한 번 맞춘다
    tick();
    const id = setInterval(tick, POLL_MS);

    // 탭이 백그라운드면 폴링을 쉬고, 돌아오면 바로 최신값으로 맞춘다
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const up = quote.changePct >= 0;

  return (
    <>
      <div className={styles.quoteHeader}>
        <span>
          오늘의 코스피 <b>KOSPI</b>
        </span>
        <span className={quote.live ? styles.liveBadge : styles.sampleBadge}>
          {quote.live ? '시장 데이터' : '샘플 데이터'}
        </span>
      </div>

      <strong
        key={flash?.seq ?? 'init'}
        className={`${styles.indexValue} ${
          flash ? (flash.dir === 'up' ? styles.tickUp : styles.tickDown) : ''
        }`}
        aria-live="off"
      >
        {fmt(quote.value)}
      </strong>

      <span className={`${styles.indexChange} ${up ? styles.up : styles.down}`}>
        {up ? '▲' : '▼'} {Math.abs(quote.changePct).toFixed(2)}% <small>전일 대비</small>
      </span>
    </>
  );
}
