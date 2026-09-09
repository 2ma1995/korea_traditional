'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * 시세 갱신 표시 + 자동 새로고침.
 *
 * 서버 컴포넌트는 요청이 있어야 다시 그려진다. 페이지를 켜둔 채로는
 * 시세가 아무리 움직여도 화면이 그대로이므로, 주기적으로 router.refresh()를
 * 호출해 서버에서 다시 받아온다. (fetch 캐시는 60초라 그보다 자주 부를 이유가 없다)
 */

const REFRESH_MS = 60_000;

function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

/**
 * 한국 증시 개장 여부 (폴백용).
 * 평상시에는 네이버 marketStatus를 서버에서 받아 쓴다. 이 계산은
 * 네이버 호출이 실패해 marketOpen이 null로 올 때만 쓰인다.
 * 공휴일 휴장은 판별하지 못한다.
 */
function guessMarketOpen(now: Date) {
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = kst.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = kst.getHours() * 60 + kst.getMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

function hhmmss(ms: number) {
  return new Date(ms).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });
}

interface Props {
  /** 코스피 원본 시세의 마지막 갱신 시각 (epoch ms) */
  quoteUpdatedAt: number | null;
  /** 서버가 스냅샷을 만든 시각 (epoch ms) */
  fetchedAt: number;
  /** 네이버 marketStatus 기준 개장 여부. null이면 시각으로 추정한다 */
  marketOpen: boolean | null;
  /** 시세 출처 표시 */
  sourceLabel: string;
}

export default function LiveTicker({
  quoteUpdatedAt,
  fetchedAt,
  marketOpen,
  sourceLabel,
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // 서버 스냅샷을 null로 두어 hydration 불일치를 피한다
  const nowMs = useSyncExternalStore(subscribeToClock, () => Date.now(), () => null);

  useEffect(() => {
    const id = setInterval(() => {
      setRefreshing(true);
      router.refresh();
      setTimeout(() => setRefreshing(false), 1200);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  if (nowMs === null) {
    return <span className="text-[11px] text-neutral-400">시세 확인 중…</span>;
  }

  const open = marketOpen ?? guessMarketOpen(new Date(nowMs));
  const secondsSince = Math.floor((nowMs - fetchedAt) / 1000);

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
      <span className="flex items-center gap-1">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            open ? 'animate-pulse bg-red-500' : 'bg-neutral-300'
          }`}
        />
        {open ? '장중' : '장 마감 · 종가 기준'}
      </span>

      <span>{sourceLabel}</span>

      {quoteUpdatedAt && <span>시세 {hhmmss(quoteUpdatedAt)}</span>}

      <span>
        {refreshing ? '갱신 중…' : `${Math.max(0, secondsSince)}초 전 확인`}
      </span>

      <button
        type="button"
        onClick={() => {
          setRefreshing(true);
          router.refresh();
          setTimeout(() => setRefreshing(false), 1200);
        }}
        className="underline underline-offset-2 transition hover:text-neutral-600"
      >
        새로고침
      </button>
    </span>
  );
}
