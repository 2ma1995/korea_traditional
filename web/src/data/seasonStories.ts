export interface SeasonStory {
  name: string;
  hanja: string;
  english: string;
  title: string;
  description: string;
  ingredients: string[];
  defaultTerm: string;
}

export const SEASON_STORIES: SeasonStory[] = [
  {
    name: '봄', hanja: '春', english: 'SPRING',
    title: '봄이 오면,\n다시 피어나는 맛.',
    description: '향긋한 쑥과 봄나물로, 한 해의 첫 맛을 깨웁니다.',
    ingredients: ['쑥', '딸기', '봄나물'], defaultTerm: '청명',
  },
  {
    name: '여름', hanja: '夏', english: 'SUMMER',
    title: '여름의 볕을,\n한 입 가득.',
    description: '햇살 머금은 복숭아와 감자, 싱그러운 여름을 담습니다.',
    ingredients: ['복숭아', '감자', '수박'], defaultTerm: '하지',
  },
  {
    name: '가을', hanja: '秋', english: 'AUTUMN',
    title: '가을이 익으면,\n마음도 넉넉하게.',
    description: '잘 여문 포도와 고구마로, 넉넉한 가을을 차립니다.',
    ingredients: ['포도', '고구마', '사과'], defaultTerm: '백로',
  },
  {
    name: '겨울', hanja: '冬', english: 'WINTER',
    title: '겨울의 온기를,\n서로 나누는 맛.',
    description: '팥과 견과의 고소한 온기로, 긴 겨울을 함께 나눕니다.',
    ingredients: ['팥', '감귤', '견과'], defaultTerm: '동지',
  },
];
