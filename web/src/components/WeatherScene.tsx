import type { CSSProperties } from 'react';
import type { SeasonStory } from '@/data/seasonStories';
import styles from './WeatherScene.module.css';

const weatherNames = ['petals', 'rain', 'leaves', 'snow'] as const;
const particleCounts = [30, 64, 24, 58];

/** Deterministic positions keep server and browser markup identical. */
function particleStyle(index: number, season: number): CSSProperties {
  const seed = (index * 37 + season * 17) % 101;
  const duration = season === 1 ? 0.9 + (index % 6) * 0.16 : 9 + (index % 8) * 1.35;
  return {
    '--x': `${seed}%`,
    '--duration': `${duration.toFixed(2)}s`,
    '--delay': `${(-((index * 13) % 97) / 97 * duration).toFixed(2)}s`,
    '--size': `${season === 3 ? 3 + index % 5 : 12 + index % 15}px`,
    '--drift': `${(index % 2 ? 1 : -1) * (40 + index % 7 * 18)}px`,
    '--turn': `${index * 43 % 360}deg`,
    '--alpha': (0.3 + index % 5 * 0.1).toFixed(2),
  } as CSSProperties;
}

function Weather({ season }: { season: number }) {
  return (
    <div className={`${styles.weather} ${styles[weatherNames[season]]}`} aria-hidden="true">
      <div className={styles.light} />
      <div className={styles.landscape} />
      {season === 0 && (
        <svg className={styles.blossomBranch} viewBox="0 0 520 500" fill="none">
          <g stroke="#796958" strokeLinecap="round">
            <path d="M-30 370C75 299 92 186 236 150C294 136 354 94 405 12" strokeWidth="7" />
            <path d="M78 278C76 214 68 147 110 92M191 166C251 195 307 178 342 159M283 130C279 91 295 47 305 23" strokeWidth="3" />
          </g>
          {[[106, 101], [85, 199], [184, 169], [247, 145], [302, 55], [351, 89], [335, 166], [396, 26]].map(([x, y], index) => (
            <g key={index} transform={`translate(${x} ${y}) rotate(${index * 27})`}>
              {[0, 72, 144, 216, 288].map(angle => <ellipse key={angle} cy="-11" rx="8" ry="13" fill={index % 2 ? '#eac2c3' : '#efd1cf'} transform={`rotate(${angle})`} />)}
              <circle r="4" fill="#bb9278" />
            </g>
          ))}
        </svg>
      )}
      {season === 1 && <div className={styles.summerCanopy}>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--leaf-index': i } as CSSProperties} />)}</div>}
      {Array.from({ length: particleCounts[season] }, (_, index) => (
        <span className={styles.particle} key={index} style={particleStyle(index, season)}><i /></span>
      ))}
      {season === 1 && <div className={styles.ripples}>{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ '--x': `${8 + i * 14}%`, '--delay': `${-i * 0.43}s` } as CSSProperties} />)}</div>}
      <div className={styles.paperVeil} />
    </div>
  );
}


export default function WeatherScene({ season, index, active }: { season: SeasonStory; index: number; active: boolean }) {
  return (
    <div className={styles.scene} data-weather={weatherNames[index]} data-active={active} aria-hidden={!active}>
      <Weather season={index} />
      <div className={styles.copy}>
        <span className={styles.seasonLabel}>{season.name} <span aria-hidden="true">·</span> {season.hanja}</span>
        <h2>{season.title.split('\n').map((line, i) => <span key={line}>{i === 0 ? <em>{line}</em> : line}</span>)}</h2>
        <p>{season.description}</p>
        <span className={styles.seal} aria-hidden="true">막지<br />절기</span>
      </div>
    </div>
  );
}
