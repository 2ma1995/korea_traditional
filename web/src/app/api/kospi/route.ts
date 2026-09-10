import { NextResponse } from 'next/server';
import { fetchKospiTick } from '@/lib/market';

/**
 * 코스피 시세 한 틱.
 *
 * 랜딩의 "오늘의 코스피"가 1초마다 이 경로를 찔러 숫자만 갈아끼운다.
 * 페이지를 다시 그리지 않으므로 스크롤 위치나 진행 중인 연출이 끊기지 않는다.
 *
 * 캐시는 전 구간에서 끈다. 라우트 캐시든 CDN 캐시든 한 군데라도 남아 있으면
 * 초단위로 불러도 같은 값만 돌아온다.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  const tick = await fetchKospiTick();

  // 외부 소스가 모두 실패한 경우. 클라이언트는 마지막 값을 유지한다.
  if (!tick) {
    return NextResponse.json({ ok: false as const }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true as const, ...tick }, { headers: NO_STORE });
}
