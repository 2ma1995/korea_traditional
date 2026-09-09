import type { Metadata } from 'next';
import Link from 'next/link';
import ContestGallery from '@/components/ContestGallery';
import { ARCHIVE, CURRENT_ENTRIES, REWARDS } from '@/data/contest';
import { inSeason } from '@/data/seasonalIngredients';
import { currentTerm, nextTerm } from '@/lib/solarTerm';

export const metadata: Metadata = {
  title: '절기 레시피 콘테스트 · 막지',
  description: '절기마다 열리는 레시피 콘테스트 — 투표하고 아카이브에 남기세요',
};

export default function ContestPage() {
  const today = new Date();
  const term = currentTerm(today);
  const upcoming = nextTerm(today);

  // 이번 절기의 대표 재료 = 앵커 재료가 있으면 그것, 없으면 제철 첫 번째
  const seasonal = inSeason(today.getMonth() + 1);
  const anchor = seasonal.find((i) => i.anchorTerm === term.ko) ?? seasonal[0];
  const hashtag = `#${term.ko}_${anchor ? anchor.name : '절기'}레시피`;

  return (
    <main className="hanji mx-auto max-w-md px-5 py-8">
      {/* 표제 */}
      <header className="text-center">
        <p className="font-serif text-[11px] tracking-[0.4em] text-gold">MAKJI · 막지</p>
        <h1 className="mt-3 font-serif text-2xl font-bold text-ink">절기 레시피 콘테스트</h1>
        <p className="mt-3 inline-block rounded-full bg-dancheong px-4 py-1.5 font-mono text-sm font-semibold text-white">
          {hashtag}
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          {term.ko} {term.hanja} · {upcoming.term.ko}까지 <b className="text-hong">D-{upcoming.daysLeft}</b>
        </p>
      </header>

      {/* 리워드 */}
      <ul className="mt-6 grid grid-cols-3 gap-2">
        {REWARDS.map((r) => (
          <li
            key={r.title}
            className="rounded-xl border border-line bg-paper px-2 py-3 text-center"
          >
            <p className="text-xl">{r.icon}</p>
            <p className="mt-1 text-xs font-bold text-ink">{r.title}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-neutral-500">{r.desc}</p>
          </li>
        ))}
      </ul>

      {/* 참여 CTA */}
      <Link
        href="/event"
        className="mt-5 block rounded-2xl border border-dancheong bg-dancheong p-4 text-center transition hover:opacity-90"
      >
        <p className="font-serif text-base font-bold text-white">내 레시피 올리기</p>
        <p className="mt-1 text-[11px] text-white/70">
          빵 위에 재료를 올려 조합을 만들고 출품하세요
        </p>
      </Link>

      {/* 출품작 */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="font-serif font-bold text-ink">출품작</h2>
          <span className="text-xs text-neutral-400">{CURRENT_ENTRIES.length}개 · 투표 진행 중</span>
        </div>

        <ContestGallery entries={CURRENT_ENTRIES} />

        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          위 출품작은 <b>발표 시연용 예시</b>입니다. 자사몰 B2C가 2026-08-28에 열려 실제 참여자가
          아직 없습니다. 실제 서비스에서는 사용자가 올린 레시피가 이 자리를 채웁니다.
        </p>
      </section>

      {/* 아카이브 */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between border-b border-line pb-2">
          <h2 className="font-serif font-bold text-ink">지난 절기 우승작</h2>
          <span className="text-xs text-neutral-400">아카이브</span>
        </div>

        <ul className="mt-4 space-y-2">
          {ARCHIVE.map((a) => (
            <li
              key={a.term}
              className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-gradient-to-b from-amber-50 to-orange-50 text-xl">
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                <p className="truncate text-[11px] text-neutral-400">
                  {a.hashtag} · @{a.author}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-neutral-500">
                ♥ {a.votes.toLocaleString('ko-KR')}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/archive"
          className="mt-3 block rounded-xl border border-line bg-paper px-4 py-3 text-center text-xs font-semibold text-dancheong transition hover:bg-black/[0.03]"
        >
          24절기 아카이브 전체 보기 →
        </Link>
      </section>

      {/* 운영 방식 */}
      <section className="mt-10 rounded-2xl border border-line bg-paper p-5">
        <p className="font-serif text-sm font-bold text-ink">콘테스트 운영</p>
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-neutral-600">
          <li>· 절기마다 열리고 다음 절기에 마감합니다 (약 15일)</li>
          <li>· 1년에 24회, 우승작은 아카이브에 영구 등록됩니다</li>
          <li>· 출품 사진은 참여자가 직접 촬영한 것만 올릴 수 있습니다</li>
          <li>· 브랜드 채널 노출 전 기업 승인 절차를 거칩니다</li>
        </ul>
      </section>

      <div className="mt-8 flex gap-2">
        <Link
          href="/event"
          className="flex-1 rounded-xl bg-ink py-3.5 text-center text-sm font-bold text-white transition hover:opacity-90"
        >
          조합 만들러 가기
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
