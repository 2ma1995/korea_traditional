import type { Metadata } from 'next';
import Link from 'next/link';
import BreadBuilder, { type BuilderBread } from '@/components/BreadBuilder';
import { PRODUCTS } from '@/data/products';
import { isInSeason, SEASONAL_INGREDIENTS } from '@/data/seasonalIngredients';
import { buildCampaign } from '@/lib/campaign';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { fetchProducePrices, type ProducePrice } from '@/lib/produceApi';
import { currentTerm, nextTerm, termsInTraditionalOrder } from '@/lib/solarTerm';

export const metadata: Metadata = {
  title: '오늘의 절기 한정가 · 막지',
  description: '오늘의 시장으로 빵을 산다 — 절기와 제철 시세로 매일 가격이 바뀝니다',
};

const won = (n: number) => n.toLocaleString('ko-KR');

export default async function EventPage() {
  const today = new Date();
  const [market, produce] = await Promise.all([
    getMarketSnapshot(today),
    fetchProducePrices(today),
  ]);
  const plan = buildDailyPlan(market);
  const term = currentTerm(today);
  const upcoming = nextTerm(today);
  const campaign = buildCampaign(term, plan, produce, today);
  const allTerms = termsInTraditionalOrder(today);

  const breads: BuilderBread[] = PRODUCTS.filter((p) => p.inStock).map((p) => ({
    productNo: p.productNo,
    name: p.name,
    price: p.price,
    baseRate: p.line === plan.targetLine ? plan.rate : 0,
  }));

  const month = today.getMonth() + 1;
  const seasonal = SEASONAL_INGREDIENTS.filter((i) => produce.has(i.code)).sort((a, b) => {
    const sa = isInSeason(a, month) ? 0 : 1;
    const sb = isInSeason(b, month) ? 0 : 1;
    return sa - sb;
  });
  const priceMap: Record<string, ProducePrice> = Object.fromEntries(produce);

  return (
    <main className="hanji mx-auto max-w-md px-5 py-8">
      {/* 24절기가 뭔지부터 — SNS로 처음 들어온 사람은 절기를 모른다 */}
      <section className="text-center">
        <p className="font-serif text-[11px] tracking-[0.4em] text-gold">MAKJI · 막지</p>

        <h1 className="mt-5 font-serif text-2xl font-bold leading-snug text-ink">
          오늘은 {term.ko}
          <span className="text-gold"> {term.hanja}</span>입니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          24절기는 1년을 스물넷으로 나눈 옛 달력입니다.
          <br />
          <b className="text-dancheong">15일마다</b> 하나씩 바뀌고, 절기마다 먹는 음식이
          달랐습니다.
        </p>
      </section>

      {/* 24절기 타임라인 — "15일마다 바뀐다"를 눈으로 */}
      <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-end justify-between gap-[3px]">
          {allTerms.map(({ term: t, phase }) => (
            <span
              key={t.longitude}
              title={`${t.ko} ${t.month}/${t.day}`}
              className={`flex-1 rounded-full ${
                phase === 'current'
                  ? 'h-6 bg-hong'
                  : phase === 'done'
                    ? 'h-2.5 bg-dancheong/35'
                    : 'h-2.5 bg-black/[0.07]'
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
          <span>입춘</span>
          <span className="font-semibold text-hong">
            {term.ko} · {term.month}/{term.day}
          </span>
          <span>대한</span>
        </div>
      </div>

      {/* 왜 빵인가 — 이 기획의 논거 */}
      <section className="mt-6 rounded-2xl border border-dancheong/30 bg-dancheong/[0.04] p-5">
        <p className="text-sm leading-relaxed text-neutral-700">
          그런데 한국 세시음식의 주재료는
          <br />
          <b className="text-dancheong">쌀 · 팥 · 잡곡 · 견과 · 쑥</b>입니다.
          <br />
          <b>밀가루가 아닙니다.</b>
        </p>
        <p className="mt-3 border-t border-dancheong/20 pt-3 text-xs leading-relaxed text-neutral-600">
          막지는 글루텐프리 · 제로슈거 · 비건 베이커리입니다. 전통과 웰니스는 원래 같은 재료를
          씁니다. <b className="text-ink">쌀 자급률 96.0%, 밀 1.5%</b>니까요.
        </p>
      </section>

      {/* 이 이벤트가 뭔가 */}
      <section className="mt-8">
        <h2 className="text-center font-serif text-lg font-bold text-ink">
          그래서 이런 이벤트입니다
        </h2>
        <ol className="mt-4 space-y-2">
          {[
            {
              n: '01',
              t: '절기마다 제철 재료를 찾습니다',
              d: `${term.ko}에는 ${campaign.hero ? campaign.hero.ingredient.name : '제철 재료'}`,
            },
            {
              n: '02',
              t: '오늘의 시장 데이터를 봅니다',
              d: '코스피 · 환율 · 국산 농산물 소매 시세',
            },
            {
              n: '03',
              t: '어울리는 빵을 오늘만 할인합니다',
              d: '가격은 내려가는 방향으로만 움직입니다',
            },
          ].map((s) => (
            <li key={s.n} className="flex gap-3 rounded-xl border border-line bg-paper p-3">
              <span className="font-mono text-sm font-bold text-gold">{s.n}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{s.t}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center text-xs text-neutral-500">
          랜덤 할인이 아니라 <b className="text-dancheong">공개된 시세</b>가 기준입니다
        </p>
      </section>

      {/* 오늘의 내용 */}
      <section className="mt-10 text-center">
        <p className="inline-block rounded-full bg-dancheong px-3 py-1 text-[11px] font-semibold text-white">
          오늘 · {term.ko} {term.hanja}
        </p>

        <h2 className="mt-4 font-serif text-[26px] font-bold leading-snug text-ink">
          {campaign.headline}
        </h2>
        <p className="mt-2 text-sm text-neutral-500">{campaign.subline}</p>

        <div className="relative mx-auto mt-6 aspect-square w-full max-w-[220px] rounded-3xl border border-line bg-gradient-to-b from-amber-50 to-orange-50">
          <span className="absolute inset-0 flex items-center justify-center text-[120px] leading-none select-none">
            🧁
          </span>
          {campaign.hero && (
            <span className="absolute left-[30%] top-[30%] text-4xl drop-shadow-md select-none">
              {campaign.hero.ingredient.emoji}
            </span>
          )}
        </div>

        <div className="mt-6">
          <p className="text-sm text-neutral-500">{campaign.product.name}</p>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            {campaign.rate > 0 && (
              <span className="text-base text-neutral-400 line-through">
                {won(campaign.product.price)}원
              </span>
            )}
            <span className="text-3xl font-bold text-ink">{won(campaign.finalPrice)}원</span>
            {campaign.rate > 0 && (
              <span className="rounded-md bg-hong px-2 py-1 text-sm font-bold text-white">
                {Math.round(campaign.rate * 100)}%
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 신규 방문자 훅 — makji.kr에서 실제 운영 중인 혜택 */}
      <a
        href="https://makji.kr/member/join.html?utm_source=meta&utm_medium=cpc&utm_campaign=breadmarket&utm_content=newmember"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-gold bg-gold/[0.07] p-4 transition hover:bg-gold/[0.12]"
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">막지가 처음이신가요?</p>
          <p className="mt-0.5 text-xs text-neutral-600">
            신규 회원 <b className="text-hong">2만원 쿠폰팩</b>을 드립니다
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">
          받기
        </span>
      </a>

      {/* 오늘의 절기 — 빵 조합 위 */}
      <section className="mt-10 rounded-2xl border border-line bg-paper p-5">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="font-serif text-lg font-bold text-ink">
            {term.ko} <span className="text-gold">{term.hanja}</span>
          </h2>
          <div className="flex items-center gap-2">
            {term.anchor && (
              <span className="rounded bg-dancheong px-1.5 py-0.5 text-[10px] font-bold text-white">
                대표 절기
              </span>
            )}
            <span className="font-mono text-xs text-neutral-400">
              {term.month}.{String(term.day).padStart(2, '0')}
            </span>
          </div>
        </div>

        {term.sesi && (
          <p className="mt-3 text-xs text-neutral-400">연계 세시 · {term.sesi}</p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{term.food}</p>

        <div className="mt-4 rounded-xl bg-dancheong/5 p-4">
          <p className="text-[11px] tracking-wide text-dancheong">오늘의 절기 조합</p>
          <p className="mt-1 font-serif font-bold text-ink">{term.productIdea}</p>
          {term.rationale && (
            <p className="mt-1 text-xs text-neutral-500">{term.rationale}</p>
          )}
        </div>

        <p className="mt-3 text-[11px] text-neutral-400">
          다음 절기 · {upcoming.term.ko} {upcoming.term.hanja} D-{upcoming.daysLeft}
        </p>
      </section>

      {/* 빵 위에 올려보기 */}
      <div className="mt-6">
        <BreadBuilder
          breads={breads}
          ingredients={seasonal}
          prices={priceMap}
          termName={term.ko}
        />
      </div>

      {/* 콘테스트 유도 */}
      <Link
        href="/contest"
        className="mt-6 block rounded-2xl border border-dancheong bg-dancheong p-5 text-center transition hover:opacity-90"
      >
        <p className="font-serif text-lg font-bold text-white">절기 레시피 콘테스트</p>
        <p className="mt-1 text-xs text-white/70">
          내 조합을 출품하고 투표에 참여해보세요
        </p>
      </Link>

      {/* 왜 오늘 이 가격인가 */}
      <section className="mt-10">
        <h2 className="font-serif text-sm font-bold text-dancheong">왜 오늘 이 가격인가</h2>
        <ul className="mt-3 space-y-2.5">
          {campaign.reasons.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm leading-relaxed text-neutral-600">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-paper p-3 text-center">
          <div>
            <p className="text-[10px] text-neutral-400">코스피</p>
            <p
              className={`mt-0.5 font-mono text-xs font-semibold ${
                market.kospi.changePct >= 0 ? 'text-hong' : 'text-dancheong'
              }`}
            >
              {market.kospi.changePct >= 0 ? '▲' : '▼'}{' '}
              {Math.abs(market.kospi.changePct).toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400">
              {campaign.hero ? campaign.hero.ingredient.name : '원/달러'}
            </p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-dancheong">
              {campaign.hero
                ? `▼ ${Math.abs(campaign.hero.price.changeMonthPct ?? 0).toFixed(1)}%`
                : won(market.fxUsdKrw.value)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-400">서울</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-ink">{market.tempC}°C</p>
          </div>
        </div>
      </section>

      {/* 브랜드 신뢰 */}
      <section className="mt-10 rounded-2xl border border-line bg-paper p-5">
        <p className="font-serif text-sm font-bold text-ink">막지가 만드는 방식</p>
        <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
          <li>· 밀가루 ZERO — 국산 쌀가루 베이스</li>
          <li>· 설탕 무첨가 — 천연 당 알룰로스</li>
          <li>· 향료 · 색소 · 보존료 無</li>
          <li>· HACCP 인증 시설에서 제조</li>
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-neutral-400">
          제철 재료는 판매 상품이 아니라 페어링 제안입니다. 시세는 공영도매시장 소매 가격
          기준이며, 조사일에 따라 달라질 수 있습니다.
        </p>
      </section>

      <a
        href={campaign.shopUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 block w-full rounded-xl bg-ink py-4 text-center text-sm font-bold text-white transition hover:opacity-90"
      >
        막지 자사몰 바로가기
      </a>

      <div className="mt-4 flex justify-center gap-4 text-xs text-neutral-400">
        <Link href="/" className="underline underline-offset-4">
          오늘의 빵시장
        </Link>
        <Link href="/archive" className="underline underline-offset-4">
          24절기 아카이브
        </Link>
      </div>
    </main>
  );
}
