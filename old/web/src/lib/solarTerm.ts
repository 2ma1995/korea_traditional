import { SOLAR_TERMS, type SolarTerm } from '@/data/solarTerms';

/** 1/1을 0으로 하는 경과일. 윤년은 Date.UTC가 처리한다. */
function dayOfYear(month: number, day: number, year: number) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000);
}

/** 절기를 양력 날짜 순으로 정렬 (입춘 2/4 ~ 동지 12/22) */
function byCalendarOrder(year: number) {
  return SOLAR_TERMS.map((term) => ({ term, at: dayOfYear(term.month, term.day, year) })).sort(
    (a, b) => a.at - b.at,
  );
}

/**
 * 주어진 날짜가 속한 절기.
 * 절기는 시작일부터 다음 절기 전날까지 유효하다.
 * 1/1~소한 전날은 전년 12월에 시작한 동지 구간이므로, 달력상 마지막 절기를 반환한다.
 */
export function currentTerm(date = new Date()): SolarTerm {
  const year = date.getFullYear();
  const today = dayOfYear(date.getMonth() + 1, date.getDate(), year);
  const ordered = byCalendarOrder(year);

  const started = ordered.filter((x) => x.at <= today);
  if (started.length === 0) {
    // 연초 — 전년도 마지막 절기가 아직 유효하다
    return ordered[ordered.length - 1].term;
  }
  return started[started.length - 1].term;
}

/** 다음 절기와 남은 일수 */
export function nextTerm(date = new Date()): { term: SolarTerm; daysLeft: number } {
  const year = date.getFullYear();
  const today = dayOfYear(date.getMonth() + 1, date.getDate(), year);
  const ordered = byCalendarOrder(year);

  const upcoming = ordered.find((x) => x.at > today);
  if (upcoming) {
    return { term: upcoming.term, daysLeft: upcoming.at - today };
  }

  // 연말 — 내년 첫 절기까지
  const first = byCalendarOrder(year + 1)[0];
  const daysThisYear = dayOfYear(12, 31, year) + 1;
  return { term: first.term, daysLeft: daysThisYear - today + first.at };
}

export type TermPhase = 'done' | 'current' | 'upcoming';

export interface TermWithPhase {
  term: SolarTerm;
  phase: TermPhase;
  /** upcoming일 때 남은 일수 */
  daysUntil: number | null;
}

/**
 * 24절기를 전통 순서(입춘 → 대한)로 정렬하고, 오늘 기준 상태를 붙인다.
 * 전통 순서는 황경 315°(입춘)를 시작점으로 한다.
 */
export function termsInTraditionalOrder(date = new Date()): TermWithPhase[] {
  const year = date.getFullYear();
  const today = dayOfYear(date.getMonth() + 1, date.getDate(), year);
  const active = currentTerm(date);

  return [...SOLAR_TERMS]
    .sort((a, b) => ((a.longitude - 315 + 360) % 360) - ((b.longitude - 315 + 360) % 360))
    .map((term) => {
      if (term.longitude === active.longitude) {
        return { term, phase: 'current' as const, daysUntil: null };
      }
      const at = dayOfYear(term.month, term.day, year);
      return at < today
        ? { term, phase: 'done' as const, daysUntil: null }
        : { term, phase: 'upcoming' as const, daysUntil: at - today };
    });
}

/** 절기 6개씩 봄·여름·가을·겨울로 묶는다 (입춘·입하·입추·입동 기준) */
export function groupBySeason(terms: TermWithPhase[]) {
  const labels = ['봄', '여름', '가을', '겨울'] as const;
  return labels.map((label, i) => ({ label, items: terms.slice(i * 6, i * 6 + 6) }));
}
