'use client';

import { useState } from 'react';
import { TOPPING_RULES } from '@/data/indicators';
import type { SeasonalIngredient } from '@/data/seasonalIngredients';
import type { ProducePrice } from '@/lib/produceApi';

/** 빵 이미지 에셋이 없어 이모지로 대체한다.
 *  기업이 AI 콘텐츠 생성을 금지했으므로, 실제 구현에서는
 *  기업 승인을 받은 제품 이미지 에셋으로 교체한다. */
const BREAD_EMOJI: Record<number, string> = {
  28: '🧁', // 휘낭시에
  25: '🍪', // 스콘
  31: '🍞', // 테트리스 브레드
  32: '🥐', // 모닝롤
  30: '🥯', // 잉글리시 머핀
  33: '🥟', // 냉동생지
  23: '🍰', // 카스테라
  19: '🍮', // 티라미수
  29: '🎂', // 마틸다
  27: '🥪', // 샌드위치
};

/** 토핑 배치 좌표 (%) — 빵 이모지 위에 겹치도록 중앙 근처로 모은다 */
const SLOTS = [
  { top: '30%', left: '30%' },
  { top: '25%', left: '55%' },
  { top: '50%', left: '26%' },
  { top: '46%', left: '58%' },
];

export interface BuilderBread {
  productNo: number;
  name: string;
  price: number;
  /** 오늘의 시장 로직에서 정해진 할인율. 재료를 올려도 이 값은 변하지 않는다. */
  baseRate: number;
}

interface Props {
  breads: BuilderBread[];
  ingredients: SeasonalIngredient[];
  prices: Record<string, ProducePrice>;
  termName: string;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const floorTo10 = (n: number) => Math.floor(n / 10) * 10;

export default function BreadBuilder({ breads, ingredients, prices, termName }: Props) {
  const [breadNo, setBreadNo] = useState(
    (breads.find((b) => b.baseRate > 0) ?? breads[0])?.productNo,
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [shared, setShared] = useState(false);

  const bread = breads.find((b) => b.productNo === breadNo) ?? breads[0];
  if (!bread) return null;

  const toggle = (code: string) => {
    setPicked((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : prev.length >= TOPPING_RULES.maxToppings
          ? prev
          : [...prev, code],
    );
  };

  const finalPrice = floorTo10(bread.price * (1 - bread.baseRate));

  const pickedNames = picked
    .map((c) => ingredients.find((i) => i.code === c))
    .filter((i): i is SeasonalIngredient => Boolean(i));

  const comboLabel =
    bread.name + (pickedNames.length > 0 ? ' + ' + pickedNames.map((i) => i.name).join(' + ') : '');

  const share = async () => {
    const text = `${termName} · ${comboLabel}\n오늘의 시장으로 빵을 산다 — 막지`;
    const url = typeof window === 'undefined' ? '' : window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: '막지 · 오늘의 빵시장', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // 사용자가 공유를 취소한 경우 — 아무것도 하지 않는다
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif font-bold text-ink">빵 위에 올려보기</h2>
        <span className="text-xs text-neutral-400">{termName} 제철</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        오늘 제철인 재료를 올려보세요. 재료는 판매 상품이 아니라 페어링 제안이고, 가격은
        공영도매시장 소매 시세입니다.
      </p>

      {/* 빵 선택 */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {breads.map((b) => (
          <button
            key={b.productNo}
            type="button"
            onClick={() => setBreadNo(b.productNo)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              b.productNo === breadNo
                ? 'bg-ink text-white'
                : 'bg-black/[0.04] text-neutral-600 hover:bg-black/[0.08]'
            }`}
          >
            {BREAD_EMOJI[b.productNo]} {b.name}
          </button>
        ))}
      </div>

      {/* 캔버스 */}
      <div className="relative mx-auto mt-4 aspect-square w-full max-w-[260px] rounded-2xl border border-line bg-gradient-to-b from-amber-50 to-orange-50">
        <span className="absolute inset-0 flex items-center justify-center text-[150px] leading-none select-none">
          {BREAD_EMOJI[bread.productNo] ?? '🍞'}
        </span>
        {pickedNames.map((ing, i) => (
          <button
            key={ing.code}
            type="button"
            onClick={() => toggle(ing.code)}
            style={SLOTS[i]}
            className="absolute text-3xl drop-shadow-md transition hover:scale-110 active:scale-95"
            aria-label={`${ing.name} 빼기`}
          >
            {ing.emoji}
          </button>
        ))}
        {picked.length === 0 && (
          <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-amber-700/60">
            아래에서 재료를 골라주세요
          </span>
        )}
      </div>

      {/* 재료 팔레트 */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ingredients.map((ing) => {
          const price = prices[ing.code];
          const down = (price?.changeMonthPct ?? 0) < 0;
          const on = picked.includes(ing.code);
          const full = !on && picked.length >= TOPPING_RULES.maxToppings;
          return (
            <button
              key={ing.code}
              type="button"
              onClick={() => toggle(ing.code)}
              disabled={full}
              className={`rounded-xl px-2.5 py-2 text-left transition ${
                on
                  ? 'bg-ink text-white'
                  : full
                    ? 'border border-line bg-black/[0.02] text-neutral-300'
                    : 'border border-line bg-white text-neutral-700 hover:border-neutral-400'
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-base">{ing.emoji}</span>
                {ing.name}
                {ing.anchorTerm && <span className="text-[10px] text-gold">★</span>}
              </span>
              {price ? (
                <span
                  className={`mt-0.5 block font-mono text-[11px] ${
                    on ? 'text-white/60' : down ? 'text-dancheong' : 'text-neutral-400'
                  }`}
                >
                  {price.changeMonthPct === null
                    ? `${won(price.price)}원`
                    : `${down ? '▼' : '▲'} ${Math.abs(price.changeMonthPct).toFixed(1)}% · ${won(price.price)}원`}
                </span>
              ) : (
                <span
                  className={`mt-0.5 block text-[11px] ${on ? 'text-white/60' : 'text-neutral-300'}`}
                >
                  시세 없음
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">
        시세는 한 달 전 대비입니다. 재료를 올려도 가격은 바뀌지 않습니다.
      </p>

      {/* 결과 */}
      <div className="mt-5 rounded-xl border border-line bg-black/[0.02] p-4">
        <p className="text-xs text-neutral-400">내 조합</p>
        <p className="mt-1 text-sm font-semibold text-ink">{comboLabel}</p>

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          {bread.baseRate > 0 ? (
            <span className="rounded-md bg-hong px-2 py-1 text-xs font-bold text-white">
              오늘 {Math.round(bread.baseRate * 100)}%
            </span>
          ) : (
            <span className="text-xs text-neutral-400">오늘 할인 대상 아님</span>
          )}
          <span className="flex items-baseline gap-2">
            {bread.baseRate > 0 && (
              <span className="text-sm text-neutral-400 line-through">{won(bread.price)}원</span>
            )}
            <span className="text-lg font-bold text-ink">{won(finalPrice)}원</span>
          </span>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          이 조합 담기
        </button>

        <button
          type="button"
          onClick={share}
          className="mt-2 w-full rounded-xl border border-ink bg-transparent py-3 text-sm font-semibold text-ink transition hover:bg-black/[0.04]"
        >
          {shared ? '링크가 복사되었습니다' : '내 조합 공유하기'}
        </button>
      </div>
    </section>
  );
}
