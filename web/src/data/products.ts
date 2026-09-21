// MAKJI 제품 마스터
// 출처: makji.kr 직접 확인 (2026-09-08). product_no는 카페24 실제 값.
//
// glutenFree가 제품을 가르는 유일한 기준이다 — 할인 대상 선정(discount.ts)도 이 값만 본다.
// 이전에는 같은 뜻의 line: 'domestic' | 'imported' 필드가 따로 있었으나,
// "국산 쌀"이라는 이름과 달리 실제로는 글루텐프리 여부와 100% 일치해
// 오해의 소지가 있어 제거했다.
//
// ⚠️ glutenFree가 false인 4종은 "밀가루를 쓴다"는 확인이 아니라
//    "사이트에 글루텐프리 표기가 없다"는 뜻이다. 기업 확인 필요 항목.
// ⚠️ glutenFree가 true여도 쌀가루를 쓴다는 뜻은 아니다 (예: 휘낭시에는 아몬드가루 기반).
//
// ⚠️ 원산지를 주장하지 않는다 (2026-09-18 팀 원재료 표기 전수 확인).
//    쌀가루는 국내산이 아니다. 국내산으로 확인된 것은 벌꿀·난백액·우유 정도이고
//    주재료가 아니다. 기존 발표덱의 "국내산 쌀가루 라인"은 성립하지 않는다.
//    배지는 표기로 확인되는 것만 쓴다 — 글루텐프리 · 무설탕 · 보존료 無.

/** 게임/레시피용 원료 코드 9종 */
export type IngredientCode =
  | 'water'
  | 'riceFlour'
  | 'egg'
  | 'allulose'
  | 'butter'
  | 'almondFlour'
  | 'cream'
  | 'cheese'
  | 'cocoa';

export interface Product {
  /** 카페24 product_no */
  productNo: number;
  /** 표시명 (짧게) */
  name: string;
  /** 사이트 정식 상품명 */
  fullName: string;
  /** 정가 (원) */
  price: number;
  /** 사이트에 글루텐프리가 명시되어 있는가 — 배지 표기용이다. 라인 판정에 쓰지 말 것 */
  glutenFree: boolean;
  /**
   * 오늘의 라인 (발표덱 8·9장).
   *
   *   meal   식사형·데일리 — 코스피가 오른 날.  "주식이 오르면, 주식(主食)을"
   *   sweet  달달한 위로   — 코스피가 내린 날.  "아쉬운 장 마감, 달달하게"
   *
   * glutenFree로 가르지 않는다. 그건 밀가루를 안 쓴다는 뜻이지 밥이 되는 빵이라는
   * 뜻이 아니다 — 실제로 하락 라인 4종이 전부 glutenFree라 그대로 쓰면 정반대가 된다.
   * 원산지("국내산 쌀")로도 가르지 않는다. 쌀가루가 국내산이 아니다(아래 주석).
   */
  line: 'meal' | 'sweet';
  /** 사이트 원재료 표기 원문 */
  label: string;
  /**
   * 재고 (2026-09-18 재확인).
   *
   * 판정은 상품 상세의 SOLD OUT 버튼 블록이 `displaynone`인지로 본다.
   * 페이지에 있는 `aSoldoutDisplay = {"33":"품절"}`은 품절일 때 쓸 문구일 뿐
   * 상태가 아니다 — 이걸 상태로 읽어서 생지를 열흘간 품절로 두었다.
   *
   * 손으로 확인하는 값이라 재입고를 놓친다. 카페24 재고 연동이 다음 단계다.
   */
  inStock: boolean;
  /** 원료 바스켓 — 값은 게임 레시피 필요 개수이자 원가 비중의 대리값 (추정치) */
  recipe: Partial<Record<IngredientCode, number>>;
}

export const PRODUCTS: Product[] = [
  {
    productNo: 29,
    name: '마틸다 초코케이크',
    fullName: '막지 글루텐프리 무설탕 마틸다 초코케이크',
    price: 42000,
    glutenFree: true,
    line: 'sweet',
    label: '밀가루·인공첨가물 ZERO / 향료·색소·보존료 無',
    inStock: false,
    recipe: { cocoa: 10, butter: 7, egg: 6, cream: 4, allulose: 2, water: 1 },
  },
  {
    productNo: 33,
    name: '냉동생지 3종',
    fullName: '막지 글루텐프리 냉동생지 3종',
    price: 21000,
    glutenFree: true,
    line: 'meal',
    label: '밀가루 없이 만든 글루텐프리',
    inStock: true,
    recipe: { butter: 8, almondFlour: 5, riceFlour: 5, egg: 4, water: 2 },
  },
  {
    productNo: 19,
    name: '달항아리 티라미수',
    fullName: '막지 글루텐프리 무설탕 달항아리 티라미수(플레인/피스타치오)',
    price: 15000,
    glutenFree: true,
    line: 'sweet',
    label: '글루텐프리 무설탕',
    inStock: false,
    recipe: { cheese: 7, cream: 5, egg: 4, allulose: 2, cocoa: 1, water: 1 },
  },
  {
    productNo: 23,
    name: 'ZERO 카스테라',
    fullName: '막지 ZERO 카스테라',
    price: 12000,
    glutenFree: true,
    line: 'meal',
    label: '설탕·밀가루 ZERO / 천연 당 알룰로스',
    inStock: false,
    recipe: { egg: 6, allulose: 4, butter: 3, riceFlour: 3, water: 1 },
  },
  {
    productNo: 31,
    name: '테트리스 브레드',
    fullName: '폭신한 통식빵, 막지 테트리스 브레드',
    price: 11000,
    glutenFree: false,
    line: 'meal',
    label: '향료·색소·보존료 無 (글루텐프리 표기 없음)',
    inStock: true,
    recipe: { riceFlour: 6, butter: 4, egg: 3, cream: 2, water: 1 },
  },
  {
    productNo: 32,
    name: '제로 무설탕 모닝롤',
    fullName: '담백폭신 막지 제로 무설탕 모닝롤',
    price: 4500,
    glutenFree: false,
    line: 'meal',
    label: '설탕 무첨가 (글루텐프리 표기 없음)',
    inStock: true,
    recipe: { riceFlour: 4, allulose: 3, butter: 2, egg: 1, water: 1 },
  },
  {
    productNo: 28,
    name: '글루텐프리 휘낭시에',
    fullName: '겉바속쫀 막지 글루텐프리 휘낭시에',
    price: 3800,
    glutenFree: true,
    line: 'sweet',
    label: '밀가루 ZERO / 원유 100% 동물성 버터',
    inStock: true,
    recipe: { butter: 4, egg: 2, almondFlour: 2, allulose: 1, water: 1 },
  },
  {
    productNo: 25,
    name: '글루텐프리 스콘',
    fullName: '환상의 단짠 조합, 막지 글루텐프리 스콘',
    price: 3800,
    glutenFree: true,
    line: 'sweet',
    label: '밀가루 ZERO / 100% 버터와 동물성 생크림',
    inStock: true,
    recipe: { butter: 3, cream: 3, riceFlour: 2, allulose: 1, water: 1 },
  },
  {
    productNo: 27,
    name: '대만식 샌드위치',
    fullName: '촉촉폭신 막지 수제 대만식 샌드위치',
    price: 2400,
    glutenFree: false,
    line: 'meal',
    label: '직접 만든 식빵·호밀빵 / 슈크림·체다·화이트치즈',
    inStock: false,
    recipe: { riceFlour: 3, cheese: 2, cream: 1, water: 1 },
  },
  {
    productNo: 30,
    name: '비건 잉글리시 머핀',
    fullName: '막지 비건 잉글리시 머핀(햄치즈/비건)',
    price: 1500,
    glutenFree: false,
    line: 'meal',
    label: '식물성 원료 (글루텐프리 표기 없음)',
    inStock: true,
    recipe: { riceFlour: 4, water: 1 },
  },
];
