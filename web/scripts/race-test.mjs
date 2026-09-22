/**
 * 동시 예약 시험 — 선착순 잠금이 진짜로 막는지 본다.
 *
 *   node scripts/race-test.mjs [사람수]
 *   node scripts/race-test.mjs --clean     시험이 남긴 예약을 지운다
 *
 * 서른 자리에 쉰 명이 **같은 순간** 달려들게 하고, 정확히 서른 명만 통과하는지 센다.
 * 이걸 눈으로 확인할 방법이 없어서 만들었다 — 혼자 눌러보면 늘 멀쩡해 보인다.
 *
 * 세 가지를 본다.
 *   ① 초과 체결   자리보다 많이 나가면 못 주는 빵을 팔았다고 손님에게 말하게 된다
 *   ② 과소 체결   자리가 남았는데 전부 튕기면 팔 수 있는 빵을 안 판 것이다
 *   ③ 자리 번호   1..N이 겹치지 않고 하나씩 나와야 한다
 *
 * 사람은 방문자 쿠키로 가른다. 쿠키가 같으면 "한 사람 한 자리"(0015)에 걸려
 * 경합이 아니라 멱등성을 시험하게 된다 — 그건 아래 따로 본다.
 */

const BASE = process.env.BASE ?? 'http://localhost:3000';
const CLEAN = process.argv.includes('--clean');
const PEOPLE = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 50);

/**
 * 시험이 남긴 예약을 지운다.
 *
 * ⚠️ 날짜는 **KST**다. 서버가 seoulDateString으로 쓰기 때문이다 —
 *    UTC로 지우면 자정 전후에 엉뚱한 날을 건드리고, 지운 줄 알았는데 그대로다.
 *    실제로 그 함정에 한 번 빠져 앱이 고장 난 줄 알았다.
 */
async function clean(productNo) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log('SUPABASE 환경변수가 없어 정리를 건너뜁니다.'); return; }
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await fetch(`${url}/rest/v1/fills?day=eq.${kst}&product_no=eq.${productNo}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(`상품 ${productNo}의 ${kst} 예약 삭제: ${res.status}`);
}

const uuid = () => crypto.randomUUID();

async function today() {
  const res = await fetch(`${BASE}/api/fill`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`오늘 정보를 못 읽었습니다 (${res.status})`);
  return res.json();
}

async function reserve(productNo, depth, unit, visitor) {
  const res = await fetch(`${BASE}/api/fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `bm_v=${visitor}` },
    body: JSON.stringify({ productNo, depth, unit }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const main = async () => {
  const info = await today();
  console.log(`오늘 체결 현황: ${JSON.stringify(info.filled ?? {}).slice(0, 120)}`);

  const page = await (await fetch(BASE, { cache: 'no-store' })).text();
  const m = page.match(/\\"productNo\\":(\d+),[\s\S]{0,2500}?\\"onLine\\"[\s\S]{0,600}?\\"rate\\":([0-9.]+)[\s\S]{0,900}?\\"units\\":\[\{\\"code\\":\\"([A-Z0-9]+)\\"[\s\S]{0,300}?\\"allotment\\":(\d+)/);
  if (!m) { console.log('시험할 상품을 화면에서 못 찾았습니다. 장이 열려 있는지 확인하세요.'); return; }
  const [, productNo, rate, unit, allotment] = m;
  console.log(`\n대상: 상품 ${productNo} · 폭 ${rate} · 옵션 ${unit} · 자리 ${allotment}개`);
  if (CLEAN) { await clean(productNo); return; }
  console.log(`${PEOPLE}명이 동시에 예약을 시도합니다…\n`);

  /* 이미 나간 자리를 빼야 기대값이 맞는다. 시험을 두 번 돌리면 첫 판이 자리를
     채워두므로, 그걸 모르면 멀쩡한 코드를 '과소 체결'이라고 잡는다 */
  const before = (await today()).filled?.[`${productNo}:${Number(rate).toFixed(3)}`] ?? 0;
  const room = Math.max(0, Number(allotment) - before);
  console.log(`이미 나간 자리 ${before}개 · 남은 자리 ${room}개`);
  if (room === 0) { console.log('자리가 남지 않아 시험할 수 없습니다. 내일 다시 하거나 fills를 비우세요.'); return; }

  const results = await Promise.all(
    Array.from({ length: PEOPLE }, () => reserve(Number(productNo), Number(rate), unit, uuid())),
  );

  const won = results.filter(r => r.ok && r.filled);
  const lost = results.filter(r => !(r.ok && r.filled));
  const slots = won.map(r => r.slot).sort((a, b) => a - b);
  const dup = slots.filter((v, i) => i > 0 && v === slots[i - 1]);
  const expected = Math.min(room, PEOPLE);

  console.log(`체결 ${won.length} · 미체결 ${lost.length}`);
  console.log(`자리 번호: ${slots.slice(0, 12).join(', ')}${slots.length > 12 ? ' …' : ''}`);

  let bad = 0;
  if (won.length > expected) { console.log(`❌ 초과 체결 — ${expected}명이 한도인데 ${won.length}명이 통과했습니다`); bad++; }
  if (won.length < expected) { console.log(`❌ 과소 체결 — ${expected}명이 되어야 하는데 ${won.length}명입니다`); bad++; }
  if (dup.length) { console.log(`❌ 자리 번호 중복: ${[...new Set(dup)].join(', ')}`); bad++; }

  /* 멱등성 — 한 사람이 같은 요청을 다섯 번 */
  const me = uuid();
  const again = await Promise.all(Array.from({ length: 5 }, () => reserve(Number(productNo), Number(rate), unit, me)));
  const mine = again.filter(r => r.ok && r.filled).length;
  const full = won.length >= room;
  console.log(`\n한 사람이 다섯 번 시도 → 자리 ${mine}개${full ? ' (자리가 다 차서 0이 정상)' : ''}`);
  if (mine > 1) { console.log(`❌ 한 사람이 자리를 ${mine}개 먹었습니다 (0015가 안 걸렸습니다)`); bad++; }
  if (!full && mine !== 1) { console.log(`❌ 자리가 남았는데 한 자리도 못 잡았습니다`); bad++; }

  console.log(bad ? `\n실패 ${bad}건` : '\n✅ 전부 통과');
  process.exitCode = bad ? 1 : 0;
};

main().catch(e => { console.error('시험 중 오류:', e.message); process.exitCode = 1; });
