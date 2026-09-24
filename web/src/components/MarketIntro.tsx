'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import intro from './Intro.module.css';
import styles from './Market.module.css';

/**
 * 빵장 대문 — 들어올 때 한옥 문이 열리고, 지금이 어느 때인지 말한 뒤 화면이 나온다.
 *
 * 옛 /season의 오프닝(old/web/src/components/Intro.tsx)과 같은 문·같은 CSS다. 문구만 다르다.
 * 본문은 서버에서 그대로 렌더한다(첫 HTML이 비면 안 된다). 대신 문이 걷히기 시작하는
 * 순간 본문의 key를 바꿔 다시 마운트한다 — 그래야 문 뒤에서 미리 끝나 있던 애니메이션이
 * 아니라, 문이 열리는 그 순간에 그래프가 그려지고 카드가 촤라락 올라온다.
 *
 * 문구는 phase를 따라간다. 장중에 "시작했습니다"라고 하면 3.4초 뒤 본문이
 * "지금 예상되는"이라고 말을 바꿔서, 첫인상에서 앞뒤가 안 맞는다.
 *
 * 건너뛰는 경우: URL에 해시가 있을 때(딥링크), 동작 줄이기 설정, 오늘 이미 본 경우,
 * 그리고 버튼·ESC. 매일 오는 서비스라 같은 날 재방문까지 문을 열면 방해가 된다.
 */

const OPEN_MS = 3400;   // 문 열림(.4s~1.95s) + 문구(1.35s~3.1s)
const FADE_MS = 650;
const SEEN_KEY = 'makji.intro.seenOn';

/** KST 기준 오늘 날짜(YYYY-MM-DD). 날이 바뀌면 새 장이니 문을 다시 연다 */
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const seenToday = () => { try { return localStorage.getItem(SEEN_KEY) === kstDay(); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, kstDay()); } catch { /* 시크릿 모드 — 매번 보여준다 */ } };

type Phase = 'live' | 'locked' | 'open' | 'closed';

interface Props {
  children: ReactNode;
  phase: Phase;
  theme: string;
  changePct: number;
  /** 오늘 할인 폭 (0.2 = 20%) */
  rate: number;
  /** 빵장 개장 시각 "20:00" */
  openAt: string;
}

export default function MarketIntro({ children, phase, theme, changePct, rate, openAt }: Props) {
  const [state, setState] = useState<'idle' | 'playing' | 'exiting' | 'done'>('idle');
  /* 본문 리마운트 키 — 문이 걷히기 시작할 때 한 번 올린다 */
  const [round, setRound] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const timers = useRef<number[]>([]);

  const finish = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    if (dialog.current?.open) dialog.current.close();
    document.documentElement.style.overflow = '';
    setState(prev => { if (prev === 'playing') setRound(r => r + 1); return 'done'; });
  }, []);

  useEffect(() => {
    const skip = Boolean(window.location.hash) || window.matchMedia('(prefers-reduced-motion: reduce)').matches || seenToday();
    const t = window.setTimeout(() => setState(skip ? 'done' : 'playing'), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state === 'exiting') {
      const timer = window.setTimeout(finish, FADE_MS);
      return () => clearTimeout(timer);
    }
    if (state !== 'playing') return;
    const overlay = dialog.current;
    if (!overlay) return;
    document.documentElement.style.overflow = 'hidden';
    if (!overlay.open) overlay.showModal();
    markSeen();   // 재생을 시작한 시점에 기록한다 — 보는 중에 새로고침해도 다시 열리지 않게
    timers.current.push(window.setTimeout(() => { setState('exiting'); setRound(r => r + 1); }, OPEN_MS));
    return () => { timers.current.forEach(window.clearTimeout); timers.current = []; };
  }, [state, finish]);

  const up = changePct >= 0;
  const pct = <b className={up ? styles.up : styles.down}>{up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%</b>;

  /* 지금이 어느 때인가. 'open'만 원래 문구 그대로다 */
  const script: Record<Phase, { head: ReactNode; sub: ReactNode; mark: string }> = {
    live: {
      head: <>막지의 <em>빵장</em>이<br />준비 중입니다.</>,
      sub: <>국장 {pct} 진행 중 · <b>15:30에 오늘의 빵이 정해집니다</b></>,
      mark: '국 장 이 끝 나 면 , 빵 장',
    },
    locked: {
      head: <>오늘의 <em>국장</em>이<br />닫혔습니다.</>,
      sub: <>{pct} 확정 · {theme} · <b>{openAt} 빵장 개장</b></>,
      mark: '오 늘 의 빵 이 정 해 졌 다',
    },
    open: {
      head: <>막지의 <em>빵장</em>이<br />시작했습니다.</>,
      sub: <>오늘 국장 {pct} · {theme} · 기본 할인 {Math.round(rate * 100)}%</>,
      mark: '국 장 이 끝 나 면 , 빵 장',
    },
    closed: {
      head: <>오늘 <em>빵장</em>은<br />문을 닫았습니다.</>,
      sub: <>어제 국장 {pct} · <b>다음 거래일 {openAt}</b>에 다시 열립니다</>,
      mark: '내 일 , 다 시',
    },
  };
  const say = script[phase];

  return (
    <>
      {/* 본문은 항상 있다(SSR). 문이 걷히기 시작할 때 key가 바뀌어 애니메이션이 그때 시작된다 */}
      <div key={round} aria-hidden={state === 'playing'}>{children}</div>
      {(state === 'playing' || state === 'exiting') && (
        <dialog
          ref={dialog}
          className={intro.overlay}
          data-phase="opening"
          data-exiting={state === 'exiting'}
          aria-label="빵장 오프닝"
          onCancel={event => { event.preventDefault(); finish(); }}
        >
          <div className={intro.openingScene} data-active="true">
            <div className={intro.doors} aria-hidden="true">
              <div className={`${intro.panel} ${intro.left}`} />
              <div className={`${intro.panel} ${intro.right}`} />
              <span className={intro.seam} />
            </div>
            <div className={intro.line}>
              <p>
                {say.head}
                <span className={styles.introSub}>{say.sub}</span>
              </p>
            </div>
            <span className={intro.mark} aria-hidden="true">{say.mark}</span>
          </div>
          {state === 'playing' && <button type="button" className={intro.skip} onClick={finish} autoFocus>건너뛰기 <span aria-hidden="true">↗</span></button>}
        </dialog>
      )}
    </>
  );
}
