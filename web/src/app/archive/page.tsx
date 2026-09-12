import type { Metadata } from 'next';
import Link from 'next/link';
import ProductPhoto from '@/components/ProductPhoto';
import { ARCHIVE } from '@/data/contest';
import { groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';

export const metadata: Metadata = { title: '스물네 절기 기록장 · 막지', description: '계절은 흐르고 맛있는 기억은 쌓입니다. 막지의 24절기 레시피 기록장.' };
const winnerByTerm = new Map(ARCHIVE.map((a) => [a.term, a]));
const seasonHanja = ['春', '夏', '秋', '冬'];
const seasonNotes = ['다시 움트는 맛', '햇살을 머금은 맛', '여물어 깊어진 맛', '따뜻하게 나누는 맛'];

export default function ArchivePage() {
  const today = new Date();
  const terms = termsInTraditionalOrder(today);
  const seasons = groupBySeason(terms);
  return <main id="main-content" className="page-width inner-page archive-page">
    <header className="page-heading"><div><span className="eyebrow">TWENTY-FOUR SEASONS, ONE TABLE</span><h1>스물네 절기 <em>기록장.</em></h1><p>계절은 흐르고, 맛있는 기억은 차곡차곡 쌓입니다.</p></div><div className="archive-total"><strong>{String(ARCHIVE.length).padStart(2, '0')}</strong><span>/ 24<br />기록된 절기</span></div></header>
    <nav className="archive-season-nav" aria-label="계절별 기록">{seasons.map(({ label }, i) => <a key={label} href={`#season-${i}`}><span>{seasonHanja[i]}</span>{label}<span aria-hidden="true">↓</span></a>)}</nav>
    <p className="demo-note">등록된 레시피와 우승 기록은 시연용 예시입니다. 절기마다 그 무렵 나오는 제철 재료를 함께 적었습니다. 절기를 펼치면 연결 논거와 기록된 우승작을 볼 수 있습니다.</p>
    {seasons.map(({ label, items }, index) => <section id={`season-${index}`} key={label} className={`archive-season season-${index}`}><div className="archive-season-heading"><span className="season-character" aria-hidden="true">{seasonHanja[index]}</span><div><span className="eyebrow">CHAPTER 0{index + 1}</span><h2>{label}, {seasonNotes[index]}</h2></div><span className="fine-print">{items[0].term.ko} — {items[5].term.ko}</span></div><div className="archive-grid">{items.map(({ term, phase, daysUntil }) => {
      const winner = winnerByTerm.get(term.ko);
      return <details id={`term-${term.longitude}`} key={term.longitude} className={`archive-term ${phase}`}><summary><div className="archive-term-top"><span>{String(term.month).padStart(2, '0')}.{String(term.day).padStart(2, '0')}</span><span>{phase === 'current' ? '지금의 절기' : winner ? '기록된 맛' : phase === 'upcoming' ? `D–${daysUntil}` : '지나간 절기'}</span></div><div className="archive-term-name"><h3>{term.ko}</h3><span>{term.hanja}</span><b aria-hidden="true">＋</b></div><p>{term.food}</p><p className="term-ingredients"><span>제철 재료</span>{term.seasonalIngredients.map(item => <b key={item}>{item}</b>)}</p></summary><div className="archive-term-detail">{winner ? <div className="archive-winner"><div className="archive-winner-photo"><ProductPhoto productNo={winner.productNo} name={`${winner.title} 참고 상품 사진`} /><span className="reference-label">베이스 상품 이미지</span></div><p className="archive-author">예시 우승작 · @{winner.author}</p><strong>{winner.title}</strong><span className="archive-winner-likes">♥ {winner.votes.toLocaleString('ko-KR')}</span></div> : <p className="fine-print">{phase === 'current' ? '이번 절기의 취향을 직접 만들어보세요.' : phase === 'upcoming' ? '새로운 계절의 맛을 기다리고 있어요.' : '아직 등록된 레시피가 없습니다.'}</p>}{phase === 'current' && <Link href="/contest" className="text-link">이번 절기 조합 보기 ↗</Link>}</div></details>;
    })}</div></section>)}
    <section className="inline-invitation"><div><span className="eyebrow">YOUR TASTE, OUR NEXT CHAPTER</span><h2>다음 페이지의 주인공은 당신.</h2><p>다른 사람들이 차린 절기상을 만나보세요.</p></div><Link href="/contest" className="button button-primary">모두의 절기상 보기 <span>↗</span></Link></section>
  </main>;
}
