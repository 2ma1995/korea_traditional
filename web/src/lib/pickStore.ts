'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * 오늘 내 종목 — 브라우저에만 남는 선택.
 *
 * 왜 '손익 입력'이 아니라 '종목 선택'인가. 손익을 스스로 적게 하면 검증할 수 없고,
 * 아무나 −5를 적으면 최저가가 된다. 종목은 공개 시세라 부풀릴 수 없다.
 *
 * 왜 잠그나. 장 끝나고 고르면 제일 많이 움직인 종목을 고르면 그만이다.
 * 장 시작(09:00) 전에 고르고 바꾸지 못하게 해서 결과를 모르고 고르게 한다.
 * 그게 이 기능의 유일한 무결성이다.
 *
 * 서버로 가는 것은 심볼뿐이다(/api/quote). 누가 뭘 골랐는지는 저장하지 않는다.
 */

export interface Pick {
  symbol: string;
  name: string;
  /** ISO 시각 — 잠김 안내에 쓴다 */
  pickedAt: string;
}

const STORAGE_KEY = 'makji_pick';

let memo: string | null | undefined;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function read(): string | null {
  if (memo === undefined) {
    try { memo = window.localStorage.getItem(STORAGE_KEY); } catch { memo = null; }
  }
  return memo;
}
const readOnServer = (): string | null => null;

function write(raw: string | null) {
  memo = raw;
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch { /* 메모리 사본으로 이번 방문은 유지된다 */ }
  listeners.forEach(callback => callback());
}

/** 오늘 것일 때만 살린다. 어제 고른 종목이 오늘 자리를 정하면 안 된다 */
function parse(raw: string | null, today: string): Pick | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { date?: string; pick?: Pick };
    return saved?.date === today && saved.pick ? saved.pick : null;
  } catch { return null; }
}

export function useSavedPick(today: string): [Pick | null, (next: Pick | null) => void] {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const pick = useMemo(() => parse(raw, today), [raw, today]);
  const setPick = (next: Pick | null) => write(next ? JSON.stringify({ date: today, pick: next }) : null);
  return [pick, setPick];
}
