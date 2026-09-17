'use client';

import styles from './Market.module.css';

/** 숫자 롤링 — 바뀐 자리만 굴러 내려온다. key가 바뀌면 그 자리가 리마운트되며 CSS가 튄다 */
export default function Flip({ value }: { value: string }) {
  return (
    <span className={styles.flip}>
      {value.split('').map((ch, i) => (
        <span key={`${i}-${ch}`} className={/[0-9]/.test(ch) ? styles.digit : styles.sep}>{ch}</span>
      ))}
    </span>
  );
}
