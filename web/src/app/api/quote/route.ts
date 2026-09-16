import { NextResponse } from 'next/server';
import { findWatchItem } from '@/data/watchlist';
import { fetchSymbolQuote } from '@/lib/market';

/**
 * 관심 종목 한 개의 오늘 등락률.
 *
 * 손님이 종목을 고르면 이 값이 손익률을 대신하고, 그게 오늘 내 자리를 정한다.
 * 계좌를 받지 않는 경로라서 개인정보가 오가지 않는다.
 *
 * ⚠️ 심볼은 화이트리스트(WATCHLIST)로만 받는다. 임의 심볼을 그대로 외부에
 *    넘기면 우리 서버가 아무 주소나 대신 찔러주는 프록시가 된다.
 */

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get('symbol') ?? '';
  const item = findWatchItem(symbol);

  if (!item) {
    return NextResponse.json(
      { ok: false as const, error: '등록되지 않은 종목입니다.' },
      { status: 400, headers: NO_STORE },
    );
  }

  const quote = await fetchSymbolQuote(item.symbol);
  if (!quote) {
    return NextResponse.json(
      { ok: false as const, error: '시세를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      ok: true as const,
      symbol: item.symbol,
      name: item.name,
      value: quote.value,
      changePct: quote.changePct,
      updatedAt: quote.updatedAt,
    },
    { headers: NO_STORE },
  );
}
