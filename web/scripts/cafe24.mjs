/**
 * 카페24 체험몰(makjitest)에 직접 붙는 도구.
 *
 *   node scripts/cafe24.mjs                 상품 목록
 *   node scripts/cafe24.mjs codes           할인코드 목록
 *
 * 토큰은 Supabase의 cafe24_tokens에서 읽는다 — 여기서 갱신하지 않는다.
 * 카페24는 갱신할 때 refresh_token을 회전시켜서, 스크립트가 갱신하고 저장을 빠뜨리면
 * 배포본 인증이 통째로 깨진다. 만료됐으면 배포본 /api/health?product=1 을 한 번
 * 부르면 앱이 제대로 갱신·저장한다.
 *
 * ⚠️ 실제 막지 자사몰이 아니라 체험몰이다. CAFE24_MALL_ID를 확인하고 쓸 것.
 */

import { readFileSync } from 'node:fs';
for (const l of readFileSync('.env.local','utf8').split('\n')) {
  const t=l.trim(); if(!t||t.startsWith('#')||!t.includes('='))continue;
  const [k,...r]=t.split('='); process.env[k.trim()]=r.join('=').trim().replace(/^["']|["']$/g,'');
}
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY,MALL=process.env.CAFE24_MALL_ID;
const tk=await (await fetch(`${U}/rest/v1/cafe24_tokens?select=access_token&limit=1`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
export const TOKEN=tk[0].access_token;
export const MALLID=MALL;
export const api=async(p,m='GET',body)=>{
  const r=await fetch(`https://${MALL}.cafe24api.com${p}`,{method:m,
    headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json','X-Cafe24-Api-Version':'2026-09-01'},
    body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status, body:await r.text()};
};


/* ── CLI ── */
if (process.argv[1]?.endsWith('cafe24.mjs')) {
  const what = process.argv[2] ?? 'products';
  if (what === 'codes') {
    const r = await api('/api/v2/admin/discountcodes?limit=50');
    const cs = JSON.parse(r.body).discountcodes ?? [];
    console.log(`할인코드 ${cs.length}개`);
    for (const c of cs) console.log(`  no=${c.discount_code_no}  ${c.discount_code}  ${c.discount_value}${c.discount_value_unit === 'P' ? '%' : '원'}  ${c.available_start_date}~${c.available_end_date}`);
  } else {
    const r = await api('/api/v2/admin/products?limit=100&fields=product_no,product_name,price,display,selling');
    const ps = JSON.parse(r.body).products ?? [];
    console.log(`상품 ${ps.length}개 (진열중 ${ps.filter(p => p.display === 'T').length})`);
    for (const p of ps.sort((a, b) => a.product_no - b.product_no)) {
      console.log(`  ${String(p.product_no).padStart(3)}  ${String(p.product_name).slice(0, 20).padEnd(22)} ${String(Math.round(Number(p.price))).padStart(6)}원  판매:${p.selling} 진열:${p.display}`);
    }
  }
}
