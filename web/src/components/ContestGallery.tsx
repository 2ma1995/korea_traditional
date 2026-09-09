'use client';

import { useState } from 'react';
import type { ContestEntry } from '@/data/contest';

/**
 * 출품작 갤러리 + 투표.
 *
 * 투표는 아직 클라이언트 상태로만 동작한다. 실제 서비스에서는
 * 회원 인증 + 서버 저장이 필요하고, 1인 1표 제한이 붙어야 한다.
 */
export default function ContestGallery({ entries }: { entries: ContestEntry[] }) {
  const [voted, setVoted] = useState<Set<string>>(new Set());

  const toggleVote = (id: string) => {
    setVoted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = [...entries].sort(
    (a, b) => b.votes + (voted.has(b.id) ? 1 : 0) - (a.votes + (voted.has(a.id) ? 1 : 0)),
  );

  return (
    <ul className="mt-4 space-y-3">
      {sorted.map((entry, rank) => {
        const isVoted = voted.has(entry.id);
        const count = entry.votes + (isVoted ? 1 : 0);
        return (
          <li key={entry.id} className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-gradient-to-b from-amber-50 to-orange-50 text-3xl">
                {entry.emoji}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {rank === 0 && (
                    <span className="rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-white">
                      1위
                    </span>
                  )}
                  <p className="truncate font-serif font-bold text-ink">{entry.title}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-400">@{entry.author}</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-600">
                  {entry.note}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <div className="flex flex-wrap gap-1">
                <span className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-neutral-500">
                  {entry.product}
                </span>
                {entry.toppings.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-dancheong/10 px-1.5 py-0.5 text-[10px] text-dancheong"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={() => toggleVote(entry.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isVoted
                    ? 'bg-hong text-white'
                    : 'border border-line text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {isVoted ? '♥' : '♡'} {count.toLocaleString('ko-KR')}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
