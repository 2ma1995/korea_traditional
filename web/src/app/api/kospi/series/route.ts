import { NextResponse } from 'next/server';
import { fetchKospiHistory, type KospiRange } from '@/lib/market';

/**
 * 코스피 기간 차트 데이터.
 *   ?range=1d   당일 5분봉 (기본) — 히어로가 60초마다 불러 선을 이어 붙인다
 *   ?range=5d   1주 30분봉
 *   ?range=1mo  한 달 일봉
 *   ?range=3mo  세 달 일봉
 *   ?range=1y   1년 일봉
 * 점마다 시각(t)이 같이 간다 — 툴팁에 날짜를 쓰고, 이전 점과 비교해 그날 등락률을 낸다.
 */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const RANGES: KospiRange[] = ['1d', '5d', '1mo', '3mo', '1y'];

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('range') ?? '1d';
  const range = (RANGES.includes(q as KospiRange) ? q : '1d') as KospiRange;
  const h = await fetchKospiHistory(range);
  if (!h || !h.points.length) return NextResponse.json({ ok: false as const }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ ok: true as const, range, points: h.points, series: h.points.map(p => p.v), prevClose: h.prevClose }, { headers: NO_STORE });
}
