import { cookies } from 'next/headers';
import { seoulDateString } from '@/lib/market';

/**
 * 청약권 — 오늘 빵을 산 사람만 공모에 청약할 수 있다.
 *
 * 무료 탭 한 번이면 그건 투표지 공모가 아니다. 진짜 공모는 증거금을 건다.
 * 여기서는 구매가 증거금이다.
 *
 *   오늘 빵을 산다  →  청약권 1장  →  다음 빵을 고를 권리
 *
 * 얻는 것이 셋이다. "공모주"라는 은유가 성립하고, 구매 동기가 하나 더 붙고,
 * 사업자가 얻는 수요 데이터가 허수가 아닌 실구매자 것이 된다.
 *
 * 이 서비스에는 로그인이 없다. 그래서 서버가 발급하는 HttpOnly 쿠키로 검증한다 —
 * 페이지 스크립트로는 만들 수 없고 서버만 발급한다.
 *
 * ⚠️ 한계. 쿠키를 지우고 다시 구매하면 청약권을 또 얻는다. 다만 구매가 선착순
 *    한정 수량이라 남용에 실제 비용이 든다. 정식 방어는 회원 체계가 붙은 뒤다.
 *    이전 방식(localStorage로만 1인 1청약)은 서버가 아무것도 못 막았으니
 *    그보다는 한 단계 위다. 발표에서 이 한계를 밝힌다.
 */

/** 오늘 구매로 얻은, 아직 쓰지 않은 청약권 */
const RIGHT = 'bm_bid';
/** 오늘 이미 청약했다는 표시. 어느 후보였는지도 담아 화면 복원에 쓴다 */
const USED = 'bm_bid_used';

/** 자정을 넘기면 자연히 만료된다 — 청약권은 그날 것이다 */
const MAX_AGE = 60 * 60 * 24;

const OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
} as const;

export interface BidState {
  /** 청약할 수 있는가 */
  canBid: boolean;
  /** 오늘 이미 청약했다면 그 후보 id */
  bidFor: string | null;
}

/** 지금 이 브라우저의 청약 상태. 서버 컴포넌트·라우트 핸들러 양쪽에서 쓴다 */
export async function bidState(at: Date = new Date()): Promise<BidState> {
  const today = seoulDateString(at);
  const jar = await cookies();
  const used = jar.get(USED)?.value ?? '';
  /* 값은 "YYYY-MM-DD:후보id". 날짜가 오늘이 아니면 지난 회차 것이라 무시한다 */
  const [usedDay, candidate] = used.split(':');
  if (usedDay === today && candidate) return { canBid: false, bidFor: candidate };
  return { canBid: jar.get(RIGHT)?.value === today, bidFor: null };
}

/** 구매 성공 → 청약권 발급. 이미 오늘 청약했으면 다시 주지 않는다 */
export async function grantBidRight(at: Date = new Date()): Promise<void> {
  const today = seoulDateString(at);
  const jar = await cookies();
  if ((jar.get(USED)?.value ?? '').startsWith(`${today}:`)) return;
  jar.set(RIGHT, today, OPTIONS);
}

/** 청약 성공 → 청약권 소진. 어느 후보였는지 남긴다 */
export async function spendBidRight(candidate: string, at: Date = new Date()): Promise<void> {
  const jar = await cookies();
  jar.set(USED, `${seoulDateString(at)}:${candidate}`, OPTIONS);
  jar.delete(RIGHT);
}
