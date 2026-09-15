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

export default function AdminConsole({ entries: initial, plan }: Props) {
  const [entries, setEntries] = useState(initial);
  /* 검수 대기가 없으면 빈 화면부터 보게 된다. 그때는 전체를 먼저 펼친다. */
  const [filter, setFilter] = useState<Filter>(
    initial.some(entry => entry.status === 'pending') ? 'pending' : 'all',
  );
  const [approved, setApproved] = useState(false);
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
            {plan.items.map(item => (
              <li key={item.productNo}>
                <span>{item.name}</span>
                <del>{won(item.price)}원</del>
                <b>{won(item.finalPrice)}원</b>
              </li>
            ))}
          </ul>

          <div className={styles.planActions}>
            <button type="button" className={styles.submit} onClick={() => setApproved(previous => !previous)}>
              {approved ? '승인 취소' : '승인하고 게시'}
            </button>
            <span className={styles.state} data-on={approved ? 'published' : 'waiting'}>
              {approved ? '게시됨 · PUBLISHED' : '승인 대기'}
            </span>
            {plan.soldOutCount > 0 && <span className={styles.note}>품절 {plan.soldOutCount}종은 목록에서 제외됨</span>}
          </div>
          <p className={styles.note} style={{ marginTop: 12 }}>
            승인하면 손님 화면에 이 할인이 나갑니다. 자사몰 가격 반영은 아직 수동입니다 —
            카페24 관리자에서 같은 할인율을 설정해야 결제 금액이 맞습니다.
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
