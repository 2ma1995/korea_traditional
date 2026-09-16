/**
 * 관심 종목 목록 — 계좌를 받지 않는 경로.
 *
 * 손님이 종목 하나를 고르면 그 종목의 오늘 등락률이 내 손익률을 대신한다.
 * 실제 내 손익은 아니지만 "만약 내가 이걸 들고 있었다면"으로 성립하고,
 * 대신 **허들이 0이고 조작이 불가능하다** (공개 시세라서).
 *
 * 스크린샷 업로드 경로(실제 손익)와 병행한다. 둘 다 열어두면 업로드가 선택이 된다.
 *
 * ⚠️ 심볼은 화이트리스트다. /api/quote가 이 목록에 없는 심볼을 거부한다 —
 *    임의 심볼을 받으면 우리 서버가 외부 요청 프록시가 된다.
 *
 * 선정 기준: 개인 투자자 보유 비중이 높은 대형주. 시가총액 순이 아니라
 * "고를 때 이름이 바로 떠오르는가"로 골랐다. 기업 협의로 갈아끼울 수 있다.
 */

export interface WatchItem {
  /** Yahoo Finance 심볼. 코스피는 .KS, 코스닥은 .KQ */
  symbol: string;
  name: string;
}

export const WATCHLIST: WatchItem[] = [
  { symbol: '005930.KS', name: '삼성전자' },
  { symbol: '000660.KS', name: 'SK하이닉스' },
  { symbol: '373220.KS', name: 'LG에너지솔루션' },
  { symbol: '035420.KS', name: 'NAVER' },
  { symbol: '035720.KS', name: '카카오' },
  { symbol: '005380.KS', name: '현대차' },
  { symbol: '207940.KS', name: '삼성바이오로직스' },
  { symbol: '068270.KS', name: '셀트리온' },
  { symbol: '247540.KQ', name: '에코프로비엠' },
];

export function findWatchItem(symbol: string): WatchItem | undefined {
  return WATCHLIST.find(item => item.symbol === symbol);
}
