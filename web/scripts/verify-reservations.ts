/** npx --no-install tsx scripts/verify-reservations.ts — no network or real orders. */
import assert from 'node:assert/strict';

async function main() {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { tryFill, loadMyReservations, loadFilledCounts } = await import('../src/lib/fills');
  const at = new Date('2026-09-23T17:00:00+09:00');
  const first = await tryFill(32, 0.07, 30, at, 'alice', 'OPTION2');
  assert.equal(first.filled, true);
  const repeated = await tryFill(32, 0.10, 30, at, 'alice', 'OPTION1');
  assert.equal(repeated.already, true);
  assert.equal(repeated.filled, false);
  const mine = await loadMyReservations('alice', at);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].unit, 'OPTION2');
  assert.equal(mine[0].depth, 0.07);
  assert.equal(mine[0].slot, first.slot);
  assert.deepEqual(await loadMyReservations('bob', at), []);
  assert.deepEqual(await loadMyReservations(null, at), []);
  assert.deepEqual(await loadMyReservations('alice', new Date('2026-09-24T17:00:00+09:00')), []);
  assert.equal((await loadFilledCounts(at))['32:0.070'], 1);
  assert.equal((await tryFill(32, 0.07, 30, at, 'bob', 'OPTION2')).filled, true);
  assert.equal((await loadFilledCounts(at))['32:0.070'], 2);
  // Price-mode reservations have no coupon: unknown payment must not restore stock.
  process.env.SUPABASE_URL = 'http://reservation-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
  const originalFetch = globalThis.fetch;
  const originalSocket = globalThis.WebSocket;
  // No realtime is used in this test; older local Node versions lack WebSocket.
  globalThis.WebSocket = class { constructor() { throw new Error('Unexpected realtime connection'); } } as unknown as typeof WebSocket;
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method ?? 'GET', 'GET', 'Unverified payment must not trigger a write');
    const url = new URL(String(input));
    assert.ok(url.pathname.includes('/rest/v1/fills'));
    reads++;
    if (url.searchParams.has('visitor')) {
      assert.equal(url.searchParams.get('visitor'), 'eq.alice');
      assert.equal(url.searchParams.get('day'), 'eq.2026-09-23');
      assert.equal(url.searchParams.get('settled'), 'neq.expired');
      return new Response(JSON.stringify([{ product_no: 32, depth: '0.07', unit: 'OPTION2', slot: 1, expires_at: null, settled: 'open', coupon_code: null }]));
    }
    return new Response(JSON.stringify([{ id: 1, product_no: 32, coupon_code: null, unit: 'OPTION2' }]));
  };
  try {
    assert.equal((await loadMyReservations('alice', at))[0].unit, 'OPTION2');
    const { sweepExpired } = await import('../src/lib/settle');
    /* 쿠폰이 없으면 반납한다. 판매가 연동 모드에서는 쿠폰을 아예 안 만들기 때문에
       (lib/coupon.COUPON_ENABLED) 여기서 붙들면 모든 예약이 영원히 안 풀린다 —
       서른 자리가 첫날 차고 끝난다. lib/settle.paidFor의 주석 참고.
       '붙들기'는 쿠폰은 있는데 카페24를 못 읽었을 때만이다. */
    assert.deepEqual(await sweepExpired(at), { checked: 1, held: 0, paid: 0, expired: 1 });
    assert.equal(reads, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
  }
  console.log('PASS: 쿠폰 없는 예약은 기한이 지나면 반납된다 (판정 수단이 아예 없는 경우)');
  console.log('PASS: 재예약은 원래 옵션·폭을 지키고, 사람·날짜가 섞이지 않으며, 두 번 세지 않는다');
}
void main();
