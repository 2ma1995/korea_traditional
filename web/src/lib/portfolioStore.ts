'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

import { seoulDateString } from '@/lib/market';

/**
 * 내 관심 빵 — 포트폴리오.
 *
 * 현직자: "주식 데이터는 가격만이 아니다. 유저의 관심 종목 데이터도 주식 데이터다.
 * 관심 빵을 비중으로 구성하면 '네 비중 1위 빵이 오늘 할인빵'이라고 말해줄 수 있다."
 *
 * 저장 형태는 { 키: { qty, at } }다. 키는 옵션이 있으면 "상품번호:품목코드", 없으면
 * "상품번호"다 — 휘낭시에 코코넛·피칸·초코를 따로 담을 수 있다(예약도 옵션마다 한 자리, 0019).
 * at은 마지막으로 담은 시각(epoch ms)이고, 수량이 같을 때 **최근에 담은 것이 먼저** 오도록
 * 정렬에 쓴다. 예전 형태({ 번호: 수량 }, 옵션 없는 키)도 그대로 읽어 at=0으로 본다 —
 * 이미 담아둔 사람의 목록이 사라지면 안 된다. 옵션이 있는 빵의 옛 키는 포트폴리오에서
 * 옵션을 고르면 그 옵션 키로 옮긴다(moveKey).
 *
 * qty는 **살 개수**다(한 옵션 최대 orderbook.SEATS_PER_OPTION). 한 번에 예약하기가 이만큼 자리를
 * 잡고(0020), 도넛 비중과 "비중 1위"도 이 개수로 센다.
 *
 * 목록 자체는 브라우저에만 남는다. 서버로 가는 것은 "누가 무엇을 담았는지"가
 * 아니라 **담겼다는 사실 한 건**뿐이다(reportWatch) — 수요 보정(+3%p)의 분모가
 * 거기서 나온다. 목록을 통째로 올리지 않는 이유는 그럴 필요가 없어서다.
 */

export interface Holding { qty: number; at: number }
export type Portfolio = Record<string, Holding>;
/** 화면이 쓰는 한 줄 — 빵 하나, 또는 빵의 옵션 하나 */
export interface HoldingEntry { key: string; no: number; unit: string | null; qty: number; at: number }

/** 옵션이 있으면 "번호:품목코드", 없으면 "번호" */
export const keyOf = (productNo: number, unit: string | null = null) => (unit ? `${productNo}:${unit}` : String(productNo));
export function splitKey(key: string): { no: number; unit: string | null } {
  const [no, unit] = key.split(':');
  return { no: Number(no), unit: unit || null };
}
const KEY = /^\d+(:[A-Za-z0-9]{1,32})?$/;

const STORAGE_KEY = 'makji_portfolio';
let memo: string | null | undefined;
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function read(): string | null {
  if (memo === undefined) {
    try { memo = window.localStorage.getItem(STORAGE_KEY); } catch { memo = null; }
  }
  return memo;
}
const readOnServer = (): string | null => null;
function write(next: Portfolio) {
  const raw = JSON.stringify(next);
  memo = raw;
  try { window.localStorage.setItem(STORAGE_KEY, raw); } catch { /* 메모리 사본으로 유지 */ }
  listeners.forEach(cb => cb());
}

/**
 * 서버에 "이 빵이 담겼다"를 알린다 — 수요 보정의 분모.
 *
 * 실패해도 아무것도 되돌리지 않는다. 담기는 이미 화면에서 끝났고, 여기서
 * 손님에게 오류를 보여줄 일이 아니다. 집계가 한 건 빠질 뿐이다.
 *
 * 중복은 서버가 (날짜·상품·방문자)로 거른다. 여기 Set은 그 앞단에서 같은 탭의
 * 반복 토글이 요청을 쏟아내지 않게 막는 것뿐이라, 새로고침하면 비어도 된다.
 */
const reported = new Set<string>();
function reportWatch(productNo: number) {
  const key = `${seoulDateString()}:${productNo}`;
  if (reported.has(key)) return;
  reported.add(key);
  void fetch('/api/watch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productNo }),
  }).catch(() => {
    /* 다음 기회에 다시 보내도록 되돌린다 */
    reported.delete(key);
  });
}

/** 저장하면서, 이번에 새로 들어온 빵만 서버에 알린다 — 수요 보정은 빵 단위로 센다 */
function commit(prev: Portfolio, next: Portfolio) {
  const before = new Set(Object.keys(prev).map(key => splitKey(key).no));
  for (const key of Object.keys(next)) {
    const { no } = splitKey(key);
    if (!before.has(no)) { before.add(no); reportWatch(no); }
  }
  write(next);
}

/** 예전 형태(숫자)도 받아 준다 */
function parse(raw: string | null): Portfolio {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: Portfolio = {};
    for (const [key, held] of Object.entries(v as Record<string, unknown>)) {
      if (!KEY.test(key)) continue;
      if (typeof held === 'number') { if (held > 0) out[key] = { qty: held, at: 0 }; continue; }
      const h = held as { qty?: unknown; at?: unknown };
      const qty = Number(h?.qty);
      if (Number.isFinite(qty) && qty > 0) out[key] = { qty, at: Number(h?.at) || 0 };
    }
    return out;
  } catch { return {}; }
}

/** 수량 많은 순 → 같으면 최근에 담은 순. 옵션마다 한 줄이다 */
export function sortHoldings(portfolio: Portfolio): HoldingEntry[] {
  return Object.entries(portfolio)
    .map(([key, h]) => ({ key, ...splitKey(key), qty: h.qty, at: h.at }))
    .sort((a, b) => b.qty - a.qty || b.at - a.at);
}

/** 빵 단위로 합친 관심 — 도넛·비중 1위·"오늘 n종 할인"은 빵을 센다 */
export function byProduct(entries: HoldingEntry[]): { no: number; qty: number; at: number }[] {
  const out = new Map<number, { no: number; qty: number; at: number }>();
  for (const e of entries) {
    const prev = out.get(e.no);
    out.set(e.no, prev ? { no: e.no, qty: prev.qty + e.qty, at: Math.max(prev.at, e.at) } : { no: e.no, qty: e.qty, at: e.at });
  }
  return [...out.values()];
}

export function usePortfolio() {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const portfolio = useMemo(() => parse(raw), [raw]);
  /**
   * 개수를 그 값으로 맞춘다(키 하나 = 빵 하나 또는 옵션 하나). 0이면 뺀다.
   * at은 그대로 둔다 — 개수만 바뀔 때 표시 순서가 흔들리지 않게.
   */
  const setQty = (key: string, qty: number) => {
    const next = { ...portfolio };
    if (qty <= 0) delete next[key];
    else next[key] = { qty, at: portfolio[key]?.at ?? Date.now() };
    commit(portfolio, next);
  };
  /**
   * 빵 카드의 하트 — 이 빵의 옵션이 하나라도 담겨 있으면 전부 빼고,
   * 없으면 지금 고른 옵션(없으면 빵)으로 담는다.
   */
  const toggleProduct = (productNo: number, unit: string | null) => {
    const mine = Object.keys(portfolio).filter(key => splitKey(key).no === productNo);
    const next = { ...portfolio };
    if (mine.length) mine.forEach(key => { delete next[key]; });
    else next[keyOf(productNo, unit)] = { qty: 1, at: Date.now() };
    commit(portfolio, next);
  };
  /** 옵션 없이 담아둔 옛 키를 옵션 키로 옮긴다 — 관심도와 담은 시각은 그대로. 이미 있으면 합친다 */
  const moveKey = (from: string, to: string) => {
    const held = portfolio[from];
    if (!held || from === to) return;
    const next = { ...portfolio };
    delete next[from];
    next[to] = { qty: (next[to]?.qty ?? 0) + held.qty, at: held.at };
    commit(portfolio, next);
  };
  return { portfolio, setQty, toggleProduct, moveKey };
}

/**
 * 화면에 뿌릴 순서 — 담은 수를 바꿔도 줄 위치가 흔들리지 않게 한다.
 *
 * sortHoldings(수량 많은 순)를 그대로 쓰면 +/− 를 누를 때마다 줄이 위아래로 튀고
 * 도넛 조각 색까지 바뀐다. 그래서 **항목이 들어오거나 빠질 때만** 순서를 다시 잡고,
 * 수량 변경은 순서에 영향을 주지 않는다. 새로 담은 빵은 뒤에 붙는다.
 *
 * 렌더 중 setState는 React가 허용하는 "값이 바뀌었을 때 상태 맞추기" 패턴이다.
 * useState 초기값으로 얼리면 안 된다 — 첫 렌더에는 localStorage를 아직 못 읽어
 * 빈 목록이 순서로 굳는다(실제로 그렇게 굳어 정렬이 계속 바뀌었다).
 */
export function useStableHoldings(portfolio: Portfolio): HoldingEntry[] {
  const all = useMemo(() => sortHoldings(portfolio), [portfolio]);
  const [order, setOrder] = useState<string[]>([]);
  const [seenKeys, setSeenKeys] = useState('');

  const keys = all.map(e => e.key).slice().sort().join(',');
  if (keys !== seenKeys) {
    setSeenKeys(keys);
    setOrder(prev => {
      const kept = prev.filter(key => portfolio[key]);
      const added = all.map(e => e.key).filter(key => !kept.includes(key));
      return [...kept, ...added];
    });
  }

  return useMemo(() => {
    const byOrder = order.map(key => all.find(e => e.key === key)).filter((e): e is HoldingEntry => Boolean(e));
    /* 순서가 아직 안 잡힌 항목이 있으면 뒤에 붙여 하나도 빠지지 않게 한다 */
    const rest = all.filter(e => !order.includes(e.key));
    return [...byOrder, ...rest];
  }, [all, order]);
}

/** 이 빵에 담은 관심도 합 — 옵션 여럿을 담았으면 모두 더한다 */
export const qtyOf = (portfolio: Portfolio, productNo: number) =>
  Object.entries(portfolio).reduce((sum, [key, h]) => sum + (splitKey(key).no === productNo ? h.qty : 0), 0);
