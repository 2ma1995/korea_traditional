'use client';

import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import MarketTape from '@/components/MarketTape';
import OrderBook from '@/components/OrderBook';
import { WATCHLIST } from '@/data/watchlist';
import type { ProductBook } from '@/lib/orderbook';
import { PNL_CLAMP, settle, type Settlement } from '@/lib/settlement';
import type { Tape } from '@/lib/tape';
import styles from './MyDesk.module.css';

/**
 * 2층 — 오늘 내 장을 빵으로 정산한다.
 *
 * 1층(시장)이 오늘 열릴 칸의 개수를 정해놓으면, 여기서 손님의 하루가
 * 그 칸들 중 어디에 앉을지를 정한다. 그리고 그 결과가 3층(호가창)의
 * 시작 칸이 된다.
 *
 * 계좌는 받지 않는다. 아이디·비밀번호·증권사 앱키는 어떤 형태로도 받지 않는 것이
 * 원칙이다 — 받는 순간 남의 주문 권한을 보관하게 된다. 대신 두 경로를 연다.
 *
 *   A. 관심 종목  — 종목 하나를 고르면 그 종목의 오늘 등락률이 손익률을 대신한다.
 *                   허들 0, 조작 불가(공개 시세), 주식을 안 해도 참여 가능.
 *   B. 손익 입력  — 실제 수익률을 직접 넣는다. 스크린샷 판독(LLM)은 다음 단계라
 *                   지금은 숫자를 받는다. 화면에 그 사실을 밝힌다.
 *
 * 조작은 막지 않고 **이득을 없앤다.** ±5%부터는 같은 구간이라 아무리 부풀려도
 * 자리가 더 내려가지 않는다(PNL_CLAMP). 상한 38%·1일 1회와 합치면 편집해서
 * 얻을 이득이 빵 한 봉지에 몇백 원이다.
 *
 * 저장은 브라우저에만 한다. 서버로 보내는 것은 종목 심볼뿐이고, 손익률은
 * 서버로 가지 않는다.
 */

type Source =
  | { kind: 'symbol'; symbol: string; name: string; pnlPct: number }
  | { kind: 'manual'; pnlPct: number };

interface Props {
  books: ProductBook[];
  open: boolean;
  /** 시장 스냅샷 날짜 (YYYY-MM-DD). 저장된 정산이 오늘 것인지 가린다 */
  today: string;
  /** 1층이 오늘 연 최저호가 폭 — 화면 문구에 쓴다 */
  limitRate: number;
  /** 서버에서 그린 오늘 집계. 정산하면 여기서 갱신한다 */
  initialTape: Tape;
}

const STORAGE_KEY = 'makji_settlement';
const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;

/* ------------------------------------------------------------------ */
/* 정산 보관 — 브라우저에만 남는다                                       */
/* ------------------------------------------------------------------ */

/**
 * localStorage를 외부 저장소로 두고 useSyncExternalStore로 읽는다.
 *
 * effect 안에서 setState로 복원하면 마운트 직후 한 번 더 렌더된다(React 19가
 * 린트로 막는다). 서버 스냅샷을 null로 두면 SSR·하이드레이션은 '정산 전' 화면을
 * 그리고, 하이드레이션이 끝난 뒤 저장값으로 한 번에 바뀐다 — 불일치가 없다.
 *
 * 메모리 사본을 함께 두는 이유: 시크릿 모드나 저장 차단 환경에서 localStorage가
 * 던진다. 그때도 이번 방문 동안은 화면에 남아야 한다.
 */
let memo: string | null | undefined; // undefined = 아직 안 읽음
const listeners = new Set<() => void>();

function subscribeSaved(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function readSaved(): string | null {
  if (memo === undefined) {
    try {
      memo = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      memo = null;
    }
  }
  return memo;
}

/** 서버에는 저장값이 없다. 항상 '정산 전'으로 그린다 */
const readSavedOnServer = (): string | null => null;

function writeSaved(raw: string | null) {
  memo = raw;
  try {
    if (raw === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* 저장 못 해도 메모리 사본으로 이번 방문은 유지된다 */
  }
  listeners.forEach(callback => callback());
}

/** 저장값이 오늘 것일 때만 살린다. 빵장은 하루 단위라 어제 정산은 버린다 */
function parseSaved(raw: string | null, today: string): Source | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { date?: string; source?: Source };
    return saved?.date === today && saved.source ? saved.source : null;
  } catch {
    return null;
  }
}

export default function MyDesk({ books, open, today, limitRate, initialTape }: Props) {
  const [tab, setTab] = useState<'symbol' | 'manual'>('symbol');
  const [symbol, setSymbol] = useState(WATCHLIST[0].symbol);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tape, setTape] = useState(initialTape);
  /* 같은 결과를 다시 보내지 않는다. 슬라이더를 만지작거려도 집계가 부풀지 않게 */
  const reported = useRef<string | null>(null);

  /* 오늘 이미 정산했다면 그대로 되살린다 */
  const saved = useSyncExternalStore(subscribeSaved, readSaved, readSavedOnServer);
  const source = useMemo(() => parseSaved(saved, today), [saved, today]);

  function remember(next: Source | null) {
    writeSaved(next ? JSON.stringify({ date: today, source: next }) : null);
  }

  /**
   * 오늘 집계에 한 줄 보탠다.
   *
   * 보내는 것은 '위로/자축/본전'과 '몇 번째 칸' 두 가지뿐이다. 수익률 숫자와
   * 고른 종목은 보내지 않는다 — 시황에 필요하지 않고, 보내지 않으면 샐 일도 없다.
   * 실패해도 조용히 넘어간다. 집계는 내 정산 결과를 보는 데 필요하지 않다.
   */
  async function report(next: Source) {
    const outcome = settle(next.pnlPct, books[0]?.ticks.length ?? 1);
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
      if (json?.ok) setTape(json.tape);
    } catch {
      /* 집계는 부가 정보다. 실패를 손님에게 알릴 이유가 없다 */
    }
  }

  async function settleBySymbol() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? '시세를 가져오지 못했습니다.');
      const next: Source = { kind: 'symbol', symbol: json.symbol, name: json.name, pnlPct: json.changePct };
      remember(next);
      void report(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '시세를 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  function settleByManual() {
    const value = Number(manual);
    if (!Number.isFinite(value)) {
      setError('수익률을 숫자로 입력해 주세요.');
      return;
    }
    setError(null);
    const next: Source = { kind: 'manual', pnlPct: Number(value.toFixed(2)) };
    remember(next);
    void report(next);
  }

  /* 오늘 열린 칸 수 = 1층이 정한 한도. 상품마다 같다 */
  const openTicks = books[0]?.ticks.length ?? 1;
  const result: Settlement | null = source ? settle(source.pnlPct, openTicks) : null;

  return (
    <>
      <MarketTape tape={tape} />

      <section className={styles.desk} data-settled={result !== null} aria-label="오늘 내 정산">
        {result === null ? (
          <>
            <div className={styles.deskHead}>
              <span className="eyebrow">오늘 내 정산</span>
              <h2>오늘 당신의 하루는 어땠습니까</h2>
              <p>
                시장은 오늘 <b>정가 −{Math.round(limitRate * 100)}%</b>까지 열어두었습니다.
                그 안에서 <b>당신의 자리</b>는 오늘 당신의 하루가 정합니다.
              </p>
            </div>

            <div className={styles.tabs} role="group" aria-label="정산 방법">
              <button type="button" aria-pressed={tab === 'symbol'} onClick={() => setTab('symbol')}>
                관심 종목으로
              </button>
              <button type="button" aria-pressed={tab === 'manual'} onClick={() => setTab('manual')}>
                수익률 직접 입력
              </button>
            </div>

            {tab === 'symbol' ? (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>오늘 내 종목</span>
                  <select value={symbol} onChange={event => setSymbol(event.target.value)}>
                    {WATCHLIST.map(item => (
                      <option key={item.symbol} value={item.symbol}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className={styles.submit} onClick={settleBySymbol} disabled={busy}>
                  {busy ? '불러오는 중…' : '정산하기'}
                </button>
                <p className={styles.hint}>
                  계좌를 연결하지 않습니다. 고른 종목의 <b>오늘 등락률</b>만 공개 시세에서 읽습니다.
                </p>
              </div>
            ) : (
              <div className={styles.form}>
                <label className={styles.field}>
                  <span>오늘 내 수익률 (%)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="예: -2.4"
                    value={manual}
                    onChange={event => setManual(event.target.value)}
                  />
                </label>
                <button type="button" className={styles.submit} onClick={settleByManual}>
                  정산하기
                </button>
                <p className={styles.hint}>
                  ±{PNL_CLAMP}%부터는 모두 같은 구간입니다 — 부풀려도 자리가 더 내려가지 않습니다.
                  <br />
                  <b>MTS 수익률 화면 캡처를 읽는 기능은 다음 단계입니다.</b> 지금은 숫자를 직접 받습니다.
                  입력한 수익률은 서버로 보내지 않고 이 브라우저에만 남습니다.
                </p>
              </div>
            )}

            {error && <p className={styles.error} role="alert">{error}</p>}
          </>
        ) : (
          <div className={styles.result} data-side={result.side}>
            <div className={styles.resultHead}>
              <span className="eyebrow">오늘 내 정산</span>
              <strong className={styles.title}>{result.title}</strong>
              <p className={styles.message}>{result.message}</p>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>{source?.kind === 'symbol' ? source.name : '내 수익률'}</dt>
                <dd className={styles.pnl} data-side={result.side}>
                  {signed(source?.pnlPct ?? 0)}
                </dd>
              </div>
              <div>
                <dt>오늘 시장이 연 한도</dt>
                <dd>정가 −{Math.round(limitRate * 100)}%</dd>
              </div>
              <div>
                <dt>그 안에서 내 자리</dt>
                <dd className={styles.seat}>
                  {openTicks - result.seatIndex}칸 중 맨 위
                  <small>−{Math.round((books[0]?.ticks[result.seatIndex]?.depth ?? 0) * 100)}%부터</small>
                </dd>
              </div>
            </dl>

            <p className={styles.resultNote}>
              {result.cappedByMarket
                ? '오늘 시장이 연 폭이 여기까지라 더 내려가지 못했습니다. 크게 움직인 날 다시 오시면 더 깊은 자리가 열립니다.'
                : '아래 칸은 한정 수량입니다. 더 내려갈지는 당신이 정합니다.'}
            </p>

            <button type="button" className={styles.reset} onClick={() => remember(null)}>
              다시 정산하기
            </button>
          </div>
        )}
      </section>

      <section className={styles.boards} aria-label="상품별 호가창">
        {books.map(item => (
          <OrderBook
            key={item.product.productNo}
            book={item}
            open={open}
            seatIndex={result?.seatIndex ?? 0}
            settled={result !== null}
            flavor={result?.side ?? null}
          />
        ))}
      </section>
    </>
  );
}
