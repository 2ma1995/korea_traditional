'use client';

import { useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import { TOPPING_RULES } from '@/data/indicators';
import type { SeasonalIngredient } from '@/data/seasonalIngredients';
import type { ProducePrice } from '@/lib/produceApi';

export interface BuilderBread { productNo: number; name: string; price: number; baseRate: number; }
interface Props { breads: BuilderBread[]; ingredients: SeasonalIngredient[]; prices: Record<string, ProducePrice>; termName: string; }
const won = (n: number) => n.toLocaleString('ko-KR');

export default function BreadBuilder({ breads, ingredients, prices, termName }: Props) {
  const [breadNo, setBreadNo] = useState((breads.find(b => b.baseRate > 0) ?? breads[0])?.productNo);
  const [picked, setPicked] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState('');
  const bread = breads.find(b => b.productNo === breadNo) ?? breads[0];
  if (!bread) return <p className="empty-note">지금은 선택할 수 있는 빵이 없습니다.</p>;
  const toggle = (code: string) => setPicked(prev => prev.includes(code) ? prev.filter(c => c !== code) : prev.length >= TOPPING_RULES.maxToppings ? prev : [...prev, code]);
  const pickedIngredients = picked.map(c => ingredients.find(i => i.code === c)).filter((i): i is SeasonalIngredient => Boolean(i));
  const comboLabel = [bread.name, ...pickedIngredients.map(i => i.name)].join(' + ');
  const finalPrice = Math.floor(bread.price * (1 - bread.baseRate) / 10) * 10;
  const share = async () => {
    const text = `${termName} · ${comboLabel}\n한국의 계절을 한 입에 담다 — 막지`;
    try {
      if (navigator.share) { await navigator.share({ title: '막지 · 나만의 절기상', text, url: window.location.href }); setShareStatus('조합을 공유했습니다.'); }
      else { await navigator.clipboard.writeText(`${text}\n${window.location.href}`); setShareStatus('조합과 링크가 복사되었습니다.'); }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setShareStatus('공유하지 못했습니다. 다시 시도해주세요.'); }
  };

  return <section className="bread-builder" aria-label="절기 빵 조합 만들기">
    <div className="builder-section-heading"><span>01</span><h2>오늘은 어떤 빵인가요?</h2></div>
    <div className="bread-options">{breads.map(b => <button type="button" key={b.productNo} aria-pressed={b.productNo === breadNo} onClick={() => { setBreadNo(b.productNo); setShareStatus(''); }} className={b.productNo === breadNo ? 'selected' : ''}>{b.name}</button>)}</div>
    <div className="builder-preview"><ProductPhoto productNo={bread.productNo} name={bread.name} priority /><span className="preview-label">MY SEASONAL TABLE</span><div className="picked-toppings" aria-live="polite">{pickedIngredients.map(i => <button key={i.code} type="button" onClick={() => toggle(i.code)} aria-label={`${i.name} 빼기`}><span aria-hidden="true">{i.emoji}</span>{i.name}<span aria-hidden="true">×</span></button>)}</div><span className="preview-caption">{picked.length ? '함께 즐길 제철 재료를 골랐어요' : '아래에서 함께 즐길 재료를 골라보세요'}</span></div>
    <div className="builder-section-heading"><span>02</span><h2>제철의 맛을 더해주세요.</h2><small>{picked.length} / {TOPPING_RULES.maxToppings}</small></div>
    <div className="ingredient-options">{ingredients.map(i => {
      const price = prices[i.code]; const on = picked.includes(i.code); const full = !on && picked.length >= TOPPING_RULES.maxToppings;
      return <button type="button" key={i.code} disabled={full} aria-pressed={on} onClick={() => { toggle(i.code); setShareStatus(''); }} className={on ? 'selected' : ''}><span className="ingredient-icon" aria-hidden="true">{i.emoji}</span><span><strong>{i.name}</strong><small>{price ? `${won(price.price)}원 · 소매 시세` : '제철 페어링'}</small></span><span className="ingredient-check" aria-hidden="true">{on ? '✓' : '+'}</span></button>;
    })}</div>
    {ingredients.length === 0 && <p className="fine-print">이번 달에 등록된 제철 재료가 없습니다. 빵만 선택해 조합을 공유할 수 있어요.</p>}
    <p className="fine-print">최대 {TOPPING_RULES.maxToppings}개까지 선택할 수 있어요. 선택한 재료를 다시 누르면 취소됩니다.</p>
    <div className="builder-result"><span className="eyebrow">나의 {termName} 한 상</span><h3>{comboLabel}</h3><div className="builder-price"><span>{bread.baseRate > 0 ? `오늘의 빵 혜택 ${Math.round(bread.baseRate * 100)}%` : '선택한 빵 가격'}</span><div>{bread.baseRate > 0 && <del>{won(bread.price)}원</del>}<strong>{won(finalPrice)}원</strong></div></div><div className="builder-actions"><button type="button" onClick={share} className="button button-primary">내 조합 공유하기 <span>↗</span></button><a href={`https://makji.kr/product/detail.html?product_no=${bread.productNo}`} target="_blank" rel="noopener noreferrer" className="button button-outline">빵 구매하러 가기 <span>↗</span></a></div><p className="share-status" role="status">{shareStatus}</p></div>
  </section>;
}
