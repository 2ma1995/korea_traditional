'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';

/**
 * 내 관심 빵 — 포트폴리오.
 *
 * 현직자: "주식 데이터는 가격만이 아니다. 유저의 관심 종목 데이터도 주식 데이터다.
 * 관심 빵을 비중으로 구성하면 '네 비중 1위 빵이 오늘 할인빵'이라고 말해줄 수 있다."
 *
 * 저장 형태는 { 상품번호: { qty, at } }다. at은 마지막으로 담은 시각(epoch ms)이고,
 * 수량이 같을 때 **최근에 담은 것이 먼저** 오도록 정렬에 쓴다. 예전 형태({ 번호: 수량 })도
 * 그대로 읽어 at=0으로 본다 — 이미 담아둔 사람의 목록이 사라지면 안 된다.
 *
 * 브라우저에만 남는다. 서버로 가지 않는다.
 */

export interface Holding { qty: number; at: number }
export type Portfolio = Record<string, Holding>;

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

/** 예전 형태(숫자)도 받아 준다 */
function parse(raw: string | null): Portfolio {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: Portfolio = {};
    for (const [no, held] of Object.entries(v as Record<string, unknown>)) {
      if (typeof held === 'number') { if (held > 0) out[no] = { qty: held, at: 0 }; continue; }
      const h = held as { qty?: unknown; at?: unknown };
      const qty = Number(h?.qty);
      if (Number.isFinite(qty) && qty > 0) out[no] = { qty, at: Number(h?.at) || 0 };
    }
    return out;
  } catch { return {}; }
}

/** 수량 많은 순 → 같으면 최근에 담은 순 */
export function sortHoldings(portfolio: Portfolio): { no: number; qty: number; at: number }[] {
  return Object.entries(portfolio)
    .map(([no, h]) => ({ no: Number(no), qty: h.qty, at: h.at }))
    .sort((a, b) => b.qty - a.qty || b.at - a.at);
}

export function usePortfolio() {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const portfolio = useMemo(() => parse(raw), [raw]);
  const add = (productNo: number) => {
    const prev = portfolio[productNo];
    write({ ...portfolio, [productNo]: { qty: (prev?.qty ?? 0) + 1, at: Date.now() } });
  };
  const remove = (productNo: number) => {
    const next = { ...portfolio };
    const prev = next[productNo];
    if (!prev || prev.qty <= 1) delete next[productNo];
    else next[productNo] = { qty: prev.qty - 1, at: Date.now() };
    write(next);
  };
  return { portfolio, add, remove };
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
export function useStableHoldings(portfolio: Portfolio) {
  const all = useMemo(() => sortHoldings(portfolio), [portfolio]);
  const [order, setOrder] = useState<number[]>([]);
  const [seenKeys, setSeenKeys] = useState('');

  const keys = all.map(e => e.no).slice().sort((a, b) => a - b).join(',');
  if (keys !== seenKeys) {
    setSeenKeys(keys);
    setOrder(prev => {
      const kept = prev.filter(no => portfolio[no]);
      const added = all.map(e => e.no).filter(no => !kept.includes(no));
      return [...kept, ...added];
    });
  }

  return useMemo(() => {
    const byOrder = order.map(no => all.find(e => e.no === no)).filter((e): e is typeof all[number] => Boolean(e));
    /* 순서가 아직 안 잡힌 항목이 있으면 뒤에 붙여 하나도 빠지지 않게 한다 */
    const rest = all.filter(e => !order.includes(e.no));
    return [...byOrder, ...rest];
  }, [all, order]);
}

/** 화면에서 수량만 필요할 때 */
export const qtyOf = (portfolio: Portfolio, productNo: number) => portfolio[productNo]?.qty ?? 0;
