import Link from 'next/link';
import LiveTicker from '@/components/LiveTicker';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { fetchProducePrices } from '@/lib/produceApi';
import { currentTerm, nextTerm } from '@/lib/solarTerm';

const won = (n: number) => n.toLocaleString('ko-KR');

export default async function Home() {
  const today = new Date();
  const [market, produce] = await Promise.all([
    getMarketSnapshot(today),
    fetchProducePrices(today),
  ]);
  const plan = buildDailyPlan(market);
  const term = currentTerm(today);
  const upcoming = nextTerm(today);

  const up = market.kospi.changePct >= 0;
  const produceLive = produce.size > 0;

  return (
    <main className="hanji mx-auto max-w-2xl px-5 py-10">
      {!produceLive && (
        <p className="mb-6 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <span className="font-semibold">농산물 시세를 불러오지 못했습니다.</span> 인증키 설정을
          확인해주세요. 코스피·환율·기온·원자재는 정상입니다.
        </p>
      )}

      {/* 표제 */}
      <header className="border-b-2 border-double border-gold pb-6 text-center">
        <p className="font-serif text-[11px] tracking-[0.4em] text-gold">MAKJI · 막지</p>

        <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-ink">
          오늘의 빵시장
        </h1>
        <p className="mt-2 font-serif text-sm text-dancheong">오늘의 시장으로 빵을 산다</p>

        <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-line bg-paper px-4 py-1.5">
          <span className="font-serif text-sm font-semibold text-ink">
            {term.ko} <span className="text-gold">{term.hanja}</span>
          </span>
          <span className="h-3 w-px bg-line" />
          <span className="font-mono text-xs text-neutral-500">{market.date}</span>
        </div>
      </header>

      {/* 오늘의 시장 */}
      <section className="mt-8 rounded-2xl border border-line bg-paper p-5">
        <h2 className="font-serif text-sm font-bold tracking-wide text-dancheong">오늘의 시장</h2>

        <div className="mt-4 flex items-baseline justify-between border-b border-line pb-4">
          <span className="text-sm text-neutral-500">코스피</span>
          <span className="font-mono text-xl font-semibold text-ink">
            {won(market.kospi.value)}
            <span className={`ml-2 text-sm ${up ? 'text-hong' : 'text-dancheong'}`}>
              {up ? '▲' : '▼'} {Math.abs(market.kospi.changePct).toFixed(2)}%
            </span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-xs text-neutral-500">
          <div className="flex justify-between">
            <span>원/달러</span>
            <span className="font-mono text-ink">{won(market.fxUsdKrw.value)}</span>
          </div>
          <div className="flex justify-between">
            <span>서울 기온</span>
            <span className="font-mono text-ink">{market.tempC}°C</span>
          </div>
          <div className="flex justify-between">
            <span>코코아</span>
            <span className="font-mono text-ink">
              {market.commodities.cocoa.changePct >= 0 ? '▲' : '▼'}{' '}
              {Math.abs(market.commodities.cocoa.changePct).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>밀</span>
            <span className="font-mono text-ink">
              {market.commodities.wheat.changePct >= 0 ? '▲' : '▼'}{' '}
              {Math.abs(market.commodities.wheat.changePct).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <LiveTicker
            quoteUpdatedAt={market.kospi.updatedAt}
            fetchedAt={market.fetchedAt}
            marketOpen={market.kospiMarketOpen}
            sourceLabel={
              market.kospiMarketOpen !== null
                ? '네이버 금융 · 무지연'
                : market.kospi.live
                  ? 'Yahoo Finance'
                  : '샘플 데이터'
            }
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            환율·원자재 Yahoo Finance
            {market.tempLive && ' · 기온 Open-Meteo'}
            {produceLive && ' · 농산물 공공데이터포털'} · 원가지수 커버리지{' '}
            {Math.round(market.costCoverage * 100)}%
          </p>
        </div>
      </section>

      {/* 오늘의 할인 */}
      <section className="mt-10">
        <h2 className="font-serif text-2xl font-bold leading-snug text-ink">{plan.headline}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{plan.reason}</p>

        <p className="mt-2 inline-block rounded border border-line bg-paper px-2 py-1 text-[11px] text-dancheong">
          {plan.targetLine === 'domestic'
            ? '국산 라인 · 쌀 자급률 96.0%'
            : '수입 라인 · 밀 자급률 1.5%'}
          {plan.guardrailApplied && ' · 원가 상승으로 할인폭 조정'}
        </p>

        <ul className="mt-5 space-y-3">
          {plan.items.map(({ product, finalPrice, rate }) => (
            <li key={product.productNo} className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{product.name}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">{product.label}</p>
                </div>
                <span className="shrink-0 rounded-md bg-hong px-2 py-1 text-xs font-bold text-white">
                  {Math.round(rate * 100)}%
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-sm text-neutral-400 line-through">
                  {won(product.price)}원
                </span>
                <span className="text-lg font-bold text-ink">{won(finalPrice)}원</span>
              </div>
            </li>
          ))}
        </ul>

        {plan.soldOut.length > 0 && (
          <div className="mt-5 rounded-xl border border-line bg-black/[0.02] p-4">
            <p className="text-xs font-semibold text-neutral-500">
              오늘 할인 대상이지만 품절입니다
            </p>
            <ul className="mt-2 space-y-1">
              {plan.soldOut.map((p) => (
                <li key={p.productNo} className="flex justify-between text-xs text-neutral-400">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 font-mono">{won(p.price)}원</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 이벤트 페이지로 */}
      <Link
        href="/event"
        className="mt-10 block rounded-2xl border border-dancheong bg-dancheong p-5 text-center transition hover:opacity-90"
      >
        <p className="font-serif text-lg font-bold text-white">
          {term.ko}, 빵 위에 올려보기
        </p>
        <p className="mt-1 text-xs text-white/70">
          오늘 제철 재료를 올리면 할인이 더 붙습니다
        </p>
      </Link>

      <p className="mt-5 text-center text-[11px] text-neutral-400">
        다음 절기 · {upcoming.term.ko} {upcoming.term.hanja} D-{upcoming.daysLeft}
      </p>
    </main>
  );
}
