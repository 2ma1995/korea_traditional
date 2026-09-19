/**
 * 관심 담기 → 수요 보정(+3%p) 검증.
 *
 *   cd web && npx tsx scripts/verify-watches.ts
 *
 * Supabase 없이 메모리 폴백으로 돈다 — 로컬에서 그대로 확인할 수 있다.
 * 과거 날짜로 씨를 뿌려(recordWatch·tryFill의 at 인자) 7일 창을 채운다.
 *
 * ⚠️ tsx로 돌릴 때 확장자를 .mts로 바꾸지 말 것. package.json에 type이 없어
 *    .ts는 CJS, .mts는 ESM으로 갈리고 그러면 lib 모듈이 두 번 로드돼
 *    메모리 폴백 Map이 둘로 나뉜다 — 집계가 전부 0으로 보인다.
 */

import { loadWatchCounts, recordWatch } from '@/lib/watches';
import { tryFill } from '@/lib/fills';
import { loadSkuSignals } from '@/lib/skuSignals';
import { demandBonusFor, inventoryBonusFor } from '@/lib/skuAdjust';
import { seoulDateString } from '@/lib/market';

const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${got === undefined ? '' : `  (got: ${JSON.stringify(got)})`}`); }
};

async function main() {
  /* ── 1. 사람 단위 중복 제거 ── */
  console.log('\n1. 같은 날 같은 빵을 같은 사람이 여러 번 담아도 한 번만 센다');
  ok('처음 담으면 센다',           (await recordWatch(31, 'v1', ago(1))).counted === true);
  ok('같은 사람 두 번째는 안 센다', (await recordWatch(31, 'v1', ago(1))).counted === false);
  ok('다른 사람은 센다',           (await recordWatch(31, 'v2', ago(1))).counted === true);
  ok('저장소 없으면 stored=false', (await recordWatch(31, 'v3', ago(1))).stored === false);
  ok('다른 날이면 다시 센다',      (await recordWatch(31, 'v1', ago(2))).counted === true);

  /* ── 2. 창 경계 [from, to) ── */
  console.log('\n2. 집계 창은 오늘을 뺀다 — 오늘 담긴 것이 오늘 폭을 바꾸면 안 된다');
  await recordWatch(31, 'today-1', new Date());
  const from = seoulDateString(ago(7));
  const today = seoulDateString(new Date());
  ok('오늘 담긴 것은 창 밖', (await loadWatchCounts(from, today))[31] === 4, (await loadWatchCounts(from, today))[31]);
  ok('to를 내일로 하면 오늘도 들어온다', (await loadWatchCounts(from, seoulDateString(ago(-1))))[31] === 5);

  /* ── 3. 전환율 → 수요 보정 ── */
  console.log('\n3. 전환율 구간별 보정');
  const seed = async (no: number, watchers: number, fills: number) => {
    for (let i = 0; i < watchers; i++) await recordWatch(no, `w${no}-${i}`, ago(2));
    for (let i = 0; i < fills; i++) await tryFill(no, 0.3, 30, ago(2));
  };
  await seed(19, 25, 4);   /* 0.16 → low  0.03 */
  await seed(23, 25, 8);   /* 0.32 → mid  0.02 */
  await seed(25, 25, 15);  /* 0.60 → good 0    */
  await seed(27, 25, 0);   /* 0.00 → low  0.03 — 한 번도 안 팔린 빵 */
  await seed(28, 10, 2);   /* 표본 10 < 20 → 0 */
  await tryFill(29, 0.3, 30, ago(2)); /* 관심 0, 체결 1 → conversion null → 0 */

  const s = await loadSkuSignals(new Date());
  ok('19 담아만 두고 안 삼  → 0.03', demandBonusFor(s[19]) === 0.03, { c: s[19]?.conversion, n: s[19]?.demandSample });
  ok('23 중간              → 0.02', demandBonusFor(s[23]) === 0.02, { c: s[23]?.conversion });
  ok('25 잘 팔림           → 0',    demandBonusFor(s[25]) === 0,    { c: s[25]?.conversion });
  ok('27 한 번도 안 팔림   → 0.03 (합집합 회귀)', demandBonusFor(s[27]) === 0.03, { signal: s[27] });
  ok('28 표본 미달         → 0',    demandBonusFor(s[28]) === 0,    { n: s[28]?.demandSample });
  ok('29 관심 0 → conversion null', s[29] !== undefined && s[29]!.conversion === null, s[29]);
  ok('27은 체결이 없어 coverDays도 null', s[27]?.coverDays === null, s[27]);
  ok('19 재고 보정은 그대로 동작',  inventoryBonusFor(s[19]) === 0.02, { cover: s[19]?.coverDays });

  /* ── 4. 하루 동안 폭이 고정되는가 ── */
  console.log('\n4. 하루 동안 폭이 고정되는가');
  ok('(전제) 19에 신호가 있다', s[19] !== undefined);
  const before = JSON.stringify(s[19]);
  for (let i = 0; i < 50; i++) await recordWatch(19, `flood-${i}`, new Date());
  const after = await loadSkuSignals(new Date());
  ok('오늘 50명이 더 담아도 신호 동일', JSON.stringify(after[19]) === before, { before, after: after[19] });

  console.log(`\n${fail === 0 ? '전부 통과' : '실패 있음'} — ${pass} pass / ${fail} fail\n`);
  process.exit(fail === 0 ? 0 : 1);
}
void main();
