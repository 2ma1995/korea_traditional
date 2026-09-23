import { couponUsed, revokeCoupon } from '@/lib/coupon';
import { adjustInventory } from '@/lib/inventory';
import { seoulDateString } from '@/lib/market';
import { supabase } from '@/lib/supabase';

/**
 * 기한이 지난 예약을 정리한다 — 결제했으면 확정, 안 했으면 자리를 반납한다.
 *
 * 왜 크론이 아니라 요청마다 도는가(lazy). Vercel 무료 플랜은 크론이 하루 한 번만
 * 돌아 1시간 주기를 맡길 수 없다. 반면 빵장은 장중에 사람이 계속 들어오는
 * 서비스라 그 방문이 곧 타이머가 된다. 크론은 마감 뒤 한 번 쓸어담는 안전망이다.
 *
 * 판정은 할인코드의 issued_count로 한다(lib/coupon). 예약마다 고유 코드 1장을
 * 주므로 쓰였으면 결제한 것이다. 주문 조회 권한 없이 결제를 아는 유일한 길이다.
 *
 * ⚠️ 판정이 불가능하면(조회 실패·코드 없음) 아무것도 하지 않는다.
 *    모르면 자리를 뺏지 않는 쪽이 맞다 — 결제한 사람의 자리를 반납하면
 *    그 사람은 돈을 내고 빵을 못 받는다. 다음 요청에서 다시 본다.
 */

export interface SweepResult {
  checked: number;
  paid: number;
  expired: number;
  /** 판정을 못 해 그대로 둔 건수 */
  held: number;
}

const EMPTY: SweepResult = { checked: 0, paid: 0, expired: 0, held: 0 };

/** 같은 순간 여러 요청이 동시에 훑지 않게. 30초면 1시간 기한에 충분히 촘촘하다 */
const THROTTLE_MS = 30_000;
let lastRun = 0;
let inFlight: Promise<SweepResult> | null = null;

interface Row { id: number; product_no: number; coupon_code: string | null; unit?: string | null }

export async function sweepExpired(at: Date = new Date()): Promise<SweepResult> {
  if (Date.now() - lastRun < THROTTLE_MS) return EMPTY;
  if (inFlight) return inFlight;
  lastRun = Date.now();

  inFlight = (async () => {
    const db = supabase();
    if (!db) return EMPTY; // 메모리 폴백에는 기한이 없다

    const { data, error } = await db
      .from('fills')
      .select('id, product_no, coupon_code, unit')
      .eq('settled', 'open')
      .lt('expires_at', at.toISOString())
      .limit(50); // 한 요청이 오래 붙들지 않게 — 남으면 다음 요청이 마저 한다

    if (error || !data?.length) return EMPTY;

    const result: SweepResult = { checked: data.length, paid: 0, expired: 0, held: 0 };

    for (const row of data as Row[]) {
      const used = await paidFor(db, row);
      if (used === null) { result.held += 1; continue; }

      if (used) {
        await db.from('fills').update({ settled: 'paid' }).eq('id', row.id).eq('settled', 'open');
        result.paid += 1;
        continue;
      }

      /* 자리를 반납한다. slot을 비워야 그 번호를 다음 사람이 쓸 수 있다(0012).
         inFlight는 이 인스턴스 안에서만 통한다 — 인스턴스 둘이 같은 줄을 동시에
         반납하면 재고가 두 번 돌아온다. 'open'인 줄을 실제로 바꾼 쪽만 되돌린다 */
      const { data: closed } = await db.from('fills').update({ settled: 'expired', slot: null })
        .eq('id', row.id).eq('settled', 'open').select('id');
      if (!closed?.length) continue;
      /* 잡았던 그 품목으로 돌려놓는다 — 첫 품목에 얹으면 재고가 옮겨 붙는다 */
      await adjustInventory(row.product_no, +1, row.unit ?? null);
      await revokeHere(db, row.coupon_code);
      result.expired += 1;
    }
    return result;
  })().finally(() => { inFlight = null; });

  return inFlight;
}

/**
 * 결제했는가.
 *
 * 판매가 연동으로 결제한 주문에는 쿠폰이 없다. 그래서 쿠폰만으로는 결제를 확인할 수
 * 없는데, 확인될 때까지 붙들면 자리가 영영 안 풀린다 — 아래 paidFor의 주석 참고.
 */
/**
 * 이 예약이 결제됐나. 판정할 수 없으면 null.
 *
 * null과 false를 가르는 기준은 **다음에 다시 물어보면 답이 나오는가**다.
 *
 *   쿠폰이 없다        → false. 다시 물어봐도 영영 답이 없다.
 *                        판매가 연동 모드에서는 쿠폰을 아예 안 만들기 때문이다
 *                        (lib/coupon.COUPON_ENABLED). 여기서 null을 주면 모든 예약이
 *                        영원히 안 풀려 서른 자리가 첫날 차고 끝난다 — 실제로 그랬다.
 *   쿠폰은 있는데 못 읽음 → null. 카페24가 잠깐 안 될 수 있으니 다음 쓸기에 다시 본다.
 *
 * ⚠️ 쿠폰이 없을 때 false로 두는 것은 **근거 없는 추정**이다. 판매가로 이미 결제한
 *    손님의 자리를 반납할 수 있다. 그래도 이쪽을 고른 이유는 손해의 크기가 다르기
 *    때문이다 — 잘못 반납해도 손님은 이미 샀고(주문은 자사몰에 남는다), 재고 동기화는
 *    꺼져 있고, 되돌릴 쿠폰도 없다. 반대로 안 풀면 선착순이 통째로 멈춘다.
 *
 *    제대로 된 답은 주문 조회다(mall.read_order 권한은 이미 받았다). 그게 붙으면
 *    이 추정은 사라진다.
 */
async function paidFor(db: NonNullable<ReturnType<typeof supabase>>, row: Row): Promise<boolean | null> {
  if (!row.coupon_code) return false;
  const { data } = await db.from('coupons').select('cafe24_no').eq('code', row.coupon_code).maybeSingle();
  const no = (data as { cafe24_no: number | null } | null)?.cafe24_no;
  if (!no) return null;
  return couponUsed(no, row.coupon_code);
}

async function revokeHere(db: NonNullable<ReturnType<typeof supabase>>, code: string | null): Promise<void> {
  if (!code) return;
  const { data } = await db.from('coupons').select('cafe24_no').eq('code', code).maybeSingle();
  const no = (data as { cafe24_no: number | null } | null)?.cafe24_no;
  if (no) await revokeCoupon(no);
}

/** 오늘 몇 건이 반납됐나 — 관리자 화면과 발표에 쓸 숫자 */
export async function expiredToday(at: Date = new Date()): Promise<number> {
  const db = supabase();
  if (!db) return 0;
  const { count } = await db
    .from('fills')
    .select('id', { count: 'exact', head: true })
    .eq('day', seoulDateString(at))
    .eq('settled', 'expired');
  return count ?? 0;
}
