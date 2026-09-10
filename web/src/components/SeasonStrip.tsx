import Link from 'next/link';
import { groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';

export default function SeasonStrip({ date }: { date: Date }) {
  const seasons = groupBySeason(termsInTraditionalOrder(date));
  return <div className="season-strip" aria-label="스물네 절기 달력">
    <div className="season-strip-label"><span className="eyebrow">OUR SEASONS</span><p>스물네 번의<br />맛있는 계절</p></div>
    <div className="season-track">{seasons.map(({ label, items }) => <div className="season-group" key={label}><span className="season-name">{label}</span><div>{items.map(({ term, phase }) => <Link href={`/archive#term-${term.longitude}`} className={`term-mark ${phase}`} key={term.longitude} aria-label={`${term.ko}${phase === 'current' ? ', 지금의 절기' : ''}`}><span className="term-dot" /><span>{term.ko}</span></Link>)}</div></div>)}</div>
  </div>;
}
