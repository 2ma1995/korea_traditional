'use client';

import { useMemo, useState } from 'react';
import type { ContestEntry, EntryStatus } from '@/data/contest';
import { PRODUCTS } from '@/data/products';
import styles from './AdminConsole.module.css';

/**
 * 관리자 콘솔 — 출품 검수와 할인안 승인.
 *
 * 저장소(Supabase)를 붙이기 전 단계라 모든 변경이 이 화면의 상태로만 남는다.
 * 새로고침하면 초기값으로 돌아간다 — 화면 위에 그 사실을 밝혀둔다.
 * 저장을 붙일 때 바꿀 곳은 judge()·addManual() 두 함수뿐이다.
 */

export interface PlanSummary {
  date: string;
  headline: string;
  reason: string;
  rate: number;
  items: { productNo: number; name: string; price: number; finalPrice: number }[];
  soldOutCount: number;
}

interface Props {
  entries: ContestEntry[];
  plan: PlanSummary;
  /** 우리 제품번호 → 자사몰 상품번호. 연결되지 않은 제품은 반영할 수 없다 */
  links: Record<number, number>;
  maxRate: number;
}

/** 오늘 반영할 한 줄. 코스피가 채운 값을 관리자가 조정한다 */
interface PlanRow {
  productNo: number;
  name: string;
  price: number;
  /** 코스피가 제안한 할인율. 조정해도 이 값은 남겨 기록에 쓴다 */
  suggested: number;
  rate: number;
  selected: boolean;
}

type Filter = EntryStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: '검수 대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '반려' },
  { key: 'all', label: '전체' },
];

const won = (value: number) => value.toLocaleString('ko-KR');

/** 좋아요 동기화 시각 — 하루 1회 동기화라 날짜와 시각을 함께 읽혀야 한다. */
const syncedAt = (iso: string) => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${at.getMonth() + 1}.${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

const productName = (productNo: number) =>
  PRODUCTS.find(product => product.productNo === productNo)?.name ?? '기타';

/** 인스타그램 게시물 주소에서 코드를 뽑는다. 수동 등록분의 임시 mediaId로 쓴다. */
const shortcodeOf = (url: string) => url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1] ?? '';

export default function AdminConsole({ entries: initial, plan, links, maxRate }: Props) {
  const [entries, setEntries] = useState(initial);
  /* 검수 대기가 없으면 빈 화면부터 보게 된다. 그때는 전체를 먼저 펼친다. */
  const [filter, setFilter] = useState<Filter>(
    initial.some(entry => entry.status === 'pending') ? 'pending' : 'all',
  );
  /* 코스피가 채운 기본값으로 시작한다. 관리자는 여기서 빼거나 낮춘다 —
     전부 손으로 정하는 화면이 되면 코스피 연동이 장식이 된다. */
  const [rows, setRows] = useState<PlanRow[]>(() => plan.items.map(item => ({
    productNo: item.productNo,
    name: item.name,
    price: item.price,
    suggested: plan.rate,
    rate: plan.rate,
    selected: true,
  })));
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [productNo, setProductNo] = useState(PRODUCTS[0]?.productNo ?? 0);

  const counts = useMemo(() => ({
    pending: entries.filter(entry => entry.status === 'pending').length,
    approved: entries.filter(entry => entry.status === 'approved').length,
    rejected: entries.filter(entry => entry.status === 'rejected').length,
    all: entries.length,
  }), [entries]);

  const shown = filter === 'all' ? entries : entries.filter(entry => entry.status === filter);

  /** 10원 단위 절사 — 서버(publish 라우트)와 같은 규칙이어야 금액이 어긋나지 않는다 */
  const finalPrice = (row: PlanRow) => Math.floor((row.price * (1 - row.rate)) / 10) * 10;
  const setRow = (productNo: number, patch: Partial<PlanRow>) =>
    setRows(previous => previous.map(row => (row.productNo === productNo ? { ...row, ...patch } : row)));
  const chosen = rows.filter(row => row.selected);

  /** 고른 제품을 자사몰에 반영한다. 연결되지 않은 제품은 서버가 건너뛰고 이유를 돌려준다. */
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

  /** 체크/엑스. 같은 버튼을 다시 누르면 검수 대기로 되돌린다 — 잘못 누른 것을 취소할 길이 필요하다. */
  const judge = (id: string, next: Exclude<EntryStatus, 'pending'>) => {
    setEntries(previous => previous.map(entry =>
      entry.id === id ? { ...entry, status: entry.status === next ? 'pending' : next } : entry,
    ));
  };

  /**
   * 게시물 주소 수동 등록.
   *
   * 멘션 웹훅은 놓친 알림을 되찾을 수 없다. 관리자가 휴대폰에서 본 게시물을
   * 직접 넣는 경로를 항상 열어둬야 대회 운영이 멈추지 않는다.
   */
  const canAdd = shortcodeOf(url) !== '' && title.trim() !== '';
  const addManual = () => {
    if (!canAdd) return;
    const code = shortcodeOf(url);
    setEntries(previous => [{
      id: `manual-${code}`,
      title: title.trim(),
      productNo,
      toppings: [],
      emoji: '🖐',
      instagram: {
        mediaId: `manual:${code}`,
        permalink: url.trim(),
        username: '확인 필요',
        likeCount: null,
        likeCountAt: new Date().toISOString(),
      },
      note: '관리자 수동 등록',
      status: 'pending',
      sourceTag: '수동 등록',
    }, ...previous]);
    setUrl('');
    setTitle('');
    setFilter('pending');
  };

  return (
    <>
      <p className={styles.warn}>
        <b>검수·승인 결과는 아직 저장되지 않습니다.</b> 이 브라우저에만 남고 새로고침하면 초기화됩니다.
        아래 <b>카페24 연결 시험</b>은 실제로 체험몰 판매가를 바꿉니다.
      </p>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>오늘의 할인안 승인</h2>
          <span className={styles.count}>{plan.date} · 코스피 기준 자동 생성</span>
        </div>

        <div className={styles.plan}>
          <div className={styles.planTop}>
            <div>
              <strong>{plan.headline}</strong>
              <p className={styles.reason}>{plan.reason}</p>
            </div>
            <span className={styles.rate}>{Math.round(plan.rate * 100)}%</span>
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
                    {linked
                      ? <small> · 자사몰 #{linked}</small>
                      : <small className={styles.unlinked}> · 연결 안 됨</small>}
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
                </li>
              );
            })}
          </ul>

          <div className={styles.planActions}>
            <button type="button" className={styles.submit} onClick={publish} disabled={publishing || !chosen.length}>
              {publishing ? '반영 중…' : `자사몰에 반영 (${chosen.length}종)`}
            </button>
            {plan.soldOutCount > 0 && <span className={styles.note}>품절 {plan.soldOutCount}종은 목록에서 제외됨</span>}
          </div>
          {published && <p className={styles.note} style={{ marginTop: 12, whiteSpace: 'pre-line' }}>{published}</p>}
          <p className={styles.note} style={{ marginTop: 12 }}>
            할인율은 코스피가 채운 값입니다. 재고나 기업 요청으로 빼거나 낮출 수 있고,
            상한 {Math.round(maxRate * 100)}%(기업 확인값)는 넘지 못합니다.
            반영하면 자사몰 판매가가 실제로 바뀌며, 바꾸기 전 가격은 기록에 남습니다.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>출품 검수</h2>
          <div className={styles.tabs}>
            {FILTERS.map(({ key, label }) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label} {counts[key]}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0
          ? <p className={styles.empty}>이 상태의 출품이 없습니다.</p>
          : <ul className={styles.list}>
            {shown.map(entry => (
              <li key={entry.id} className={styles.entry} data-status={entry.status}>
                <span className={styles.thumb} aria-hidden="true">{entry.emoji}</span>
                <div className={styles.body}>
                  <div className={styles.title}>{entry.title}</div>
                  <p className={styles.meta}>
                    <b>{productName(entry.productNo)}</b> · @{entry.instagram.username} · {entry.sourceTag}
                    <br />
                    <span className={styles.likes}>
                      좋아요 {entry.instagram.likeCount ?? '비공개'}
                    </span>
                    {' '}· {syncedAt(entry.instagram.likeCountAt)} 기준 ·{' '}
                    <a className={styles.postLink} href={entry.instagram.permalink} target="_blank" rel="noopener noreferrer">
                      게시물 열기
                    </a>
                  </p>
                </div>
                <div className={styles.judge}>
                  <button
                    type="button"
                    data-kind="ok"
                    aria-pressed={entry.status === 'approved'}
                    aria-label={`${entry.title} 승인`}
                    onClick={() => judge(entry.id, 'approved')}
                  >✓</button>
                  <button
                    type="button"
                    data-kind="no"
                    aria-pressed={entry.status === 'rejected'}
                    aria-label={`${entry.title} 반려`}
                    onClick={() => judge(entry.id, 'rejected')}
                  >✕</button>
                </div>
              </li>
            ))}
          </ul>}
      </section>

      <section className={styles.section}>
        <div className={styles.head}>
          <h2>게시물 수동 등록</h2>
          <span className={styles.count}>멘션 알림을 놓쳤을 때</span>
        </div>

        <div className={styles.form}>
          <label className={styles.field}>
            <span>게시물 주소</span>
            <input
              type="url"
              value={url}
              onChange={event => setUrl(event.target.value)}
              placeholder="https://www.instagram.com/p/..."
            />
          </label>
          <label className={styles.field}>
            <span>레시피 제목</span>
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder="포도 생지 타르트" />
          </label>
          <label className={styles.field}>
            <span>빵 카테고리</span>
            <select value={productNo} onChange={event => setProductNo(Number(event.target.value))}>
              {PRODUCTS.map(product => (
                <option key={product.productNo} value={product.productNo}>{product.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.submit} onClick={addManual} disabled={!canAdd}>
            검수 대기로 추가
          </button>
        </div>
        <p className={styles.formNote}>
          작성자와 좋아요 수는 Graph API로 채웁니다. 수동 등록분은 <b>확인 필요</b>로 들어가고,
          연동 후 게시물 주소로 조회해 채웁니다.
        </p>
      </section>
    </>
  );
}
