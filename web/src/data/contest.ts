// 절기 레시피 콘테스트
//
// ⚠️ 아래 출품작은 전부 발표 시연용 예시 데이터다.
//    MAKJI 자사몰 B2C가 2026-08-28에 열려 실제 참여자가 아직 없다.
//    실제 서비스에서는 사용자가 올린 레시피가 이 자리를 채운다.
//
// 콘텐츠를 AI로 생성하지 않는다는 기업 제약에 맞춰, 출품작 이미지는
// 사용자가 직접 올린 사진을 쓴다. 여기서는 이모지로 자리만 잡아둔다.

export interface ContestEntry {
  id: string;
  /** 참가자 표시명 */
  author: string;
  /** 레시피 제목 */
  title: string;
  /** 사용한 막지 제품 */
  product: string;
  /** 올린 제철 재료 */
  toppings: string[];
  /** 대표 이미지 자리 (실제로는 사용자 업로드 사진) */
  emoji: string;
  votes: number;
  /** 한 줄 설명 */
  note: string;
}

export interface Contest {
  /** 절기 한글명 */
  term: string;
  /** SNS 해시태그 */
  hashtag: string;
  /** 마감 = 다음 절기 시작일 */
  entries: ContestEntry[];
}

/** 진행 중인 콘테스트 (예시 데이터) */
export const CURRENT_ENTRIES: ContestEntry[] = [
  {
    id: 'e1',
    author: 'bread_lover_sj',
    title: '포도 생지 타르트',
    product: '글루텐프리 냉동생지',
    toppings: ['포도'],
    emoji: '🍇',
    votes: 2341,
    note: '생지를 얇게 밀어 굽고 캠벨얼리를 통째로 올렸어요',
  },
  {
    id: 'e2',
    author: 'zero_sugar_diary',
    title: '고구마 무스 스콘',
    product: '글루텐프리 스콘',
    toppings: ['고구마'],
    emoji: '🍠',
    votes: 1876,
    note: '군고구마를 으깨서 스콘 위에. 당 추가 없이도 충분히 달아요',
  },
  {
    id: 'e3',
    author: 'glutenfree_mom',
    title: '사과 시나몬 브레드',
    product: '테트리스 브레드',
    toppings: ['사과'],
    emoji: '🍎',
    votes: 1204,
    note: '홍로를 얇게 썰어 올리고 시나몬만 뿌렸습니다',
  },
  {
    id: 'e4',
    author: 'makji_daily',
    title: '배 콩포트 휘낭시에',
    product: '글루텐프리 휘낭시에',
    toppings: ['배'],
    emoji: '🍐',
    votes: 987,
    note: '원황 배를 졸여서 휘낭시에 위에 얹었어요',
  },
];

/** 지난 절기 우승작 아카이브 (예시 데이터) */
export interface ArchiveItem {
  term: string;
  hashtag: string;
  title: string;
  author: string;
  emoji: string;
  votes: number;
}

export const ARCHIVE: ArchiveItem[] = [
  {
    term: '처서',
    hashtag: '#처서_복숭아레시피',
    title: '백도 크림 머핀',
    author: 'summer_baker',
    emoji: '🍑',
    votes: 3102,
  },
  {
    term: '입추',
    hashtag: '#입추_감자레시피',
    title: '감자 로즈마리 스콘',
    author: 'potato_holic',
    emoji: '🥔',
    votes: 2458,
  },
  {
    term: '대서',
    hashtag: '#대서_수박레시피',
    title: '수박 그라니타 브레드',
    author: 'coolbread',
    emoji: '🍉',
    votes: 2011,
  },
];

/** 리워드 안내 */
export const REWARDS = [
  { icon: '🏅', title: '우승자', desc: '할인 쿠폰 증정' },
  { icon: '📗', title: '아카이브', desc: '영구 등록' },
  { icon: '🗳️', title: '투표 참여', desc: '추가 리워드' },
];
