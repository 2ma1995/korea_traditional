'use client';

import { useState } from 'react';
import { PRODUCTS } from '@/data/products';
import type { IpoRound } from '@/lib/ipo';
import styles from './AdminConsole.module.css';

/**
 * 공모 회차 편집 — 막지가 직접 회차를 열고 후보 빵을 넣고 뺀다.
 *
 * 절기 자동 편성을 대신한다. 절기는 "15일마다"라는 주기를 공짜로 줬지만 후보를
 * 제철 재료에서 기계적으로 만들어, 만들 수 없는 빵이 후보에 올랐다.
 * 여기서는 기업이 실제로 만들 수 있는 것만 올린다.
 *
 * 열린 회차가 없으면 손님 화면에 공모 섹션이 아예 안 뜬다 — 빈 회차를 억지로
 * 만들지 않는 것이 규칙이다. 쉬고 싶으면 회차를 안 만들면 된다.
 */

interface Draft {
  id?: string;
  name: string;
  opensOn: string;
  closesOn: string;
  ask: string;
  candidates: { id?: string; name: string; note: string; productNo: number | null; allotment: number }[];
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
};

const emptyDraft = (): Draft => ({
  name: '', opensOn: today(), closesOn: plusDays(14), ask: '',
  candidates: [{ name: '', note: '', productNo: null, allotment: 30 }],
});

const fromRound = (r: IpoRound): Draft => ({
  id: r.id, name: r.name, opensOn: r.opensOn, closesOn: r.closesOn, ask: r.ask,
  candidates: r.candidates.map(c => ({ id: c.id, name: c.name, note: c.note, productNo: c.productNo, allotment: c.allotment })),
});

export default function IpoRounds({ initial, stored }: { initial: IpoRound[]; stored: boolean }) {
  const [rounds, setRounds] = useState(initial);
  const [persisted, setPersisted] = useState(stored);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));
  const patchCandidate = (i: number, p: Partial<Draft['candidates'][number]>) =>
    setDraft(d => ({ ...d, candidates: d.candidates.map((c, n) => (n === i ? { ...c, ...p } : c)) }));

  async function send(init: RequestInit, url = '/api/admin/ipo/rounds') {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(url, init);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setRounds(json.rounds ?? []);
      if (typeof json.stored === 'boolean') setPersisted(json.stored);
      return json;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  const save = async () => {
    const json = await send({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (json) { setMessage(`"${draft.name}" 저장했습니다.`); setDraft(emptyDraft()); }
  };

  const remove = async (id: string, name: string) => {
    const json = await send({ method: 'DELETE' }, `/api/admin/ipo/rounds?id=${encodeURIComponent(id)}`);
    if (json) setMessage(`"${name}" 회차를 닫았습니다. 청약 기록은 그대로 남습니다.`);
  };

  const now = today();
  const state = (r: IpoRound) => (r.opensOn > now ? '예정' : r.closesOn < now ? '지난 회차' : '열림');

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>공모 회차</h2>
        <span className={styles.count}>{rounds.length}개 · 열린 회차만 손님 화면에 보임</span>
      </div>

      <div className={styles.plan}>
        <p className={styles.note}>
          회차 기간과 후보 빵을 직접 정합니다. <b>열린 회차가 없으면 손님 화면에 공모 섹션이 뜨지 않습니다</b> —
          쉬고 싶은 시즌은 회차를 만들지 않으면 됩니다. 후보는 하나 이상 있어야 합니다.
        </p>

        {rounds.length > 0 && (
          <ul className={styles.planItems}>
            {rounds.map(r => (
              <li key={r.id} className={styles.planRow}>
                <span className={styles.rowName}>
                  <b>{r.name}</b>
                  <small>{r.opensOn} ~ {r.closesOn} · {state(r)} · 후보 {r.candidates.length}종</small>
                </span>
                <span className={styles.planActions}>
                  <button type="button" onClick={() => setDraft(fromRound(r))} disabled={busy}>불러와 수정</button>
                  <button type="button" className={styles.rowRemove} onClick={() => remove(r.id, r.name)} disabled={busy}>닫기</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.form}>
          <label className={styles.field}>
            <span>회차 이름</span>
            <input value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="2026 가을 공모" maxLength={40} />
          </label>
          <label className={styles.field}>
            <span>시작일</span>
            <input type="date" value={draft.opensOn} onChange={e => patch({ opensOn: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>마감일</span>
            <input type="date" value={draft.closesOn} onChange={e => patch({ closesOn: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>손님에게 던질 질문</span>
            <input value={draft.ask} onChange={e => patch({ ask: e.target.value })} placeholder="비우면 '다음엔 어떤 빵이 좋을까요?'" maxLength={60} />
          </label>

          <p className={styles.formNote}>후보 빵</p>
          {draft.candidates.map((c, i) => (
            <div key={i} className={styles.cafe24Row}>
              <label className={styles.field}>
                <span>이름</span>
                <input value={c.name} onChange={e => patchCandidate(i, { name: e.target.value })} placeholder="비건 잉글리시 머핀" maxLength={40} />
              </label>
              <label className={styles.field}>
                <span>자사몰 상품</span>
                <select
                  value={c.productNo ?? ''}
                  onChange={e => {
                    const no = e.target.value === '' ? null : Number(e.target.value);
                    const product = PRODUCTS.find(p => p.productNo === no);
                    patchCandidate(i, { productNo: no, name: c.name || product?.name || '' });
                  }}
                >
                  <option value="">신제품 (자사몰에 아직 없음)</option>
                  {PRODUCTS.map(p => <option key={p.productNo} value={p.productNo}>{p.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>근거 한 줄</span>
                <input value={c.note} onChange={e => patchCandidate(i, { note: e.target.value })} placeholder="지난 시즌 품절 1위" maxLength={60} />
              </label>
              <label className={styles.field}>
                <span>배정 수량</span>
                <input type="number" min={1} max={999} value={c.allotment} onChange={e => patchCandidate(i, { allotment: Number(e.target.value) || 1 })} />
              </label>
              <button
                type="button"
                className={styles.rowRemove}
                onClick={() => setDraft(d => ({ ...d, candidates: d.candidates.filter((_, n) => n !== i) }))}
                disabled={draft.candidates.length <= 1}
              >빼기</button>
            </div>
          ))}

          <div className={styles.planActions}>
            <button type="button" onClick={() => setDraft(d => ({ ...d, candidates: [...d.candidates, { name: '', note: '', productNo: null, allotment: 30 }] }))}>
              + 빵 추가
            </button>
            <button type="button" className={styles.submit} onClick={save} disabled={busy}>
              {draft.id ? '이 회차 저장' : '새 회차 만들기'}
            </button>
            {draft.id && <button type="button" onClick={() => setDraft(emptyDraft())} disabled={busy}>새로 만들기로</button>}
          </div>
        </div>

        {!persisted && (
          <p className={styles.note}>
            ⚠️ 저장소에 닿지 못했습니다. 회차가 <b>이번 서버 세션 메모리에만</b> 남고 재시작하면 사라집니다.
            <code>0009_ipo_seasons.sql</code>을 실행하면 영구 저장됩니다.
          </p>
        )}
        {message && <p className={styles.note} role="status">{message}</p>}
      </div>
    </section>
  );
}
