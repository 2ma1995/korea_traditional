/**
 * 할인을 손님에게 어떻게 전달할 것인가 — **한 가지만** 고른다.
 *
 * 두 길이 있고, 둘을 같이 켜면 할인이 두 번 먹는다. 이미 내린 판매가에 코드까지
 * 적용되면 원가 밑으로 팔린다. 그래서 여기서 하나만 고르게 하고, 두 구현은
 * 이 값을 보고 각자 조용히 비켜난다.
 *
 *   'price'   자사몰 판매가를 직접 바꾼다 (lib/priceSync)
 *             손님은 막지몰에서 그냥 결제한다. 회원가입도 코드 입력도 필요 없다.
 *             "선착순 30개"는 카페24 재고로 성립한다(lib/inventory) —
 *             30개가 나가면 자사몰에서도 품절이다. 설계도 §9 1·2단계가 이 길이다.
 *             ⚠️ 자정 복원이 실패하면 다음 날도 싸게 팔린다. 그래서 가장 위험한 스위치다.
 *
 *   'coupon'  예약마다 할인코드를 발급한다 (lib/coupon)
 *             자사몰 판매가를 건드리지 않아 되돌릴 일이 없다.
 *             대신 손님이 코드를 옮겨 적어야 하고, 카페24 할인코드는 회원 전용이라
 *             (available_user='M') 비회원은 못 쓴다. 전환율이 깎인다.
 *
 * 기본은 'price'다. 손님이 아무것도 안 해도 되는 쪽이 옳고, 재고 연동으로
 * 선착순이 성립하면서 이 길을 막던 이유가 사라졌다.
 * 기업이 "판매가는 건드리지 마세요"라고 하면 DISCOUNT_DELIVERY=coupon 하나로 바뀐다.
 */
export type DiscountDelivery = 'price' | 'coupon';

export function discountDelivery(): DiscountDelivery {
  return process.env.DISCOUNT_DELIVERY === 'coupon' ? 'coupon' : 'price';
}
