'use client';

import { useRef, useState } from 'react';
import { WATCHLIST } from '@/data/watchlist';
import { PNL_CLAMP, settle } from '@/lib/settlement';
import type { Source } from '@/lib/settlementStore';
import type { Tape } from '@/lib/tape';
import styles from './Terminal.module.css';

/**
 * 내 하루 정산 — 증권 앱의 "계좌 연결" 자리.
 *
 * 증권 앱은 계좌가 있어야 매수가 된다. 빵장은 내 하루를 넣어야 내 가격이 나온다.
 * 안 넣어도 맨 위 칸(누구나 가격)으로 살 수 있으니 강제는 아니다.
 *
 * 계좌는 받지 않는다. 두 경로만 연다.
 *   관심 종목  — 종목 하나 고르면 그 종목의 오늘 등락률이 손익률을 대신한다
 *   직접 입력  — 스크린샷 판독(LLM)은 다음 단계라 지금은 숫자를 받는다
 *
 * 정산하면 집계에 한 줄 보탠다 — 보내는 것은 '위로/자축/본전'과 '몇 번째 칸' 뿐.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  today: string;
  openTicks: number;
  limitRate: number;
  source: Source | null;
  setSource: (next: Source | null) => void;
  onTape: (tape: Tape) => void;
}

const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;

export default function AccountSheet({ open, onClose, today, openTicks, limitRate, source, setSource, onTape }: Props) {
  const [tab, setTab] = useState<'symbol' | 'manual'>('symbol');
  const [symbol, setSymbol] = useState(WATCHLIST[0].symbol);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reported = useRef<string | null>(null);

  if (!open) return null;

  async function report(next: Source) {
    const outcome = settle(next.pnlPct, openTicks);
    const key = `${today}:${outcome.side}:${outcome.seatIndex}`;
    if (reported.current === key) return;
    reported.current = key;
    try {
      const res = await fetch('/api/tape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side: outcome.side, seat: outcome.seatIndex }),
      });
      const json = await res.json();
      if (json?.ok) onTape(json.tape);
    } catch {
      /* 집계는 부가 정보다 */
    }
  }

  function commit(next: Source) {
    setSource(next);
    void report(next);
  }

  async function bySymbol() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '시세를 가져오지 못했습니다.');
      commit({ kind: 'symbol', symbol: json.symbol, name: json.name, pnlPct: json.changePct });
    } catch (err) {
      setError(err instanceof Error ? err.message : '시세를 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function byManual() {
    const value = Number(manual);
    if (!Number.isFinite(value)) { setError('수익률을 숫자로 입력해 주세요.'); return; }
    setError(null);
    commit({ kind: 'manual', pnlPct: Number(value.toFixed(2)) });
  }

  const result = source ? settle(source.pnlPct, openTicks) : null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="내 하루 정산" onClick={onClose}>
      <div className={styles.sheet} onClick={event => event.stopPropagation()}>
        <div className={styles.sheetHead}>
          <h3>{result ? '오늘 내 정산' : '내 하루 정산하기'}</h3>
          <button type="button" className={styles.close} onClick={onClose}>닫기 ✕</button>
        </div>

        {result && source ? (
          <div className={styles.result} data-side={result.side}>
            <strong>{result.title}</strong>
            <p>{result.message}</p>
            <dl>
              <div><dt>{source.kind === 'symbol' ? source.name : '내 수익률'}</dt><dd>{signed(source.pnlPct)}</dd></div>
              <div><dt>오늘 한도</dt><dd>−{Math.round(limitRate * 100)}%</dd></div>
              <div><dt>내 자리</dt><dd>{openTicks - result.seatIndex}칸 중 맨 위</dd></div>
            </dl>
            {result.cappedByMarket && (
              <p>오늘 시장이 연 폭이 여기까지라 더 내려가지 못했습니다. 크게 움직인 날 다시 오시면 더 깊은 자리가 열립니다.</p>
            )}
            <button type="button" className={styles.linkBtn} onClick={() => setSource(null)}>다시 정산하기</button>
          </div>
        ) : (
          <>
            <p className={styles.sheetLede}>
              시장은 오늘 <b>정가 −{Math.round(limitRate * 100)}%</b>까지 열어두었습니다.
              그 안에서 <b>내 자리</b>는 오늘 내 하루가 정합니다. 계좌는 연결하지 않습니다.
            </p>

            <div className={styles.seg} role="group" aria-label="정산 방법">
              <button type="button" aria-pressed={tab === 'symbol'} onClick={() => setTab('symbol')}>관심 종목으로</button>
              <button type="button" aria-pressed={tab === 'manual'} onClick={() => setTab('manual')}>수익률 직접 입력</button>
            </div>

            {tab === 'symbol' ? (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>오늘 내 종목</span>
                  <select value={symbol} onChange={event => setSymbol(event.target.value)}>
                    {WATCHLIST.map(item => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}
                  </select>
                </label>
                <button type="button" className={styles.submit} onClick={bySymbol} disabled={busy}>
                  {busy ? '불러오는 중…' : '이 종목으로 정산하기'}
                </button>
                <p className={styles.sheetHint}>고른 종목의 <b>오늘 등락률</b>만 공개 시세에서 읽습니다. 서버로 가는 것은 종목 이름뿐입니다.</p>
              </div>
            ) : (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>오늘 내 수익률 (%)</span>
                  <input type="number" inputMode="decimal" step="0.1" placeholder="예: -2.4" value={manual} onChange={event => setManual(event.target.value)} />
                </label>
                <button type="button" className={styles.submit} onClick={byManual}>이 수익률로 정산하기</button>
                <p className={styles.sheetHint}>
                  ±{PNL_CLAMP}%부터는 같은 구간입니다 — 부풀려도 자리가 더 내려가지 않습니다.
                  <br /><b>MTS 캡처 판독은 다음 단계</b>라 지금은 숫자를 받습니다. 수익률은 서버로 보내지 않고 이 브라우저에만 남습니다.
                </p>
              </div>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
