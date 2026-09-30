'use client';

import { useRef, useState } from 'react';
import { priceAt } from '@/lib/offers';
import { SHOP_BASE } from '@/lib/shop';
import styles from './AdminConsole.module.css';

/**
 * 관리자 콘솔 — 자사몰 가격 반영.
 *
 * 기본 상품과 할인율은 빵장의 buildToday 결과를 쓴다.
 * 수동 조정은 자사몰 반영에만 사용하며 빵장의 자동 진열을 변경하지 않는다.
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
    productNo: number; name: string; price: number; finalPrice: number; rate: number;
    /** 자사몰 재고 합. 카페24가 재고관리를 안 켠 상품이면 null */
    stock: number | null;
    /** 옵션별 재고·추가금·자리 수 — 옵션이 값을 바꾸는 상품은 기본가만 봐서는 안 된다 */
    options: {
      code: string; label: string; quantity: number | null; add: number;
      /** 이 옵션에만 따로 정해둔 자리 수. 없으면 빵 값을 쓴다 */
      allotment?: number;
    }[];
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

export default function AdminConsole({ plan, links, maxRate, allotmentDefault }: Props) {
  /* 물량은 빵마다 다르다. 1,500원짜리 머핀과 42,000원짜리 케이크에 같은 수를
     풀 이유가 없다. 누르면 그 자리에서 저장한다 — 저장 버튼을 따로 두면
     고쳐놓고 안 누르는 일이 생긴다 */
  /* 열쇠는 "32"(빵 전체) 또는 "32:품목코드"(그 옵션만)다. 옵션마다 숫자를 넣게만
     하면 여덟 개짜리 상품에서 아무도 안 고친다 — 빵에 한 번 넣으면 전 옵션에 걸리고,
     다르게 줄 옵션만 따로 적는다 */
  const [caps, setCaps] = useState<Record<string, number>>(() => ({
    ...Object.fromEntries([...plan.items, ...plan.pool].map(item => [String(item.productNo), item.allotment])),
    ...Object.fromEntries(
      [...plan.items, ...plan.pool].flatMap(item => item.options
        .filter(o => o.allotment !== undefined)
        .map(o => [`${item.productNo}:${o.code}`, o.allotment as number])),
    ),
  }));
  const savedCaps = useRef(caps);
  const [capMessage, setCapMessage] = useState('');
  const [savingCap, setSavingCap] = useState<string | null>(null);

  /* max — 그 빵(옵션)의 카페24 재고. 재고보다 많이 열어도 재고가 이기므로(lib/offers.unitsFor)
     처음부터 재고까지만 받는다. 모르면(재고관리 꺼짐) 1000 */
  async function saveCap(productNo: number, next: number, unit?: string, max = 1000) {
    const key = unit ? `${productNo}:${unit}` : String(productNo);
    const value = Math.min(max, 1000, Math.max(1, Math.round(next)));
    setCaps(prev => ({ ...prev, [key]: value }));
    setSavingCap(key);
    setCapMessage('');
    try {
      const response = await fetch('/api/admin/allotment', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo, allotment: value, unit }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '물량 저장에 실패했습니다.');
      savedCaps.current = { ...savedCaps.current, [key]: value };
      setCapMessage('물량을 저장했습니다. 빵장을 새로 열면 적용됩니다.');
    } catch (cause) {
      setCaps(prev => {
        const restored = { ...prev };
        if (savedCaps.current[key] === undefined) delete restored[key];
        else restored[key] = savedCaps.current[key];
        return restored;
      });
      setCapMessage(cause instanceof Error ? cause.message : '물량 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSavingCap(null);
    }
  }

  /* 목록에 있으면 반영 대상이다. 체크는 '지금 고른 것'이고 −로 빼는 데 쓴다.
     예전에는 체크가 곧 반영 여부였는데, 빼려면 체크를 풀어 목록에 남겨두는 수밖에
     없어서 "무엇을 반영하는가"가 한눈에 안 보였다 */
  const [rows, setRows] = useState<PlanRow[]>(() => plan.items.map(item => ({
    productNo: item.productNo,
    name: item.name,
    price: item.price,
    suggested: item.rate,
    rate: item.rate,
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
  const finalPrice = (row: PlanRow) => priceAt(row.price, row.rate).price;
  /* 옵션까지 더한 최종가. 자사몰이 기본가와 추가금을 **따로** 깎으므로 여기도 따로
     절사해 더한다 — 합쳐서 한 번에 깎으면 10원씩 어긋난다(lib/priceSync) */
  const unitPrice = (row: PlanRow, add: number) =>
    finalPrice(row) + priceAt(add, row.rate).price;
  const setRow = (productNo: number, patch: Partial<PlanRow>) =>
    setRows(previous => previous.map(row => (row.productNo === productNo ? { ...row, ...patch } : row)));
  /* 목록에 있는 것이 곧 반영 대상이다 */
  const chosen = rows;
  const checked = rows.filter(row => row.selected);
  /* 상품번호로 재고를 찾는다. 오늘 목록과 후보 양쪽을 본다 */
  const catalog = [...plan.items, ...plan.pool];
  const stockOf = (productNo: number) => catalog.find(item => item.productNo === productNo);
  /* 아직 목록에 없는 빵 — '+'로 넣을 수 있다 */
  const addable = catalog.filter(item => !rows.some(row => row.productNo === item.productNo));

  /* 옵션값 → 빵값 → 기본값 (lib/appSettings.allotmentFor와 같은 순서여야 한다) */
  const capOf = (productNo: number, unit?: string) =>
    (unit ? caps[`${productNo}:${unit}`] : undefined) ?? caps[String(productNo)] ?? allotmentDefault;

  /* 화면에 보이는 값 = 실제로 걸리는 값. 예전에 재고보다 크게 저장해 둔 값은 재고로 눌러 보여준다 */
  const limitOf = (quantity: number | null | undefined) => (quantity === null || quantity === undefined ? 1000 : quantity);
  const shopHost = (() => { try { return new URL(SHOP_BASE).host; } catch { return SHOP_BASE; } })();

  /* 예약 한도 칸 — 숫자를 직접 치는 게 먼저고 ± 는 한 건씩 미세 조정이다.
     ± 는 누르는 즉시, 직접 친 값은 칸을 벗어날 때 저장한다. 재고를 넘는 숫자는 칠 수 없다 */
  const capStepper = (productNo: number, name: string, max: number, unit?: string) => {
    const key = unit ? `${productNo}:${unit}` : String(productNo);
    if (max <= 0) return <span className={styles.soldOut}>재고 없음</span>;
    const saved = capOf(productNo, unit);
    const value = Math.min(saved, max);
    return (
      <span className={styles.capCell}>
        <span className={styles.stepper} data-busy={savingCap === key}>
          <button type="button" aria-label={`${name} 예약 한도 한 건 줄이기`}
            disabled={value <= 1 || savingCap !== null}
            onClick={() => saveCap(productNo, value - 1, unit, max)}>−</button>
          <input type="number" min={1} max={max} aria-label={`${name} 예약 한도(건)`}
            value={value} disabled={savingCap !== null}
            onChange={event => setCaps(previous => ({ ...previous, [key]: Math.min(max, Number(event.target.value) || 1) }))}
            onBlur={event => saveCap(productNo, Number(event.target.value) || 1, unit, max)}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          <span className={styles.stepperLabel}>건</span>
          <button type="button" aria-label={`${name} 예약 한도 한 건 늘리기`}
            disabled={value >= max || savingCap !== null}
            onClick={() => saveCap(productNo, value + 1, unit, max)}>+</button>
        </span>
        {saved > max && <small className={styles.capNote}>재고에 맞춰 {won(max)}건</small>}
      </span>
    );
  };

  const removeChecked = () => setRows(previous => previous.filter(row => !row.selected));
  const addProduct = (productNo: number) => {
    const item = catalog.find(entry => entry.productNo === productNo);
    if (!item) return;
    setRows(previous => [...previous, {
      productNo: item.productNo, name: item.name, price: item.price,
      suggested: item.rate, rate: item.rate, selected: false,
    }]);
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
        <b>자사몰에 반영</b>을 누르면 <b>{shopHost}</b> 판매가가 바로 바뀝니다.
        평일 15:30에는 자동으로 반영되니, 여기서는 손으로 다시 걸 때만 쓰고 누르기 전에 <b>자사몰 현재가 확인</b>으로 금액을 보세요.
      </p>

      <div className={styles.head}>
        <h2>오늘 자사몰에 반영할 가격</h2>
        <span className={styles.count}>
          {plan.date} · 오늘 기본 할인 {Math.round(plan.rate * 100)}%
        </span>
      </div>

      <div className={styles.plan}>
        <div className={styles.planTop}>
          <div>
            <strong>{plan.headline}</strong>
            <p className={styles.reason}>{plan.reason}</p>
          </div>
          <div className={styles.rateBlock}>
            <small>오늘 기본 할인</small>
            <span className={styles.rate}>{Math.round(plan.rate * 100)}%</span>
          </div>
        </div>

        {/* 오늘 라인이 자동으로 고르지만, 기업이 "이건 빼자"고 할 수 있다.
            그때마다 코드를 고치게 할 수는 없어 여기서 넣고 뺀다 */}
        <div className={styles.toolbar}>
          <button type="button" className={styles.toolButton} onClick={() => setAdding(open => !open)}
            disabled={!addable.length} aria-expanded={adding}>＋ 빵 추가</button>
          <button type="button" className={styles.toolButton} onClick={removeChecked} disabled={!checked.length}>
            선택한 빵 빼기{checked.length ? ` (${checked.length})` : ''}
          </button>
          <small>체크한 빵만 목록에서 빠집니다 · 빵장 손님 화면은 그대로예요</small>
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


        {capMessage && <p className={styles.note} role="status">{capMessage}</p>}
        <ul className={styles.planGrid}>
          <li className={styles.gridHead} aria-hidden="true">
            <span /><span>빵</span><span>자사몰 재고</span><span>하루 예약 한도</span><span>정가 → 할인가</span><span>할인율</span>
          </li>
          {rows.map(row => {
            const linked = links[row.productNo];
            const item = stockOf(row.productNo);
            const opts = item?.options ?? [];
            /* 옵션이 있으면 옵션마다 따로 연다 — 옵션마다 재고가 달라서 한 숫자로 걸면 재고를 넘는다 */
            const optionSum = opts.reduce((sum, o) => sum + Math.max(0, Math.min(capOf(row.productNo, o.code), limitOf(o.quantity))), 0);
            return (
              <li key={row.productNo} className={styles.planBlock}>
                <div className={styles.gridRow}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    aria-label={`${row.name} 고르기 (선택한 빵 빼기)`}
                    onChange={() => setRow(row.productNo, { selected: !row.selected })}
                  />
                  <span className={styles.rowName}>
                    {row.name}
                    <small>자사몰 #{linked ?? row.productNo}</small>
                  </span>
                  {/* 카페24에서 읽어온 값이다. 여기서 바꾸지 않는다 — 재고는 기업이 카페24에서 관리한다 */}
                  <span className={styles.cell} data-label="자사몰 재고">
                    {item?.stock === null || item?.stock === undefined ? '관리 안 함' : `${won(item.stock)}개`}
                  </span>
                  <span className={styles.cell} data-label="하루 예약 한도">
                    {opts.length
                      ? <small className={styles.optSum}>옵션별 ↓ · 합계 {won(optionSum)}건</small>
                      : capStepper(row.productNo, row.name, limitOf(item?.stock))}
                  </span>
                  <span className={`${styles.cell} ${styles.priceCell}`} data-label="정가 → 할인가">
                    <del>{won(row.price)}원</del> <b>{won(finalPrice(row))}원</b>
                  </span>
                  <span className={`${styles.cell} ${styles.rateBox}`} data-label="할인율">
                    <input
                      value={Math.round(row.rate * 100)}
                      inputMode="numeric"
                      aria-label={`${row.name} 할인율`}
                      onChange={event => setRow(row.productNo, {
                        rate: Math.min(Math.max(Number(event.target.value) || 0, 0), maxRate * 100) / 100,
                      })}
                    />%
                    {row.rate !== row.suggested && <small className={styles.adjusted}>제안 {Math.round(row.suggested * 100)}%</small>}
                  </span>
                </div>
                {/* 옵션마다 재고·예약 한도·최종가. 추가금도 같은 비율로 깎인다(lib/priceSync) */}
                {opts.map(o => (
                  <div key={o.code} className={`${styles.gridRow} ${styles.optRow}`}>
                    <span />
                    <span className={styles.optName}>└ {o.label}</span>
                    <span className={styles.cell} data-label="재고">{o.quantity === null ? '관리 안 함' : `${won(o.quantity)}개`}</span>
                    <span className={styles.cell} data-label="예약 한도">{capStepper(row.productNo, `${row.name} ${o.label}`, limitOf(o.quantity), o.code)}</span>
                    <span className={`${styles.cell} ${styles.priceCell}`} data-label="할인가">
                      <b>{won(unitPrice(row, o.add))}원</b>{o.add > 0 && <small> (추가 {won(o.add)}원 포함)</small>}
                    </span>
                    <span />
                  </div>
                ))}
                {shopPrices[row.productNo] && (
                  <small className={styles.shopPrice}>
                    {shopPrices[row.productNo].startsWith('오류')
                      ? shopPrices[row.productNo]
                      : `자사몰 지금 ${won(Number(shopPrices[row.productNo]))}원 → 반영하면 ${won(priceAt(Number(shopPrices[row.productNo]), row.rate).price)}원`}
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

        <ul className={styles.notes}>
          <li>목록과 할인율은 <b>빵장의 오늘 할인</b>에서 가져옵니다. 여기서 바꾼 값은 <b>자사몰에 반영</b>을 누를 때만 쓰입니다.</li>
          <li><b>하루 예약 한도</b>는 빵장에서 할인가로 예약받는 건수입니다(옵션 하나 = 1건). <b>카페24 재고를 넘길 수 없고</b>, 바꾸면 바로 저장됩니다.</li>
          <li>할인율 상한은 {Math.round(maxRate * 100)}%(기업 확인값)입니다. 할인은 자사몰의 현재 판매가를 기준으로 걸리고, 바꾸기 전 가격은 기록에 남습니다.</li>
        </ul>
      </div>
    </section>
  );
}
