/** npx --no-install tsx scripts/verify-holidays.ts — 휴장일 판정. 네트워크·DB 없음. */
import assert from 'node:assert/strict';

async function main() {
  process.env.MARKET_ALWAYS_OPEN = '';
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { KRX_HOLIDAYS, isWeekend, marketHours, pickWindow } = await import('../src/lib/orderbook');
  const { countVisits, recordVisit } = await import('../src/lib/visits');
  const kst = (s: string) => new Date(`${s}+09:00`);

  // 달력 자체 — 오타로 주말 날짜나 없는 날짜가 들어가면 여기서 걸린다
  for (const day of KRX_HOLIDAYS) {
    const d = new Date(`${day}T12:00:00Z`);
    assert.equal(d.toISOString().slice(0, 10), day, `없는 날짜: ${day}`);
    assert.ok(d.getUTCDay() !== 0 && d.getUTCDay() !== 6, `주말은 적지 않는다: ${day}`);
  }
  assert.equal([...KRX_HOLIDAYS].filter(day => day.startsWith('2026')).length, 17); // 거래소 공고 17일

  // 추석(목) — 장 시간에도 닫힌다
  assert.deepEqual(marketHours(kst('2026-09-24T16:00:00')).reason, 'holiday');
  assert.equal(marketHours(kst('2026-09-24T16:00:00')).open, false);
  assert.equal(pickWindow(kst('2026-09-24T08:00:00')).reason, 'holiday');
  // 전날(수)·다음 월요일은 연다
  assert.equal(marketHours(kst('2026-09-23T16:00:00')).open, true);
  assert.equal(marketHours(kst('2026-09-28T16:00:00')).open, true);
  // 날짜는 KST로 본다 — UTC 9/23 15:30은 KST 9/24 00:30, 휴장일이다
  assert.equal(marketHours(new Date('2026-09-23T15:30:00Z')).reason, 'holiday');
  assert.equal(marketHours(new Date('2026-09-27T15:30:00Z')).reason, 'before'); // KST 월 00:30

  // 주말 배당은 토·일만
  assert.equal(isWeekend(kst('2026-09-24T12:00:00')), false);
  assert.equal(isWeekend(kst('2026-09-26T12:00:00')), true);

  // 출석 — 공휴일에 온 날은 거래일 출석으로 세지 않는다
  for (const day of ['2026-09-21', '2026-09-23', '2026-09-24', '2026-09-25']) {
    await recordVisit('bob', kst(`${day}T12:00:00`));
  }
  assert.equal(await countVisits('bob', '2026-09-21', '2026-09-26'), 2);

  console.log('verify-holidays: ok');
}

main().catch(error => { console.error(error); process.exit(1); });
