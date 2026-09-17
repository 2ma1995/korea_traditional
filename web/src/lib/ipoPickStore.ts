'use client';

import { useSyncExternalStore } from 'react';

/**
 * 내 공모 청약 — 회차별 하나. 브라우저에만 남는다.
 * IpoTab(청약 버튼)과 Market(FOR YOU의 "첫 관심 데이터" 문구)이 같은 값을 본다.
 */
const KEY = (round: string) => `makji_ipo:${round}`;
const listeners = new Set<() => void>();
let memo: Record<string, string | null> = {};

function read(round: string): string | null {
  if (!(round in memo)) {
    try { memo[round] = window.localStorage.getItem(KEY(round)); } catch { memo[round] = null; }
  }
  return memo[round];
}
export function writeIpoPick(round: string, candidate: string) {
  memo = { ...memo, [round]: candidate };
  try { window.localStorage.setItem(KEY(round), candidate); } catch { /* */ }
  listeners.forEach(cb => cb());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useIpoPick(round: string): string | null {
  return useSyncExternalStore(subscribe, () => read(round), () => null);
}
