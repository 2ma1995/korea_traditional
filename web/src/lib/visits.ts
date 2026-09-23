import { seoulDateString } from '@/lib/market';
import { KRX_HOLIDAYS } from '@/lib/orderbook';
import { supabase } from '@/lib/supabase';

/**
 * 거래일 출석 — 주간 활동점수의 세 항목 중 하나.
 *
 * 하루에 몇 번 들어오든 1회다. (day, visitor) unique가 그 역할을 한다 —
 * 새로고침을 반복해 점수를 쌓는 걸 막는다. watches가 사람 단위로 세는 것과 같다.
 *
 * ⚠️ 휴장일 방문은 점수에 넣지 않는다. 배당을 쓰러 온 방문이 다음 배당을 만들면
 *    순환논리가 된다. 기록은 남기되 집계에서 거래일만 센다.
 */

const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

/* 표가 없을 때의 폴백 — watches·fills와 같은 방식이다. 로컬에서 확인이 막히면 안 된다 */
const memory = new Set<string>();

/**
 * 오늘 출석을 남긴다. 이미 있으면 조용히 넘어간다.
 *
 * 화면을 그릴 때마다 불리므로 실패해도 페이지를 막지 않는다 — 출석은 배당 점수의
 * 재료일 뿐이고, 여기서 예외를 던지면 저장소 문제로 빵장 전체가 안 열린다.
 */
export async function recordVisit(visitor: string, at: Date = new Date()): Promise<void> {
  const day = seoulDateString(at);
  const key = `${day}:${visitor}`;
  const db = supabase();
  if (!db) { memory.add(key); return; }

  const { error } = await db.from('visits').insert({ day, visitor });
  if (!error) return;
  if (missingTable(error.code)) { memory.add(key); return; }
  /* 오늘 이미 왔다 — 정상이다 */
  if (error.code === '23505') return;
  /* 그 밖의 실패는 삼킨다. 출석 한 건 때문에 화면이 죽으면 안 된다 */
}

/** [from, to) 구간에 이 사람이 며칠 왔나. 주말은 호출부가 구간으로 자르고, 평일 휴장일은 여기서 뺀다 */
export async function countVisits(visitor: string, from: string, to: string): Promise<number> {
  const db = supabase();
  if (!db) return [...memory].filter(key => {
    const day = key.slice(0, 10);
    return key.endsWith(`:${visitor}`) && day >= from && day < to && !KRX_HOLIDAYS.has(day);
  }).length;

  let query = db
    .from('visits')
    .select('id', { count: 'exact', head: true })
    .eq('visitor', visitor)
    .gte('day', from)
    .lt('day', to);
  const closed = [...KRX_HOLIDAYS].filter(day => day >= from && day < to);
  if (closed.length) query = query.not('day', 'in', `(${closed.join(',')})`);
  const { count, error } = await query;

  if (error) return 0;
  return count ?? 0;
}
