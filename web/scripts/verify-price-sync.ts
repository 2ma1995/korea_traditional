/** npx --no-install tsx scripts/verify-price-sync.ts — 시세를 못 받은 날 15:30 크론이 판매가를 바꾸지 않는다.
    fetch를 전부 막고 돈다 — 카페24·Supabase·시세 어디에도 요청이 나가지 않는다(PRICE_SYNC=on이어도 안전). */
import assert from 'node:assert/strict';

async function main() {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  process.env.DISCOUNT_DELIVERY = 'price';
  process.env.PRICE_SYNC = 'on';
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('offline'); }) as typeof fetch;

  const { publishToday } = await import('../src/lib/priceSync');
  const report = await publishToday(new Date('2026-09-29T06:30:00Z'));   // 화 15:30 KST
  assert.equal(report.dryRun, true, '샘플 시세로는 dryRun — 크론이 알림도 보내지 않는다');
  assert.equal(report.applied.length, 0, '샘플 폭으로 계산한 목록도 남기지 않는다');
  assert.match(report.note ?? '', /샘플/);
  assert.ok(calls > 0, '시세 조회는 시도했다');
  console.log('verify-price-sync: ok');
}

main().catch(error => { console.error(error); process.exit(1); });
