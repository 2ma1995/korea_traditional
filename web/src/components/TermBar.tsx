import styles from './TermBar.module.css';

/**
 * 절기 띠 — 컨테이너 폭을 그대로 쓴다.
 *
 * 랜딩(오늘의 코스피 위)과 모두의 절기상(페이지 머리) 두 곳에서 같은 모양으로 쓴다.
 * 작은 도장 상자로 두면 페이지마다 크기·위치가 달라져 같은 정보가 다르게 읽힌다.
 */
export default function TermBar({
  label,
  name,
  hanja,
  note,
  nextName,
  daysLeft,
  date,
}: {
  /** '오늘의 절기' / '이번 절기' */
  label: string;
  name: string;
  hanja: string;
  /** 절기 한 줄 설명. 없으면 줄을 그리지 않는다 */
  note?: string;
  nextName: string;
  daysLeft: number;
  /** YYYY-MM-DD. 랜딩처럼 기준일을 밝혀야 하는 곳에서만 넘긴다 */
  date?: string;
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.mark}>
        <span>{label}</span>
        <strong>{name}</strong>
        <small>{hanja}</small>
      </div>
      <div className={styles.meta}>
        {note && <p>{note}</p>}
        <span>
          {date && `${date} · `}
          {nextName}까지 D–{daysLeft}
        </span>
      </div>
    </div>
  );
}
