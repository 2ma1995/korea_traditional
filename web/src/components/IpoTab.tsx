'use client';

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
 * 회차와 후보는 관리자가 직접 넣는다(lib/ipo · api/admin/ipo/rounds). 2026-09-21에
 * 절기 자동 편성을 걷어냈다 — 기업이 실제로 만들 수 있는 빵만 후보에 올라야
 * 공모가 지킬 수 있는 약속이 된다.
 *
 * 청약은 오늘 빵을 산 사람만 할 수 있다(lib/bidRight). 구매가 증거금 역할이라
 * "공모주"라는 은유가 성립한다. 오늘 안 산 사람에게도 후보와 경쟁률은 보인다 —
 * 그게 구매 동기를 만드는 자리라서 가리면 안 된다.
 *
 * ⚠️ 청약에 자사몰 아이디를 받는다. 당첨되면 그 사람에게 쿠폰을 보내야 하는데
 *    이 서비스에는 로그인이 없어서다. 개인정보라 화면에 목적과 보유 기간을
 *    반드시 적고(아래 memberNote), 쿠폰 발급이 끝나면 지운다(0009 주석).
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
  /* 당첨 쿠폰을 보낼 곳. 로그인이 없어 손님이 직접 적는다 */
  const [member, setMember] = useState('');

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
        body: JSON.stringify({ candidate, member: member.trim() }),
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
    if (!member.trim()) return '아이디를 적어주세요';
    return '청약하기';
  };

  return (
    <>
      <div className={styles.ipoHead}>
        <div>
          <span className="eyebrow">🗳 NEXT · 다음에 나올 빵</span>
          <h2>{round.name}</h2>
          <p>
            <b>{round.ask}</b><br />
            막지가 이번 회차에 올린 후보입니다. <b>{round.closesOn.slice(5).replace('-', '월 ')}일</b> 마감,
            경쟁률 1위가 실제로 나옵니다.
          </p>
          {/* 구매 전에도 규칙을 먼저 알려준다 — 버튼에만 적어두면 왜 잠겼는지 모른다 */}
          <p className={styles.ipoGate} data-open={view.canBid || Boolean(mine)}>
            {mine
              ? <><b>오늘 청약 완료.</b> 다음 회차에 또 한 장 받습니다.</>
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
                    <span>{c.note}</span>
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
                  disabled={busy || Boolean(mine) || !view.canBid || !member.trim()}
                  onClick={() => bid(c.id)}
                >
                  {buttonText(c.id)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {view.canBid && !mine && (
        <div className={styles.memberBox}>
          <label htmlFor="ipo-member">쿠폰 받을 자사몰 아이디</label>
          <input
            id="ipo-member"
            type="text"
            inputMode="email"
            autoComplete="username"
            maxLength={64}
            value={member}
            onChange={e => setMember(e.target.value)}
            placeholder="makji.kr 로그인 아이디"
          />
          {/* 개인정보를 받는 자리라 목적과 보유 기간을 여기서 밝힌다 */}
          <p className={styles.memberNote}>
            당첨된 빵이 나올 때 <b>할인 쿠폰</b>을 보내드리기 위해서만 씁니다.
            발급이 끝나면 지웁니다. 쿠폰을 보낼 곳이 있어야 청약이 접수됩니다.
          </p>
        </div>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      <dl className={styles.ipoRules}>
        <div><dt>손님</dt><dd>내가 고른 빵이 <b>실제로 나옵니다</b>. 경쟁률은 매일 바뀝니다</dd></div>
        <div><dt>기업</dt><dd>만들기 전에 <b>수요를 봅니다</b>. 오늘 산 사람의 표라 허수가 없습니다</dd></div>
        <div><dt>규칙</dt><dd><b>오늘 빵을 사면 청약권 1장</b> · 마감일 1위 상장 · 청약자에게 쿠폰</dd></div>
      </dl>

      <p className={styles.hint}>
        {!view.live && '저장소가 연결되지 않아 이번 서버 세션의 메모리에만 기록됩니다. '}
        {view.demo > 0 && <span className={styles.demoWarn}>⚠️ 이 중 {view.demo}건은 화면 확인용 샘플입니다. </span>}
        후보는 막지가 직접 골라 올립니다. 청약권은 구매할 때 서버가 발급합니다
        (회원 기반 1인 1청약은 다음 단계).
      </p>
    </>
  );
}
