'use client';

import { useState } from 'react';
import styles from './Tabs.module.css';

/**
 * 배당금 통장 — 자사몰 아이디 연결, 잔액, "배당금으로 할인받기".
 *
 * 이 서비스에는 로그인이 없어 배당을 받을 계정을 손님이 직접 알려줘야 한다
 * (공모 청약의 아이디 칸과 같은 이유). 휴장이 시작되면 잔액만큼 할인 쿠폰이 자사몰
 * 쿠폰함에 **자동으로** 들어가고, 안 쓰면 다음 장에 거둬 잔액으로 돌아온다(lib/payout).
 * 버튼은 그 자동 발급을 기다리지 않고 지금 받고 싶을 때만 쓴다.
 */

const won = (n: number) => n.toLocaleString('ko-KR');
const until = (iso: string) => new Date(iso).toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

interface Props {
  initial: string | null;
  mode: 'wallet' | 'mileage';
  balance: number;
  /** 지금 쿠폰함에 나가 있는 배당금 쿠폰 */
  coupon?: { amount: number; until: string } | null;
}

export default function DividendLink({ initial, mode, balance: initialBalance, coupon: initialCoupon = null }: Props) {
  const [linked, setLinked] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  const [member, setMember] = useState('');
  const [balance, setBalance] = useState(initialBalance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [coupon, setCoupon] = useState(initialCoupon);

  const post = async (path: string, body?: unknown) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error ?? `실패 (${response.status})`);
    return json;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '서버에 닿지 못했어요. 잠시 뒤 다시 해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const link = () => run(async () => {
    const json = await post('/api/dividend/link', { member: member.trim() });
    setLinked(json.member);
    setBalance(json.balance ?? 0);
    setDone('');
    setEditing(false);
  });

  const redeem = () => run(async () => {
    const json = await post('/api/dividend/redeem');
    setBalance(0);
    setCoupon({ amount: json.amount, until: json.until });
    setDone(`${won(json.amount)}원 쿠폰이 쿠폰함에 들어갔어요. 자사몰에 로그인해 결제할 때 고르세요 · ${won(json.minPrice)}원 이상 주문`);
  });

  if (linked && !editing) {
    return (
      <div className={styles.memberBox}>
        {mode === 'wallet' && (
          <>
            <label>내 배당금 · 이번 달 말 소멸</label>
            <strong>{won(balance + (coupon?.amount ?? 0))}P</strong>
            {coupon && (
              <p className={styles.memberNote}>
                <b>{won(coupon.amount)}원 쿠폰</b>이 자사몰 쿠폰함에 있어요 · {until(coupon.until)}까지.
                안 쓰면 다음 장에 배당금으로 돌아와요.
              </p>
            )}
            {balance > 0 && !done && (
              <button type="button" className={styles.bid} disabled={busy} onClick={redeem}>
                {busy ? '쿠폰 만드는 중…' : coupon ? `새로 쌓인 ${won(balance)}원 합쳐서 다시 받기` : `${won(balance)}원 할인 쿠폰으로 받기`}
              </button>
            )}
            {!coupon && balance === 0 && !done && (
              <p className={styles.memberNote}>휴장일이 되면 쌓인 배당금이 할인 쿠폰으로 자동으로 들어가요.</p>
            )}
            {done && <p className={styles.memberNote} role="status">{done}</p>}
          </>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.memberNote}>
          <b>{linked}</b> 계정으로 {mode === 'wallet' ? '매주 토요일 배당금이 쌓여요' : '매주 토요일 적립금이 들어가요'}.{' '}
          <button type="button" onClick={() => setEditing(true)}>바꾸기</button>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.memberBox}>
      <label htmlFor="dividend-member">배당 받을 자사몰 아이디</label>
      <input
        id="dividend-member"
        type="text"
        autoComplete="username"
        maxLength={20}
        value={member}
        onChange={e => setMember(e.target.value)}
        placeholder="makji.kr 로그인 아이디"
      />
      <button type="button" className={styles.bid} disabled={busy || !member.trim()} onClick={link}>
        {busy ? '확인 중…' : '연결하기'}
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {/* 개인정보를 받는 자리라 목적을 여기서 밝힌다 */}
      <p className={styles.memberNote}>
        배당을 {mode === 'wallet' ? '자사몰 할인 쿠폰' : '자사몰 적립금'}으로 드리기 위해서만 씁니다.
        이메일로 가입했다면 <b>@ 앞부분</b>이 아이디일 수 있어요. 한 아이디는 한 주에 한 번 받아요.
      </p>
    </div>
  );
}
