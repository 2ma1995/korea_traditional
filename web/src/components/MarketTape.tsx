'use client';

import { MIN_SAMPLE, type Tape } from '@/lib/tape';
import styles from './MarketTape.module.css';

/**
 * 오늘의 빵장 시황.
 *
 * 이 화면의 목적은 판매가 아니라 **유입**이다. 잃은 날 가장 듣고 싶은 말은
 * "나만 그런 게 아니구나"이고, 그 한 줄을 보러 들어오는 사람이 생긴다.
 * 그래서 정산하지 않아도 항상 보이는 자리에 둔다.
 *
 * 표본이 적으면 비율을 보여주지 않는다. 3명 중 2명을 "67%가 위로가"라고 쓰면
 * 그건 집계가 아니라 거짓말이다. MIN_SAMPLE을 넘기 전까지는 인원만 밝힌다.
 */

interface Props {
  tape: Tape;
}

const pct = (part: number, total: number) => Math.round((part / total) * 100);

export default function MarketTape({ tape }: Props) {
  if (!tape.live) {
    return (
      <section className={styles.tape} data-state="off" aria-label="오늘의 빵장 시황">
        <span className="eyebrow">오늘의 빵장</span>
        <p className={styles.waiting}>
          집계 저장소가 아직 연결되지 않았습니다. 연결되면 오늘 사람들이 어느 자리에 앉았는지 여기에 표시됩니다.
        </p>
      </section>
    );
  }

  if (!tape.ready) {
    return (
      <section className={styles.tape} data-state="warming" aria-label="오늘의 빵장 시황">
        <div className={styles.head}>
          <span className="eyebrow">오늘의 빵장</span>
          <span className={styles.count}>{tape.total}명 정산</span>
        </div>
        <p className={styles.waiting}>
          아직 집계 중입니다 — <b>{MIN_SAMPLE}명</b>부터 오늘의 비율을 보여드립니다.
        </p>
      </section>
    );
  }

  const lossPct = pct(tape.loss, tape.total);
  const gainPct = pct(tape.gain, tape.total);
  const lead = lossPct >= gainPct;

  return (
    <section className={styles.tape} data-state="ready" aria-label="오늘의 빵장 시황">
      <div className={styles.head}>
        <span className="eyebrow">오늘의 빵장</span>
        <span className={styles.count}>{tape.total}명 정산</span>
      </div>

      <p className={styles.headline}>
        오늘 <strong>{lead ? lossPct : gainPct}%</strong>가{' '}
        <em data-side={lead ? 'loss' : 'gain'}>{lead ? '위로가' : '자축가'}</em>를 골랐습니다
      </p>

      <div className={styles.bar} role="img"
        aria-label={`위로가 ${lossPct}%, 자축가 ${gainPct}%, 본전가 ${100 - lossPct - gainPct}%`}>
        <span data-side="loss" style={{ flexGrow: tape.loss }} />
        <span data-side="flat" style={{ flexGrow: tape.flat }} />
        <span data-side="gain" style={{ flexGrow: tape.gain }} />
      </div>

      <dl className={styles.legend}>
        <div><dt data-side="loss">위로가</dt><dd>{tape.loss}명</dd></div>
        <div><dt data-side="flat">본전가</dt><dd>{tape.flat}명</dd></div>
        <div><dt data-side="gain">자축가</dt><dd>{tape.gain}명</dd></div>
      </dl>

      <p className={styles.sub}>
        오늘 <b>가장 깊이 앉은 자리</b>에 {tape.deepest}명이 함께 있습니다.
        {tape.demo > 0 && (
          <>
            <br />
            <span className={styles.demo}>
              ⚠️ 이 중 {tape.demo}명은 화면 확인용 <b>샘플</b>입니다. 실제 정산이 아닙니다.
            </span>
          </>
        )}
      </p>
    </section>
  );
}
