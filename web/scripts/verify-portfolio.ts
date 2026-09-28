/** npx --no-install tsx scripts/verify-portfolio.ts — 관심빵 키(빵·옵션) 계산. 브라우저 없음. */
import assert from 'node:assert/strict';

async function main() {
  const { byProduct, keyOf, qtyOf, sortHoldings, splitKey } = await import('../src/lib/portfolioStore');

  // 옵션이 있으면 "번호:품목코드", 없으면 "번호" — 옛날에 담은 키도 그대로 읽힌다
  assert.equal(keyOf(28, 'COCO'), '28:COCO');
  assert.equal(keyOf(31, null), '31');
  assert.deepEqual(splitKey('28:COCO'), { no: 28, unit: 'COCO' });
  assert.deepEqual(splitKey('31'), { no: 31, unit: null });

  // 휘낭시에 코코넛·피칸 + 모닝롤 — 목록은 옵션마다 한 줄, 비중·도넛은 빵 단위로 합친다
  const portfolio = { '28:COCO': { qty: 2, at: 10 }, '28:PECAN': { qty: 1, at: 30 }, '32': { qty: 2, at: 20 } };
  const rows = sortHoldings(portfolio);
  assert.deepEqual(rows.map(r => r.key), ['32', '28:COCO', '28:PECAN']); // 관심도 같으면 최근에 담은 쪽 먼저
  assert.equal(qtyOf(portfolio, 28), 3);
  assert.equal(qtyOf(portfolio, 99), 0);
  const breads = byProduct(rows);
  assert.deepEqual(breads.find(b => b.no === 28), { no: 28, qty: 3, at: 30 });
  assert.equal(breads.length, 2);

  console.log('verify-portfolio: ok');
}

main().catch(error => { console.error(error); process.exit(1); });
