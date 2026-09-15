'use client';

import { useState } from 'react';
import type { DiscountTier } from '@/data/indicators';
import styles from './AdminConsole.module.css';

/**
 * 할인 구간 설정 — "코스피가 몇 % 움직이면 몇 % 할인".
 *
 * 저장하지 않으면 코드 기본값(data/indicators.ts)으로 돌아간다. 설정이 비었다고
 * 할인이 사라지면 안 되므로, 비우는 것이 아니라 되돌리는 쪽으로 동작한다.
 *
 * 상한은 기업 확인값이라 화면에서도 서버에서도 막는다.
 */

interface Props {
  initial: DiscountTier[];
  maxRate: number;
}

export default function TierSettings({ initial, maxRate }: Props) {
  const [tiers, setTiers] = useState(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<DiscountTier>) =>
    setTiers(previous => previous.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error ?? `저장 실패 (${response.status})`); return; }
      setTiers(data.tiers);
      setMessage('저장했습니다. 손님 화면의 할인율도 이 구간을 따릅니다.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>할인 구간 설정</h2>
        <span className={styles.count}>코스피 등락률 → 할인율</span>
      </div>

      <div className={styles.plan}>
        <ul className={styles.planItems}>
          {tiers.map((tier, index) => (
            <li key={index} className={styles.tierRow}>
              <span>코스피 등락</span>
              <span className={styles.rateBox}>
                <input
                  value={tier.minAbsChange}
                  inputMode="decimal"
                  aria-label={`${index + 1}번째 구간 하한`}
                  onChange={event => update(index, { minAbsChange: Number(event.target.value) || 0 })}
                />%
              </span>
              <span>이상이면</span>
              <span className={styles.rateBox}>
                <input
                  value={Math.round(tier.rate * 100)}
                  inputMode="numeric"
                  aria-label={`${index + 1}번째 구간 할인율`}
                  onChange={event => update(index, {
                    rate: Math.min(Math.max(Number(event.target.value) || 0, 0), maxRate * 100) / 100,
                  })}
                />%
              </span>
              <span>할인</span>
              <input
                className={styles.tierLabel}
                value={tier.label}
                aria-label={`${index + 1}번째 구간 이름`}
                onChange={event => update(index, { label: event.target.value })}
              />
              <button
                type="button"
                className={styles.rowRemove}
                aria-label={`${index + 1}번째 구간 삭제`}
                onClick={() => setTiers(previous => previous.filter((_, i) => i !== index))}
              >✕</button>
            </li>
          ))}
        </ul>

        <div className={styles.planActions}>
          <button
            type="button"
            className={styles.outline}
            onClick={() => setTiers(previous => [...previous, { minAbsChange: 0, rate: 0.1, label: '구간' }])}
          >구간 추가</button>
          <button type="button" className={styles.submit} onClick={save} disabled={busy || !tiers.length}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>

        {message && <p className={styles.note} style={{ marginTop: 12 }}>{message}</p>}
        <p className={styles.note} style={{ marginTop: 12 }}>
          등락률이 큰 구간부터 먼저 맞춰봅니다. 어느 구간에도 안 걸리면 마지막 구간을 씁니다 —
          할인 없는 날은 만들지 않기로 한 기획입니다. 상한은 {Math.round(maxRate * 100)}%(기업 확인값)입니다.
        </p>
      </div>
    </section>
  );
}
