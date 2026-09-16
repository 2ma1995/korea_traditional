import { supabase } from '@/lib/supabase';
import { seoulDateString } from '@/lib/market';

/**
 * 오늘의 빵장 시황.
 *
 * 손님이 빵을 사지 않아도 들어올 이유를 만드는 자리다. 잃은 날 가장 듣고 싶은
 * 말은 "나만 그런 게 아니구나"이고, 그건 오늘 사람들이 어느 칸에 앉았는지를
 * 보여주면 된다. 운세 서비스 이용 동기 1위가 "마음의 위안"(59%)인 것과 같은 자리다.
 *
 * 저장하는 것은 세 가지뿐이다 — 날짜 · 위로/자축/본전 · 몇 번째 칸.
 * 수익률 숫자도, 고른 종목도, 사용자 식별자도 서버로 오지 않는다.
 *
 * 표본이 적을 때 비율을 그대로 보여주면 "100%가 위로가"처럼 거짓말이 된다.
 * MIN_SAMPLE 미만이면 화면이 비율 대신 "집계 중"을 띄우도록 ready로 알린다.
 */

export type SettlementSideKey = 'gain' | 'loss' | 'flat';

/** 이 인원을 넘겨야 비율을 보여준다 */
export const MIN_SAMPLE = 10;

/** 체결 탭에 시간순으로 보여줄 한 줄 */
export interface TapeEvent {
  /** ISO 시각 */
  at: string;
  side: SettlementSideKey;
  seat: number;
  demo: boolean;
}

export interface Tape {
  day: string;
  total: number;
  loss: number;
  gain: number;
  flat: number;
  /** 오늘 가장 깊은 칸에 앉은 사람 수 */
  deepest: number;
  /** 이 중 화면 확인용 샘플이 몇 건인가. 0이 아니면 화면에 밝힌다 */
  demo: number;
  /** 비율을 보여줘도 되는 표본인가 */
  ready: boolean;
  /** 저장소에 닿았는가. false면 "집계 준비 전"이다 (DB 미연결) */
  live: boolean;
  /** 최근 순. 체결 탭이 시간순 목록으로 보여준다 */
  recent: TapeEvent[];
}

/** 체결 탭에 보여줄 최대 줄 수 */
const RECENT_LIMIT = 40;

const empty = (day: string, live: boolean): Tape => ({
  day, total: 0, loss: 0, gain: 0, flat: 0, deepest: 0, demo: 0, ready: false, live, recent: [],
});

export async function loadTape(at: Date = new Date()): Promise<Tape> {
  const day = seoulDateString(at);
  const db = supabase();
  if (!db) return empty(day, false);

  const { data, error } = await db
    .from('settlement_events')
    .select('side, seat, demo, created_at')
    .eq('day', day)
    .order('created_at', { ascending: false });

  if (error || !data) return empty(day, false);

  const rows = data as { side: SettlementSideKey; seat: number; demo: boolean; created_at: string }[];
  const maxSeat = rows.reduce((top, row) => Math.max(top, row.seat), 0);

  return {
    day,
    total: rows.length,
    loss: rows.filter(row => row.side === 'loss').length,
    gain: rows.filter(row => row.side === 'gain').length,
    flat: rows.filter(row => row.side === 'flat').length,
    /* 오늘 실제로 앉은 칸 중 가장 깊은 칸의 인원. 열린 칸 수는 날마다 다르므로
       고정 인덱스가 아니라 오늘 관측된 최대값을 기준으로 센다 */
    deepest: rows.filter(row => row.seat === maxSeat).length,
    demo: rows.filter(row => row.demo).length,
    ready: rows.length >= MIN_SAMPLE,
    live: true,
    recent: rows.slice(0, RECENT_LIMIT).map(row => ({
      at: row.created_at, side: row.side, seat: row.seat, demo: row.demo,
    })),
  };
}

/** 정산 한 건을 남기고, 갱신된 집계를 돌려준다 */
export async function recordSettlement(
  side: SettlementSideKey,
  seat: number,
  at: Date = new Date(),
): Promise<Tape> {
  const day = seoulDateString(at);
  const db = supabase();
  if (!db) return empty(day, false);

  await db.from('settlement_events').insert({ day, side, seat, demo: false });
  return loadTape(at);
}
