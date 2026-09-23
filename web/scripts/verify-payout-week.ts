/**
 * 배당 지급 주 판정 — 주말에 누르면 이번 주, 평일에 누르면 지난주.
 *   npx --no-install tsx scripts/verify-payout-week.ts
 */
import assert from 'node:assert/strict';
import { weekWindow } from '../src/lib/dividend';
import { payWeekDate } from '../src/lib/payout';

const week = (iso: string) => weekWindow(payWeekDate(new Date(iso)));
const cases: [string, string, string][] = [
  ['2026-09-26T00:10:00+09:00', '2026-09-21', '토요일 새벽 → 이번 주'],
  ['2026-09-27T22:00:00+09:00', '2026-09-21', '일요일 밤 → 이번 주'],
  ['2026-09-28T09:00:00+09:00', '2026-09-21', '월요일 → 지난주'],
  ['2026-09-25T23:59:00+09:00', '2026-09-14', '금요일 밤 → 지난주'],
  ['2026-09-25T15:30:00Z',       '2026-09-21', 'UTC 금요일 15:30 = KST 토요일 00:30 → 이번 주'],
];
for (const [at, from, label] of cases) {
  assert.equal(week(at).from, from, label);
  console.log(`✅ ${label}`);
}

/* 휴장일이 낀 주의 출석 기준 — 거래일 − 1, 3일 상한, 최소 1 */
import { visitDaysNeeded } from '../src/lib/dividend';
assert.equal(visitDaysNeeded('2026-09-14', '2026-09-19'), 3, '평소 주(거래일 5일) → 3일');
assert.equal(visitDaysNeeded('2026-09-21', '2026-09-26'), 2, '추석 주(거래일 3일) → 2일');
assert.equal(visitDaysNeeded('2026-10-05', '2026-10-10'), 2, '10/5 주(거래일 3일) → 2일');
console.log('✅ 휴장 주 출석 기준');

/* 배당금 쿠폰 마감 — 다음 거래일 15:30 직전, 달을 넘지 않게 */
import { redeemWindowEnd } from '../src/lib/payout';
const end = (iso: string) => new Date(redeemWindowEnd(new Date(iso))).toISOString();
assert.equal(end('2026-09-24T12:00:00+09:00'), new Date('2026-09-28T15:00:00+09:00').toISOString(), '추석(목) → 9/28(월) 15:00');
assert.equal(end('2026-09-26T12:00:00+09:00'), new Date('2026-09-28T15:00:00+09:00').toISOString(), '토요일 → 월요일 15:00');
assert.equal(end('2026-10-31T12:00:00+09:00'), new Date('2026-10-31T23:00:00+09:00').toISOString(), '10/31(토) → 달 말에서 끊는다');
console.log('✅ 배당금 쿠폰 마감');

import { kstDateTime } from '../src/lib/payout';
assert.equal(kstDateTime(new Date('2026-09-23T08:47:12.345Z')), '2026-09-23T17:00:00+09:00', '카페24는 정각만 받는다');
console.log('✅ 쿠폰 기간 형식');
