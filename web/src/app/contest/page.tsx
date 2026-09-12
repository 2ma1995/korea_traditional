import type { Metadata } from 'next';
import Link from 'next/link';
import ContestGallery from '@/components/ContestGallery';
import TermBar from '@/components/TermBar';
import { CURRENT_ENTRIES, REWARDS } from '@/data/contest';
import { approvedCount, rankByCategory } from '@/lib/contestRanking';
import { currentTerm, nextTerm } from '@/lib/solarTerm';
import styles from './contest.module.css';

export const metadata: Metadata = { title: '모두의 절기상 · 막지', description: '취향을 나누면 계절이 더 맛있어집니다. 막지 절기 조리법 대회.' };

export default function ContestPage() {
  const today = new Date();
  const term = currentTerm(today);
  const upcoming = nextTerm(today);
  const shown = approvedCount(CURRENT_ENTRIES);
  const categoryCount = rankByCategory(CURRENT_ENTRIES).length;
  return <main id="main-content" className="page-width inner-page">
    <header className={`page-heading ${styles.heading}`}><div><span className="eyebrow">OUR SEASONAL TABLE</span><h1>함께 차린, <em>계절.</em></h1><p>서로 다른 취향이 모여, 더 맛있는 계절이 됩니다.</p></div></header>
    <div className={styles.termPanel}>
      <TermBar label="이번 절기" name={term.ko} hanja={term.hanja} note={term.food} nextName={upcoming.term.ko} daysLeft={upcoming.daysLeft} />
    </div>
    <section className={`contest-banner ${styles.banner}`} aria-labelledby="contest-title">
      <div className="contest-title"><span className="eyebrow">이번 절기 조리법 대회</span><h2 id="contest-title">{term.ko}의 맛을 나눠주세요.</h2><p>{upcoming.term.ko}까지 <strong>D–{upcoming.daysLeft}</strong> <span>· 나만의 제철 페어링</span></p></div>
      <ul className={`rewards ${styles.rewardList}`}>{REWARDS.map((r, i) => <li key={r.title} className={styles.reward}><span>0{i + 1}</span><strong>{r.title}</strong><p>{r.desc}</p></li>)}</ul>
    </section>
    <section className={`gallery-section ${styles.gallery}`} aria-labelledby="gallery-title">
      <div className={`section-heading ${styles.galleryHeading}`}><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2 id="gallery-title">취향이 담긴 한 상</h2></div><span className={`gallery-count ${styles.galleryCount}`}>빵 카테고리 {categoryCount}종 · 카테고리별 좋아요 1~3위 · 조합 {shown}개</span></div>
      <p className={`demo-note ${styles.notice}`}>시연용 레시피와 좋아요입니다. 사진은 조합에 사용된 막지 제품의 참고 사진이며, 완성된 출품작 사진이 아닙니다. 좋아요 수는 참가자 인스타그램 게시물에서 동기화한 값이며, 카드에 적힌 시각 기준입니다. 순위에는 관리자가 확인한 출품만 올라갑니다.</p>
      <ContestGallery entries={CURRENT_ENTRIES} />
    </section>
    <section className={`inline-invitation ${styles.archive}`}><div><span className="eyebrow">THE SEASONAL ARCHIVE</span><h2>지나간 계절에도, 맛은 남으니까.</h2><p>스물네 절기 속에 담긴 레시피를 펼쳐보세요.</p></div><Link href="/archive" className="button button-outline">절기 기록장 펼치기 <span>↗</span></Link></section>
    <details className={`market-details ${styles.guide}`}><summary>대회 참여 안내 <span>＋</span></summary><div className="market-detail-body"><p>대회는 절기마다 열리고 다음 절기에 마감합니다. 우승작은 절기 기록장에 남습니다.</p><p>실제 출품에는 직접 촬영한 사진이 필요합니다. 현재는 조합 만들기·공유·투표 시연을 제공하며, 사진 업로드와 출품 접수는 아직 지원하지 않습니다.</p></div></details>
  </main>;
}
