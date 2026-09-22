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

interface Row { id: number; product_no: number; coupon_code: string | null }

export async function sweepExpired(at: Date = new Date()): Promise<SweepResult> {
  if (Date.now() - lastRun < THROTTLE_MS) return EMPTY;
  if (inFlight) return inFlight;
  lastRun = Date.now();

  inFlight = (async () => {
    const db = supabase();
    if (!db) return EMPTY; // 메모리 폴백에는 기한이 없다

    const { data, error } = await db
      .from('fills')
      .select('id, product_no, coupon_code')
      .eq('settled', 'open')
      .lt('expires_at', at.toISOString())
      .limit(50); // 한 요청이 오래 붙들지 않게 — 남으면 다음 요청이 마저 한다

    if (error || !data?.length) return EMPTY;

    const result: SweepResult = { checked: data.length, paid: 0, expired: 0, held: 0 };

    for (const row of data as Row[]) {
      const used = await paidFor(db, row);
      if (used === null) { result.held += 1; continue; }

      if (used) {
        await db.from('fills').update({ settled: 'paid' }).eq('id', row.id);
        result.paid += 1;
        continue;
      }

      /* 자리를 반납한다. slot을 비워야 그 번호를 다음 사람이 쓸 수 있다(0012) */
      await db.from('fills').update({ settled: 'expired', slot: null }).eq('id', row.id);
      await adjustInventory(row.product_no, +1);
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
 * 코드가 없으면(발급 실패) 판정할 근거가 없다. 그런데 코드가 없으면 손님은
 * 할인가로 살 수단이 없었으므로, 자리를 붙들고 있을 이유도 없다 — 반납한다.
 */
async function paidFor(db: NonNullable<ReturnType<typeof supabase>>, row: Row): Promise<boolean | null> {
  if (!row.coupon_code) return false;
  const { data } = await db.from('coupons').select('cafe24_no').eq('code', row.coupon_code).maybeSingle();
  const no = (data as { cafe24_no: number | null } | null)?.cafe24_no;
  if (!no) return false;
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
