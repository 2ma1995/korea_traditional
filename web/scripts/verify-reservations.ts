/** npx --no-install tsx scripts/verify-reservations.ts — no network or real orders. */
import assert from 'node:assert/strict';

async function main() {
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { tryFill, loadMyReservations, loadFilledCounts } = await import('../src/lib/fills');
  const at = new Date('2026-09-23T17:00:00+09:00');
  const first = await tryFill(32, 0.07, 30, at, 'alice', 'OPTION2');
  assert.equal(first.filled, true);
  // 같은 옵션을 또 누르면 새 자리를 주지 않는다 — 한 사람 한 자리
  const repeated = await tryFill(32, 0.07, 30, at, 'alice', 'OPTION2');
  assert.equal(repeated.already, true);
  assert.equal(repeated.filled, false);
  // 다른 옵션은 따로 한 자리다(0019) — 휘낭시에 코코넛·피칸을 둘 다 잡을 수 있다
  const other = await tryFill(32, 0.07, 30, at, 'alice', 'OPTION1');
  assert.equal(other.filled, true);
  const mine = await loadMyReservations('alice', at);
  assert.deepEqual(mine.map(m => m.unit).sort(), ['OPTION1', 'OPTION2']);
  const option2 = mine.find(m => m.unit === 'OPTION2')!;
  assert.equal(option2.depth, 0.07);
  assert.equal(option2.slot, first.slot);
  assert.deepEqual(await loadMyReservations('bob', at), []);
  assert.deepEqual(await loadMyReservations(null, at), []);
  assert.deepEqual(await loadMyReservations('alice', new Date('2026-09-24T17:00:00+09:00')), []);
  // 빵 전체와 옵션별로 함께 센다 — 화면이 옵션마다 '물량 끝'을 말하려면 옵션별 수가 필요하다
  assert.equal((await loadFilledCounts(at))['32:0.070'], 2);
  assert.equal((await loadFilledCounts(at))['32:0.070:OPTION2'], 1);
  assert.equal((await tryFill(32, 0.07, 30, at, 'bob', 'OPTION2')).filled, true);
  assert.equal((await loadFilledCounts(at))['32:0.070'], 3);
  assert.equal((await loadFilledCounts(at))['32:0.070:OPTION2'], 2);
  assert.equal((await loadFilledCounts(at))['32:0.070:OPTION1'], 1);
  // Price-mode reservations have no coupon: unknown payment must not restore stock.
  process.env.SUPABASE_URL = 'http://reservation-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-key';
  const originalFetch = globalThis.fetch;
  const originalSocket = globalThis.WebSocket;
  // No realtime is used in this test; older local Node versions lack WebSocket.
  globalThis.WebSocket = class { constructor() { throw new Error('Unexpected realtime connection'); } } as unknown as typeof WebSocket;
  let reads = 0;
  const releases: { filter: string | null; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.includes('/rest/v1/fills'));
    /* 쓰기는 반납 한 가지만 허용한다 — 'open'인 그 줄을 'expired'로. 결제 판정 수단이
       없다고 'paid'로 올리거나 다른 줄을 건드리면 여기서 걸린다 */
    if ((init?.method ?? 'GET') !== 'GET') {
      assert.equal(init?.method, 'PATCH', 'Unverified payment must only release the slot');
      releases.push({ filter: url.searchParams.get('settled'), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify([{ id: 1 }]));
    }
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
    /* 'open'일 때만 바꾼다 — 두 인스턴스가 같은 줄을 동시에 반납해도 한쪽만 재고를 되돌린다 */
    assert.deepEqual(releases, [{ filter: 'eq.open', body: { settled: 'expired', slot: null } }]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
  }
  console.log('PASS: 쿠폰 없는 예약은 기한이 지나면 반납된다 (판정 수단이 아예 없는 경우)');
  console.log('PASS: 재예약은 원래 옵션·폭을 지키고, 사람·날짜가 섞이지 않으며, 두 번 세지 않는다');
}
void main();
