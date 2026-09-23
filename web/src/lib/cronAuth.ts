import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * 크론 호출자 확인.
 *
 * Vercel Cron은 CRON_SECRET 환경변수가 있으면 `Authorization: Bearer <secret>`을
 * 붙여 보낸다. 이 라우트는 자사몰 가격을 바꾸므로 아무나 부르게 둘 수 없다.
 *
 * CRON_SECRET이 없으면 잠근다 — 열어두는 쪽으로 기울면 배포 직후 공개 URL이
 * 가격 변경 버튼이 된다.
 */
export function denyCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false as const, error: 'CRON_SECRET이 설정되지 않아 잠겨 있습니다.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!isCron(request)) {
    return NextResponse.json(
      { ok: false as const, error: '권한이 없습니다.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}

/** 크론 비밀이 맞는가. 한 글자씩 비교하면 응답 시간으로 비밀을 앞에서부터 알아낼 수 있어 상수 시간으로 본다 */
export function isCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
