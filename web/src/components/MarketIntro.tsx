'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import intro from './Intro.module.css';
import styles from './Market.module.css';

/**
 * 빵장 대문 — 들어올 때 한옥 문이 열리고 "막지의 빵장이 시작했습니다." 뒤에 화면이 나온다.
 *
 * /season의 오프닝(Intro.tsx)과 같은 문·같은 CSS다. 문구만 다르다.
 * 본문은 서버에서 그대로 렌더한다(첫 HTML이 비면 안 된다). 대신 문이 걷히기 시작하는
 * 순간 본문의 key를 바꿔 다시 마운트한다 — 그래야 문 뒤에서 미리 끝나 있던 애니메이션이
 * 아니라, 문이 열리는 그 순간에 그래프가 그려지고 카드가 촤라락 올라온다.
 *
 * 건너뛰는 경우: URL에 해시가 있을 때(딥링크), 동작 줄이기 설정, 그리고 버튼·ESC.
 */

const OPEN_MS = 3400;   // 문 열림(.4s~1.95s) + 문구(1.35s~3.1s)
const FADE_MS = 650;

interface Props {
  children: ReactNode;
  theme: string;
  changePct: number;
}

export default function MarketIntro({ children, theme, changePct }: Props) {
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
    const skip = Boolean(window.location.hash) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setState(skip ? 'done' : 'playing'), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== 'playing') return;
    const overlay = dialog.current;
    if (!overlay) return;
    document.documentElement.style.overflow = 'hidden';
    if (!overlay.open) overlay.showModal();
    timers.current.push(window.setTimeout(() => { setState('exiting'); setRound(r => r + 1); }, OPEN_MS));
    timers.current.push(window.setTimeout(finish, OPEN_MS + FADE_MS));
    return () => { timers.current.forEach(window.clearTimeout); timers.current = []; };
  }, [state, finish]);

  const up = changePct >= 0;

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
                막지의 <em>빵장</em>이<br />시작했습니다.
                <span className={styles.introSub}>
                  오늘 국장 <b className={up ? styles.up : styles.down}>{up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%</b> · {theme}
                </span>
              </p>
            </div>
            <span className={intro.mark} aria-hidden="true">국 장 이 끝 나 면 , 빵 장</span>
          </div>
          {state === 'playing' && <button type="button" className={intro.skip} onClick={finish} autoFocus>건너뛰기 <span aria-hidden="true">↗</span></button>}
        </dialog>
      )}
    </>
  );
}
