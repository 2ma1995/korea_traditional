'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * 내 관심 빵 — 포트폴리오.
 *
 * 현직자: "주식 데이터는 가격만이 아니다. 유저의 관심 종목 데이터도 주식 데이터다.
 * 관심 빵을 비중으로 구성하면 '네 비중 1위 빵이 오늘 할인빵'이라고 말해줄 수 있다."
 *
 * 빵장에 주식 데이터가 들어가면 손님의 결정이 '살지/말지'에서 '오늘 살지/다음에 살지'로
 * 바뀐다. '다음에'를 받는 자리가 여기다. 알림 인프라는 다음 단계라 지금은 담기만 한다.
 *
 * 브라우저에만 남는다. 서버로 가지 않는다.
 */

export type Portfolio = Record<string, number>; // productNo → 담은 수

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
function parse(raw: string | null): Portfolio {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

export function usePortfolio() {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const portfolio = useMemo(() => parse(raw), [raw]);
  const add = (productNo: number) => write({ ...portfolio, [productNo]: (portfolio[productNo] ?? 0) + 1 });
  const remove = (productNo: number) => {
    const next = { ...portfolio };
    if ((next[productNo] ?? 0) <= 1) delete next[productNo]; else next[productNo] -= 1;
    write(next);
  };
  return { portfolio, add, remove };
}
