// 24절기 마스터 데이터
// 출처: 절기_베이커리_캘린더.html (2026-09-07 작성, 절기 날짜 검증 완료)
//
// 주의 1: sesi 필드의 정월대보름·추석·단오·칠석·유두·중양절·초파일은
//         음력 명절이며 24절기가 아니다. 외부 문서에서는 "절기·세시"로 묶어 표기한다.
// 주의 2: strength 'weak' 4개(우수·입추·처서·소한)는 고유 세시음식이 없어
//         제철 작물로 채운 자리다. 세시음식처럼 소개하면 지적받는다.

export type EvidenceStrength = 'strong' | 'medium' | 'weak';

export interface SolarTerm {
  /** 한글 절기명 */
  ko: string;
  /** 한자 절기명 */
  hanja: string;
  /** 양력 월 (1-12) */
  month: number;
  /** 양력 일 */
  day: number;
  /** 태양 황경 (0-345, 15도 간격) */
  longitude: number;
  /** 대표 절기 — 근거가 확실해 우선 구현 대상 */
  anchor: boolean;
  /** 라인업의 기둥 (동지) */
  keystone: boolean;
  /** 연계 음력 명절 (없으면 빈 문자열) */
  sesi: string;
  /** 전통 음식·재료 */
  food: string;
  /** MAKJI 제품 아이디어 */
  productIdea: string;
  /** 제철 재료.
   *  출처는 food와 같은 표(절기_베이커리_캘린더.html)의 '전통 음식·재료' 열과
   *  'MAKJI 제품' 열의 '제철 —' 표기다. 세시음식이 아니라 그 무렵 나오는 재료이므로,
   *  strength 'weak' 4개(우수·입추·처서·소한)도 이 필드는 채워져 있다. */
  seasonalIngredients: string[];
  /** 연결 논거 */
  rationale: string;
  /** 세시 근거 강도 */
  strength: EvidenceStrength;
}

export const SOLAR_TERMS: SolarTerm[] = [
  {
    ko: "춘분",
    hanja: "春分",
    month: 3,
    day: 21,
    longitude: 0,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "볶은 콩 나눠 먹기(지역 풍속), 나이떡 기록",
    productIdea: "미숫가루 휘낭시에",
    seasonalIngredients: ["볶은 콩", "콩가루"],
    rationale: "볶은 곡물·콩가루",
    strength: "medium"
  },
  {
    ko: "청명",
    hanja: "淸明",
    month: 4,
    day: 5,
    longitude: 15,
    anchor: true,
    keystone: false,
    sesi: "한식 동지+105일 삼월삼일 음 3/3",
    food: "한식엔 불을 쓰지 않아 찬 음식 . 삼월삼일 화전(진달래) · 쑥떡",
    productIdea: "쑥 냉동생지",
    seasonalIngredients: ["쑥", "진달래"],
    rationale: "식용꽃 휘낭시에 — 집에서 굽는 화전",
    strength: "strong"
  },
  {
    ko: "곡우",
    hanja: "穀雨",
    month: 4,
    day: 20,
    longitude: 30,
    anchor: true,
    keystone: false,
    sesi: "",
    food: "우전(雨前) - 곡우 전에 딴 첫 찻잎이 최상품. 곡우물 (나무 수액)",
    productIdea: "우전 말차 휘낭시에·스콘",
    seasonalIngredients: ["우전 찻잎", "나무 수액"],
    rationale: "차 등급이 그대로 상품 등급",
    strength: "strong"
  },
  {
    ko: "입하",
    hanja: "立夏",
    month: 5,
    day: 6,
    longitude: 45,
    anchor: false,
    keystone: false,
    sesi: "초파일 음 4/8",
    food: "쑥떡 , 느티떡 , 죽순",
    productIdea: "쑥 비건 잉글리시 머핀",
    seasonalIngredients: ["쑥", "느티잎", "죽순"],
    rationale: "기존 비건 라인 확장",
    strength: "medium"
  },
  {
    ko: "소만",
    hanja: "小滿",
    month: 5,
    day: 21,
    longitude: 60,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "봄나물 끝물(씀바귀·냉이), 보리가 익기 시작",
    productIdea: "보리 캄파뉴 냉동생지",
    seasonalIngredients: ["씀바귀", "냉이", "보리"],
    rationale: "보리는 저GI 서사와 연결",
    strength: "medium"
  },
  {
    ko: "망종",
    hanja: "芒種",
    month: 6,
    day: 6,
    longitude: 75,
    anchor: false,
    keystone: false,
    sesi: "단오 음 5/5",
    food: "보리·밀 수확 , 풋보리 그슬려 먹기. 단오 수리취떡 ·앵두",
    productIdea: "쑥·보리 잡곡 브레드",
    seasonalIngredients: ["보리", "밀", "수리취", "앵두"],
    rationale: "수리취떡의 쑥을 그대로",
    strength: "strong"
  },
  {
    ko: "하지",
    hanja: "夏至",
    month: 6,
    day: 21,
    longitude: 90,
    anchor: true,
    keystone: false,
    sesi: "유두 음 6/15",
    food: "하지 감자 - 이 무렵 캐는 감자가 제맛. 유두엔 유두면 ·상화병",
    productIdea: "감자 스콘",
    seasonalIngredients: ["감자"],
    rationale: "감자 전분은 글루텐프리 배합과 궁합",
    strength: "strong"
  },
  {
    ko: "소서",
    hanja: "小暑",
    month: 7,
    day: 7,
    longitude: 105,
    anchor: true,
    keystone: false,
    sesi: "칠석 음 7/7",
    food: "밀 수확 직후라 밀가루 음식 (국수·수제비). 칠석 밀전병 - 이후엔 밀 맛이 떨어진다고 봤다",
    productIdea: "밀 없는 칠석 — 글루텐프리 전병 생지",
    seasonalIngredients: ["밀"],
    rationale: "브랜드 메시지를 정면으로 뒤집는 자리",
    strength: "strong"
  },
  {
    ko: "대서",
    hanja: "大暑",
    month: 7,
    day: 23,
    longitude: 120,
    anchor: false,
    keystone: false,
    sesi: "삼복 초·중·말복",
    food: "참외·수박·복숭아, 복달임 음식",
    productIdea: "복숭아 냉동 디저트",
    seasonalIngredients: ["참외", "수박", "복숭아"],
    rationale: "더울수록 냉동 제품이 유리",
    strength: "strong"
  },
  {
    ko: "입추",
    hanja: "立秋",
    month: 8,
    day: 8,
    longitude: 135,
    anchor: false,
    keystone: false,
    sesi: "백중 음 7/15",
    food: "김장 채소 파종 시기. 고유 세시음식 약함",
    productIdea: "옥수수 브레드",
    seasonalIngredients: ["햇옥수수", "김장 채소"],
    rationale: "제철 — 햇옥수수",
    strength: "weak"
  },
  {
    ko: "처서",
    hanja: "處暑",
    month: 8,
    day: 23,
    longitude: 150,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "더위가 물러나고 벼가 익는다. 고추 말리기. 고유 세시음식 없음",
    productIdea: "무화과 스콘",
    seasonalIngredients: ["무화과", "고추"],
    rationale: "제철 — 무화과 단기 출하",
    strength: "weak"
  },
  {
    ko: "백로",
    hanja: "白露",
    month: 9,
    day: 8,
    longitude: 165,
    anchor: true,
    keystone: false,
    sesi: "",
    food: "포도순절 - 백로 무렵 포도가 제맛이라 불린 이름",
    productIdea: "포도·머스캣 휘낭시에",
    seasonalIngredients: ["포도", "머스캣"],
    rationale: "절기 이름 자체가 제품명",
    strength: "strong"
  },
  {
    ko: "추분",
    hanja: "秋分",
    month: 9,
    day: 23,
    longitude: 180,
    anchor: true,
    keystone: false,
    sesi: "추석 음 8/15",
    food: "송편 (쌀), 햇곡·밤·대추",
    productIdea: "쌀가루 베이스 밤 앙금 스콘",
    seasonalIngredients: ["햇곡", "쌀", "밤", "대추"],
    rationale: "쌀은 원래 글루텐프리",
    strength: "strong"
  },
  {
    ko: "한로",
    hanja: "寒露",
    month: 10,
    day: 8,
    longitude: 195,
    anchor: false,
    keystone: false,
    sesi: "중양절 음 9/9",
    food: "국화전 ·국화주, 밤떡",
    productIdea: "국화 향 휘낭시에",
    seasonalIngredients: ["국화", "밤"],
    rationale: "밤 브레드",
    strength: "strong"
  },
  {
    ko: "상강",
    hanja: "霜降",
    month: 10,
    day: 23,
    longitude: 210,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "첫 서리. 감·곶감 , 무 수확, 단풍놀이",
    productIdea: "곶감 스콘",
    seasonalIngredients: ["감", "곶감", "무"],
    rationale: "곶감의 단맛으로 정제당 저감",
    strength: "medium"
  },
  {
    ko: "입동",
    hanja: "立冬",
    month: 11,
    day: 7,
    longitude: 225,
    anchor: true,
    keystone: false,
    sesi: "상달 고사 음 10월",
    food: "김장 시작. 고사에 팥시루떡 을 올린다",
    productIdea: "저당 팥 앙금 브레드",
    seasonalIngredients: ["팥"],
    rationale: "팥시루떡 컨셉",
    strength: "strong"
  },
  {
    ko: "소설",
    hanja: "小雪",
    month: 11,
    day: 22,
    longitude: 240,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "첫눈. 김장 마무리, 시루떡",
    productIdea: "고구마 브레드",
    seasonalIngredients: ["고구마"],
    rationale: "제철 — 저장 고구마 당도 최고",
    strength: "medium"
  },
  {
    ko: "대설",
    hanja: "大雪",
    month: 12,
    day: 7,
    longitude: 255,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "메주 쑤기 - 콩을 삶아 띄우는 시기",
    productIdea: "대두 비건 단백 머핀",
    seasonalIngredients: ["콩", "메주"],
    rationale: "발효 서사 연결 가능",
    strength: "medium"
  },
  {
    ko: "동지",
    hanja: "冬至",
    month: 12,
    day: 22,
    longitude: 270,
    anchor: true,
    keystone: true,
    sesi: "",
    food: "팥죽 과 새알심 - 나이 수만큼 넣어 먹는다. 애동지엔 팥떡",
    productIdea: "저당 팥 앙버터 + 새알심 쌀 스콘",
    seasonalIngredients: ["팥", "쌀"],
    rationale: "라인업 전체의 기둥. 근거가 가장 확실",
    strength: "strong"
  },
  {
    ko: "소한",
    hanja: "小寒",
    month: 1,
    day: 6,
    longitude: 285,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "한 해 중 가장 추운 무렵. 고유 세시음식 없음",
    productIdea: "유자 휘낭시에",
    seasonalIngredients: ["유자", "감귤"],
    rationale: "제철 — 유자·감귤",
    strength: "weak"
  },
  {
    ko: "대한",
    hanja: "大寒",
    month: 1,
    day: 20,
    longitude: 300,
    anchor: true,
    keystone: false,
    sesi: "설 음 1/1 정월대보름 음 1/15",
    food: "떡국. 대보름 오곡밥·약밥 , 부럼깨기 - 호두·땅콩·잣·밤을 깨물어 먹는다",
    productIdea: "견과 휘낭시에 · 오곡 잡곡 브레드",
    seasonalIngredients: ["호두", "땅콩", "잣", "밤", "오곡"],
    rationale: "부럼 = 견과류. 잡곡은 글루텐프리 배합",
    strength: "strong"
  },
  {
    ko: "입춘",
    hanja: "立春",
    month: 2,
    day: 4,
    longitude: 315,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "궁중 오신반 , 민간 세생채(입춘채) - 겨우내 부족한 영양을 채우는 햇나물. 움파·산갓·당귀·미나리",
    productIdea: "봄나물 사워도우 냉동생지",
    seasonalIngredients: ["움파", "산갓", "당귀", "미나리"],
    rationale: "미나리·당귀 향 스콘",
    strength: "strong"
  },
  {
    ko: "우수",
    hanja: "雨水",
    month: 2,
    day: 19,
    longitude: 330,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "눈이 비로 바뀌는 절기. 고유 세시음식 없음",
    productIdea: "딸기 휘낭시에",
    seasonalIngredients: ["딸기"],
    rationale: "제철 — 딸기 성출하기",
    strength: "weak"
  },
  {
    ko: "경칩",
    hanja: "驚蟄",
    month: 3,
    day: 6,
    longitude: 345,
    anchor: false,
    keystone: false,
    sesi: "",
    food: "고로쇠·단풍나무 수액 마시기",
    productIdea: "수액 시럽 저당 스콘",
    seasonalIngredients: ["고로쇠 수액", "단풍나무 수액"],
    rationale: "정제당 대체 서사와 직결",
    strength: "medium"
  }
];

export const ANCHOR_TERMS = SOLAR_TERMS.filter((t) => t.anchor);
