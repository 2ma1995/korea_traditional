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
  items: {
    productNo: number; name: string; price: number; finalPrice: number;
    /** 자사몰 재고 합. 카페24가 재고관리를 안 켠 상품이면 null */
    stock: number | null;
    /** 옵션별 재고와 추가금 — 옵션이 값을 바꾸는 상품은 기본가만 봐서는 안 된다 */
    options: { label: string; quantity: number | null; add: number }[];
    /** 이 빵에 정한 하루 물량 */
    allotment: number;
    /** 자사몰에서 지금 살 수 있는가. 품절이면 목록에 넣지 못한다 */
    sellable: boolean;
  }[];
  /**
   * 오늘 목록에 없는 빵 — '+'로 넣을 수 있는 후보다.
   *
   * 오늘 라인(상승=식사형 / 하락=달달)이 자동으로 고르지만, 기업이 "이건 오늘
   * 빼자"거나 "이것도 넣자"고 할 수 있다. 그때 코드를 고치게 할 수는 없다.
   */
  pool: PlanSummary['items'];
  soldOutCount: number;
}

interface Props {
  plan: PlanSummary;
  /** 따로 정한 적 없는 빵에 쓰는 물량 기본값 */
  allotmentDefault: number;
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

export default function AdminConsole({ plan, links, maxRate, instantDepth, allotmentDefault }: Props) {
  /* 물량은 빵마다 다르다. 1,500원짜리 머핀과 42,000원짜리 케이크에 같은 수를
     풀 이유가 없다. 누르면 그 자리에서 저장한다 — 저장 버튼을 따로 두면
     고쳐놓고 안 누르는 일이 생긴다 */
  const [caps, setCaps] = useState<Record<number, number>>(
    () => Object.fromEntries(plan.items.map(item => [item.productNo, item.allotment])),
  );
  const [savingCap, setSavingCap] = useState<number | null>(null);

  async function saveCap(productNo: number, next: number) {
    const value = Math.min(1000, Math.max(1, next));
    setCaps(prev => ({ ...prev, [productNo]: value }));
    setSavingCap(productNo);
    await fetch('/api/admin/allotment', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productNo, allotment: value }),
    }).catch(() => null);
    setSavingCap(null);
  }

  /* 목록에 있으면 반영 대상이다. 체크는 '지금 고른 것'이고 −로 빼는 데 쓴다.
     예전에는 체크가 곧 반영 여부였는데, 빼려면 체크를 풀어 목록에 남겨두는 수밖에
     없어서 "무엇을 반영하는가"가 한눈에 안 보였다 */
  const [rows, setRows] = useState<PlanRow[]>(() => plan.items.map(item => ({
    productNo: item.productNo,
    name: item.name,
    price: item.price,
    suggested: instantDepth,
    rate: instantDepth,
    selected: false,
  })));
  /* '+'를 눌렀을 때 뜨는 후보 목록 */
  const [adding, setAdding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState('');
  /* 자사몰의 현재 판매가. 반영은 이 값을 기준으로 계산되므로 우리 정가와 다를 수 있다. */
  const [shopPrices, setShopPrices] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState(false);

  /** 10원 단위 절사 — 서버(publish 라우트)와 같은 규칙이어야 금액이 어긋나지 않는다 */
  const finalPrice = (row: PlanRow) => Math.floor((row.price * (1 - row.rate)) / 10) * 10;
  /* 옵션까지 더한 최종가. 자사몰이 기본가와 추가금을 **따로** 깎으므로 여기도 따로
     절사해 더한다 — 합쳐서 한 번에 깎으면 10원씩 어긋난다(lib/priceSync) */
  const unitPrice = (row: PlanRow, add: number) =>
    finalPrice(row) + Math.floor((add * (1 - row.rate)) / 10) * 10;
  const setRow = (productNo: number, patch: Partial<PlanRow>) =>
    setRows(previous => previous.map(row => (row.productNo === productNo ? { ...row, ...patch } : row)));
  /* 목록에 있는 것이 곧 반영 대상이다 */
  const chosen = rows;
  const checked = rows.filter(row => row.selected);
  /* 상품번호로 재고를 찾는다. 오늘 목록과 후보 양쪽을 본다 */
  const catalog = [...plan.items, ...plan.pool];
  const stockOf = (productNo: number) => catalog.find(item => item.productNo === productNo);
  /* 아직 목록에 없는 빵 — '+'로 넣을 수 있다 */
  const addable = plan.pool.filter(item => !rows.some(row => row.productNo === item.productNo));

  const capOf = (productNo: number) => caps[productNo] ?? allotmentDefault;

  const removeChecked = () => setRows(previous => previous.filter(row => !row.selected));
  const addProduct = (productNo: number) => {
    const item = plan.pool.find(entry => entry.productNo === productNo);
    if (!item) return;
    setRows(previous => [...previous, {
      productNo: item.productNo, name: item.name, price: item.price,
      suggested: instantDepth, rate: instantDepth, selected: false,
    }]);
    setCaps(previous => ({ ...previous, [item.productNo]: item.allotment }));
  };

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
          <div className={styles.rateBlock}>
            <span className={styles.rate}>−{Math.round(instantDepth * 100)}%</span>
            {/* 오늘 라인이 자동으로 고르지만, 기업이 "이건 빼자"고 할 수 있다.
                그때마다 코드를 고치게 할 수는 없어 여기서 넣고 뺀다 */}
            <div className={styles.listTools}>
              <button type="button" onClick={() => setAdding(open => !open)}
                disabled={!addable.length} aria-expanded={adding}
                title={addable.length ? '빵 추가' : '더 넣을 빵이 없습니다'}>＋</button>
              <button type="button" onClick={removeChecked} disabled={!checked.length}
                title={checked.length ? `고른 ${checked.length}종 빼기` : '뺄 빵을 체크하세요'}>−</button>
            </div>
          </div>
        </div>

        {adding && (
          <ul className={styles.addList}>
            {addable.map(item => {
              /* 지금 못 파는 빵은 넣지 못한다. 넣어봤자 손님 화면에서 걸러지고,
                 자사몰 판매가만 바뀐 채 아무도 못 산다.
                 막힌 이유를 구분해서 적는다 — "재고를 넣으세요"라고만 하면,
                 재고 240개를 두고 판매중지해 둔 빵 앞에서 관리자가 헤맨다 */
              const outOfStock = item.stock === 0;
              const blocked = outOfStock || !item.sellable;
              return (
                <li key={item.productNo}>
                  <button type="button" disabled={blocked}
                    onClick={() => { addProduct(item.productNo); setAdding(false); }}>
                    <b>{item.name}</b>
                    <small>{won(item.price)}원 · 재고 {item.stock === null ? '관리 안 함' : won(item.stock)}</small>
                    {blocked && (
                      <em className={styles.addBlocked}>
                        {outOfStock ? '카페24에서 재고를 넣어 주세요' : '카페24에서 판매중으로 바꿔 주세요'}
                      </em>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}


        <ul className={styles.planItems}>
          {rows.map(row => {
            const linked = links[row.productNo];
            return (
              <li key={row.productNo} className={styles.planRow} data-off={!row.selected}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  aria-label={`${row.name} 고르기 (− 로 빼기)`}
                  onChange={() => setRow(row.productNo, { selected: !row.selected })}
                />
                <span className={styles.rowName}>
                  {row.name}
                  <small> · 자사몰 #{linked ?? row.productNo}{linked ? '' : ' (제품번호 그대로)'}</small>
                </span>
                {/* 카페24에서 읽어온 값이다. 여기서 바꾸지 않는다 — 재고는 기업이
                    카페24에서 관리하고, 두 곳에서 관리하면 어느 쪽이 맞는지 모르게 된다 */}
                <span className={styles.stock} title={stockOf(row.productNo)?.options.map(o => `${o.label} ${o.quantity ?? '—'}`).join(' · ') || '재고관리 꺼진 상품'}>
                  {(() => {
                    const total = stockOf(row.productNo)?.stock;
                    if (total === null || total === undefined) return '재고 —';
                    /* 재고가 물량보다 적으면 재고가 이긴다 — 없는 빵은 못 판다 */
                    return `재고 ${won(total)}${total < capOf(row.productNo) ? ' ⚠️' : ''}`;
                  })()}
                </span>
                {/* 이 빵의 하루 물량. 숫자를 직접 치는 것이 먼저고 ± 는 한 건씩 미세 조정이다 —
                    5씩만 움직이면 37건 같은 수를 넣을 방법이 없었다.
                    ± 는 누르는 즉시, 직접 친 값은 칸을 벗어날 때 저장한다 */}
                <span className={styles.stepper} data-busy={savingCap === row.productNo}>
                  <span className={styles.stepperLabel}>예약</span>
                  <button type="button" aria-label={`${row.name} 물량 한 건 줄이기`}
                    disabled={capOf(row.productNo) <= 1 || savingCap === row.productNo}
                    onClick={() => saveCap(row.productNo, capOf(row.productNo) - 1)}>−</button>
                  <input type="number" min={1} max={1000} aria-label={`${row.name} 물량(건)`}
                    value={capOf(row.productNo)} disabled={savingCap === row.productNo}
                    onChange={event => setCaps(previous => ({ ...previous, [row.productNo]: Number(event.target.value) || 1 }))}
                    onBlur={event => saveCap(row.productNo, Number(event.target.value) || 1)}
                    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                  <span className={styles.stepperLabel}>건</span>
                  <button type="button" aria-label={`${row.name} 물량 한 건 늘리기`}
                    disabled={capOf(row.productNo) >= 1000 || savingCap === row.productNo}
                    onClick={() => saveCap(row.productNo, capOf(row.productNo) + 1)}>+</button>
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
                {/* 옵션이 값을 바꾸는 상품은 기본가만 봐서는 손님이 얼마를 내는지 모른다.
                    추가금도 같은 비율로 깎이므로(lib/priceSync.discountVariants)
                    어느 옵션을 골라도 할인율은 같다 — 그걸 눈으로 확인하는 자리다 */}
                {(() => {
                  const opts = stockOf(row.productNo)?.options ?? [];
                  if (!opts.length) return null;
                  return (
                    <small className={styles.optionPrices}>
                      {opts.map(o => (
                        <span key={o.label}>
                          {o.label}
                          {o.add > 0 && <> <b>{won(unitPrice(row, o.add))}원</b></>}
                          {o.quantity !== null && <> · 재고 {won(o.quantity)}</>}
                        </span>
                      ))}
                    </small>
                  );
                })()}
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
          <b>예약 n건</b>은 그 빵을 하루에 몇 <b>건</b>까지 할인가로 예약받을지입니다 —
          빵 개수가 아닙니다. 한 건은 손님이 옵션 하나를 고르는 단위라, 30건을 열어두고
          모두가 &lsquo;5개&rsquo;를 고르면 빵은 150개가 나갑니다.
          <b>옵션별 상한은 카페24 재고</b>가 맡습니다 — 줄 아래 옵션마다 적힌 수가 그것이고,
          둘 중 작은 쪽이 실제 한도입니다.
          <br />
          기본값은 코스피가 채웁니다. 재고나 기업 요청으로 빼거나 낮출 수 있고, 상한{' '}
          {Math.round(maxRate * 100)}%(기업 확인값)는 넘지 못합니다.
          할인은 <b>자사몰의 현재 판매가</b>를 기준으로 계산되며, 바꾸기 전 가격은 기록에 남습니다.
        </p>
      </div>
    </section>
  );
}
