// 제철 페어링 재료 마스터
//
// 중요: 이 재료들은 MAKJI 제품의 원재료가 아니다. 빵 "위에 올리는" 재료다.
// 제품에 포도가 들어있지 않아도 "오늘 포도가 제철이니 구운 생지에 올려 드세요"는 성립한다.
// 페어링으로 재정의하면 농산물 시세와의 인과가 살아난다.
//
// 시세 출처: 공공데이터포털 — 한국농수산식품유통공사(aT)
//            전국 공영도매시장 실시간 경매정보 (apis.data.go.kr/B552845/recent/price)
//
// ★ itemName은 API의 item_nm과 정확히 일치해야 한다. 실측으로 대조 완료(2026-09-09).
//
// 제외된 재료와 사유 — 이 API는 도매시장 경매 데이터라 아래는 조회되지 않는다
//   밤 · 대추 : 임산물이라 도매시장 경매 품목이 아님 (추분 앵커라 아쉽지만 시세 없음)
//   쑥        : 산나물 (청명 앵커)
//   단호박    : '호박'만 있고 단호박 별도 품목 없음
//   유자·무화과 : 출하량이 적어 조사 품목에서 제외

export interface SeasonalIngredient {
  code: string;
  /** 화면 표시명 */
  name: string;
  /** 공공데이터 API의 item_nm — 정확히 일치해야 매칭된다 */
  itemName: string;
  emoji: string;
  /** 제철 월 (1-12). 연말~연초로 걸치는 경우 from > to */
  season: { from: number; to: number };
  /** 연결 절기 (있으면 그 절기의 앵커 재료) */
  anchorTerm?: string;
  note: string;
}

export const SEASONAL_INGREDIENTS: SeasonalIngredient[] = [
  {
    code: 'grape',
    name: '포도',
    itemName: '포도',
    emoji: '🍇',
    season: { from: 8, to: 10 },
    anchorTerm: '백로',
    note: '백로를 포도순절이라 불렀다',
  },
  {
    code: 'apple',
    name: '사과',
    itemName: '사과',
    emoji: '🍎',
    season: { from: 9, to: 11 },
    note: '햇사과 출하기',
  },
  {
    code: 'pear',
    name: '배',
    itemName: '배',
    emoji: '🍐',
    season: { from: 9, to: 10 },
    note: '추석 성수품',
  },
  {
    code: 'peach',
    name: '복숭아',
    itemName: '복숭아',
    emoji: '🍑',
    season: { from: 7, to: 9 },
    note: '백도 출하 막바지',
  },
  {
    code: 'sweetPotato',
    name: '고구마',
    itemName: '고구마',
    emoji: '🍠',
    season: { from: 9, to: 11 },
    note: '가을 대표 간식 작물',
  },
  {
    code: 'redBean',
    name: '팥',
    itemName: '팥',
    emoji: '🫘',
    season: { from: 10, to: 12 },
    anchorTerm: '동지',
    note: '동지 팥죽 — 라인업 전체의 기둥',
  },
  {
    code: 'tangerine',
    name: '감귤',
    itemName: '감귤',
    emoji: '🍊',
    season: { from: 11, to: 1 },
    note: '겨울 출하 정점',
  },
  {
    code: 'strawberry',
    name: '딸기',
    itemName: '딸기',
    emoji: '🍓',
    season: { from: 12, to: 4 },
    note: '겨울~봄 성출하기',
  },
  {
    code: 'potato',
    name: '감자',
    itemName: '감자',
    emoji: '🥔',
    season: { from: 6, to: 7 },
    anchorTerm: '하지',
    note: '하지 무렵 하지감자',
  },
];

/** 해당 월에 제철인가 */
export function isInSeason(ing: SeasonalIngredient, month: number) {
  const { from, to } = ing.season;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

/** 해당 월에 제철인 재료 */
export function inSeason(month: number) {
  return SEASONAL_INGREDIENTS.filter((i) => isInSeason(i, month));
}
