import { PRODUCTS, type Product } from '@/data/products';
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
 *
 * ── 2026-09-18 재설계 (기업연계/공모주_재설계.md) ─────────────────────
 *
 * 가장 큰 위험은 1위 빵이 실제로 나오지 않는 것이다. 안 나오면 전부 거짓말이 된다.
 * 그래서 회차를 두 모드로 나눠 기업 개발 부담을 연 4회로 묶는다.
 *
 *   이분이지(춘분·하지·추분·동지)  신제품 공모   연 4회   절기 제철 재료로 후보
 *   그 외 20개 절기               재입고 공모   연 20회  품절 상품으로 후보
 *
 * 이분이지는 절기 데이터에 이미 있다 — 황경이 90의 배수인 네 절기다. 임의로 고른
 * 것이 아니라 데이터에 있는 구분을 쓴다.
 *
 * 재입고 공모의 후보는 품절 상품 중 정가 높은 순 셋이다. 1위가 재입고되면 품절
 * 목록에서 빠지고 다음 상품이 올라온다 — 목록이 스스로 돈다. 품절이 셋 미달이면
 * 모자란 자리를 절기 후보로 채운다(후보가 비는 회차를 만들지 않는다).
 *
 * 그리고 이 기능의 근거가 서비스 전체 근거와 같다 — 슬픔을 줄이는 것은 구매가
 * 아니라 '선택'이고(Rick 외, Garg 2019) 기제는 통제감이다. 공모는 오늘의 구매보다
 * 강한 선택이다. "내가 고른 빵이 실제로 나온다".
 */

export interface IpoCandidate {
  id: string;
  name: string;
  /** 후보를 세운 근거가 된 제철 재료. 재입고 후보는 빈 문자열 */
  ingredient: string;
  /** 첫 출시 수량. 경쟁률의 분모 */
  allotment: number;
  /** 왜 이 후보인가 */
  basis: string;
  /** 재입고 후보면 그 상품의 카페24 번호. 신제품 후보는 null */
  productNo: number | null;
  /** 재입고 후보의 정가. 화면에 "42,000원 상품" 으로 쓴다 */
  listPrice: number | null;
}

/** 'restock' = 품절 상품 재입고 · 'new' = 절기 신제품 */
export type IpoMode = 'restock' | 'new';

export interface IpoRound {
  id: string;
  termKo: string;
  termHanja: string;
  month: number;
  day: number;
  daysLeft: number;
  ingredients: string[];
  candidates: IpoCandidate[];
  mode: IpoMode;
  /** 화면 배너 — 모드에 따라 말이 다르다 */
  label: string;
  /** 손님에게 던지는 질문 */
  ask: string;
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
 * 모드는 절기가 정한다. 황경이 90의 배수(춘분 0 · 하지 90 · 추분 180 · 동지 270)면
 * 신제품 공모, 그 외는 재입고 공모다. 다만 재입고할 품절 상품이 하나도 없으면
 * 재입고 공모를 열 수 없으므로 신제품 공모로 넘긴다.
 *
 * soldOut은 호출부가 넣는다 — 재고는 자사몰에서 받아오는 값이라(lib/stock)
 * 여기서 직접 부르지 않고 주입받는다. 비우면 코드 상수의 품절 목록을 쓴다.
 */
export function currentRound(at: Date = new Date(), soldOut?: Product[]): IpoRound {
  const { term, daysLeft } = nextTerm(at);
  const out = (soldOut ?? PRODUCTS.filter(product => !product.inStock))
    .slice()
    .sort((a, b) => b.price - a.price);

  const keystone = term.longitude % 90 === 0;
  const mode: IpoMode = keystone || !out.length ? 'new' : 'restock';

  const candidates = mode === 'restock'
    ? restockCandidates(out, term)
    : seasonCandidates(term);

  return {
    id: `${at.getFullYear()}-${term.longitude}`,
    termKo: term.ko,
    termHanja: term.hanja,
    month: term.month,
    day: term.day,
    daysLeft,
    ingredients: term.seasonalIngredients,
    candidates,
    mode,
    label: mode === 'restock' ? '재상장 공모' : '신규 상장 공모',
    ask: mode === 'restock'
      ? '무엇을 먼저 다시 들여올까요?'
      : `${term.ko}엔 어떤 빵이 좋을까요?`,
  };
}

/** 재입고 후보 — 품절 상품 중 정가 높은 순 셋. 모자라면 절기 후보로 채운다 */
function restockCandidates(soldOut: Product[], term: Parameters<typeof seasonCandidates>[0]): IpoCandidate[] {
  const picked = soldOut.slice(0, 3).map<IpoCandidate>((product, i) => ({
    id: `r${product.productNo}`,
    name: product.name,
    ingredient: '',
    allotment: ALLOTMENT,
    basis: `품절 · 정가 ${product.price.toLocaleString('ko-KR')}원${i === 0 ? ' · 가장 비싼 품절 상품' : ''}`,
    productNo: product.productNo,
    listPrice: product.price,
  }));
  if (picked.length >= 3) return picked;
  /* 품절이 셋 미달 — 남은 자리는 절기 후보로. 회차에 후보가 비지 않게 한다 */
  return [...picked, ...seasonCandidates(term).slice(0, 3 - picked.length)];
}

/**
 * 신제품 후보 — 절기 제철 재료로 셋.
 *
 * 후보 1은 절기 데이터의 productIdea(근거 있는 것), 후보 2·3은 productIdea에
 * 안 들어간 제철 재료 + 막지 제품 형태로 세운다. 재료가 겹치지 않게 골라
 * 세 후보가 서로 다른 맛으로 읽히게 한다. 기업이 후보를 직접 넣는 관리자 화면은 다음 단계다.
 */
function seasonCandidates(term: ReturnType<typeof nextTerm>['term']): IpoCandidate[] {
  const step = term.longitude / 15;
  const others = term.seasonalIngredients.filter(item => !term.productIdea.includes(item));
  const pool = others.length >= 2 ? others : term.seasonalIngredients;
  const ing2 = pool[0] ?? term.seasonalIngredients[0] ?? '제철';
  const ing3 = pool[1] ?? pool[0] ?? term.seasonalIngredients[0] ?? '제철';
  /* productIdea에 이미 쓰인 형태(예: 스콘)는 피한다 — 세 후보가 형태로도 갈려야 고를 맛이 난다 */
  const forms = FORMS.filter(form => !term.productIdea.includes(form));
  const form2 = forms[step % forms.length];
  const form3 = forms[(step + 1) % forms.length];
  return [
    { id: 'a', name: term.productIdea, ingredient: term.seasonalIngredients[0] ?? '', allotment: ALLOTMENT, basis: term.rationale, productNo: null, listPrice: null },
    { id: 'b', name: `${ing2} ${form2}`, ingredient: ing2, allotment: ALLOTMENT, basis: `${term.ko} 무렵 제철 — ${ing2}`, productNo: null, listPrice: null },
    { id: 'c', name: `${ing3} ${form3}`, ingredient: ing3, allotment: ALLOTMENT, basis: `${term.ko} 무렵 제철 — ${ing3}`, productNo: null, listPrice: null },
  ];
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
  /* mode를 같이 남긴다 — 나중에 "재입고 공모와 신제품 공모 중 어느 쪽 참여가
     높았나"를 답할 수 있어야 다음 회차 구성의 근거가 된다 */
  await db.from('ipo_bids').insert({ round: round.id, candidate, demo: false, mode: round.mode });
  return loadIpoCounts(round);
}
