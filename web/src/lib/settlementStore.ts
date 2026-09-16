'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * 내 하루 — 브라우저에만 남는 정산 입력.
 *
 * 서버로 가지 않는다. 종목을 골랐다면 심볼만 /api/quote로 나가고,
 * 수익률 숫자는 어디에도 보내지 않는다.
 *
 * localStorage를 외부 저장소로 두고 useSyncExternalStore로 읽는다.
 * 서버 스냅샷을 null로 두면 SSR·하이드레이션은 '정산 전' 화면을 그리고,
 * 하이드레이션이 끝난 뒤 저장값으로 한 번에 바뀐다 — 불일치가 없다.
 *
 * 메모리 사본을 함께 두는 이유: 시크릿 모드나 저장 차단 환경에서 localStorage가
 * 던진다. 그때도 이번 방문 동안은 화면에 남아야 한다.
 */

export type Source =
  | { kind: 'symbol'; symbol: string; name: string; pnlPct: number }
  | { kind: 'manual'; pnlPct: number };

const STORAGE_KEY = 'makji_settlement';

let memo: string | null | undefined; // undefined = 아직 안 읽음
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function read(): string | null {
  if (memo === undefined) {
    try {
      memo = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      memo = null;
    }
  }
  return memo;
}

const readOnServer = (): string | null => null;

function write(raw: string | null) {
  memo = raw;
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* 저장 못 해도 메모리 사본으로 이번 방문은 유지된다 */
  }
  listeners.forEach(callback => callback());
}

/** 저장값이 오늘 것일 때만 살린다. 빵장은 하루 단위라 어제 정산은 버린다 */
function parse(raw: string | null, today: string): Source | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { date?: string; source?: Source };
    return saved?.date === today && saved.source ? saved.source : null;
  } catch {
    return null;
  }
}

export function useSavedSource(today: string): [Source | null, (next: Source | null) => void] {
  const raw = useSyncExternalStore(subscribe, read, readOnServer);
  const source = useMemo(() => parse(raw, today), [raw, today]);
  const setSource = (next: Source | null) =>
    write(next ? JSON.stringify({ date: today, source: next }) : null);
  return [source, setSource];
}
