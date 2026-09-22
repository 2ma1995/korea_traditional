import { adminApi, cafe24Config } from '@/lib/cafe24';
import { discountDelivery } from '@/lib/discountDelivery';
import { seoulDateString } from '@/lib/market';
import { supabase } from '@/lib/supabase';

/**
 * 할인코드 발급 — 설계도 최상단의 문제를 푸는 자리.
 *
 * 화면은 8,470원인데 자사몰로 넘기면 11,000원이었다. 예약이 잡히면 그 폭만큼의
 * 코드를 카페24에서 발급해 손님에게 준다. 자사몰 판매가는 건드리지 않는다.
 *
 * ⚠️ 왜 PRICE_SYNC_ENABLED처럼 꺼두지 않았나.
 *    가격 동기화는 **이미 있는 상품의 판매가를 덮어쓴다** — 복원에 실패하면 손님이
 *    진짜 그 값에 산다. 그래서 기업 승인 전에는 켜지 않는다.
 *    할인코드는 **새로 만들기만 한다.** 기존 상품도 가격도 안 건드리고, 지우면
 *    그만이다. 게다가 RFP §3-3이 "상품가·쿠폰을 업데이트"하라고 직접 요구한다.
 *    그래서 기본값은 켜짐이고, 사고가 나면 COUPON=off 환경변수로 끈다.
 *
 * ⚠️ 발급 실패가 예약을 되돌리면 안 된다. 손님은 이미 자리를 잡았고, 코드가 없어
 *    아쉬울 뿐이다. 호출부는 실패를 null로 받아 넘어가고, 화면이 그 사실을 밝힌다.
 *
 * 카페24 필드는 2026-09-22에 체험몰에서 하나씩 확인한 값이다(문서가 렌더링되지
 * 않아 오류 메시지로 역추적했다). 아래 주석의 ⚠️ 표시가 그때 걸렸던 것들이다.
 */

/**
 * 쿠폰으로는 전달하지 않기로 했다 (2026-09-22 결정).
 *
 * 카페24 할인코드는 회원 전용이다(available_user='M'). 비회원은 코드를 받아도 못 쓰고,
 * 쓸 수 있는 사람도 결제창에서 코드를 옮겨 적어야 한다. 빵 한 개를 사는 흐름에
 * 그 단계를 넣으면 전환이 깎인다.
 *
 * 환경변수 기본값에만 기대지 않고 코드에서 막는다 — DISCOUNT_DELIVERY=coupon 한 줄로
 * 되살아나면 결정이 지켜지지 않는다. 되살리려면 여기를 true로 바꾼다.
 * 발급 로직과 카페24 필드 확인값은 아래에 그대로 둔다. 판매가 변경 승인이 끝내 안 나면
 * 쿠폰이 유일한 수단이라, 지우지 않고 꺼만 둔다.
 */
export const COUPON_ENABLED = false;

/* 할인 전달 방식이 'coupon'일 때만 발급한다. 'price' 모드에서 같이 발급하면
   이미 내린 판매가에 코드가 또 먹어 원가 밑으로 간다(lib/discountDelivery) */
const enabled = () => COUPON_ENABLED && discountDelivery() === 'coupon' && process.env.COUPON !== 'off';

/**
 * 코드를 쓸 수 있는 기간(일).
 *
 * ⚠️ 1은 못 쓴다. 시작일과 종료일이 같으면 카페24가 422로 거부한다
 *    ("Please re-enter the usage period"). 그래서 최소가 2다 — 오늘과 내일.
 *
 * 빵장은 "오늘의 가격"이 전제라 원래는 오늘까지가 맞다. 하지만 카페24가 그걸
 * 허용하지 않으므로 하루를 더 준다. 손님이 결제를 미루면 판매를 놓치니
 * 나쁜 쪽으로 기운 것도 아니다. 늘리고 싶으면 여기만 고치면 된다.
 */
export const COUPON_DAYS = 2;

/** 퍼센트 할인일 때 카페24가 요구하는 최대 할인 금액. 빵값 기준으로는 사실상 무제한 */
const MAX_DISCOUNT = 100000;

export interface IssuedCoupon {
  code: string;
  rate: number;
  expiresOn: string;
  /** 카페24에 실제로 만들어졌는가. false면 우리 기록에만 있다 */
  live: boolean;
  /** 우리 저장소에 남았는가. false면 이번 서버 세션 메모리에만 있다 */
  stored: boolean;
}

/**
 * 이 코드가 쓰였는가 — 결제 여부를 이걸로 판정한다.
 *
 * 카페24 할인코드는 issued_count를 돌려준다. 예약마다 1장씩 고유 코드를 주므로
 * 1이면 결제한 것이고 0이면 안 한 것이다. 주문 조회 권한(mall.read_order) 없이
 * 결제 여부를 아는 유일한 길이다.
 *
 * ⚠️ 결제 후 취소했을 때 이 값이 되돌아오는지는 확인되지 않았다.
 *    안 되돌아오면 취소분 재고를 놓친다 — 주문 권한이 붙으면 그때 보완한다.
 *
 * @returns 판정 불가(조회 실패·코드 없음)면 null. 호출부는 그때 자리를 건드리지 않는다.
 */
export async function couponUsed(cafe24No: number, code?: string): Promise<boolean | null> {
  if (!cafe24Config()) return null;
  try {
    /* ⚠️ 단건 조회(/discountcodes/{no})에는 issued_count가 없다. 목록에만 있다 —
       2026-09-22에 두 응답의 키를 직접 대조해 확인했다. 그래서 목록으로 묻는다. */
    const query = code ? `?discount_code=${encodeURIComponent(code)}&limit=20` : '?limit=100';
    const data = await adminApi<{ discountcodes?: { discount_code_no: number; issued_count?: number }[] }>(
      `/api/v2/admin/discountcodes${query}`,
    );
    const hit = (data?.discountcodes ?? []).find(item => item.discount_code_no === cafe24No);
    /* 코드가 목록에 없다 = 이미 지워졌거나 만료됐다. 판정 불가로 둔다 */
    if (!hit) return null;
    return typeof hit.issued_count === 'number' ? hit.issued_count > 0 : null;
  } catch {
    return null;
  }
}

/** 미결제로 반납할 때 코드를 거둔다. 실패해도 넘어간다 — 기한이 지나 어차피 못 쓴다 */
export async function revokeCoupon(cafe24No: number): Promise<boolean> {
  if (!cafe24Config()) return false;
  try {
    await adminApi(`/api/v2/admin/discountcodes/${cafe24No}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

/* ── 메모리 폴백 ── */
const memory: IssuedCoupon[] = [];
const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

const addDays = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 사람이 옮겨 적을 수 있어야 한다 — 헷갈리는 0·O·1·I·L은 뺀다 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomCode = (day: string) => {
  const tail = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  return `MAKJI${day.replaceAll('-', '').slice(2)}${tail}`;
};

/**
 * 예약 한 건에 대한 할인코드를 발급한다.
 *
 * @param productNo 이 상품에만 쓸 수 있는 코드다 — 다른 빵에 돌려쓰지 못하게
 * @param rate      0.30 = 30%
 * @returns 실패하면 null. 예약은 그대로 살아 있다
 */
export async function issueCoupon(
  productNo: number,
  rate: number,
  at: Date = new Date(),
): Promise<IssuedCoupon | null> {
  if (!enabled()) return null;
  if (!cafe24Config()) return null; // 키가 없으면 조용히 건너뛴다 — 로컬에서 예약은 계속 돼야 한다

  const day = seoulDateString(at);
  const expiresOn = addDays(day, COUPON_DAYS - 1);
  const code = randomCode(day);
  const percent = Math.round(rate * 100);
  if (percent <= 0 || percent >= 100) return null;

  let cafe24No: number | null = null;
  try {
    const made = await adminApi<{ discountcode: { discount_code_no: number } }>(
      '/api/v2/admin/discountcodes',
      {
        method: 'POST',
        body: {
          shop_no: 1,
          request: {
            discount_code_name: `빵장 ${day} · ${percent}%`,
            discount_code: code,
            discount_value_unit: 'P',
            discount_value: percent,          // ⚠️ 정수만. "30.00"은 422
            discount_max_price: MAX_DISCOUNT, // ⚠️ 퍼센트면 필수
            discount_truncation_unit: 'F',    // ⚠️ 문자 코드(F 버림). 10 같은 숫자는 422
            available_product_type: 'P',      // ⚠️ A(전체)·P(개별)만 유효
            available_product: [productNo],
            available_start_date: day,
            available_end_date: expiresOn,
            available_user: 'M',
            available_issue_count: 1,
          },
        },
      },
    );
    cafe24No = made?.discountcode?.discount_code_no ?? null;
  } catch {
    /* 발급 실패로 예약을 되돌리지 않는다. 화면이 "코드는 나중에"라고 밝힌다 */
    return null;
  }

  const record: IssuedCoupon = { code, rate, expiresOn, live: true, stored: false };
  const db = supabase();
  if (!db) { memory.push(record); return record; }

  const { error } = await db.from('coupons').insert({
    day, product_no: productNo, code, rate: rate.toFixed(3), cafe24_no: cafe24No, expires_on: expiresOn,
  });
  if (error) {
    if (missingTable(error.code)) { memory.push(record); return record; }
    /* 카페24에는 이미 만들어졌다. 우리 기록만 없는 것이라 코드는 그대로 준다 */
    return record;
  }
  return { ...record, stored: true };
}
