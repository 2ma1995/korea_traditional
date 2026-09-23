import { NextResponse } from 'next/server';
import { loadIpoEnabled } from '@/lib/appSettings';
import { bidState, spendBidRight } from '@/lib/bidRight';
import { bidIpo, currentRound, loadIpoCounts } from '@/lib/ipo';

/**
 * 공모.
 *   GET   지금 열린 회차 + 경쟁률 + 내 청약 상태
 *   POST  { candidate, member } 청약 한 건 → 갱신된 경쟁률
 *
 * 받는 값은 후보 id와 자사몰 회원 ID다. 회차와 후보 목록은 서버가 정한다 —
 * 관리자가 만든 회차 중 오늘 열려 있는 것이고, 클라이언트가 지난 회차나 없는
 * 후보를 보내면 거부한다.
 *
 * 청약 자격은 오늘 빵을 산 사람만이다(lib/bidRight). 구매가 증거금 역할이라
 * 여기서 청약권을 확인하고 성공하면 소진한다.
 *
 * 회원 ID를 받는 이유 — 당첨되면 청약자에게 쿠폰을 보내야 하는데 이 서비스에는
 * 로그인이 없다. 개인정보라 목적(쿠폰 발급)이 끝나면 지운다(0009 주석).
 */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const bad = (error: string, status = 400) =>
  NextResponse.json({ ok: false as const, error }, { status, headers: NO_STORE });

/** 회원 ID — 자사몰 아이디·이메일·휴대폰 어느 쪽이든 받되 길이만 지킨다 */
const MEMBER_MAX = 64;

export async function GET() {
  const [round, enabled] = await Promise.all([currentRound(), loadIpoEnabled()]);
  /* 열린 회차가 없거나 관리자가 껐으면 회차는 null이다. 화면이 섹션을 감춘다 */
  if (!round || !enabled.value) {
    return NextResponse.json({ ok: true as const, round: null, counts: {}, demo: 0, live: false, ...(await bidState()) }, { headers: NO_STORE });
  }
  const [counts, mine] = await Promise.all([loadIpoCounts(round), bidState()]);
  return NextResponse.json({ ok: true as const, round, ...counts, ...mine }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  /* 관리자가 공모를 껐으면 서버에서 막는다. 화면은 이미 NEXT 섹션을 감추지만,
     이 경로는 화면을 거치지 않고도 부를 수 있다 — 꺼진 회차에 표가 쌓이면
     나중에 그 회차를 되살릴 때 허수가 섞인다. */
  const enabled = await loadIpoEnabled();
  if (!enabled.value) return bad('지금은 공모를 받지 않습니다.', 409);

  let body: { candidate?: unknown; member?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('본문을 읽지 못했습니다.');
  }

  const now = new Date();
  const round = await currentRound(now);
  if (!round) return bad('지금 열린 공모 회차가 없습니다.', 409);

  const candidate = String(body.candidate ?? '');
  if (!round.candidates.some(item => item.id === candidate)) {
    return bad('이번 회차에 없는 후보입니다.');
  }

  const member = String(body.member ?? '').trim();
  if (!member) return bad('쿠폰을 보낼 자사몰 아이디를 적어주세요.');
  if (member.length > MEMBER_MAX) return bad('아이디가 너무 깁니다.');

  const mine = await bidState(now);
  if (mine.bidFor) return bad('오늘은 이미 청약했습니다.', 409);
  if (!mine.canBid) return bad('오늘 빵을 사면 청약할 수 있어요.', 403);

  const counts = await bidIpo(round, candidate, member, mine.fillId ?? null);
  if ('refused' in counts) return bad(counts.refused, 409);
  await spendBidRight(candidate, now);
  return NextResponse.json(
    { ok: true as const, round, ...counts, canBid: false, bidFor: candidate },
    { headers: NO_STORE },
  );
}
