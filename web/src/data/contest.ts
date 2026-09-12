// 절기 조리법 대회
//
// ⚠️ 아래 출품작은 전부 발표 시연용 예시 데이터다.
//    MAKJI 자사몰 B2C가 2026-08-28에 열려 실제 참여자가 아직 없다.
//    실제 서비스에서는 사용자가 올린 레시피가 이 자리를 채운다.
//
// 콘텐츠를 AI로 생성하지 않는다는 기업 제약에 맞춰, 출품작 이미지는
// 사용자가 직접 올린 사진을 쓴다. 여기서는 이모지로 자리만 잡아둔다.

/**
 * 출품 수집 경로 — 캡션 @멘션.
 *
 * 해시태그 검색(/{ig-hashtag-id}/recent_media)은 쓸 수 없다: 작성자(username)를
 * 요청할 수 없고, 조회 시점 기준 24시간 안의 게시물만 돌려준다.
 *
 * 캡션·댓글 @멘션은 목록으로 조회하는 엔드포인트가 없다. Meta가 mentions
 * 웹훅으로 media_id를 밀어주고, 그 id로 mentioned_media 에지를 물어
 * username·like_count·caption을 받는다. 즉 웹훅 수신 endpoint가 필수이고,
 * 놓친 멘션은 되찾을 수 없어 관리자 수동 등록 경로를 함께 둬야 한다.
 *
 * 참고: /{ig-user-id}/tags 는 캡션 멘션이 아니라 "사진에 태그된" 게시물이다.
 *       이쪽은 목록 폴링이 되지만 참가자가 사진 태그를 걸어야 한다.
 */
export const CONTEST_MENTION = '@makji';
/** 참가자 안내용 해시태그. 노출·홍보용이고 수집의 근거는 위 멘션이다. */
export const CONTEST_TAG = '#막지_절기레시피';

/**
 * 인스타그램 게시물에서 가져오는 값.
 *
 * 좋아요는 우리 화면의 투표가 아니라 게시물의 수치다. Graph API로 주기적으로
 * 동기화한 스냅샷이므로 실시간이 아니고, 화면에 기준 시각을 함께 밝힌다.
 */
export interface InstagramPost {
  /** Graph API IG Media id. 좋아요 재동기화의 키 */
  mediaId: string;
  /** 게시물 주소. 카드에서 원문으로 나간다 */
  permalink: string;
  /** 작성자 계정 */
  username: string;
  /** 좋아요 수. 작성자가 좋아요 수를 숨기면 API가 값을 주지 않으므로 null이 온다 */
  likeCount: number | null;
  /** 위 좋아요 수를 가져온 시각 (ISO 8601) */
  likeCountAt: string;
}

/**
 * 관리자 검수 상태.
 *
 * 태그된 게시물은 pending으로 들어오고, 관리자 페이지에서 확인한 것만
 * approved가 되어 "취향이 담긴 한 상"에 노출된다. rejected는 노출하지 않는다.
 */
export type EntryStatus = 'pending' | 'approved' | 'rejected';

export interface ContestEntry {
  id: string;
  /** 레시피 제목 */
  title: string;
  /** 빵 카테고리 = 사용한 막지 제품. products.ts의 productNo와 연결한다.
   *  이름 문자열로 두면 제품명이 바뀔 때 사진·카테고리 묶음이 조용히 깨진다. */
  productNo: number;
  /** 올린 제철 재료 */
  toppings: string[];
  /** 대표 이미지 자리 (실제로는 게시물 사진) */
  emoji: string;
  /** 출품 게시물. 순위 기준인 좋아요가 여기서 온다 */
  instagram: InstagramPost;
  /** 한 줄 설명 */
  note: string;
  /** 관리자 검수 상태. approved만 화면에 나간다 */
  status: EntryStatus;
  /** 관리자가 이 게시물을 찾은 해시태그 */
  sourceTag: string;
}

export interface Contest {
  /** 절기 한글명 */
  term: string;
  /** SNS 해시태그 */
  hashtag: string;
  /** 마감 = 다음 절기 시작일 */
  entries: ContestEntry[];
}

/** 진행 중인 대회 (예시 데이터) */
export const CURRENT_ENTRIES: ContestEntry[] = [
  {
    id: 'e1',
    title: '포도 생지 타르트',
    productNo: 33, // 냉동생지 3종
    toppings: ['포도'],
    emoji: '🍇',
    instagram: {
      mediaId: '17912345678901234',
      permalink: 'https://www.instagram.com/p/e1-demo/',
      username: 'bread_lover_sj',
      likeCount: 2341,
      likeCountAt: '2026-09-10T13:00:00+09:00',
    },
    note: '생지를 얇게 밀어 굽고 캠벨얼리를 통째로 올렸어요',
    status: 'approved',
    sourceTag: CONTEST_MENTION,
  },
  {
    id: 'e2',
    title: '고구마 무스 스콘',
    productNo: 25, // 글루텐프리 스콘
    toppings: ['고구마'],
    emoji: '🍠',
    instagram: {
      mediaId: '17912345678901235',
      permalink: 'https://www.instagram.com/p/e2-demo/',
      username: 'zero_sugar_diary',
      likeCount: 1876,
      likeCountAt: '2026-09-10T13:00:00+09:00',
    },
    note: '군고구마를 으깨서 스콘 위에. 당 추가 없이도 충분히 달아요',
    status: 'approved',
    sourceTag: CONTEST_MENTION,
  },
  {
    id: 'e3',
    title: '사과 시나몬 브레드',
    productNo: 31, // 테트리스 브레드
    toppings: ['사과'],
    emoji: '🍎',
    instagram: {
      mediaId: '17912345678901236',
      permalink: 'https://www.instagram.com/p/e3-demo/',
      username: 'glutenfree_mom',
      likeCount: 1204,
      likeCountAt: '2026-09-10T13:00:00+09:00',
    },
    note: '홍로를 얇게 썰어 올리고 시나몬만 뿌렸습니다',
    status: 'approved',
    sourceTag: CONTEST_MENTION,
  },
  {
    id: 'e4',
    title: '배 콩포트 휘낭시에',
    productNo: 28, // 글루텐프리 휘낭시에
    toppings: ['배'],
    emoji: '🍐',
    instagram: {
      mediaId: '17912345678901237',
      permalink: 'https://www.instagram.com/p/e4-demo/',
      username: 'makji_daily',
      likeCount: 987,
      likeCountAt: '2026-09-10T13:00:00+09:00',
    },
    note: '원황 배를 졸여서 휘낭시에 위에 얹었어요',
    status: 'approved',
    sourceTag: CONTEST_MENTION,
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
  /** 우승작이 쓴 막지 제품. 카드에 베이스 상품 사진으로 쓴다 (완성작 사진이 아니다) */
  productNo: number;
}

export const ARCHIVE: ArchiveItem[] = [
  {
    term: '처서',
    hashtag: '#처서_복숭아레시피',
    title: '백도 크림 머핀',
    productNo: 30, // 비건 잉글리시 머핀
    author: 'summer_baker',
    emoji: '🍑',
    votes: 3102,
  },
  {
    term: '입추',
    hashtag: '#입추_감자레시피',
    title: '감자 로즈마리 스콘',
    productNo: 25, // 글루텐프리 스콘
    author: 'potato_holic',
    emoji: '🥔',
    votes: 2458,
  },
  {
    term: '대서',
    hashtag: '#대서_수박레시피',
    title: '수박 그라니타 브레드',
    productNo: 31, // 테트리스 브레드
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
