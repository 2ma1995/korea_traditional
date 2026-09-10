import type { ContestEntry } from '@/data/contest';
import { PRODUCTS } from '@/data/products';

/**
 * 빵 카테고리별 순위.
 *
 * 카테고리는 막지 제품 하나(productNo)다. 각 카테고리에서 좋아요가 많은 순으로
 * 1~3위를 세우고, 화면에서는 왼쪽이 1위가 된다.
 *
 * 관리자가 승인(approved)한 출품만 순위에 들어간다. 멘션으로 수집된 pending 게시물은
 * 관리자 페이지에서 확인하기 전까지 노출되지 않는다.
 */

/** 카테고리마다 보여줄 순위 자리 수 (1~3위) */
export const RANK_SLOTS = 3;

export interface RankedCategory {
  productNo: number;
  /** 제품명. products.ts에 없는 번호면 '기타'로 떨어진다 */
  name: string;
  /** 게시물 좋아요 많은 순 상위 RANK_SLOTS개. 왼쪽이 1위 */
  ranked: ContestEntry[];
  /** 이 카테고리에 승인된 출품 총 수 (3위 밖도 포함) */
  total: number;
}

/**
 * 게시물 좋아요 수. 작성자가 좋아요 수를 숨긴 게시물은 API가 값을 주지 않으므로
 * 0으로 두고 순위 맨 뒤로 보낸다 (카드에는 '비공개'로 표시한다).
 */
export const likesOf = (entry: ContestEntry) => entry.instagram.likeCount ?? 0;

/**
 * 승인된 출품을 카테고리별로 묶어 좋아요 순으로 세운다.
 *
 * 카테고리 순서도 1위의 좋아요 수를 따른다 — 섹션 표기가 "좋아요순"이므로
 * 카테고리 사이에서도 같은 기준이어야 한다.
 */
export function rankByCategory(entries: ContestEntry[]): RankedCategory[] {
  const byProduct = new Map<number, ContestEntry[]>();
  for (const entry of entries) {
    if (entry.status !== 'approved') continue;
    const list = byProduct.get(entry.productNo);
    if (list) list.push(entry);
    else byProduct.set(entry.productNo, [entry]);
  }

  return [...byProduct.entries()]
    .map(([productNo, list]) => {
      const sorted = [...list].sort((a, b) => likesOf(b) - likesOf(a));
      return {
        productNo,
        name: PRODUCTS.find(product => product.productNo === productNo)?.name ?? '기타',
        ranked: sorted.slice(0, RANK_SLOTS),
        total: sorted.length,
      };
    })
    .sort((a, b) => likesOf(b.ranked[0]) - likesOf(a.ranked[0]));
}

/** 승인된 출품 수 — 섹션 머리말 표기용 */
export const approvedCount = (entries: ContestEntry[]) =>
  entries.filter(entry => entry.status === 'approved').length;
