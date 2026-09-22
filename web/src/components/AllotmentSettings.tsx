'use client';

import { useState } from 'react';
import styles from './AdminConsole.module.css';

/**
 * 오늘 풀 물량의 상한.
 *
 * 카페24 재고를 덮어쓰지 않는다 — 위에서 막을 뿐이다. 재고가 300개여도 그걸 다
 * 할인가로 팔 생각은 아니고, 반대로 재고가 10개면 10개가 이긴다.
 * 재고 자체는 기업이 카페24에서 관리한다 — 같은 숫자를 두 곳에서 관리하지 않는다.
 * (예약이 카페24 재고를 깎게 했다가 겪은 사고가 lib/inventory에 적혀 있다)
 */

interface Props {
  initial: { value: number; stored: boolean };
  /** 저장된 값이 없을 때 쓰는 코드 기본값 */
  fallback: number;
}

export default function AllotmentSettings({ initial, fallback }: Props) {
  const [value, setValue] = useState(String(initial.value));
  const [stored, setStored] = useState(initial.stored);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const n = Number(value);
  const valid = Number.isFinite(n) && n >= 1 && n <= 1000;

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/allotment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allotment: n }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setMessage(json?.error ?? '저장하지 못했습니다.'); return; }
      setValue(String(json.value));
      setStored(true);
      setMessage('저장했습니다. 다음 화면부터 적용됩니다.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>오늘 풀 물량</h2>
        <span className={styles.count}>한 종당 {stored ? `${value}건` : `${fallback}건 (기본값)`}</span>
      </div>

      <div className={styles.plan}>
        <p className={styles.note}>
          빵 한 종을 하루에 <b>몇 건까지 할인가로 팔 것인가</b>입니다.
          자사몰 재고를 바꾸지 않고 <b>위에서 막기만</b> 합니다 — 자사몰 재고가 이 값보다
          적으면 재고가 이깁니다.
        </p>

        <div className={styles.fields}>
          <label>
            <span>한 종당 물량</span>
            <input type="number" inputMode="numeric" min={1} max={1000} step={5} value={value}
              onChange={event => setValue(event.target.value)} aria-label="한 종당 물량(건)" />
            <small>1건은 손님 한 명이 한 번 예약하는 단위입니다. 1~1,000 사이</small>
          </label>
        </div>

        <div className={styles.planActions}>
          <button type="button" onClick={save} disabled={busy || !valid}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <span className={styles.state} data-on={stored ? 'published' : undefined}>
            {stored ? 'DB 저장됨' : '코드 기본값으로 돌는 중'}
          </span>
          {message && <span className={styles.note}>{message}</span>}
        </div>

        <p className={styles.note}>
          재고 자체는 <b>카페24 관리자</b>에서 바꾸세요. 여기서 자사몰 재고를 건드리면 같은
          숫자를 두 곳에서 관리하게 되고, 어느 쪽이 맞는지 아무도 모르게 됩니다.
        </p>
      </div>
    </section>
  );
}
