'use client';

import ProductPhoto from '@/components/ProductPhoto';
import type { OfferUnit, TodayOffer } from '@/lib/offers';
import type { Bid } from '@/components/OfferSheet';
import { byProduct, keyOf, usePortfolio, type HoldingEntry } from '@/lib/portfolioStore';
import { SEATS_PER_OPTION } from '@/lib/orderbook';
import styles from './Market.module.css';

interface Props {
  offers: TodayOffer[];
  /** 담아둔 빵·옵션 — 옵션마다 한 줄 */
  entries: HoldingEntry[];
  /** 오늘 예약 — "번호:품목코드" 키. 옵션마다 한 자리다(0019) */
  bids: Record<string, Bid>;
  /** 이 옵션의 오늘 남은 자리(옵션이 없으면 빵 전체) */
  left: (offer: TodayOffer, unit: string | null) => number;
  /** 지금 예약할 수 있는가 — 휴장일·개장 전에는 할인이 보여도 못 잡는다 */
  canBuy: boolean;
  closedNote: string;
  onPick: (productNo: number, unit: string | null) => void;
  /** 옵션 없이 담아둔 옛 관심을 옵션으로 옮긴다 */
  onMove: (from: string, to: string) => void;
  onBuyAll: (items: { offer: TodayOffer; unit: string | null; count: number }[]) => void;
  bulk: { busy: boolean; done: number; missed: number; error?: string } | null;
}

type Tone = 'booked' | 'sale' | 'wait' | 'end' | 'out' | 'plain' | 'pick';
interface Row {
  entry: HoldingEntry;
  offer: TodayOffer | undefined;
  unit: OfferUnit | undefined;
  name: string;
  price: number;
  tone: Tone;
  status: string;
  /** 한 번에 예약하기로 오늘 더 잡을 개수 — 담은 개수에서 이미 잡은 만큼 뺀다. 0이면 대상 아님 */
  need: number;
}

const won = (n: number) => n.toLocaleString('ko-KR');
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/* 물량이 이만큼 아래로 내려오면 '남음 n'을 같이 말한다 — 다 나가기 전에 알아야 잡는다 */
const lowFor = (allotment: number) => Math.max(3, Math.ceil(allotment * 0.2));

/**
 * 내 관심 빵 — 담아둔 빵·옵션을 오늘 상태와 함께 보여주고, 한 번에 예약한다.
 *
 * 줄마다 오늘 무슨 일이 있는지 하나만 말한다. 우선순위는 손님이 해야 할 일 순서다.
 *   예약함      결제 기한 안에 자사몰에서 결제해야 한다
 *   품절        자사몰에 재고가 없다(옵션 단위)
 *   오늘 물량 끝  할인 자리가 다 나갔다 — 정가로는 살 수 있다
 *   오늘 n% 할인  지금 잡을 수 있다. 자리가 얼마 안 남았으면 '남음 n'
 *   개장 대기     할인은 정해졌지만 아직(또는 오늘은) 예약을 받지 않는다
 *   정가         오늘 할인 대상이 아니다
 *
 * 결제까지 묶어주지는 못한다. 자사몰 장바구니는 손님 브라우저 세션에 붙어 있고,
 * 로그인이 없는 우리 서비스는 그 세션을 모른다 — 체험몰에서 담기를 쏴봤지만
 * isLogin:F로 거절당했다(2026-09-23). 그래서 "예약은 한 번에, 결제는 빵마다"다.
 *
 * − n + 는 **살 개수**다(한 옵션 최대 SEATS_PER_OPTION). 한 번에 예약하기는 그 개수만큼
 * 자리를 잡고(0020), 버튼의 개수·금액도 바로 따라간다. 이미 잡은 만큼은 빼고 모자란 만큼만 더 잡는다.
 * 비중(%)과 도넛은 이 개수로 계산한다.
 */
export default function Portfolio({ offers, entries, bids, left, canBuy, closedNote, onPick, onMove, onBuyAll, bulk }: Props) {
  const { setQty } = usePortfolio();

  const rows: Row[] = entries.map(entry => {
    const offer = offers.find(o => o.product.productNo === entry.no);
    const unit = offer?.units.find(u => u.code === entry.unit);
    const base = offer?.product.name ?? `상품 #${entry.no}`;
    const name = unit ? `${base} · ${unit.label}` : base;
    const price = unit?.price ?? offer?.price ?? 0;
    const listPrice = unit?.listPrice ?? offer?.product.price ?? 0;
    const bid = bids[entry.key];
    const row = (tone: Tone, status: string, need = 0): Row => ({ entry, offer, unit, name, price, tone, status, need });
    const held = bid?.status === 'filled' ? bid.count ?? 1 : 0;
    const want = Math.min(entry.qty, SEATS_PER_OPTION);
    /* 지금 더 잡을 수 있는 상태인가 — 할인 중이고, 장이 열렸고, 팔고 있고, 자리가 남았다 */
    const open = Boolean(offer && offer.saved > 0 && canBuy && offer.product.inStock && (!unit || unit.sellable) && left(offer, entry.unit) > 0);

    if (held > 0) {
      const pay = bid!.settled === 'paid' ? '결제 확인됨' : bid!.expiresAt ? `${hhmm(bid!.expiresAt)}까지 결제` : '결제 이어가기';
      if (want > held && open && bid!.settled !== 'paid') return row('booked', `예약 ${held}개 · ${want - held}개 더 잡을 수 있어요 · ${pay}`, want - held);
      return row('booked', `예약 ${held}개 · ${pay}`);
    }
    if (!offer) return row('out', '판매 정보를 찾지 못했어요');
    /* 옵션이 있는 빵을 옛날에 옵션 없이 담았다 — 무엇을 원하는지 먼저 골라야 한다 */
    if (offer.units.length > 0 && !entry.unit) return row('pick', '옵션을 골라 담아 주세요');
    if (entry.unit && !unit) return row('out', '자사몰에서 내려간 옵션이에요');
    if (!offer.product.inStock || (unit && !unit.sellable)) return row('out', '품절');
    if (offer.saved <= 0) return row('plain', '오늘 할인 대상 아님 · 정가');

    const pct = listPrice > 0 ? Math.round((1 - price / listPrice) * 100) : 0;
    const remaining = left(offer, entry.unit);
    if (remaining <= 0) return row('end', `오늘 물량 끝 · 정가 ${won(listPrice)}원`);
    if (!canBuy) return row('wait', `오늘 ${pct}% · ${closedNote}`);
    const allotment = unit?.allotment ?? offer.allotment;
    const low = remaining <= lowFor(allotment) ? ` · 남음 ${remaining}` : '';
    return row('sale', `오늘 ${pct}% 할인 · ${won(price)}원${want > 1 ? ` × ${want}` : ''}${low}`, want);
  });

  const breads = byProduct(entries);
  const total = entries.reduce((sum, e) => sum + e.qty, 0);
  const shareOf = (qty: number) => (total ? Math.round((qty / total) * 100) : 0);
  /* 비중 1위는 빵 단위 — 옵션 셋을 담은 휘낭시에는 셋을 합친 비중이다. 같으면 최근에 담은 쪽 */
  const top = [...breads].sort((a, b) => b.qty - a.qty || b.at - a.at)[0];
  const topOffer = top && offers.find(o => o.product.productNo === top.no);

  const count = (tone: Tone) => rows.filter(r => r.tone === tone).length;
  const summary = ([
    ['sale', '오늘 할인'], ['wait', '할인 예정'], ['booked', '예약함'], ['end', '물량 끝'], ['out', '품절'],
  ] as [Tone, string][]).map(([tone, label]) => ({ tone, label, n: count(tone) })).filter(s => s.n > 0);

  const bookable = rows.filter(r => r.need > 0);
  /* 버튼은 개수와 금액을 담은 수 그대로 말한다 — 모닝롤 3개면 3개, 그 값의 세 배 */
  const bookableCount = bookable.reduce((sum, r) => sum + r.need, 0);
  const bookableTotal = bookable.reduce((sum, r) => sum + r.price * r.need, 0);
  const reserved = rows.find(r => r.tone === 'booked');
  const next = reserved ?? rows.find(r => r.tone === 'sale' || r.tone === 'wait') ?? rows[0];

  if (!rows.length) return <p className={styles.empty}>관심빵을 담으면 여기에서 예약과 결제를 이어갈 수 있어요.</p>;

  return <>
    <div className={styles.topPick}>
      <span className="eyebrow">내 관심빵 {breads.length}종{rows.length > breads.length ? ` · 옵션 ${rows.length}개` : ''}</span>
      {summary.length > 0 && (
        <p className={styles.pfSummary} aria-label="오늘 내 관심빵 상태">
          {summary.map(s => <span key={s.tone} className={styles.pfTag} data-tone={s.tone}>{s.label} {s.n}</span>)}
        </p>
      )}
      {top && breads.length > 1 && (
        <p className={styles.topSub}>비중 1위 {topOffer?.product.name ?? `상품 #${top.no}`} · {shareOf(top.qty)}%{topOffer && topOffer.saved > 0 ? ` · 오늘 ${won(topOffer.price)}원부터` : ''}</p>
      )}
    </div>
    <ul className={styles.pfList}>
      {rows.map(row => {
        const { entry, offer } = row;
        return <li key={entry.key} className={styles.pfRow}>
          <span className={styles.thumb}><ProductPhoto productNo={entry.no} name={row.name} /></span>
          <span className={styles.pfName}>
            <button type="button" className={styles.pfNameBtn} onClick={() => onPick(entry.no, entry.unit)}><b>{row.name}</b></button>
            <span className={styles.pfTag} data-tone={row.tone}>{row.status}</span>
            {rows.length > 1 && (
              <span className={styles.pfShare} aria-label={`관심 비중 ${shareOf(entry.qty)}%`}>
                <i style={{ width: `${shareOf(entry.qty)}%` }} />
                <b>{shareOf(entry.qty)}%</b>
              </span>
            )}
          </span>
          <span className={styles.pfCtl}>
            {/* 옵션 없이 담아둔 옛 관심 — 옵션을 고르면 그 옵션으로 옮긴다 */}
            {row.tone === 'pick' && offer && (
              <select className={styles.pfUnit} value="" aria-label={`${row.name} 옵션 고르기`}
                onChange={event => event.target.value && onMove(entry.key, keyOf(entry.no, event.target.value))}>
                <option value="" disabled>옵션 고르기</option>
                {offer.units.map(u => (
                  <option key={u.code} value={u.code}>{u.label}{u.sellable ? ` · ${won(u.price)}원` : ' · 품절'}</option>
                ))}
              </select>
            )}
            <button type="button" className={styles.link} onClick={() => onPick(entry.no, entry.unit)}
              aria-label={`${row.name} ${row.tone === 'booked' ? '결제 안내' : '자세히'}`}>
              {row.tone === 'booked' ? '결제 안내' : '자세히'}
            </button>
            {/* 살 개수 — 한 번에 예약하기가 이만큼 잡는다. 1에서 −를 누르면 관심 해제 */}
            <small className={styles.pfQtyLabel} aria-hidden="true">개수</small>
            <button type="button" onClick={() => setQty(entry.key, entry.qty - 1)} aria-label={entry.qty > 1 ? `${row.name} 한 개 줄이기` : `${row.name} 관심 해제`}>−</button>
            <b aria-label={`${row.name} 개수`}>{entry.qty}</b>
            <button type="button" disabled={entry.qty >= SEATS_PER_OPTION} onClick={() => setQty(entry.key, entry.qty + 1)}
              aria-label={entry.qty >= SEATS_PER_OPTION ? `${row.name} 최대 ${SEATS_PER_OPTION}개` : `${row.name} 한 개 늘리기`}>+</button>
          </span>
        </li>;
      })}
    </ul>
    <div className={styles.buyAll}>
      {bookable.length > 0 ? (
        <button type="button" className={styles.primary} disabled={bulk?.busy}
          onClick={() => onBuyAll(bookable.map(r => ({ offer: r.offer!, unit: r.entry.unit, count: Math.min(r.entry.qty, SEATS_PER_OPTION) })))}>
          {bulk?.busy ? '예약 중…' : `할인 중인 ${bookableCount}개 한 번에 예약 · ${won(bookableTotal)}원`}
        </button>
      ) : next && (
        <button type="button" className={styles.primary} onClick={() => onPick(next.entry.no, next.entry.unit)}>
          {reserved ? '예약한 빵 결제 이어가기' : '관심빵 자세히 보기'}
        </button>
      )}
      {bulk && !bulk.busy && (bulk.done > 0 || bulk.missed > 0) && (
        <p className={styles.buyAllNote}>
          {bulk.done > 0 && <><b>{bulk.done}가지 예약됐습니다.</b> 빵을 눌러 결제 안내를 확인하세요. </>}
          {/* 실패 이유를 서버가 말한 그대로 쓴다. 예전에는 무엇이 막았든
              "물량이 끝났습니다"라고만 해서, 장이 닫힌 것도 품절로 보였다 */}
          {bulk.missed > 0 && <>{bulk.missed}가지는 예약하지 못했습니다 — {bulk.error ?? '오늘 물량이 끝났습니다.'}</>}
          {bulk.missed === 0 && bulk.error && <>{bulk.error}</>}
        </p>
      )}
      <p className={styles.buyAllNote}>
        담은 <b>개수만큼</b> 예약해요(한 옵션 최대 {SEATS_PER_OPTION}개). 예약은 한 번에 되지만
        <b>결제는 빵마다 막지몰에서</b> 하셔야 합니다 — 자사몰에서 같은 옵션·개수로 담아 주세요.
      </p>
    </div>
    <p className={styles.hint}>관심 목록은 이 브라우저에 저장됩니다. 알림은 아래 알림 설정에서 별도로 켜 주세요.</p>
  </>;
}
