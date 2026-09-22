import { adminApi, cafe24Config } from '@/lib/cafe24';

/**
 * 카페24 실재고 조정 — 예약하면 줄이고, 반납하면 되돌린다.
 *
 * 설계도 §9 2단계가 가리키던 자리다. 자사몰 재고를 같이 줄여야 "선착순 30개"가
 * 빵장 안에서만 도는 숫자가 아니라 진짜가 된다 — 31번째는 자사몰에서도 품절이다.
 *
 * ⚠️ 기본은 꺼져 있다(INVENTORY_SYNC).
 *    가격 동기화와 같은 급이다 — 실제 자사몰 재고를 바꾸고, 잘못 줄이면 팔 수 있는
 *    빵이 안 팔린다. 체험몰에서 검증한 뒤 켠다.
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
export async function adjustInventory(productNo: number, delta: number): Promise<InventoryResult> {
  if (!enabled()) return { changed: false, quantity: null, note: 'INVENTORY_SYNC 꺼짐' };
  if (!cafe24Config()) return { changed: false, quantity: null, note: '카페24 환경변수 없음' };

  try {
    const codes = await variantCodes(productNo);
    if (!codes.length) return { changed: false, quantity: null, note: '옵션을 찾지 못함' };

    /* 옵션이 여럿이면 첫 옵션만 건드린다. 막지 상품은 옵션이 하나뿐이고,
       여러 옵션에 나눠 쓰면 어느 쪽을 줄일지가 또 하나의 결정이 된다 */
    const code = codes[0];
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
