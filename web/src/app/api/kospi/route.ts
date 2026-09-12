import { NextResponse } from 'next/server';
import { fetchKospiTick } from '@/lib/market';

/**
 * 코스피 시세 한 틱.
 *
 * 랜딩의 "오늘의 코스피"가 1초마다 이 경로를 찔러 숫자만 갈아끼운다.
 * 페이지를 다시 그리지 않으므로 스크롤 위치나 진행 중인 연출이 끊기지 않는다.
 *
 * 캐시 층이 두 개이고 역할이 다르다.
 *
 *   응답 캐시 (Cache-Control: no-store) — 끈다.
 *     브라우저·CDN이 우리 응답을 들고 있으면 폴링해도 같은 값만 본다.
 *
 *   네이버 호출 캐시 (market.ts의 1초 공유 캐시) — 켠다.
 *     끄면 "보고 있는 탭 수 × 초당 1회"로 네이버를 때린다. 1초만 물고 있으면
 *     같은 초의 요청들이 한 번의 호출을 공유하므로, 접속자가 몇 명이든
 *     네이버 호출은 초당 1회로 고정된다.
 *
 * ⚠️ Next의 fetch 캐시(next.revalidate)는 여기서 쓰지 않는다.
 *    라우트 핸들러에서 동작하지 않는 것을 실측했다 — 프로덕션 빌드에서
 *    요청 22회를 보냈는데 네이버 호출이 21회 나갔다. dynamic='force-dynamic',
 *    fetchCache='default-cache' 둘 다 결과가 같았다. 그래서 market.ts에
 *    직접 1초 캐시를 구현했다.
 */

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  const tick = await fetchKospiTick();

  // 외부 소스가 모두 실패한 경우. 클라이언트는 마지막 값을 유지한다.
  if (!tick) {
    return NextResponse.json({ ok: false as const }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true as const, ...tick }, { headers: NO_STORE });
}
