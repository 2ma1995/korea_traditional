'use client';

import { WATCHLIST } from '@/data/watchlist';
import { PICK_CLOSE_HOUR, type PickWindow } from '@/lib/orderbook';
import type { Pick } from '@/lib/pickStore';
import styles from './Terminal.module.css';

/**
 * 오늘 내 종목 고르기 — 종목 화면 자리를 통째로 쓴다.
 *
 * 증권 앱 첫 화면이 "관심종목을 추가하세요"인 것과 같은 자리다. 우측 상단
 * 작은 버튼으로 두면 있는지도 모른다. 고르기 전엔 이게 화면의 주인공이다.
 *
 * 종목 옆에 오늘 등락률을 보여주지 않는다 — 보여주면 제일 많이 움직인 걸 고른다.
 */

interface Props {
  window: PickWindow;
  onPick: (pick: Pick) => void;
  onBrowse: () => void;
}

export default function PickPanel({ window, onPick, onBrowse }: Props) {
  const closed = !window.open;

  return (
    <div className={styles.pickPanel}>
      <span className="eyebrow">오늘 내 종목</span>
      {closed ? (
        <>
          <h3>오늘 선택은 {PICK_CLOSE_HOUR}:00에 마감됐습니다</h3>
          <p>
            {window.reason === 'holiday'
              ? '주식시장이 쉬는 날은 빵장도 쉽니다. 다음 거래일 아침에 고르세요.'
              : `장이 열리기 전에만 고를 수 있습니다. 내일 아침 ${PICK_CLOSE_HOUR}시 전에 고르세요.`}
            <br />오늘은 누구나 가격(맨 위 칸)으로 살 수 있습니다.
          </p>
        </>
      ) : (
        <>
          <h3>오늘 내 종목을 고르세요</h3>
          <p>
            이 종목이 오늘 <b>내 빵값</b>을 정합니다. 장중에 종목이 움직이면 내 빵값도 같이 움직이고,
            15:30에 확정됩니다. <b>고른 뒤엔 바꿀 수 없습니다.</b>
          </p>
          <div className={styles.pickGrid} role="group" aria-label="종목 선택">
            {WATCHLIST.map(item => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => onPick({ symbol: item.symbol, name: item.name, pickedAt: new Date().toISOString() })}
              >
                <b>{item.name}</b>
                <span>{item.symbol.replace('.KS', ' · 코스피').replace('.KQ', ' · 코스닥')}</span>
              </button>
            ))}
          </div>
          {window.reason === 'test' && (
            <p className={styles.warn}>테스트 중이라 장 마감 후에도 고를 수 있습니다. 원래는 {PICK_CLOSE_HOUR}:00에 잠기고, 고른 뒤 바꿀 수 없습니다.</p>
          )}
        </>
      )}
      <button type="button" className={styles.linkBtn} onClick={onBrowse}>고르지 않고 둘러보기 →</button>
    </div>
  );
}
