'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import WeatherScene from '@/components/WeatherScene';
import { SEASON_STORIES } from '@/data/seasonStories';
import { INTRO_REPLAY } from '@/lib/introReplay';
import styles from './Intro.module.css';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const OPENING_MS = 3750;
const SEASON_MS = 2200;
const FADE_MS = 650;
/* 동작 줄이기 — 연출을 걷어내면 기다릴 이유도 없다. 장면만 차례로 넘기고 짧게 끝낸다. */
const STATIC_OPENING_MS = 1600;
const STATIC_SEASON_MS = 1100;

function subscribeToPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/* 새로고침할 때마다 처음부터 재생한다.
   건너뛰는 경우는 #앵커로 들어온 딥링크 하나뿐이다.
   동작 줄이기 설정에서는 건너뛰지 않는다 — 움직임만 빼고 장면은 그대로 보여준다.
   (세션당 1회로 제한하려면 sessionStorage 플래그를 여기서 확인하면 된다) */
function getSkipPreference() {
  return Boolean(window.location.hash);
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION).matches;
}

/** The opening is temporary; the scrollable calendar remains above the market. */
export default function Intro() {
  const skipPreference = useSyncExternalStore(subscribeToPreference, getSkipPreference, () => true);
  const reducedMotion = useSyncExternalStore(subscribeToPreference, getReducedMotion, () => false);
  const [replays, setReplays] = useState(0);
  /* 로고를 누르면 딥링크 해시가 남아 있든 이미 한 번 봤든 무조건 재생한다.
     동작 줄이기 설정은 requestIntroReplay가 먼저 걸러내므로 여기선 따지지 않는다. */
  const shouldSkip = replays === 0 && skipPreference;
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState(-1);
  const [exiting, setExiting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timers = useRef<number[]>([]);
  const restoreScroll = useRef<() => void>(() => {});

  const moveToMarket = useCallback(() => {
    restoreScroll.current();
    const target = document.getElementById('today-market');
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
  }, []);

  const finish = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    moveToMarket();
    dialog.current?.close();
    setDone(true);
    document.getElementById('market-title')?.focus({ preventScroll: true });
  }, [moveToMarket]);

  /* 헤더 로고가 보내는 재생 신호. 랜딩에 머문 채로 눌렀을 때만 온다 —
     다른 페이지에서는 '/'로 이동하면서 새로 마운트되어 알아서 재생된다. */
  useEffect(() => {
    const replay = () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      setPhase(-1);
      setExiting(false);
      setDone(false);
      setReplays(count => count + 1);
    };
    window.addEventListener(INTRO_REPLAY, replay);
    return () => window.removeEventListener(INTRO_REPLAY, replay);
  }, []);

  useEffect(() => {
    const overlay = dialog.current;
    if (shouldSkip || done || !overlay) return;

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    let restored = false;
    html.style.overflow = 'hidden';
    restoreScroll.current = () => {
      if (restored) return;
      html.style.overflow = previousOverflow;
      restored = true;
    };
    overlay.showModal();

    const schedule = (callback: () => void, delay: number) => {
      timers.current.push(window.setTimeout(callback, delay));
    };
    // 동작 줄이기에서는 장면이 즉시 바뀌므로 머무는 시간만 짧게 가져간다.
    const openingMs = reducedMotion ? STATIC_OPENING_MS : OPENING_MS;
    const seasonMs = reducedMotion ? STATIC_SEASON_MS : SEASON_MS;
    SEASON_STORIES.forEach((_, index) => schedule(() => setPhase(index), openingMs + index * seasonMs));
    const endingAt = openingMs + SEASON_STORIES.length * seasonMs;
    schedule(() => {
      // Reposition while the winter scene still covers the page, then reveal KOSPI.
      moveToMarket();
      setExiting(true);
    }, endingAt);
    schedule(finish, endingAt + (reducedMotion ? 0 : FADE_MS));

    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      restoreScroll.current();
      if (overlay.open) overlay.close();
    };
  }, [shouldSkip, done, reducedMotion, moveToMarket, finish]);

  if (shouldSkip || done) return null;

  return (
    <dialog
      ref={dialog}
      className={styles.overlay}
      data-phase={phase < 0 ? 'opening' : SEASON_STORIES[phase].english.toLowerCase()}
      data-exiting={exiting}
      aria-label="막지의 사계절 오프닝"
      onCancel={event => { event.preventDefault(); finish(); }}
    >
      <div className={styles.openingScene} data-active={phase < 0} aria-hidden={phase >= 0}>
        <div className={styles.doors} aria-hidden="true">
          <div className={`${styles.panel} ${styles.left}`} />
          <div className={`${styles.panel} ${styles.right}`} />
          <span className={styles.seam} />
        </div>
        <div className={styles.line}><p>우리의 계절에는<br /><em>스물네 가지</em> 맛이 있다.</p></div>
        <span className={styles.mark} aria-hidden="true">一 年 二 十 四 味</span>
      </div>
      {SEASON_STORIES.map((season, index) => <WeatherScene key={season.name} season={season} index={index} active={phase === index} />)}
      <button type="button" className={styles.skip} onClick={finish} autoFocus>건너뛰고 혜택 보기 <span aria-hidden="true">↗</span></button>
    </dialog>
  );
}
