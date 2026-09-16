'use client';

import { MIN_SAMPLE, type Tape } from '@/lib/tape';
import type { Tick } from '@/lib/orderbook';
import styles from './Terminal.module.css';

/**
 * 체결 탭 — 증권 앱의 체결 내역 자리.
 *
 * 증권 앱의 체결 탭은 "누가 얼마에 샀나"를 시간순으로 보여준다. 우리는 그 자리에
 * "오늘 사람들이 어느 칸에 앉았나"를 놓는다. 잃은 날 가장 듣고 싶은 말은
 * "나만 그런 게 아니구나"고, 그건 이 목록이 말해준다.
 *
 * 표본이 적으면 비율을 보여주지 않는다. 3명 중 2명을 "67%"라고 쓰면
 * 집계가 아니라 거짓말이다.
 */

interface Props {
  tape: Tape;
  ticks: Tick[];
}

const SIDE_NAME = { loss: '위로가', gain: '자축가', flat: '본전가' } as const;
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function clock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export default function TapeTab({ tape, ticks }: Props) {
  if (!tape.live) {
    return <p className={styles.empty}>집계 저장소가 아직 연결되지 않았습니다. 연결되면 오늘 사람들이 어느 자리에 앉았는지 여기에 표시됩니다.</p>;
  }

  const seatName = (seat: number) => {
    const tick = ticks[Math.min(seat, ticks.length - 1)];
    return tick ? `−${Math.round(tick.depth * 100)}% 칸` : `${seat + 1}번째 칸`;
  };

  return (
    <>
      <dl className={styles.tapeSum}>
        <div><dt>오늘 정산</dt><dd>{tape.total}명</dd></div>
        <div>
          <dt>위로가</dt>
          <dd data-side="loss">{tape.ready ? `${pct(tape.loss, tape.total)}%` : `${tape.loss}명`}</dd>
        </div>
        <div>
          <dt>자축가</dt>
          <dd data-side="gain">{tape.ready ? `${pct(tape.gain, tape.total)}%` : `${tape.gain}명`}</dd>
        </div>
      </dl>

      {!tape.ready && (
        <p className={styles.hint}>{MIN_SAMPLE}명부터 비율을 보여드립니다. 지금은 인원만 표시합니다.</p>
      )}

      {tape.recent.length === 0 ? (
        <p className={styles.empty}>오늘 첫 정산이 아직 없습니다. 상단 <b>내 하루 정산하기</b>가 첫 줄이 됩니다.</p>
      ) : (
        <ul className={styles.tapeList}>
          {tape.recent.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <time dateTime={event.at}>{clock(event.at)}</time>
              <b data-side={event.side}>{SIDE_NAME[event.side]}</b>
              <span>{seatName(event.seat)}</span>
              {event.demo ? <span className={styles.demoTag}>샘플</span> : <span />}
            </li>
          ))}
        </ul>
      )}

      {tape.demo > 0 && (
        <p className={styles.demoWarn}>⚠️ 이 중 {tape.demo}건은 화면 확인용 샘플입니다. 실제 정산이 아닙니다.</p>
      )}
    </>
  );
}
