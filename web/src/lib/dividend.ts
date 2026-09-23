import { loadDividendPolicy } from '@/lib/appSettings';
import { boughtInWindow } from '@/lib/fills';
import { seoulDateString } from '@/lib/market';
import { KRX_HOLIDAYS } from '@/lib/orderbook';
import { countVisits } from '@/lib/visits';
import { watchedInWindow } from '@/lib/watches';

/**
 * 주말 배당 — 주간 활동점수와 지급액.
 *
 * 셋을 각각 주 1회만 센다. 같은 행동을 열 번 해도 점수는 하나다 —
 * 포인트가 걸리면 관심빵을 열 개 누르는 사람이 반드시 나온다.
 *
 *   관심빵 담기        watches   한 주에 한 번이라도 담았나
 *   Bread Market 구매  fills     한 주에 한 번이라도 샀나
 *   거래일 출석        visits    한 주에 사흘 이상 왔나
 *
 * 셋이 각각 참여 · 전환 · 재방문을 재서 역할이 겹치지 않는다. 배점은 1:1:1이다 —
 * 지금은 근거가 없어서 균등이고, 관심→구매 전환율(skuSignals)이 쌓이면 그 비율로
 * 재조정한다. 구매에 큰 가중을 주지 않는 이유가 하나 더 있다. 빵은 한 주에 두 번
 * 사는 물건이 아니라, 구매자에게 최대 배당을 주면 이번 주에 다시 살 가능성이 가장
 * 낮은 사람에게 가장 많이 주게 된다.
 *
 * 잔액은 우리가 들지 않는다. 실제 적립은 카페24 적립금으로 나가고 원장도 거기 있다.
 * 여기서는 "이번 주에 얼마를 줄 것인가"만 계산한다 — 월말 소멸도 카페24 쪽 정책이다.
 */

/** 출석 점수를 받는 최소 거래일 수 — 평소(거래일 5일) 기준 */
export const VISIT_DAYS_FOR_POINT = 3;

/**
 * 이번 주에 출석으로 인정할 날 수.
 *
 * 휴장일이 낀 주는 거래일이 줄어든다. 추석 주(9/21)와 10/5 주는 사흘뿐이라
 * "3일"을 그대로 두면 하루도 빠짐없이 와야 한다. 거래일 − 1(하루는 빠져도 된다),
 * 평소 기준 3일을 넘지 않게, 최소 1일.
 */
export function visitDaysNeeded(from: string, to: string): number {
  let trading = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) < to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !KRX_HOLIDAYS.has(d.toISOString().slice(0, 10))) trading += 1;
  }
  return Math.max(1, Math.min(VISIT_DAYS_FOR_POINT, trading - 1));
}

export interface WeeklyScore {
  watched: boolean;
  bought: boolean;
  visitDays: number;
  /** 이번 주 출석 인정 기준(일). 휴장일이 낀 주는 줄어든다 */
  visitNeeded: number;
  attended: boolean;
  /** 0~3 */
  score: number;
  /** 이번 주 지급액 (P). 0점이면 0 */
  amount: number;
  /** 만점일 때의 금액 — 화면에 "3점이면 얼마"를 보여주려고 같이 준다 */
  max: number;
  /** 점수를 센 구간 [from, to) — 월요일부터 토요일 직전까지 */
  from: string;
  to: string;
}

/**
 * 이 날짜가 속한 주의 거래일 구간 [월요일, 토요일).
 *
 * 배당은 토요일에 지급하므로 그 직전까지의 평일 활동만 센다. 주말 방문이 점수에
 * 들어가면 배당을 쓰러 온 방문이 다음 배당을 만드는 순환이 된다.
 */
export function weekWindow(at: Date): { from: string; to: string } {
  /* KST 달력 날짜를 먼저 뽑고, 그 뒤로는 UTC 자정 기준으로만 더하고 뺀다.
     toLocaleString으로 Date를 KST 벽시계로 옮긴 뒤 다시 seoulDateString을 태우면
     시간대가 두 번 적용된다 — 이 맥(KST)에서는 상쇄돼 맞지만 UTC 서버에서는
     9시간이 밀려 주 경계에서 다른 주를 가리킨다. */
  const base = new Date(`${seoulDateString(at)}T00:00:00Z`);
  const weekday = base.getUTCDay();                 // 0 일요일 … 6 토요일 (KST 달력 기준)
  const backToMonday = weekday === 0 ? 6 : weekday - 1;

  const monday = new Date(base);
  monday.setUTCDate(monday.getUTCDate() - backToMonday);
  const saturday = new Date(monday);
  saturday.setUTCDate(saturday.getUTCDate() + 5);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(saturday) };
}

/**
 * 이 사람의 이번 주 점수와 지급액.
 *
 * 표식이 없으면(처음 온 사람) 0점이다 — 없는 활동을 만들어내지 않는다.
 */
export async function weeklyScoreFor(visitor: string | null, at: Date = new Date()): Promise<WeeklyScore> {
  const { from, to } = weekWindow(at);
  const policy = await loadDividendPolicy();
  const visitNeeded = visitDaysNeeded(from, to);
  const empty: WeeklyScore = {
    watched: false, bought: false, visitDays: 0, visitNeeded, attended: false,
    score: 0, amount: 0, max: policy.weeklyMax, from, to,
  };
  if (!visitor) return empty;

  const [watched, bought, visitDays] = await Promise.all([
    watchedInWindow(visitor, from, to),
    boughtInWindow(visitor, from, to),
    countVisits(visitor, from, to),
  ]);

  const attended = visitDays >= visitNeeded;
  const score = Number(watched) + Number(bought) + Number(attended);
  return {
    watched, bought, visitDays, visitNeeded, attended, score,
    amount: score === 0 ? 0 : policy.tiers[score - 1],
    max: policy.weeklyMax,
    from, to,
  };
}
