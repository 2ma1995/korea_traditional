'use client';

import { useState } from 'react';
import styles from './AdminConsole.module.css';

/**
 * 주말 배당 정책.
 *
 * 넣는 값은 셋이고, 1인 주간 최대 배당은 앞의 둘에서 계산해서 보여준다.
 *
 *   1인 주간 최대 = 평균 객단가 × 목표 할인율
 *
 * 최대 배당을 직접 넣게 하지 않는 이유 — 그건 결과값이다. 손으로 넣으면 근거 없는
 * 숫자가 박히고, 객단가가 바뀌어도 따라가지 않는다. 평일 할인 구간(TierSettings)이
 * 코스피에서 자동으로 나오는 것과 같은 생각이다.
 *
 * 객단가는 기업만 아는 값이다(카페24 주문 이력). fills에 visitor가 붙으면 실측값을
 * 옆에 띄우고 '적용'으로 갈아끼우게 만들 자리다.
 */

interface Props {
  initial: { aov: number; rate: number; budget: number; weeklyMax: number; tiers: [number, number, number]; stored: boolean };
  /** 코드가 막는 상한. 관리자가 이 위로는 못 올린다 */
  maxRate: number;
}

const won = (n: number) => n.toLocaleString('ko-KR');

export default function DividendSettings({ initial, maxRate }: Props) {
  const [aov, setAov] = useState(String(initial.aov));
  const [rate, setRate] = useState(String(Math.round(initial.rate * 1000) / 10));
  const [budget, setBudget] = useState(String(initial.budget));
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  /* 저장 전에도 입력값으로 미리 계산해 보여준다 — 숫자를 바꾸는 순간 결과가 보여야
     "이 설정이면 얼마 나가는가"를 판단할 수 있다 */
  const previewMax = Math.round((Number(aov) * (Number(rate) / 100)) / 100) * 100;
  const valid = Number.isFinite(previewMax) && previewMax > 0;
  const step = (ratio: number) => Math.round((previewMax * ratio) / 100) * 100;

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/dividend', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aov: Number(aov), rate: Number(rate) / 100, budget: Number(budget) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setSaved(json);
      setMessage(json.stored ? '저장했습니다.' : '저장했지만 DB에 닿지 못했습니다 — 서버를 재시작하면 기본값으로 돌아갑니다.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>주말 배당</h2>
        <span className={styles.count}>1인 주간 최대 {won(saved.weeklyMax)}P</span>
      </div>

      <div className={styles.plan}>
        <p className={styles.note}>
          휴장일(주말)에 상품은 <b>정가로 팝니다.</b> 대신 평일 활동에 따라 배당을 지급하고,
          배당은 주말에만 쓸 수 있습니다. 평일 코스피 할인과 겹치지 않게 하려는 구조입니다.
        </p>

        <div className={styles.fields}>
          <label>
            <span>평균 객단가</span>
            <input type="number" inputMode="numeric" min={0} step={1000} value={aov}
              onChange={event => setAov(event.target.value)} aria-label="평균 객단가(원)" />
            <small>주문 한 건의 평균 결제액. 카페24 주문 통계에서 확인합니다</small>
          </label>

          <label>
            <span>목표 할인율</span>
            <input type="number" inputMode="decimal" min={0.1} max={maxRate * 100} step={0.5} value={rate}
              onChange={event => setRate(event.target.value)} aria-label="목표 할인율(%)" />
            <small>배당으로 돌려줄 비율. 상한 {Math.round(maxRate * 100)}%를 넘길 수 없습니다</small>
          </label>

          <label>
            <span>주간 예산</span>
            <input type="number" inputMode="numeric" min={0} step={10000} value={budget}
              onChange={event => setBudget(event.target.value)} aria-label="주간 예산 상한(원)" />
            <small>한 주에 나갈 배당 총액의 한도</small>
          </label>
        </div>

        <ul className={styles.planItems}>
          <li><span>1인 주간 최대 배당</span><b>{valid ? `${won(previewMax)}P` : '—'}</b></li>
          {/* 비율은 lib/appSettings.loadDividendPolicy와 같아야 한다 — 여기 미리보기와
              실제 지급액이 다르면 관리자가 잘못된 숫자를 보고 정책을 정한다 */}
          <li><span>1점 · 활동 하나</span><b>{valid ? `${won(step(0.375))}P` : '—'}</b></li>
          <li><span>2점 · 활동 둘</span><b>{valid ? `${won(step(0.625))}P` : '—'}</b></li>
          <li><span>3점 · 관심 + 구매 + 출석</span><b>{valid ? `${won(previewMax)}P` : '—'}</b></li>
        </ul>

        <div className={styles.planActions}>
          <button type="button" onClick={save} disabled={busy || !valid}>
            {busy ? '저장 중…' : '저장'}
          </button>
          <span className={styles.state} data-on={saved.stored ? 'published' : undefined}>
            {saved.stored ? 'DB 저장됨' : '메모리에만 있음'}
          </span>
          {message && <span className={styles.note}>{message}</span>}
        </div>

        <p className={styles.note}>
          점수는 <b>관심빵 담기 · Bread Market 구매 · 거래일 3일 이상 출석</b> 셋을 각각 주 1회만 셉니다.
          같은 행동을 반복해도 점수가 쌓이지 않습니다.
          <br />
          배당은 <b>매주 토요일</b> 지급하고 <b>매월 말일 23:59</b>에 소멸합니다. 한 번 결제에 쓸 수 있는 금액은
          그 결제액의 {Math.round(maxRate * 100)}%까지입니다 — 목표 할인율을 올려도 이 한도는 코드가 막습니다.
          <br />
          객단가는 지금 손으로 넣는 값입니다. 구매 기록에 방문자 표식이 붙으면 실측값으로 바꿉니다.
        </p>
      </div>
    </section>
  );
}
