'use client';

import { useState } from 'react';
import type { PayoutLine, PayoutPreview } from '@/lib/payout';
import styles from './AdminConsole.module.css';

/**
 * 주말 배당 지급 버튼 — 미리보기로 누구에게 얼마를 확인하고, 지급을 누르면 카페24 적립금으로 들어간다.
 *
 * 자동(크론)으로 두지 않은 이유 — 테스트몰 단계라 금액을 눈으로 보고 누르는 편이 안전하다.
 * 두 번 눌러도 한 아이디에 한 주 한 번만 나간다(lib/payout).
 */

const won = (n: number) => n.toLocaleString('ko-KR');
const STATUS: Record<string, string> = { paid: '지급됨', pending: '확인 필요', failed: '실패' };

export default function DividendPayout({ mode }: { mode: 'wallet' | 'mileage' | null }) {
  const [view, setView] = useState<(PayoutPreview & { refused?: string; error?: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (method: 'GET' | 'POST') => {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/dividend/payout', { method, cache: 'no-store' });
      setView(await response.json().catch(() => ({ error: `응답을 읽지 못했습니다 (${response.status})` })));
    } catch (cause) {
      setView({ error: cause instanceof Error ? cause.message : String(cause) } as never);
    } finally {
      setBusy(false);
    }
  };

  const row = (line: PayoutLine) => (
    <li key={`${line.member}:${line.status ?? ''}`}>
      <span>{line.member} · {line.score}점{line.status ? ` · ${STATUS[line.status] ?? line.status}` : ''}{line.note ? ` — ${line.note}` : ''}</span>
      <b>{won(line.amount)}P</b>
    </li>
  );

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>배당 지급</h2>
        {view?.from && <span className={styles.count}>{view.from} ~ {view.to} 활동분</span>}
      </div>
      <div className={styles.plan}>
        <p className={styles.note}>
          {mode === 'wallet'
            ? <>자사몰 아이디를 연결한 손님의 <b>배당금 통장</b>에 쌓습니다. 손님은 휴장일에 잔액을 할인 쿠폰으로 꺼내 씁니다.</>
            : mode === 'mileage' ? <>자사몰 아이디를 연결한 손님에게 <b>카페24 적립금</b>으로 넣습니다.</>
            : <><b>꺼져 있습니다</b> — Vercel에 DIVIDEND_PAYOUT=wallet을 넣고 카페24를 재인증하면 켜집니다.</>}
          {' '}주말에 누르면 이번 주,
          평일에 누르면 지난주 활동분입니다. <b>확인 필요</b>는 카페24에 보냈는데 결과를 못 적은 줄이라,
          카페24 적립금 내역을 보고 판단하세요 — 자동으로 다시 보내지 않습니다.
        </p>

        {view?.lines && (
          <ul className={styles.planItems}>
            {view.lines.length ? view.lines.map(row) : <li><span>지급할 사람이 없습니다</span><b>—</b></li>}
            <li><span>이번 지급 합계 · 주간 예산 {won(view.budget ?? 0)}P</span><b>{won(view.total ?? 0)}P</b></li>
          </ul>
        )}
        {!!view?.done?.length && (
          <ul className={styles.planItems}>{view.done.map(row)}</ul>
        )}

        <div className={styles.planActions}>
          <button type="button" onClick={() => call('GET')} disabled={busy}>{busy ? '계산 중…' : '미리보기'}</button>
          <button type="button" onClick={() => call('POST')} disabled={busy || !mode || !view?.lines?.length}>
            {busy ? '지급 중…' : mode === 'wallet' ? '배당금 적립' : '적립금 지급'}
          </button>
          {(view?.refused || view?.error) && <span className={styles.note}>{view.refused ?? view.error}</span>}
        </div>
      </div>
    </section>
  );
}
