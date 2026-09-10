'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import styles from './Intro.module.css';

/* 모션 최소화 설정은 렌더 중에 읽어야 오버레이를 아예 그리지 않는다.
   effect 안에서 setState로 끄면 한 프레임 깜빡이고, React 19에서
   "setState synchronously within an effect" 경고가 뜬다. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getMotionPreference = () => window.matchMedia(REDUCED_MOTION).matches;
const getServerMotionPreference = () => false;

/* 타이밍은 CSS 한 곳에서만 정한다.
   JS는 CSS 애니메이션 이벤트를 받아 스크롤 위치를 옮기고 오버레이를 정리한다.
   하드코딩한 타이머를 두면 CSS와 어긋나 애니메이션 중간에 화면이 뜯긴다. */
export default function Intro() {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getMotionPreference,
    getServerMotionPreference,
  );
  const [gone, setGone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const restore = useRef<() => void>(() => {});

  /* 하얀 화면에 덮여 있는 동안 「우리의 계절을 읽다」로 위치를 옮겨둔다. */
  const goSeason = useCallback(() => {
    const target = document.getElementById('season-journey');
    if (!target) return;
    /* offsetTop은 offsetParent 기준이라 문서 좌표로 다시 잰다. */
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: 'auto' });
  }, []);

  const finish = useCallback(() => {
    restore.current();
    setGone(true);
  }, []);

  const skip = useCallback(() => {
    restore.current();
    goSeason();
    setDismissed(true);
  }, [goSeason]);

  useEffect(() => {
    if (reducedMotion) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    restore.current = () => { html.style.overflow = prev; };
    window.scrollTo(0, 0);

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    window.addEventListener('keydown', onKey);

    /* 안전장치. 애니메이션 이벤트가 오지 않으면 스크롤이 잠긴 채 페이지가 죽는다.
       (배경 탭에서 애니메이션이 시작되지 않거나, animationend를 놓치는 경우)
       연출 전체 길이보다 훨씬 뒤라 정상 흐름에서는 이 타이머가 먼저 도달하지 않는다. */
    const failsafe = window.setTimeout(() => {
      restore.current();
      goSeason();
      setGone(true);
    }, 8000);

    return () => {
      window.clearTimeout(failsafe);
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prev;
    };
  }, [goSeason, reducedMotion, skip]);

  if (reducedMotion || gone) return null;

  /* CSS 모듈이 이름을 해시하지만 원래 이름이 접미사로 남는다. */
  const isFade = (name: string) => name.includes('overlayOut');

  return (
    <div
      className={`${styles.overlay}${dismissed ? ` ${styles.dismiss}` : ''}`}
      role="presentation"
      aria-hidden="true"
      onAnimationStart={e => {
        /* 스크롤 잠금을 먼저 풀어야 scrollTo가 먹는다. 오버레이가 아직 덮고 있어 이동은 보이지 않는다. */
        if (isFade(e.animationName)) { restore.current(); goSeason(); }
      }}
      onAnimationEnd={e => { if (isFade(e.animationName)) finish(); }}
      onTransitionEnd={e => { if (dismissed && e.propertyName === 'opacity') finish(); }}
    >
      <div className={styles.doors}>
        <div className={`${styles.panel} ${styles.left}`} />
        <div className={`${styles.panel} ${styles.right}`} />
        <span className={styles.seam} />
      </div>

      <div className={styles.line}>
        <p>
          우리의 계절에는<br />
          <em>스물네 가지</em> 맛이 있다.
        </p>
      </div>

      <span className={styles.mark}>一 年 二 十 四 味</span>

      <button type="button" className={styles.skip} onClick={skip}>
        건너뛰기 (ESC)
      </button>
    </div>
  );
}
