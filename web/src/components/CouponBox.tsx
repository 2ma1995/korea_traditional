'use client';

import { useState, useSyncExternalStore } from 'react';

/** 오늘 자정까지 남은 시간 */
function remaining() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const ms = Math.max(0, end.getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 1초마다 구독자에게 알리는 외부 시계 */
function subscribeToClock(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

export default function CouponBox({ code, shopUrl }: { code: string; shopUrl: string }) {
  // 서버 스냅샷을 null로 두면 서버/클라이언트 시각 차이로 인한 hydration 불일치가 없다.
  const left = useSyncExternalStore(subscribeToClock, remaining, () => null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl bg-neutral-900 p-5 text-white">
      <p className="text-xs text-neutral-400">오늘의 쿠폰</p>

      <button
        type="button"
        onClick={copy}
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-dashed border-neutral-600 px-4 py-3 transition hover:border-neutral-400"
      >
        <span className="font-mono text-lg font-bold tracking-wider">{code}</span>
        <span className="text-xs text-neutral-400">{copied ? '복사됨' : '복사'}</span>
      </button>

      <p className="mt-3 text-center text-xs text-neutral-400">
        {left ? (
          <>
            오늘 자정까지 <span className="font-mono text-white">{left}</span>
          </>
        ) : (
          '오늘 자정까지'
        )}
      </p>

      <a
        href={shopUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 block w-full rounded-xl bg-white py-3.5 text-center text-sm font-bold text-neutral-900 transition hover:bg-neutral-100"
      >
        막지 자사몰에서 사용하기
      </a>
    </div>
  );
}
