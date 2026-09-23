'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './KospiQuote.module.css';

/**
 * 오늘의 코스피 — 1초 주기 실시간 시세.
 *
 * 서버에서 받은 스냅샷으로 첫 화면을 그리고(그래야 첫 페인트에 숫자가 비지 않는다),
 * 이후에는 /api/kospi를 1초마다 불러 숫자만 교체한다. router.refresh()로 페이지를
 * 다시 그리지 않으므로 스크롤·절기 연출·펼쳐둔 설명이 그대로 유지된다.
 *
 * 응답이 실패하면 아무것도 하지 않고 마지막 값을 유지한다. 네트워크가 잠깐
 * 끊겨도 화면에 "—"가 뜨거나 샘플 값으로 튀지 않는다.
 *
 * 호출량 관리 — 비공식 엔드포인트라 많이 부르면 차단될 수 있다. 세 겹으로 막는다.
 *   ① 탭이 안 보이면 폴링 정지 (document.hidden)
 *   ② 장이 닫히면 폴링 정지 (하루 17시간이 여기 해당). 탭으로 돌아올 때 재확인
 *   ③ 서버가 네이버 호출을 1초 캐시로 공유 (market.ts) — 접속자가 늘어도
 *      네이버 호출은 초당 1회로 고정된다. ③이 없으면 탭 수만큼 곱해진다.
 */

/** 장중 폴링 주기 */
const POLL_MS = 1000;
/** 응답이 이 시간을 넘기면 포기한다. 멈춘 요청이 폴링을 막지 않게 한다 */
const POLL_TIMEOUT_MS = 5000;

export interface KospiView {
  value: number;
  changePct: number;
  live: boolean;
  /** 네이버 marketStatus 기준 개장 여부. Yahoo 폴백이면 null(모름) */
  marketOpen: boolean | null;
  /** 이 값이 찍힌 시각(epoch ms). 휴장일에 "9/23(수) 종가"로 기준일을 밝힌다 */
  updatedAt?: number | null;
}

/**
 * 배지 — 지금 장이 열려 있는지 보여준다.
 *
 * 개장 여부는 네이버가 알려준다. Yahoo로 폴백하면 알 수 없으므로(null)
 * 장 상태를 단정하지 않고 데이터 출처만 밝힌다. 시계로 추정하면
 * 공휴일·임시휴장에 틀린 말을 하게 된다.
 */
function badgeOf({ live, marketOpen }: KospiView) {
  if (!live) return { label: '샘플 데이터', tone: 'sample' as const };
  if (marketOpen === true) return { label: '장중', tone: 'open' as const };
  if (marketOpen === false) return { label: '장 마감', tone: 'closed' as const };
  return { label: '시장 데이터', tone: 'open' as const };
}

const fmt = (value: number) =>
  value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * compact — 상태바 한 줄용. "KOSPI 3,214.52 ▲0.85% [장 마감]".
 * 폴링 로직은 같고 그리는 모양만 다르다. 두 곳에서 각각 폴링하면 호출이 두 배라
 * 컴포넌트를 나누지 않고 모드로 가른다.
 */
export default function KospiQuote({ initial, compact = false }: { initial: KospiView; compact?: boolean }) {
  const [quote, setQuote] = useState<KospiView>(initial);

  // 값이 움직인 순간에만 잠깐 색을 준다. seq가 바뀔 때 key로 애니메이션을 다시 태운다.
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; seq: number } | null>(null);
  const lastValue = useRef(initial.value);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

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
            setQuote({
              value: next.value,
              changePct: next.changePct,
              live: next.live,
              marketOpen: typeof next.marketOpen === 'boolean' ? next.marketOpen : null,
            });

            // 장이 닫혔으면 폴링을 멈춘다. 종가는 더 움직이지 않으므로
            // 계속 부르는 건 전부 낭비다 (하루 17시간이 여기 해당한다).
            // 탭으로 돌아올 때 다시 확인하므로 개장 후에도 복귀할 수 있다.
            if (next.marketOpen === false && timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        }
      } catch {
        // 폴링 실패는 조용히 넘긴다 — 마지막 값을 그대로 둔다
      } finally {
        inFlight = false;
      }
    };

    const start = () => { if (!timer) timer = setInterval(tick, POLL_MS); };

    // 페이지 캐시(1분) 때문에 서버 스냅샷이 오래됐을 수 있어 즉시 한 번 맞춘다
    tick();
    start();

    // 탭이 백그라운드면 쉬고, 돌아오면 다시 확인한다.
    // 장 마감으로 멈춘 폴링도 여기서 되살아나므로, 개장 시간에 탭으로 돌아오면
    // 초단위 갱신이 다시 붙는다.
    const onVisible = () => {
      if (document.hidden) return;
      start();
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const up = quote.changePct >= 0;
  const badge = badgeOf(quote);

  if (compact) {
    return (
      <span className={styles.compact}>
        <b>KOSPI</b>
        <strong
          key={flash?.seq ?? 'init'}
          className={flash ? (flash.dir === 'up' ? styles.tickUp : styles.tickDown) : ''}
        >{fmt(quote.value)}</strong>
        <span className={up ? styles.up : styles.down}>
          {up ? '▲' : '▼'}{Math.abs(quote.changePct).toFixed(2)}%
        </span>
        <span className={styles.marketBadge} data-tone={badge.tone}>
          {badge.tone === 'open' && <i className={styles.pulse} aria-hidden="true" />}
          {badge.label}
        </span>
      </span>
    );
  }

  return (
    <>
      <div className={styles.quoteHeader}>
        <span>
          오늘의 코스피 <b>KOSPI</b>
        </span>
        <span className={styles.marketBadge} data-tone={badge.tone}>
          {badge.tone === 'open' && <i className={styles.pulse} aria-hidden="true" />}
          {badge.label}
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
