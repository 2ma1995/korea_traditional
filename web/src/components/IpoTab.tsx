'use client';

import Link from 'next/link';
import { useState } from 'react';
import ProductPhoto from '@/components/ProductPhoto';
import type { IpoCounts, IpoRound } from '@/lib/ipo';
import styles from './Tabs.module.css';

/**
 * NEXT — 다음에 나올 빵 공모.
 *
 * 탭이 아니라 스크롤 순서 안의 한 섹션이다. MARKET → TODAY → MY → NEXT 로
 * 시간 순서가 곧 화면 순서가 된다. 별도 탭으로 빼면 처음 온 사람은 영영 못 본다 —
 * 지난번에 화면에서 뺀 이유가 그것이었다.
 *
 * 구매 체결 순간이 여기로 오는 유일한 전환 시점이다. 그 자리(OfferSheet)에서
 * "청약권 1장이 생겼어요"로 데려오고, 헤더에도 NEXT를 두었다.
 *
 * 회차는 두 모드다(lib/ipo).
 *   재상장 공모   품절 상품 중 무엇을 먼저 다시 들여올지   연 20회
 *   신규 상장 공모 절기 제철 재료로 만든 새 빵            연 4회 (이분이지)
 *
 * 청약은 오늘 빵을 산 사람만 할 수 있다(lib/bidRight). 구매가 증거금 역할이라
 * "공모주"라는 은유가 성립한다. 오늘 안 산 사람에게도 후보와 경쟁률은 보인다 —
 * 그게 구매 동기를 만드는 자리라서 가리면 안 된다.
 */

export interface IpoView extends IpoCounts {
  canBid: boolean;
  bidFor: string | null;
}

interface Props {
  round: IpoRound;
  view: IpoView;
  /** 청약 결과로 바뀐 집계를 부모에 올린다. 부모가 폴링으로도 갱신하므로 상태는 부모가 든다 */
  onChange: (next: IpoView) => void;
}

export default function IpoTab({ round, view, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = view.bidFor;
  const total = Object.values(view.counts).reduce((a, b) => a + b, 0);
  const top = Math.max(1, ...Object.values(view.counts));
  const leader = round.candidates.reduce(
    (best, c) => ((view.counts[c.id] ?? 0) > (view.counts[best.id] ?? 0) ? c : best),
    round.candidates[0],
  );

  async function bid(candidate: string) {
    if (mine || busy || !view.canBid) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/ipo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '청약에 실패했습니다.');
      onChange({ counts: json.counts, demo: json.demo, live: json.live, canBid: json.canBid, bidFor: json.bidFor });
    } catch (err) {
      setError(err instanceof Error ? err.message : '청약에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  /** 버튼이 말할 것 — 오늘 안 산 사람에게는 이 자리가 구매 안내다 */
  const buttonText = (id: string) => {
    if (mine === id) return '내 청약 ✓';
    if (mine) return '청약 완료';
    if (busy) return '청약 중…';
    if (!view.canBid) return '오늘 빵을 사면 청약';
    return '청약하기';
  };

  return (
    <>
      <div className={styles.ipoHead}>
        <div>
          <span className="eyebrow">🗳 NEXT · {round.label}</span>
          <h3>{round.termKo} <small>{round.termHanja}</small></h3>
          <p>
            <b>{round.ask}</b><br />
            {round.mode === 'restock'
              ? '지금 품절인 빵 중에서 고릅니다. 1위가 먼저 다시 들어옵니다.'
              : <>{round.month}월 {round.day}일 · {round.termKo} 무렵 <b>{round.ingredients.join(' · ')}</b>이 제맛입니다.</>}
            <br />셋 중 하나에 청약하세요. 절기 당일 경쟁률 1위가 상장됩니다.
          </p>
          {/* 구매 전에도 규칙을 먼저 알려준다 — 버튼에만 적어두면 왜 잠겼는지 모른다 */}
          <p className={styles.ipoGate} data-open={view.canBid || Boolean(mine)}>
            {mine
              ? <><b>오늘 청약 완료.</b> 다음 절기에 또 한 장 받습니다.</>
              : view.canBid
                ? <><b>청약권 1장 있어요.</b> 지금 한 후보에 걸 수 있습니다.</>
                : <><b>오늘 빵을 사면 청약권 1장</b>이 생깁니다. 사는 사람이 다음 빵을 정합니다.</>}
          </p>
        </div>
        <div className={styles.ipoClose}>
          <span>청약 마감</span>
          <strong>D-{round.daysLeft}</strong>
          <small>{total}명 청약 중</small>
        </div>
      </div>

      <ul className={styles.ipoList}>
        {round.candidates.map(c => {
          const n = view.counts[c.id] ?? 0;
          const isMine = mine === c.id;
          return (
            <li key={c.id} className={styles.ipoCard} data-mine={isMine} data-leader={leader.id === c.id && n > 0}>
              <div className={styles.ipoTop}>
                <div className={styles.ipoName}>
                  {c.productNo !== null && (
                    <span className={styles.ipoThumb} aria-hidden="true">
                      <ProductPhoto productNo={c.productNo} name={c.name} />
                    </span>
                  )}
                  <span>
                    <b>{c.name}</b>
                    <span>{c.basis}</span>
                  </span>
                </div>
                <div className={styles.ipoRatio}>
                  <strong>{(n / c.allotment).toFixed(2)} : 1</strong>
                  <small>{n} 청약 / {c.allotment} 배정</small>
                </div>
              </div>
              <div className={styles.ipoBar} aria-hidden="true"><i style={{ width: `${Math.round((n / top) * 100)}%` }} /></div>
              <div className={styles.ipoAct}>
                {leader.id === c.id && n > 0 && <span className={styles.ipoTag}>현재 1위</span>}
                <button
                  type="button"
                  className={styles.bid}
                  data-state={isMine ? 'filled' : undefined}
                  disabled={busy || Boolean(mine) || !view.canBid}
                  onClick={() => bid(c.id)}
                >
                  {buttonText(c.id)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <dl className={styles.ipoRules}>
        <div><dt>손님</dt><dd>내가 고른 빵이 <b>실제로 나옵니다</b>. 경쟁률은 매일 바뀝니다</dd></div>
        <div><dt>기업</dt><dd>만들기 전에 <b>수요를 봅니다</b>. 오늘 산 사람의 표라 허수가 없습니다</dd></div>
        <div><dt>규칙</dt><dd><b>오늘 빵을 사면 청약권 1장</b> · 절기 당일 마감 · 1위 상장</dd></div>
      </dl>

      <p className={styles.hint}>
        {!view.live && '저장소가 연결되지 않아 이번 서버 세션의 메모리에만 기록됩니다. '}
        {view.demo > 0 && <span className={styles.demoWarn}>⚠️ 이 중 {view.demo}건은 화면 확인용 샘플입니다. </span>}
        {round.mode === 'restock'
          ? '후보는 자사몰에서 지금 품절인 상품을 정가 높은 순으로 세웠습니다.'
          : '후보는 절기 데이터의 제철 재료로 세웠습니다 — 기업이 후보를 직접 넣는 화면은 다음 단계입니다.'}
        {' '}청약권은 구매할 때 서버가 발급합니다(회원 기반 1인 1청약은 다음 단계).
        {' '}<Link href="/archive" className={styles.relink}>스물네 절기 보기 →</Link>
      </p>
    </>
  );
}
