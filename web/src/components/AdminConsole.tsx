'use client';

import { useState } from 'react';
import styles from './AdminConsole.module.css';

/**
 * 관리자 콘솔 — 자사몰 가격 반영.
 *
 * 빵장에서 자사몰 판매가로 나가는 값은 **즉시구매 칸의 가격**이다.
 * 그 아래 한정 호가는 체결을 거쳐야 하므로(구현 전) 자사몰 판매가와 무관하다.
 * 그래서 기본값은 오늘 열린 최저호가가 아니라 즉시구매 폭이다.
 *
 * 코스피가 기본값을 채우고 관리자는 예외를 준다 — 재고가 없거나 기업이 원치 않는
 * 제품을 빼는 일은 실제 운영에서 반드시 생긴다. 다만 전부 손으로 정하는 화면이
 * 되면 코스피 연동이 장식이 되므로, 조정한 값 옆에 제안값을 남겨 둔다.
 */

export interface PlanSummary {
  date: string;
  headline: string;
  reason: string;
  /** 오늘 열린 최저호가 폭. 참고 표시용이다 */
  rate: number;
  items: { productNo: number; name: string; price: number; finalPrice: number }[];
  soldOutCount: number;
}

interface Props {
  plan: PlanSummary;
  /** 우리 제품번호 → 자사몰 상품번호. 없으면 productNo를 그대로 쓴다 */
  links: Record<number, number>;
  maxRate: number;
  /** 즉시구매 칸의 할인 폭. 자사몰에 반영하는 기본값 */
  instantDepth: number;
}

interface PlanRow {
  productNo: number;
  name: string;
  price: number;
  suggested: number;
  rate: number;
  selected: boolean;
}

const won = (value: number) => value.toLocaleString('ko-KR');

export default function AdminConsole({ plan, links, maxRate, instantDepth }: Props) {
  const [rows, setRows] = useState<PlanRow[]>(() => plan.items.map(item => ({
    productNo: item.productNo,
    name: item.name,
    price: item.price,
    suggested: instantDepth,
    rate: instantDepth,
    selected: true,
  })));
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState('');
  /* 자사몰의 현재 판매가. 반영은 이 값을 기준으로 계산되므로 우리 정가와 다를 수 있다. */
  const [shopPrices, setShopPrices] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(false);

  /** 10원 단위 절사 — 서버(publish 라우트)와 같은 규칙이어야 금액이 어긋나지 않는다 */
  const finalPrice = (row: PlanRow) => Math.floor((row.price * (1 - row.rate)) / 10) * 10;
  const setRow = (productNo: number, patch: Partial<PlanRow>) =>
    setRows(previous => previous.map(row => (row.productNo === productNo ? { ...row, ...patch } : row)));
  const chosen = rows.filter(row => row.selected);

  /** 자사몰의 현재 판매가를 불러온다. 반영 전에 "무엇이 얼마로 바뀌는지"를 눈으로 보기 위한 것. */
  const checkShopPrices = async () => {
    setChecking(true);
    const found: Record<number, string> = {};
    for (const row of chosen) {
      const target = links[row.productNo] ?? row.productNo;
      try {
        const response = await fetch(`/api/admin/cafe24/product?no=${target}`);
        const data = await response.json().catch(() => ({}));
        found[row.productNo] = response.ok ? data.price : `오류: ${data.error ?? response.status}`;
      } catch {
        found[row.productNo] = '오류: 서버에 닿지 못함';
      }
    }
    setShopPrices(previous => ({ ...previous, ...found }));
    setChecking(false);
  };

  const publish = async () => {
    setPublishing(true);
    setPublished('');
    try {
      const response = await fetch('/api/admin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chosen.map(row => ({ productNo: row.productNo, rate: row.rate })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setPublished(data.error ?? `반영 실패 (${response.status})`); return; }

      const lines: string[] = [];
      for (const item of data.applied ?? []) {
        lines.push(`반영됨 — ${item.name}: ${won(Number(item.originalPrice))}원 → ${won(Number(item.newPrice))}원`);
      }
      for (const item of data.skipped ?? []) {
        lines.push(`건너뜀 — ${item.name ?? item.productNo}: ${item.reason}`);
      }
      if (data.warning) lines.push(data.warning);
      setPublished(lines.join('\n') || '반영할 것이 없었습니다.');
    } catch (cause) {
      setPublished(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className={styles.section}>
      <p className={styles.warn}>
        아래 <b>자사몰에 반영</b>은 실제로 makji.kr 판매가를 바꿉니다.
        누르기 전에 <b>자사몰 현재가 확인</b>으로 실제 금액을 보세요.
      </p>

      <div className={styles.head}>
        <h2>오늘 자사몰에 반영할 가격</h2>
        <span className={styles.count}>
          {plan.date} · 오늘 열린 최저호가 −{Math.round(plan.rate * 100)}%
        </span>
      </div>

      <div className={styles.plan}>
        <div className={styles.planTop}>
          <div>
            <strong>{plan.headline}</strong>
            <p className={styles.reason}>{plan.reason}</p>
          </div>
          <span className={styles.rate}>−{Math.round(instantDepth * 100)}%</span>
        </div>

        <ul className={styles.planItems}>
          {rows.map(row => {
            const linked = links[row.productNo];
            return (
              <li key={row.productNo} className={styles.planRow} data-off={!row.selected}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  aria-label={`${row.name} 포함`}
                  onChange={() => setRow(row.productNo, { selected: !row.selected })}
                />
                <span className={styles.rowName}>
                  {row.name}
                  <small> · 자사몰 #{linked ?? row.productNo}{linked ? '' : ' (제품번호 그대로)'}</small>
                </span>
                <del>{won(row.price)}원</del>
                <b>{won(finalPrice(row))}원</b>
                <span className={styles.rateBox}>
                  <input
                    value={Math.round(row.rate * 100)}
                    inputMode="numeric"
                    aria-label={`${row.name} 할인율`}
                    onChange={event => setRow(row.productNo, {
                      rate: Math.min(Math.max(Number(event.target.value) || 0, 0), maxRate * 100) / 100,
                    })}
                  />%
                </span>
                {row.rate !== row.suggested && (
                  <small className={styles.adjusted}>제안 {Math.round(row.suggested * 100)}%</small>
                )}
                {shopPrices[row.productNo] && (
                  <small className={styles.shopPrice}>
                    {shopPrices[row.productNo].startsWith('오류')
                      ? shopPrices[row.productNo]
                      : `자사몰 ${won(Number(shopPrices[row.productNo]))}원 → ${won(Math.floor(Number(shopPrices[row.productNo]) * (1 - row.rate) / 10) * 10)}원`}
                  </small>
                )}
              </li>
            );
          })}
        </ul>

        <div className={styles.planActions}>
          <button type="button" className={styles.outline} onClick={checkShopPrices} disabled={checking || !chosen.length}>
            {checking ? '확인 중…' : '자사몰 현재가 확인'}
          </button>
          <button type="button" className={styles.submit} onClick={publish} disabled={publishing || !chosen.length}>
            {publishing ? '반영 중…' : `자사몰에 반영 (${chosen.length}종)`}
          </button>
          {plan.soldOutCount > 0 && <span className={styles.note}>품절 {plan.soldOutCount}종은 목록에서 제외됨</span>}
        </div>

        {published && <p className={styles.note} style={{ marginTop: 12, whiteSpace: 'pre-line' }}>{published}</p>}

        <p className={styles.note} style={{ marginTop: 12 }}>
          자사몰로 나가는 값은 <b>즉시구매 칸의 가격</b>입니다. 그 아래 한정 호가는 체결을 거쳐야 하므로
          자사몰 판매가와 무관합니다 (체결 처리는 구현 전).
          <br />
          기본값은 코스피가 채웁니다. 재고나 기업 요청으로 빼거나 낮출 수 있고, 상한{' '}
          {Math.round(maxRate * 100)}%(기업 확인값)는 넘지 못합니다.
          할인은 <b>자사몰의 현재 판매가</b>를 기준으로 계산되며, 바꾸기 전 가격은 기록에 남습니다.
        </p>
      </div>
    </section>
  );
}
