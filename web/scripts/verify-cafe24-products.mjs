/**
 * 체험몰 상품이 data/products.ts 와 맞는지 확인한다.
 *   node scripts/verify-cafe24-products.mjs
 * lib/stock.ts 가 쓰는 것과 같은 쿼리로 읽어서, 앱이 실제로 읽을 재고까지 대조한다.
 */

import { api } from './cafe24.mjs';
const WANT = {19:['달항아리 티라미수',15000,false],23:['ZERO 카스테라',12000,false],25:['글루텐프리 스콘',3800,true],
 27:['대만식 샌드위치',2400,false],28:['글루텐프리 휘낭시에',3800,true],29:['마틸다 초코케이크',42000,false],
 30:['비건 잉글리시 머핀',1500,true],31:['테트리스 브레드',11000,true],32:['제로 무설탕 모닝롤',4500,true],33:['냉동생지 3종',21000,true]};
const nos = Object.keys(WANT).join(',');
/* lib/stock.ts 가 쓰는 것과 같은 쿼리 */
const r = await api(`/api/v2/admin/products?product_no=${nos}&limit=100&embed=variants`);
const { products = [] } = JSON.parse(r.body);
let pass=0, fail=0;
console.log('번호  이름                 정가        판매/진열   앱이 읽을 재고   기대   판정');
for (const no of Object.keys(WANT).map(Number).sort((a,b)=>a-b)) {
  const p = products.find(x => x.product_no === no);
  const [name, price, inStock] = WANT[no];
  if (!p) { fail++; console.log(`${String(no).padStart(3)}   ❌ 없음`); continue; }
  const live = p.selling === 'T' && p.display === 'T';
  const okName = p.product_name === name, okPrice = Math.round(Number(p.price)) === price, okStock = live === inStock;
  const good = okName && okPrice && okStock;
  if (good) pass++; else fail++;
  console.log(`${String(no).padStart(3)}   ${p.product_name.padEnd(18)} ${String(Math.round(Number(p.price))).padStart(6)}원   ${p.selling}/${p.display}      ${live?'판매중':'품절  '}       ${inStock?'판매중':'품절  '}   ${good?'✅':'❌ '+[!okName&&'이름',!okPrice&&'가격',!okStock&&'재고'].filter(Boolean).join(',')}`);
}
console.log(`\n${fail===0?'전부 일치':'불일치 있음'} — ${pass}/${pass+fail}`);

const all = await api('/api/v2/admin/products?limit=100&fields=product_no,product_name,display,selling');
const list = JSON.parse(all.body).products ?? [];
console.log(`\n체험몰 전체 ${list.length}개 · 진열중 ${list.filter(p=>p.display==='T').length}개 · 숨김 ${list.filter(p=>p.display!=='T').length}개`);
