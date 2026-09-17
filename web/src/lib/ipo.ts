import { nextTerm } from '@/lib/solarTerm';
import { supabase } from '@/lib/supabase';

/**
 * 절기빵 공모주 — 다음 절기빵 후보에 청약한다.
 *
 * 2차 현직자 피드백에서 온 아이템이다. 절기는 "맞는 상품이 실제로 있어야" 살릴 수
 * 있는 데이터인데 지금은 없다. 그래서 절기를 '다음 상품을 정하는 자리'로 옮긴다 —
 * 다음 절기의 제철 재료로 후보 셋을 세우고, 손님이 청약하고, 경쟁률을 매일 공개하고,
 * 절기 당일 1위를 출시한다. 청약자는 출시 쿠폰을 받는다.
 *
 *   손님    내가 고른 빵이 실제로 나온다(기여감) · 쿠폰 · 매일 경쟁률 보러 옴
 *   사업자  출시 전에 수요 데이터를 얻는다 ← 우리 기획에 빠져 있던 '사업자 베네핏'
 *
 * 레시피 콘테스트가 하려던 참여·확산을 클릭 한 번으로 대신한다.
 */

export interface IpoCandidate {
  id: string;
  name: string;
  /** 후보를 세운 근거가 된 제철 재료 */
  ingredient: string;
  /** 첫 출시 수량. 경쟁률의 분모 */
  allotment: number;
  /** 왜 이 후보인가 */
  basis: string;
}

export interface IpoRound {
  id: string;
  termKo: string;
  termHanja: string;
  month: number;
  day: number;
  daysLeft: number;
  ingredients: string[];
  candidates: IpoCandidate[];
}

export interface IpoCounts {
  counts: Record<string, number>;
  /** 이 중 샘플이 몇 건인가 */
  demo: number;
  /** 저장소에 닿았는가. false면 메모리 폴백(이번 서버 세션만) */
  live: boolean;
}

/** 첫 출시 수량 — 기업 협의로 바뀔 값. 경쟁률 "N : 1"의 분모 */
const ALLOTMENT = 30;
const FORMS = ['휘낭시에', '모닝롤', '스콘', '카스테라', '식빵'];

/**
 * 이번 회차 — 다음 절기.
 *
 * 후보 1은 절기 데이터의 productIdea(근거 있는 것), 후보 2·3은 productIdea에
 * 안 들어간 제철 재료 + 막지 제품 형태로 세운다. 재료가 겹치지 않게 골라
 * 세 후보가 서로 다른 맛으로 읽히게 한다. 기업이 후보를 직접 넣는 관리자 화면은 다음 단계다.
 */
export function currentRound(at: Date = new Date()): IpoRound {
  const { term, daysLeft } = nextTerm(at);
  const step = term.longitude / 15;
  const others = term.seasonalIngredients.filter(item => !term.productIdea.includes(item));
  const pool = others.length >= 2 ? others : term.seasonalIngredients;
  const ing2 = pool[0] ?? term.seasonalIngredients[0] ?? '제철';
  const ing3 = pool[1] ?? pool[0] ?? term.seasonalIngredients[0] ?? '제철';
  /* productIdea에 이미 쓰인 형태(예: 스콘)는 피한다 — 세 후보가 형태로도 갈려야 고를 맛이 난다 */
  const forms = FORMS.filter(form => !term.productIdea.includes(form));
  const form2 = forms[step % forms.length];
  const form3 = forms[(step + 1) % forms.length];

  return {
    id: `${at.getFullYear()}-${term.longitude}`,
    termKo: term.ko,
    termHanja: term.hanja,
    month: term.month,
    day: term.day,
    daysLeft,
    ingredients: term.seasonalIngredients,
    candidates: [
      { id: 'a', name: term.productIdea, ingredient: term.seasonalIngredients[0] ?? '', allotment: ALLOTMENT, basis: term.rationale },
      { id: 'b', name: `${ing2} ${form2}`, ingredient: ing2, allotment: ALLOTMENT, basis: `${term.ko} 무렵 제철 — ${ing2}` },
      { id: 'c', name: `${ing3} ${form3}`, ingredient: ing3, allotment: ALLOTMENT, basis: `${term.ko} 무렵 제철 — ${ing3}` },
    ],
  };
}

/* ── 메모리 폴백 — 로컬처럼 저장소가 없을 때. 서버 인스턴스가 살아 있는 동안만 ── */
const memory = new Map<string, Record<string, number>>();
const MEMORY_DEMO: Record<string, number> = { a: 41, b: 17, c: 26 };

function memoryCounts(round: string) {
  if (!memory.has(round)) memory.set(round, { ...MEMORY_DEMO });
  return memory.get(round)!;
}

export async function loadIpoCounts(round: IpoRound): Promise<IpoCounts> {
  const db = supabase();
  const empty = Object.fromEntries(round.candidates.map(c => [c.id, 0]));

  if (!db) {
    const counts = { ...empty, ...memoryCounts(round.id) };
    return { counts, demo: Object.values(MEMORY_DEMO).reduce((a, b) => a + b, 0), live: false };
  }

  const { data, error } = await db.from('ipo_bids').select('candidate, demo').eq('round', round.id);
  if (error || !data) return { counts: empty, demo: 0, live: false };

  const counts = { ...empty };
  let demo = 0;
  for (const row of data as { candidate: string; demo: boolean }[]) {
    if (row.candidate in counts) counts[row.candidate] += 1;
    if (row.demo) demo += 1;
  }
  return { counts, demo, live: true };
}

export async function bidIpo(round: IpoRound, candidate: string): Promise<IpoCounts> {
  const db = supabase();
  if (!db) {
    const counts = memoryCounts(round.id);
    counts[candidate] = (counts[candidate] ?? 0) + 1;
    return loadIpoCounts(round);
  }
  await db.from('ipo_bids').insert({ round: round.id, candidate, demo: false });
  return loadIpoCounts(round);
}
