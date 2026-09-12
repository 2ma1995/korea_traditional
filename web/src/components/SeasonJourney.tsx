'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SolarTerm } from '@/data/solarTerms';
import SeasonIngredientArt from '@/components/SeasonIngredientArt';
import styles from './SeasonJourney.module.css';

export interface JourneySeason {
  name: string;
  hanja: string;
  english: string;
  title: string;
  description: string;
  ingredients: string[];
  terms: SolarTerm[];
  defaultTerm: string;
}

interface Props {
  seasons: JourneySeason[];
  currentLongitude: number;
}

/** Enlarged term details need more vertical room in the stacked mobile layout.
 * Keep these breakpoints in sync with the unpinned layout in SeasonJourney.module.css. */
const SHORT_SCREEN = '(max-height: 619px), (max-width: 760px) and (max-height: 739px)';

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const round2 = (n: number) => Math.round(n * 100) / 100;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export default function SeasonJourney({ seasons, currentLongitude }: Props) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState(0);
  /* 눈금이 호를 따라 켜져야 하므로 진행도를 렌더에서 쓴다.
     rAF 안에서 갱신하되 0.005 단위로 끊어 불필요한 리렌더를 줄인다. */
  const [progress, setProgress] = useState(0);
  const [selection, setSelection] = useState<Record<number, number>>({});
  const season = seasons[chapter];
  const sweptIndex = Math.min(23, Math.floor(progress * 24));
  const indexInSeason = Math.max(0, Math.min(5, sweptIndex - chapter * 6));
  /* 버튼으로 직접 고른 절기. 없으면 스크롤이 열어준 절기를 쓴다. */
  const pickedTerm = season.terms.find(term => term.longitude === selection[sweptIndex]);
  const selectedTerm = pickedTerm ?? season.terms[indexInSeason];
  /* 호가 멈출 위치. 눈금 하나가 1/24이고 호는 12시에서 시계방향으로 채워지므로
     전체 순번 / 24 가 그 절기의 각도와 정확히 맞는다 (입춘=0 → 빈 호). */
  const selectedIndex = chapter * 6 + season.terms.indexOf(selectedTerm);
  /* 버튼을 눌렀을 때만 호를 그 절기로 옮긴다. 누르지 않았으면 rAF가 매 프레임 쓰는
     --journey-progress 를 그대로 써서 스크롤 중 호가 끊김 없이 이어진다. */
  const arcProgress = pickedTerm ? selectedIndex / 24 : progress;

  useEffect(() => {
    const element = root.current;
    const viewport = stage.current;
    if (!element || !viewport) return;

    const shortScreen = window.matchMedia(SHORT_SCREEN);
    let frame = 0;

    const update = () => {
      frame = 0;
      /* 낮은 화면에서는 긴 고정 섹션 대신 계절 버튼으로 직접 넘긴다. 스크롤은 건드리지 않는다.
         동작 줄이기 설정은 여기서 따지지 않는다 — 진행을 만드는 건 사용자의 스크롤이고,
         줄여야 할 움직임(전환 연출)은 CSS 쪽에서 끈다. */
      if (shortScreen.matches) return;
      const bounds = element.getBoundingClientRect();
      const distance = element.offsetHeight - viewport.offsetHeight;
      const next = clamp(-bounds.top / Math.max(1, distance));
      const nextChapter = Math.min(seasons.length - 1, Math.floor(next * seasons.length));
      element.style.setProperty('--journey-progress', String(next));
      element.style.setProperty('--dial-turn', `${next * 45}deg`);
      setChapter(previous => previous === nextChapter ? previous : nextChapter);
      setProgress(previous => (Math.abs(previous - next) < 0.005 ? previous : next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(element);
    resizeObserver.observe(viewport);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    shortScreen.addEventListener('change', schedule);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      shortScreen.removeEventListener('change', schedule);
    };
  }, [seasons.length]);

  const goToSeason = (index: number) => {
    const element = root.current;
    const viewport = stage.current;
    if (!element || !viewport) return;
    if (window.matchMedia(SHORT_SCREEN).matches) {
      const filled = (index + 1) / seasons.length;
      element.style.setProperty('--journey-progress', String(filled));
      setProgress(filled);
      setChapter(index);
      return;
    }
    const distance = element.offsetHeight - viewport.offsetHeight;
    // Land inside the chapter, avoiding a floating-point boundary at its start.
    const progress = (index + 0.12) / seasons.length;
    // behavior는 넘기지 않는다 — globals.css가 동작 줄이기에서 smooth를 끄는 것까지 따라간다.
    window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top + distance * progress });
  };

  const allTerms = seasons.flatMap(item => item.terms);

  return (
    <section ref={root} id="season-journey" className={styles.journey} aria-label="스크롤로 만나는 스물네 절기">
      <div ref={stage} className={styles.stage} data-season={chapter} style={{ '--chapter-progress': String((chapter + 1) / seasons.length) } as CSSProperties}>
        <div className={styles.grain} aria-hidden="true" />
        <div className={styles.stageInner}>
          <div className={styles.topline}>
            <span>二十四節氣 <span className={styles.toplineDivider}>/</span> 우리의 계절을 읽다</span>
            <a href="#today-market">오늘의 코스피로 건너뛰기 <span aria-hidden="true">↘</span></a>
          </div>

          <div className={styles.scene}>
            <div className={styles.copy}>
              <span className={styles.kicker}>CHAPTER 0{chapter + 1} <span /> {season.english}</span>
              <h2 key={`title-${chapter}`} className={styles.chapterTitle}>{season.title.split('\n').map((line, index) => <span key={line}>{index === 0 ? <em>{line}</em> : line}</span>)}</h2>
              <p key={`description-${chapter}`} className={styles.description}>{season.description}</p>
              <div className={styles.ingredientList} aria-label={`${season.name}의 재료`}>
                <span>계절의 맛</span>
                {season.ingredients.map(ingredient => <strong key={ingredient}>{ingredient}</strong>)}
              </div>

              <div className={styles.termExplorer}>
                <p>스크롤하면 절기가 차례로 열립니다. 눌러서 먼저 볼 수도 있어요.</p>
                <div className={styles.termButtons} aria-label={`${season.name}의 여섯 절기`}>
                  {season.terms.map(term => <button
                    type="button"
                    key={term.longitude}
                    aria-pressed={term.longitude === selectedTerm.longitude}
                    aria-controls="journey-term-detail"
                    onClick={() => setSelection(previous => ({ ...previous, [sweptIndex]: term.longitude }))}
                  >{term.ko}{term.longitude === currentLongitude && <span className={styles.todayDot} aria-label="오늘의 절기" />}</button>)}
                </div>
                <div id="journey-term-detail" className={styles.termDetail}>
                  <div><strong>{selectedTerm.ko} <span>{selectedTerm.hanja}</span></strong><span>{String(selectedTerm.month).padStart(2, '0')}.{String(selectedTerm.day).padStart(2, '0')}</span></div>
                  <p>{selectedTerm.food}</p>
                  <span className={styles.pairing}>막지 페어링 아이디어 <b>{selectedTerm.productIdea}</b></span>
                </div>
              </div>
            </div>

            <div className={styles.calendar} aria-hidden="true">
              <div className={styles.calendarHalo} />
              <svg className={styles.calendarFace} viewBox="0 0 600 600" fill="none">
                <circle cx="300" cy="300" r="281" className={styles.outerRing} />
                <circle cx="300" cy="300" r="203" className={styles.innerRing} />
                <circle cx="300" cy="300" r="191" className={styles.innerRing} />
                {/* pathLength=1 로 두면 stroke-dasharray를 0~1 진행도로 그대로 쓸 수 있다.
                    12시에서 시작해 시계방향으로 채워지고, 눈금 순서(입춘→대한)와 맞는다. */}
                <circle cx="300" cy="300" r="235" className={styles.seasonArcTrack} pathLength={1} transform="rotate(-90 300 300)" />
                <circle
                  cx="300" cy="300" r="235"
                  className={styles.seasonArc}
                  pathLength={1}
                  transform="rotate(-90 300 300)"
                  style={pickedTerm ? ({ '--arc-progress': String(round4(arcProgress)) } as CSSProperties) : undefined}
                />
                {allTerms.map((term, index) => {
                  const angle = (index * 15 - 90) * Math.PI / 180;
                  /* 호가 이 눈금을 지났으면 켠다. 채워지는 그래프와 절기 이름이 같이 움직인다. */
                  const swept = (index + 1) / allTerms.length <= arcProgress + 0.001;
                  const active = swept || Math.floor(index / 6) === chapter;
                  /* 절기 버튼으로 고른 절기. 왼쪽 상세와 달력이 같은 절기를 가리켜야 하므로
                     스크롤 상태(swept/active)보다 선택을 우선해 표시한다. */
                  const selected = term.longitude === selectedTerm.longitude;
                  /* Math.cos/sin의 마지막 자리가 Node와 브라우저에서 달라 hydration이 깨진다. 반올림해서 문자열을 일치시킨다. */
                  const px = (radius: number) => round2(300 + Math.cos(angle) * radius);
                  const py = (radius: number) => round2(300 + Math.sin(angle) * radius);
                  return <g key={term.longitude} className={selected ? styles.selectedTick : swept ? styles.sweptTick : active ? styles.activeTick : styles.tick}>
                    <line x1={px(207)} y1={py(207)} x2={px(222)} y2={py(222)} />
                    <text x={px(255)} y={py(255)} textAnchor="middle" dominantBaseline="central">{term.ko}</text>
                    {term.longitude === currentLongitude && <circle cx={px(278)} cy={py(278)} r="3" />}
                    {/* 다이얼 위에 찍히는 표시 — 호(r=235)와 같은 반지름에 놓아 눈금을 가리키는 핀처럼 읽힌다 */}
                    {selected && <circle className={styles.selectedMark} cx={px(235)} cy={py(235)} r="5.5" />}
                  </g>;
                })}
              </svg>
              <SeasonIngredientArt season={chapter} />
              <div className={styles.calendarCenter}>
                <span className={styles.centerLabel}>계절의 문을 열다</span>
                <span key={season.hanja} className={styles.seasonCharacter}>{season.hanja}</span>
                <span className={styles.centerTerm}>{selectedTerm.ko} <i>·</i> {selectedTerm.hanja}</span>
                <span className={styles.centerSeal}>막지<br />절기</span>
              </div>
              <span className={styles.calendarFootnote}>해의 길을 따라, 한 해를 스물넷으로.</span>
            </div>
          </div>

          <div className={styles.bottomline}>
            <div className={styles.chapterNav} aria-label="계절 바로가기">
              {seasons.map((item, index) => <button type="button" key={item.name} onClick={() => goToSeason(index)} aria-pressed={chapter === index}><span>0{index + 1}</span>{item.name}</button>)}
            </div>
            <div className={styles.scrollHint}><span className={styles.scrollLine} /> 스크롤하면 다음 계절이 펼쳐집니다</div>
            <Link href="/archive" className={styles.archiveLink}>절기 기록장 <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
        <div className={styles.progressTrack} aria-hidden="true"><span style={{ '--chapter-progress': `${(chapter + 1) / 4}` } as CSSProperties} /></div>
      </div>
    </section>
  );
}
