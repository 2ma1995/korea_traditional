import type { Metadata } from 'next';
import Link from 'next/link';
import { groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';

export const metadata: Metadata = {
  title: '스물네 절기 기록장 · 막지',
  description: '계절은 흐르고 맛있는 기억은 쌓입니다. 막지의 24절기 기록장.',
};

const seasonHanja = ['春', '夏', '秋', '冬'];
const seasonNotes = ['다시 움트는 맛', '햇살을 머금은 맛', '여물어 깊어진 맛', '따뜻하게 나누는 맛'];

/**
 * 스물네 절기 기록장 — 절기 화면(/season)과 함께 되살린 것.
 *
 * 대회를 접으면서 절기별 우승작 블록은 같이 뺐다. 남는 것은 절기마다의
 * 절식과 제철 재료다. 지금 절기 칸에서는 빵장으로 건너갈 수 있다.
 */
export default function ArchivePage() {
  const today = new Date();
  const terms = termsInTraditionalOrder(today);
  const seasons = groupBySeason(terms);
  const passed = terms.filter(item => item.phase !== 'current' && item.phase !== 'upcoming').length;

  return (
    <main id="main-content" className="page-width inner-page archive-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">TWENTY-FOUR SEASONS, ONE TABLE</span>
          <h1>스물네 절기 <em>기록장.</em></h1>
          <p>계절은 흐르고, 맛있는 기억은 차곡차곡 쌓입니다.</p>
        </div>
        <div className="archive-total">
          <strong>{String(passed).padStart(2, '0')}</strong>
          <span>/ 24<br />지나온 절기</span>
        </div>
      </header>

      <nav className="archive-season-nav" aria-label="계절별 기록">
        {seasons.map(({ label }, i) => (
          <a key={label} href={`#season-${i}`}><span>{seasonHanja[i]}</span>{label}<span aria-hidden="true">↓</span></a>
        ))}
      </nav>

      <p className="demo-note">절기마다 그 무렵 나오는 제철 재료와 절식을 함께 적었습니다. 절기를 펼치면 설명을 볼 수 있습니다.</p>

      {seasons.map(({ label, items }, index) => (
        <section id={`season-${index}`} key={label} className={`archive-season season-${index}`}>
          <div className="archive-season-heading">
            <span className="season-character" aria-hidden="true">{seasonHanja[index]}</span>
            <div>
              <span className="eyebrow">CHAPTER 0{index + 1}</span>
              <h2>{label}, {seasonNotes[index]}</h2>
            </div>
            <span className="fine-print">{items[0].term.ko} — {items[5].term.ko}</span>
          </div>

          <div className="archive-grid">
            {items.map(({ term, phase, daysUntil }) => (
              <details id={`term-${term.longitude}`} key={term.longitude} className={`archive-term ${phase}`}>
                <summary>
                  <div className="archive-term-top">
                    <span>{String(term.month).padStart(2, '0')}.{String(term.day).padStart(2, '0')}</span>
                    <span>{phase === 'current' ? '지금의 절기' : phase === 'upcoming' ? `D–${daysUntil}` : '지나간 절기'}</span>
                  </div>
                  <div className="archive-term-name">
                    <h3>{term.ko}</h3><span>{term.hanja}</span><b aria-hidden="true">＋</b>
                  </div>
                  <p>{term.food}</p>
                  <p className="term-ingredients">
                    <span>제철 재료</span>{term.seasonalIngredients.map(item => <b key={item}>{item}</b>)}
                  </p>
                </summary>
                <div className="archive-term-detail">
                  <p className="fine-print">
                    {phase === 'current' ? '지금 이 절기의 재료가 가장 맛있을 때입니다.' : phase === 'upcoming' ? '새로운 계절의 맛을 기다리고 있어요.' : '이 절기는 지나갔습니다. 내년에 다시 옵니다.'}
                  </p>
                  {phase === 'current' && <Link href="/" className="text-link">오늘 빵장 보기 ↗</Link>}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="inline-invitation">
        <div>
          <span className="eyebrow">AFTER THE BELL</span>
          <h2>장이 끝나면, 빵장이 열립니다.</h2>
          <p>오늘 내 종목이 오늘 내 빵값을 정합니다.</p>
        </div>
        <Link href="/" className="button button-primary">빵장 가기 <span>↗</span></Link>
      </section>
    </main>
  );
}
