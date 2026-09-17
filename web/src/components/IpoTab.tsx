'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { IpoCounts, IpoRound } from '@/lib/ipo';
import { useIpoPick, writeIpoPick } from '@/lib/ipoPickStore';
import styles from './Tabs.module.css';

/**
 * 공모주 탭 — 다음 절기빵 청약.
 *
 * 증권 앱의 공모주 청약 탭 자리다. 후보 셋, 경쟁률, 마감(절기 당일), 청약 버튼.
 * 절기는 여기서 산다 — "다음 상품을 정하는 자리"로. 상품 없는 절기 화면은
 * 버릴 데이터라는 현직자 기준에 대한 답이다.
 *
 * 1인 1청약은 브라우저에만 남긴다(localStorage). 회원 체계가 없어 서버는 못 막는다.
 */

interface Props {
  round: IpoRound;
  counts: IpoCounts;
  /** 청약 결과로 바뀐 집계를 부모에 올린다. 부모가 폴링으로도 갱신하므로 상태는 부모가 든다 */
  onChange: (next: IpoCounts) => void;
}

export default function IpoTab({ round, counts: state, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = useIpoPick(round.id);

  const total = Object.values(state.counts).reduce((a, b) => a + b, 0);
  const top = Math.max(1, ...Object.values(state.counts));
  const leader = round.candidates.reduce((best, c) => (state.counts[c.id] ?? 0) > (state.counts[best.id] ?? 0) ? c : best, round.candidates[0]);

  async function bid(candidate: string) {
    if (mine || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/ipo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidate }) });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '청약에 실패했습니다.');
      onChange({ counts: json.counts, demo: json.demo, live: json.live });
      writeIpoPick(round.id, candidate);
    } catch (err) {
      setError(err instanceof Error ? err.message : '청약에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.ipoHead}>
        <div>
          <span className="eyebrow">다음 절기빵 공모</span>
          <h3>{round.termKo} <small>{round.termHanja}</small></h3>
          <p>{round.month}월 {round.day}일 · {round.termKo} 무렵 <b>{round.ingredients.join(' · ')}</b>이 제맛입니다.<br />셋 중 하나에 청약하세요. 절기 당일 경쟁률 1위가 출시됩니다.</p>
        </div>
        <div className={styles.ipoClose}>
          <span>청약 마감</span>
          <strong>D-{round.daysLeft}</strong>
          <small>{total}명 청약 중</small>
        </div>
      </div>

      <ul className={styles.ipoList}>
        {round.candidates.map(c => {
          const n = state.counts[c.id] ?? 0;
          const ratio = n / c.allotment;
          const isMine = mine === c.id;
          const isLeader = leader.id === c.id && n > 0;
          return (
            <li key={c.id} className={styles.ipoCard} data-mine={isMine} data-leader={isLeader}>
              <div className={styles.ipoTop}>
                <div>
                  <b>{c.name}</b>
                  <span>{c.basis}</span>
                </div>
                <div className={styles.ipoRatio}>
                  <strong>{ratio.toFixed(2)} : 1</strong>
                  <small>{n} 청약 / {c.allotment} 배정</small>
                </div>
              </div>
              <div className={styles.ipoBar} aria-hidden="true"><i style={{ width: `${Math.round((n / top) * 100)}%` }} /></div>
              <div className={styles.ipoAct}>
                {isLeader && <span className={styles.ipoTag}>현재 1위</span>}
                <button type="button" className={styles.bid} data-state={isMine ? 'filled' : undefined} disabled={busy || (mine !== null && !isMine)} onClick={() => bid(c.id)}>
                  {isMine ? '내 청약 ✓' : mine ? '청약 완료' : busy ? '청약 중…' : '청약하기'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <dl className={styles.ipoRules}>
        <div><dt>손님</dt><dd>내가 고른 빵이 실제로 나옵니다. 청약자에게 <b>출시 쿠폰</b>. 경쟁률은 매일 바뀝니다</dd></div>
        <div><dt>기업</dt><dd>만들기 전에 <b>수요를 봅니다</b>. 어느 재료·형태에 표가 몰리는지가 다음 상품 근거가 됩니다</dd></div>
        <div><dt>규칙</dt><dd>1인 1청약 · 절기 당일 마감 · 1위 출시. 쿠폰 발급은 기업 확인 후</dd></div>
      </dl>

      <p className={styles.hint}>
        {!state.live && '저장소가 연결되지 않아 이번 서버 세션의 메모리에만 기록됩니다. '}
        {state.demo > 0 && <span className={styles.demoWarn}>⚠️ 이 중 {state.demo}건은 화면 확인용 샘플입니다. </span>}
        후보는 절기 데이터의 제철 재료로 자동으로 세웠습니다 — 기업이 후보를 직접 넣는 화면은 다음 단계입니다.
        {' '}<Link href="/archive" className={styles.relink}>스물네 절기 보기 →</Link>
      </p>
    </>
  );
}
