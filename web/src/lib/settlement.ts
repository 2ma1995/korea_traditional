/**
 * 2층 — 내 손익이 오늘 한도 안에서 내 자리를 정한다.
 *
 * 세 층 구조의 가운데다.
 *
 *   1층  KOSPI 변동폭  →  오늘 열리는 호가 칸의 개수 (한도)      · orderbook.ts
 *   2층  내 손익       →  그 칸들 중 내가 앉는 자리              · 이 파일
 *   3층  내가 고른 호가 →  최종 가격                             · OrderBook.tsx
 *
 * 왜 이렇게 나눴나. 멘토 지적이 두 개였다.
 *   ⑥ "시장 변동폭 → 빵값" 연결이 억지다
 *   ④ "등락폭 컸네 → 빵 먹으러 가야지"는 실제로 안 일어난다
 * 코스피는 남의 일이지만 내 손익은 내 일이다. 그래서 손님이 움직이는 이유를
 * 2층으로 옮기고, 코스피는 1층에서 한도만 정하게 남겼다 (RFP는 그대로 충족).
 *
 * 왜 손익의 '크기'만 보나. 벌어도 잃어도 할인이다. 번 사람만 싸게 사면
 * 역진적이고, 잃은 사람만 싸게 사면 손실을 인증해야 싸진다.
 *
 * 다만 **대칭이 아니다.** 한국의 주식 자산효과는 약하다 — 자본이득 1만원당
 * 소비는 130원(1.3%)이고 해외는 3~4%다 (한국은행·KDI). "벌었으니 쓴다"에는
 * 근거를 붙이기 어렵다. 반면 손실 쪽은 근거가 있다:
 *   · 주식 손실은 상실감 + 패배감을 남긴다 (국립정신건강센터)
 *   · 슬픔은 지불의사금액을 높인다 — 기제가 loss + helplessness
 *     ("Misery is not miserly", Cryder·Lerner 외, Psychological Science)
 * 그래서 폭은 같게 두되 **카피와 화면 비중은 위로 쪽이 본진**이다.
 * 자축가는 역진성을 막는 장치로 남긴다.
 */

/**
 * 손익률 절대값 → 자리 단계.
 *
 * step은 호가 칸의 인덱스다. 0이 가장 얕은(비싼) 칸, 클수록 깊은(싼) 칸이다.
 * 오늘 열린 칸 수보다 크면 가장 깊은 칸으로 잘린다 — 시장이 연 한도를 넘지 못한다.
 */
export interface PnlBand {
  /** 손익률 절대값 하한 (%) */
  minAbs: number;
  /** 이 구간이 앉는 호가 칸 인덱스 */
  step: number;
  label: string;
}

export const PNL_BANDS: PnlBand[] = [
  { minAbs: 5, step: 3, label: '큰 하루' },
  { minAbs: 3, step: 2, label: '제법 움직인 하루' },
  { minAbs: 1, step: 1, label: '조금 움직인 하루' },
  { minAbs: 0, step: 0, label: '잔잔한 하루' },
];

/**
 * 손익률 상한 — 이 값을 넘으면 전부 같은 구간이다.
 *
 * 스크린샷은 편집할 수 있다. 막는 대신 **편집해서 얻을 이득을 없앴다** —
 * ±5%부터는 아무리 부풀려도 자리가 더 내려가지 않는다. 상한 38%·1일 1회와
 * 합치면 편집 노력 대비 이득이 빵 한 봉지에 몇백 원이다.
 */
export const PNL_CLAMP = 5;

/** 이 안쪽은 본전으로 본다. 0.00%를 요구하면 아무도 해당되지 않는다. */
const FLAT_THRESHOLD = 0.1;

export type SettlementSide = 'gain' | 'loss' | 'flat';

export interface Settlement {
  /** 입력받은 손익률 (부호 있음) */
  pnlPct: number;
  /** 구간 판정에 실제로 쓴 값 — PNL_CLAMP에서 잘린다 */
  clampedAbs: number;
  side: SettlementSide;
  band: PnlBand;
  /** 앉은 호가 칸 인덱스. 오늘 열린 칸 수에 맞춰 잘려 있다 */
  seatIndex: number;
  /** 한도에 막혀 더 내려가지 못했는가 — "시장이 오늘 여기까지만 열었습니다" */
  cappedByMarket: boolean;
  title: string;
  message: string;
}

const TITLE: Record<SettlementSide, string> = {
  loss: '위로가',
  gain: '자축가',
  flat: '본전가',
};

function messageFor(side: SettlementSide, absPnl: number): string {
  if (side === 'flat') return '오늘은 본전이네요. 지킨 것도 하루입니다.';
  if (side === 'loss') {
    return absPnl >= PNL_CLAMP
      ? '오늘 고생 많으셨습니다. 제일 깊은 자리로 모셨습니다.'
      : '오늘 조금 미끄러지셨네요. 위로가로 드리겠습니다.';
  }
  return absPnl >= PNL_CLAMP
    ? '오늘 크게 버셨네요. 자축가로 드립니다.'
    : '오늘 플러스로 마치셨네요. 자축가로 드립니다.';
}

/**
 * 내 자리를 정한다.
 *
 * @param pnlPct     오늘 손익률 (%, 부호 있음)
 * @param openTicks  오늘 열린 호가 칸 수 (1층이 정한 한도)
 */
export function settle(pnlPct: number, openTicks: number): Settlement {
  const side: SettlementSide =
    Math.abs(pnlPct) < FLAT_THRESHOLD ? 'flat' : pnlPct > 0 ? 'gain' : 'loss';

  const clampedAbs = Math.min(Math.abs(pnlPct), PNL_CLAMP);
  const band =
    PNL_BANDS.find(item => clampedAbs >= item.minAbs) ?? PNL_BANDS[PNL_BANDS.length - 1];

  const lastIndex = Math.max(0, openTicks - 1);
  const seatIndex = Math.min(band.step, lastIndex);

  return {
    pnlPct,
    clampedAbs,
    side,
    band,
    seatIndex,
    cappedByMarket: band.step > lastIndex,
    title: TITLE[side],
    message: messageFor(side, Math.abs(pnlPct)),
  };
}
