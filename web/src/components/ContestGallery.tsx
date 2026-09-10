'use client';

import { useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { ContestEntry } from '@/data/contest';

const photos: Record<string, number> = { '글루텐프리 냉동생지': 33, '글루텐프리 스콘': 25, '테트리스 브레드': 31, '글루텐프리 휘낭시에': 28 };

export default function ContestGallery({ entries }: { entries: ContestEntry[] }) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const toggleVote = (id: string) => setVoted((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const sorted = [...entries].sort((a, b) => b.votes + (voted.has(b.id) ? 1 : 0) - (a.votes + (voted.has(a.id) ? 1 : 0)));
  return <ul className="contest-grid">{sorted.map((entry, rank) => {
    const isVoted = voted.has(entry.id);
    return <li key={entry.id} className="recipe-card"><div className="recipe-image"><ProductPhoto productNo={photos[entry.product] ?? 28} name={`${entry.product} 참고 상품 사진`} /><span className="recipe-rank">{String(rank + 1).padStart(2, '0')}</span><span className="reference-label">베이스 상품 이미지</span></div><div className="recipe-content"><div className="recipe-tags">{entry.toppings.map(t => <span key={t}>#{t}</span>)}<span>#{entry.product}</span></div><h3>{entry.title}</h3><p>{entry.note}</p><div className="recipe-footer"><span>@{entry.author}</span><button type="button" onClick={() => toggleVote(entry.id)} aria-pressed={isVoted} aria-label={`${entry.title} ${isVoted ? '투표 취소' : '투표하기'}`} className={`vote-button ${isVoted ? 'is-voted' : ''}`}><span aria-hidden="true">{isVoted ? '♥' : '♡'}</span> {(entry.votes + (isVoted ? 1 : 0)).toLocaleString('ko-KR')}</button></div></div></li>;
  })}</ul>;
}
