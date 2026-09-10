import ProductPhoto from '@/components/ProductPhoto';
import type { ContestEntry } from '@/data/contest';
import { RANK_SLOTS, rankByCategory } from '@/lib/contestRanking';

/**
 * 취향이 담긴 한 상 — 빵 카테고리별 1~3위.
 *
 * 한 줄이 한 카테고리이고, 왼쪽이 1위다. 카드 크기는 기존과 같게 두었으므로
 * 3장이 화면을 넘친다. 줄 안에서 가로로 스크롤한다 (페이지 본문은 가로로
 * 흐르지 않아야 한다).
 *
 * 출품이 없는 자리는 그리지 않는다. 출품이 하나도 없는 카테고리는
 * rankByCategory가 애초에 내려주지 않으므로 줄 자체가 생기지 않는다.
 *
 * 좋아요는 우리 화면의 투표가 아니라 인스타그램 게시물의 수치다. 누를 수 없고,
 * 동기화 시점의 스냅샷이라 기준 시각을 함께 밝힌다. 그래서 이 컴포넌트는
 * 클라이언트 상태가 없다 — 서버 컴포넌트로 둔다.
 */

const ordinals = ['1위', '2위', '3위'];

/** 좋아요 기준 시각. 서버·클라이언트가 같은 문자열을 내도록 시간대를 고정한다 */
const syncedAt = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  });

export default function ContestGallery({ entries }: { entries: ContestEntry[] }) {
  const categories = rankByCategory(entries);

  if (categories.length === 0) {
    return <p className="demo-note">관리자가 확인한 출품이 아직 없습니다.</p>;
  }

  return (
    <div className="category-rankings">
      {categories.map(category => (
        <section key={category.productNo} className="category-rank" aria-label={`${category.name} 좋아요 순위`}>
          <div className="category-rank-head">
            <h3>{category.name}</h3>
            <span>
              {category.total}개 출품 · 게시물 좋아요순
              {category.total > RANK_SLOTS && ` (상위 ${RANK_SLOTS}위)`}
            </span>
          </div>

          <ol className="rank-row">
            {category.ranked.map((entry, slot) => {
              const post = entry.instagram;
              return (
                <li key={entry.id} className={`recipe-card ${slot === 0 ? 'is-first' : ''}`}>
                  <div className="recipe-image">
                    <ProductPhoto productNo={entry.productNo} name={`${category.name} 참고 상품 사진`} />
                    <span className="recipe-rank">{ordinals[slot]}</span>
                    <span className="reference-label">베이스 상품 이미지</span>
                  </div>
                  <div className="recipe-content">
                    <div className="recipe-tags">
                      {entry.toppings.map(topping => <span key={topping}>#{topping}</span>)}
                      <span>#{category.name}</span>
                    </div>
                    <h4>{entry.title}</h4>
                    <p className="recipe-author">@{post.username}</p>
                    <p>{entry.note}</p>
                    <div className="recipe-footer">
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="post-link"
                        aria-label={`${entry.title} — @${post.username}의 인스타그램 게시글 확인하기`}
                      >
                        게시글 확인하기 <span aria-hidden="true">↗</span>
                      </a>
                      {post.likeCount === null ? (
                        <span className="like-count is-hidden-count">좋아요 비공개</span>
                      ) : (
                        <span className="like-count">
                          <span className="like-count-main">
                            <span aria-hidden="true">♥</span>
                            <b>{post.likeCount.toLocaleString('ko-KR')}</b>
                          </span>
                          <small>{syncedAt(post.likeCountAt)} 기준</small>
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
