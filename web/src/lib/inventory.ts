import { adminApi, cafe24Config } from '@/lib/cafe24';

/**
 * 카페24 실재고 조정 — 예약하면 줄이고, 반납하면 되돌린다.
 *
 * 설계도 §9 2단계가 가리키던 자리다. 자사몰 재고를 같이 줄여야 "선착순 30개"가
 * 빵장 안에서만 도는 숫자가 아니라 진짜가 된다 — 31번째는 자사몰에서도 품절이다.
 *
 * ⚠️ 켜지 마라. 주문 연동으로 가차감을 되돌리기 전까지는 손해만 난다.
 *
 *    예약은 결제가 아닌데 재고를 깎는다. 그런데 손님이 실제로 사면 **카페24가 또 깎는다** —
 *    빵 하나 팔고 재고가 2 줄어, 30개를 풀면 15개에서 품절이 된다.
 *
 *    더 나쁜 쪽은 이것이다. 예약만 쌓이고 결제가 안 되면 재고가 0으로 내려가는데,
 *    2026-09-22 체험몰에서 확인한 결과 **재고 0이면 손님 화면에 품절이 뜬다**.
 *    예약한 사람이 사러 갔더니 품절인 것이다 — 예약이 자기 발등을 찍는다.
 *
 *    "31번째는 자사몰에서도 품절"(설계도 §9)이라는 목적은 fills 표가 이미 달성한다.
 *    선착순 30개는 (day, product_no, depth, slot) unique가 막는다. 여기가 하는 일은
 *    그 결과를 자사몰에 **미리** 반영하는 것뿐인데, 팔리지도 않은 재고를 막는 것은
 *    팔 수 있는 빵을 안 파는 것이다.
 *
 *    되살리는 조건: 주문 조회(mall.read_order)로 "이 예약이 결제됐다"를 확인하고
 *    그때 가차감을 +1 되돌리는 정산이 붙은 뒤. 코드는 그대로 두고 스위치만 내린다.
 *
 * ⚠️ fills 표가 정본이고 카페24 재고는 따라가는 그림자다.
 *    카페24 쓰기는 즉시 반영되지 않는다 — 재고를 PUT한 직후 상품 목록 API가
 *    옛 값을 돌려주는 것을 2026-09-22에 확인했다. 그래서 "카페24 수량을 읽어
 *    자리가 남았는지 판단"하면 안 된다. 판단은 fills의 slot unique가 하고,
 *    여기는 결과만 따라 보낸다.
 *
 * ⚠️ 읽고-더해서-쓴다(read-modify-write). 같은 순간 둘이 조정하면 하나가 묻힌다.
 *    빵 10종 × 하루 30개 규모에서는 실질적으로 안 겹치고, 어긋나도 다음 날
 *    기업이 카페24에서 수량을 다시 넣으면 맞춰진다. 정확한 보정은 주문 연동 뒤다.
 */

const enabled = () => process.env.INVENTORY_SYNC === 'on';

interface Variant { variant_code: string; use_inventory?: string; quantity?: number }

/** 상품 → 옵션코드. 옵션 구성은 거의 안 바뀌어서 서버가 사는 동안 들고 있는다 */
const variantCache = new Map<number, string[]>();

async function variantCodes(productNo: number): Promise<string[]> {
  const seen = variantCache.get(productNo);
  if (seen) return seen;
  const data = await adminApi<{ variants?: Variant[] }>(`/api/v2/admin/products/${productNo}/variants`);
  const codes = (data.variants ?? []).map(v => v.variant_code).filter(Boolean);
  if (codes.length) variantCache.set(productNo, codes);
  return codes;
}

export interface InventoryResult {
  /** 실제로 바꿨는가. 스위치가 꺼졌거나 재고관리를 안 켠 상품이면 false */
  changed: boolean;
  quantity: number | null;
  note: string | null;
}

/**
 * 재고를 delta 만큼 옮긴다. 예약이면 -1, 반납이면 +1.
 *
 * 실패해도 던지지 않는다 — 예약을 되돌리는 것이 재고가 하나 어긋나는 것보다 나쁘다.
 * 호출부는 note를 로그로 흘리고 넘어간다.
 */
export async function adjustInventory(productNo: number, delta: number, variantCode?: string | null): Promise<InventoryResult> {
  if (!enabled()) return { changed: false, quantity: null, note: 'INVENTORY_SYNC 꺼짐' };
  if (!cafe24Config()) return { changed: false, quantity: null, note: '카페24 환경변수 없음' };

  try {
    const codes = await variantCodes(productNo);
    if (!codes.length) return { changed: false, quantity: null, note: '옵션을 찾지 못함' };

    /* 손님이 고른 품목을 깎는다. 막지 상품은 옵션이 하나뿐이라고 보고 첫 품목만
       건드리던 때가 있었는데, 실제로는 모닝롤이 셋(1/3/5개)이고 대만식 샌드위치가
       여덟이다 — "5개"를 예약해놓고 "1개" 재고를 깎고 있었다.
       모르면(0013 이전 기록·선택지 없는 상품) 예전처럼 첫 품목으로 간다 */
    const code = variantCode && codes.includes(variantCode) ? variantCode : codes[0];
    const path = `/api/v2/admin/products/${productNo}/variants/${code}/inventories`;

    const now = await adminApi<{ inventory?: { use_inventory?: string; quantity?: number } }>(path);
    const inv = now.inventory;
    /* 재고관리를 안 켠 상품은 건드리지 않는다. 여기서 켜버리면 기업이 의도하지
       않은 품절이 생긴다 — 수량이 0이 되는 순간 자사몰에서 안 팔린다 */
    if (inv?.use_inventory !== 'T') return { changed: false, quantity: null, note: '재고관리 꺼진 상품' };

    const next = Math.max(0, (inv.quantity ?? 0) + delta);
    const done = await adminApi<{ inventory?: { quantity?: number } }>(path, {
      method: 'PUT',
      /* use_inventory를 같이 보내야 한다 — quantity만 보내면 0으로 리셋됐다 */
      body: { shop_no: 1, request: { use_inventory: 'T', quantity: next } },
    });
    return { changed: true, quantity: done.inventory?.quantity ?? next, note: null };
  } catch (cause) {
    return { changed: false, quantity: null, note: cause instanceof Error ? cause.message.slice(0, 160) : String(cause) };
  }
}
