import { NextResponse } from 'next/server';
import { denyCron } from '@/lib/cronAuth';
import { restoreToday } from '@/lib/priceSync';

/**
 * 자정 — 자사몰 판매가를 원가로 되돌린다.
 *
 * daily_plans에 적어둔 originalPrice만 쓴다. 기록이 없으면 아무것도 하지 않는다 —
 * 추측으로 가격을 쓰지 않는다.
 *
 * ⏰ 시각 계산 주의. Vercel 크론은 UTC로 돈다.
 *
 *   15:10 UTC 월요일  =  00:10 KST 화요일
 *
 * 그래서 이 크론이 도는 순간의 KST 날짜는 '되돌릴 그날'이 아니라 다음 날이다.
 * 그냥 new Date()를 넘기면 어제 반영한 기록을 못 찾고 "되돌릴 것이 없습니다"로
 * 끝난다 — 가격이 원가로 안 돌아온 채 남는다.
 *
 * 두 시간을 뒤로 밀어 22:10 KST로 만든다. 그러면 막 끝난 그날 날짜가 나온다.
 * 크론 요일을 UTC 월~금으로 둔 것도 같은 이유다 — 15:10 UTC 금요일이
 * 00:10 KST 토요일이고, 되돌릴 대상은 금요일 장이다.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 자정을 막 넘겼으므로 '되돌릴 날'은 두 시간 전의 KST 날짜다 */
const CLOSED_DAY_BACK_MS = 2 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const denied = denyCron(request);
  if (denied) return denied;
  const closedDay = new Date(Date.now() - CLOSED_DAY_BACK_MS);
  const report = await restoreToday(closedDay);
  return NextResponse.json({ ok: true as const, ...report }, { headers: { 'Cache-Control': 'no-store' } });
}
