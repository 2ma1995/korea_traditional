import type { Metadata } from 'next';
import Link from 'next/link';
import { ARCHIVE } from '@/data/contest';
import { groupBySeason, termsInTraditionalOrder, type TermWithPhase } from '@/lib/solarTerm';

export const metadata: Metadata = {
  title: '24절기 레시피 아카이브 · 막지',
  description: '절기마다 쌓이는 레시피 기록 — 1년에 24개',
};

/** 자사몰 B2C 개시일. 이 전 절기는 기록이 있을 수 없다. */
const SERVICE_START = new Date(2026, 7, 28);

const winnerByTerm = new Map(ARCHIVE.map((a) => [a.term, a]));

function TermRow({ item, startedAt }: { item: TermWithPhase; startedAt: Date }) {
  const { term, phase, daysUntil } = item;
  const winner = winnerByTerm.get(term.ko);

  // 서비스 개시 전 절기는 기록이 있을 수 없다
  const beforeService =
    phase === 'done' &&
    !winner &&
    new Date(startedAt.getFullYear(), term.month - 1, term.day) < startedAt;

  const tone =
    phase === 'current'
      ? 'border-hong bg-hong/[0.04]'
      : winner
        ? 'border-line bg-paper'
        : 'border-line bg-black/[0.015]';

  return (
    <li className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="font-serif text-sm font-bold text-ink">
          {term.ko} <span className="text-gold">{term.hanja}</span>
        </span>
        {term.anchor && <span className="text-[10px] text-gold">★</span>}
        <span className="ml-auto font-mono text-[11px] text-neutral-400">
          {term.month}.{String(term.day).padStart(2, '0')}
        </span>
      </div>

      {winner ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-gradient-to-b from-amber-50 to-orange-50 text-base">
            {winner.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">{winner.title}</p>
            <p className="truncate text-[10px] text-neutral-400">@{winner.author}</p>
          </div>
          <span className="shrink-0 font-mono text-[10px] text-neutral-500">
            ♥ {winner.votes.toLocaleString('ko-KR')}
          </span>
        </div>
      ) : phase === 'current' ? (
        <div className="mt-2">
          <p className="text-xs font-semibold text-hong">🔴 진행 중</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">{term.productIdea}</p>
        </div>
      ) : phase === 'upcoming' ? (
        <div className="mt-2">
          <p className="text-xs text-neutral-400">🔒 D-{daysUntil}</p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-400">{term.productIdea}</p>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs text-neutral-400">
            {beforeService ? '서비스 개시 전' : '기록 없음'}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-400">{term.productIdea}</p>
        </div>
      )}
    </li>
  );
}

export default function ArchivePage() {
  const today = new Date();
  const terms = termsInTraditionalOrder(today);
  const seasons = groupBySeason(terms);

  const recorded = terms.filter((t) => winnerByTerm.has(t.term.ko)).length;
  const anchors = terms.filter((t) => t.term.anchor).length;

  return (
    <main className="hanji mx-auto max-w-md px-5 py-8">
      {/* 표제 */}
      <header className="border-b-2 border-double border-gold pb-6 text-center">
        <p className="font-serif text-[11px] tracking-[0.4em] text-gold">MAKJI · 막지</p>
        <h1 className="mt-3 font-serif text-2xl font-bold text-ink">24절기 레시피 아카이브</h1>
        <p className="mt-2 font-serif text-sm text-dancheong">
          절기는 1년에 24번 돌아옵니다
        </p>
      </header>

      {/* 진행률 */}
      <section className="mt-6 rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">기록된 절기</span>
          <span className="font-mono text-xl font-semibold text-ink">
            {recorded}
            <span className="text-sm text-neutral-400"> / 24</span>
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
          <div
            className="h-full rounded-full bg-dancheong"
            style={{ width: `${(recorded / 24) * 100}%` }}
          />
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
          매 절기 우승작이 이 자리에 영구 등록됩니다. 24칸이 채워지면 한 해의 절기 레시피가
          브랜드 자산으로 남습니다. ★는 세시 근거가 확실한 대표 절기 {anchors}개입니다.
        </p>
      </section>

      {/* 절기 목록 */}
      {seasons.map(({ label, items }) => (
        <section key={label} className="mt-8">
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <h2 className="font-serif font-bold text-ink">{label}</h2>
            <span className="text-[11px] text-neutral-400">
              {items[0]?.term.ko} ~ {items[items.length - 1]?.term.ko}
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <TermRow key={item.term.longitude} item={item} startedAt={SERVICE_START} />
            ))}
          </ul>
        </section>
      ))}

      {/* 안내 */}
      <section className="mt-10 rounded-2xl border border-line bg-paper p-5">
        <p className="font-serif text-sm font-bold text-ink">아카이브가 쌓이는 방식</p>
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-neutral-600">
          <li>· 절기마다 레시피 콘테스트가 열리고 다음 절기에 마감됩니다</li>
          <li>· 우승작은 해당 절기 칸에 영구 등록됩니다</li>
          <li>· 1년이면 24개, 3년이면 절기별 3개씩 비교 기록이 됩니다</li>
          <li>· 자사몰 B2C는 2026-08-28에 열렸습니다. 그 전 절기는 기록이 없습니다</li>
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-neutral-400">
          등록된 우승작은 발표 시연용 예시입니다. 절기 날짜와 세시 근거는 실제 데이터입니다.
        </p>
      </section>

      <div className="mt-8 flex gap-2">
        <Link
          href="/contest"
          className="flex-1 rounded-xl bg-ink py-3.5 text-center text-sm font-bold text-white transition hover:opacity-90"
        >
          이번 절기 콘테스트
        </Link>
        <Link
          href="/"
          className="flex-1 rounded-xl border border-line bg-paper py-3.5 text-center text-sm font-bold text-ink transition hover:bg-black/[0.03]"
        >
          오늘의 빵시장
        </Link>
      </div>
    </main>
  );
}
