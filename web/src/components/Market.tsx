'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Donut, { type Slice } from '@/components/Donut';
import Flip from '@/components/Flip';
import InfoTab from '@/components/InfoTab';
import IpoTab, { type IpoView } from '@/components/IpoTab';
import KospiLive, { DRAW_MS, type Phase } from '@/components/KospiLive';
import type { KospiView } from '@/components/KospiQuote';
import OfferSheet, { type Bid } from '@/components/OfferSheet';
import Portfolio from '@/components/Portfolio';
import PushToggle from '@/components/PushToggle';
import ProductPhoto from '@/components/ProductPhoto';
import type { DiscountTier } from '@/data/indicators';
import type { IpoRound } from '@/lib/ipo';
import type { WeeklyScore } from '@/lib/dividend';
import type { WeekReport } from '@/lib/fills';
import { badgesFor, DAILY_ALLOTMENT, moodFor, priceAt, rateFor, unitsFor, type TodayMarket, type TodayOffer } from '@/lib/offers';
import { withSkuBonus } from '@/lib/skuAdjust';
import { OPEN_AT } from '@/lib/orderbook';
import { qtyOf, sortHoldings, usePortfolio, useStableHoldings } from '@/lib/portfolioStore';
import { useKospiLive, type Point } from '@/lib/useKospiLive';
import styles from './Market.module.css';
import DividendLink from '@/components/DividendLink';

/**
 * 빵장 — 스크롤하며 답하는 질문 넷.
 *
 *   MARKET   지금 시장은 어떻게 움직이지?     KOSPI LIVE 히어로
 *   TODAY    그래서 오늘 뭐가 싸지?           할인 TOP 3 카드 → 시트
 *   MY       그중 내가 좋아하는 것도 싸지?    도넛 포트폴리오 + 적중 카드
 *   (NEXT · BREAD IPO는 화면에서 뺐다. 코드는 IpoTab·lib/ipo에 남아 있다)
 *
 * KOSPI의 상태 변화가 아래로 전파된다. 장중엔 방향이 뒤집히면 "지금 마감한다면"
 * 라인·TOP 3 가격·적중 카드가 같이 바뀌고, 마감하면 CLOSED로, 20시 전엔 🔒로.
 */

interface Props {
  today: TodayMarket;
  points: Point[];
  kospi: KospiView;
  tiers: DiscountTier[];
  /** 이번 공모 회차 — 서버가 오늘 날짜와 품절 목록으로 정한다 */
  /** 지금 열린 회차. 관리자가 만든 회차가 없으면 null이다 */
  round: IpoRound | null;
  ipo: IpoView;
  /** 공모주를 화면에 띄울지. 관리자가 껐거나 회차가 없으면 NEXT 섹션이 통째로 사라진다 */
  ipoOn: boolean;
  /** 휴장일에만 온다. 이번 주 빵장 결산 — 평일엔 null */
  week: WeekReport | null;
  /** 휴장일에만 온다. 내 주간 활동점수와 이번 주 배당 */
  score: WeeklyScore | null;
  /** 배당 지급 방식 · 연결한 자사몰 아이디 · 배당금 잔액. 휴장일이 아니거나 꺼져 있으면 null */
  wallet: { mode: 'wallet' | 'mileage'; member: string | null; balance: number; coupon: { amount: number; until: string } | null } | null;
}

type Sort = 'popular' | 'watched' | 'all';
const MEDAL = ['🥇', '🥈', '🥉'];
const EMOJI: Record<number, string> = { 29: '🍰', 33: '🥖', 19: '🍮', 23: '🍰', 31: '🍞', 32: '🥐', 28: '🧁', 25: '🥐', 27: '🥪', 30: '🧁' };
const won = (n: number) => n.toLocaleString('ko-KR');
const key = (no: number, rate: number) => `${no}:${rate.toFixed(3)}`;

/**
 * 정가에서 오늘 가격으로 굴러 내려오는 숫자.
 * "BREAD MARKET OPEN 카운트다운처럼 가격도 바뀌는 게 보이면 좋겠다" — 카드가 뜬 뒤
 * 0.9초 동안 10원 단위로 내려온다. 폭이 실시간으로 바뀌면(장중) 다시 굴러간다.
 */
const ROLL_EVERY_MS = 10_000;
function RollingPrice({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { const t0 = window.setTimeout(() => setV(to), 0); return () => clearTimeout(t0); }
    let raf = 0;
    /* 한 번 굴리고 끝내지 않는다 — 카운트다운처럼 10초마다 정가에서 다시 내려온다 */
    const roll = () => {
      const start = performance.now();
      const step = (now: number) => {
        const kk = Math.min(1, (now - start) / 900);
        setV(Math.round((from + (to - from) * (1 - Math.pow(1 - kk, 3))) / 10) * 10);
        if (kk < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const t = window.setTimeout(roll, delay);
    const loop = window.setInterval(roll, ROLL_EVERY_MS);
    return () => { clearTimeout(t); clearInterval(loop); cancelAnimationFrame(raf); };
  }, [from, to, delay]);
  return <Flip value={won(v)} />;
}

export default function Market({ today, points, kospi, tiers, round, ipo: initialIpo, ipoOn, week, score, wallet }: Props) {
  const k = useKospiLive({ value: kospi.value, changePct: kospi.changePct, marketOpen: kospi.marketOpen, live: kospi.live, points });
  const [filled, setFilled] = useState<Record<string, number>>({});
  const [bids, setBids] = useState<Record<number, Bid>>({});
  const [reservationError, setReservationError] = useState('');
  /* 일괄 예약 진행·결과 */
  const [bulk, setBulk] = useState<{ busy: boolean; done: number; missed: number; error?: string } | null>(null);
  /* 상품번호 → 고른 자사몰 품목코드 */
  const [units, setUnits] = useState<Record<number, string>>({});
  /* 처음에는 전체를 보여준다 — 라인을 켜면서 오늘 진열이 4~6종으로 줄었는데,
     들어오자마자 그것만 보이면 막지에 빵이 그것뿐인 것처럼 읽힌다 */
  const [sort, setSort] = useState<Sort>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const closeSheet = useCallback(() => setSelected(null), []);
  const openFromList = (no: number) => setSelected(no);
  const openFromPortfolio = openFromList;
  const pending = useRef(new Set<number>());
  const [pfOpen, setPfOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { portfolio, setQty } = usePortfolio();
  const [ipo, setIpo] = useState(initialIpo);

  /* ── KOSPI 상태 → 아래로 전파 ── */
  const liveOn = k.marketOpen === true;
  const mood = moodFor(k.changePct);
  const live = rateFor(k.changePct, tiers);                         // 장중엔 '지금 기준 예상'
  const rate = live.rate;
  const test = today.hours.reason === 'test';
  const phase: Phase = liveOn ? 'live' : today.hours.open ? 'open' : today.hours.reason === 'before' ? 'locked' : 'closed';
  const canBuy = today.hours.open && (phase !== 'live' || test);
  const lockNote = today.hours.reason === 'holiday' ? '다음 거래일에 열려요' : phase === 'live' ? `${OPEN_AT} 확정과 함께 열려요` : phase === 'locked' ? `🔒 ${OPEN_AT} 공개` : phase === 'closed' ? `다음 거래일 ${OPEN_AT}에 열려요` : '휴장';
  const openAt = OPEN_AT;
  /* 휴장일 — 주말·공휴일이다. 가격이 움직이지 않으니 화면이 할 말이 달라진다 */
  const holiday = today.hours.reason === 'holiday';
  /* 휴장일엔 오늘 종가가 없다 — 히어로는 직전 거래일 종가를 기준으로 말한다 */
  const closed = holiday
    ? { closedFor: today.hours.closedFor ?? '휴장', nextOpen: today.hours.nextOpen ?? '다음 거래일', at: kospi.updatedAt ?? null }
    : null;

  /* 표시 가격은 실시간 폭으로. 실제 예약은 서버 확정 폭(today.rate)으로 간다 */
  /* 장중 '지금 기준 예상'도 빵마다 갈린다 — 서버가 계산한 SKU 보정을 실시간 폭 위에 얹는다.
     o.rate(서버 확정 폭)는 그대로 둔다. 예약과 잔량 조회가 그 값을 키로 쓴다 */
  const offers: TodayOffer[] = today.offers.map(o => ({
    ...o,
    ...priceAt(o.product.price, withSkuBonus(rate, o.demandBonus, o.inventoryBonus)),
    units: o.units.map(u => ({ ...u, price: priceAt(o.product.price, withSkuBonus(rate, o.demandBonus, o.inventoryBonus)).price
      + priceAt(u.listPrice - o.product.price, withSkuBonus(rate, o.demandBonus, o.inventoryBonus)).price })),
  }));

  const base = points.length < 2 ? 0 : DRAW_MS + 150;
  const reveal = (step: number) => ({ ['--d' as string]: `${base + step * 90}ms` });
  /* 카드에 붙는 시간 값은 전부 상품마다 고정한다. 정렬 순서로 주면 인기순↔관심순을
     오갈 때 값이 바뀌면서 셋이 한꺼번에 다시 튄다.
       --d  .reveal의 기본값이 opacity:0이라 끝난 애니메이션이 '시작 전'으로 돌아가 깜빡인다
       --ph 사진 kenburns는 무한 alternate라 지연이 바뀌면 확대 상태가 순간 점프한다
       delay RollingPrice의 effect가 다시 돌아 가격이 정가부터 다시 굴러 내려온다
     서버가 준 순서(today.offers)를 쓰면 처음 등장할 때의 촤라락은 그대로 남는다. */
  const stepOf = new Map(today.all.map((p, idx) => [p.productNo, idx]));

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/fill', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error('예약 조회 실패');
        if (alive) {
          setReservationError('');
          if (json.filled) setFilled(json.filled);
          if (Array.isArray(json.reservations)) setBids(previous => {
            const next = { ...previous };
            for (const bid of json.reservations as (Bid & { productNo: number })[]) {
              if (!pending.current.has(bid.productNo) && (next[bid.productNo]?.status !== 'filled' || bid.settled === 'paid')) {
                next[bid.productNo] = bid;
              }
            }
            return next;
          });
        }
      } catch {
        if (alive) setReservationError('예약 내역을 불러오지 못했어요. 잠시 뒤 자동으로 다시 확인합니다.');
      }
    };
    void pull();
    const timer = setInterval(pull, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, [today.hours.open]);

  const filledOf = (o: TodayOffer) => filled[key(o.product.productNo, o.rate)] ?? o.filled;
  const remainingOf = (o: TodayOffer) => Math.max(0, o.allotment - filledOf(o));

  /**
   * 한 종을 예약한다. 실패하면 **이유까지** 돌려준다.
   *
   * 예전에는 catch가 오류를 통째로 삼키고 전부 '미체결'로 표시했다. 그래서 장이
   * 닫혀 있어도, 폭이 어긋나도, 품절이어도 화면은 똑같이 "오늘 물량이 끝났습니다"
   * 라고 말했다 — 손님에게 거짓말이고, 우리도 원인을 못 봤다.
   * lib/fills.ts가 "저장소 없음"을 "품절"이라고 말하던 것과 같은 실수다.
   */
  async function buy(offer: TodayOffer): Promise<{ ok: boolean; error?: string }> {
    const no = offer.product.productNo;
    if (bids[no]?.status === 'filled') { setSelected(no); return { ok: true }; }
    if (pending.current.has(no)) return { ok: false };
    pending.current.add(no);
    setBids(prev => ({ ...prev, [no]: { status: 'busy', slot: null } }));
    try {
      /* 자사몰 재고는 품목 단위로 관리된다 — 어느 옵션을 잡았는지 같이 보내야
         "5개"를 예약해놓고 "1개" 재고를 깎는 일이 안 생긴다(lib/inventory) */
      const res = await fetch('/api/fill', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo: no, depth: offer.rate, unit: unitOf(offer) }) });
      const json = await res.json();
      if (!json?.ok) {
        const error = String(json?.error ?? '예약에 실패했습니다.');
        setBids(prev => ({ ...prev, [no]: { status: 'missed', slot: null, error } }));
        return { ok: false, error };
      }
      setBids(prev => ({ ...prev, [no]: { status: json.filled ? 'filled' : 'missed', slot: json.slot ?? null, stored: json.stored, coupon: json.coupon ?? null, expiresAt: json.expiresAt ?? null, delivery: json.delivery, unit: json.unit ?? unitOf(offer), depth: json.depth ?? offer.rate, settled: json.settled } }));
      if (typeof json.quantity === 'number' && typeof json.remaining === 'number') {
        setFilled(prev => ({ ...prev, [key(no, offer.rate)]: json.quantity - json.remaining }));
      }
      /* 구매가 체결되면 서버가 공모 청약권을 발급한다(lib/bidRight).
         아직 오늘 청약하지 않았다면 NEXT의 버튼이 지금 열린다 */
      if (json.filled) setIpo(prev => (prev.bidFor ? prev : { ...prev, canBid: true }));
      /* filled=false는 진짜 물량이 끝난 경우다 — 서버가 ok로 답했으니 */
      return { ok: Boolean(json.filled) };
    } catch {
      const error = '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      setBids(prev => ({ ...prev, [no]: { status: 'missed', slot: null, error } }));
      return { ok: false, error };
    } finally {
      pending.current.delete(no);
    }
  }

  /**
   * 관심빵을 한 번에 예약한다.
   *
   * 결제까지 묶어주지는 못한다 — 자사몰 장바구니는 손님 브라우저 세션에 붙어 있고,
   * 로그인이 없는 우리 서비스는 그 세션을 모른다(2026-09-23 체험몰에서 확인:
   * /exec/front/order/basket/ 은 isLogin:F로 거절한다). 그래도 자리를 먼저 잡아두는
   * 값어치가 있다 — 옵션을 고르며 시간을 쓰는 사이 물량이 나가면 안 된다.
   *
   * 하나가 막혀도 멈추지 않는다. 품절은 빵마다 따로 오는 일이라, 첫 실패에서 멈추면
   * 뒤의 멀쩡한 빵까지 못 잡는다.
   */
  async function buyAll(list: TodayOffer[]) {
    setBulk({ busy: true, done: 0, missed: 0 });
    let done = 0, missed = 0, error: string | undefined;
    for (const offer of list) {
      const result = await buy(offer);
      if (result.ok) { done += 1; continue; }
      missed += 1;
      /* 첫 실패 이유만 남긴다 — 여러 개가 같은 이유로 막히는 게 보통이다 */
      error ??= result.error;
    }
    setBulk({ busy: false, done, missed, error });
  }

  /**
   * 상품마다 고른 자사몰 옵션. 안 골랐으면 첫 판매중 옵션이다 —
   * 선택을 강요하지 않되, 예약이 엉뚱한 품목으로 가지 않게 기본값을 정해 둔다.
   */
  function unitOf(offer: TodayOffer): string | null {
    const booked = bids[offer.product.productNo];
    if (booked?.status === 'filled') return booked.unit ?? null;
    const picked = units[offer.product.productNo];
    if (picked && offer.units.some(u => u.code === picked && u.sellable)) return picked;
    return offer.units.find(u => u.sellable)?.code ?? null;
  }

  /* '전체'는 오늘 라인 밖·품절까지 막지의 모든 빵을 보여준다. 라인이 뜻을 만들지만,
     "다른 빵도 있나?"라는 질문에 답할 곳이 없으면 진열이 좁아 보인다.
     오늘 진열에 없는 빵은 정가 그대로고, 카드가 라인 밖·품절임을 밝힌다 */
  const shelf: TodayOffer[] = today.all.map(product => {
    const live = offers.find(o => o.product.productNo === product.productNo);
    if (live) return live;
    return {
      product, onLine: false, rate: 0, demandBonus: 0, inventoryBonus: 0,
      price: product.price, saved: 0, allotment: DAILY_ALLOTMENT, filled: 0, badges: badgesFor(product),
      /* 오늘 진열 밖이라 폭이 0이다 — 옵션도 정가 그대로 */
      units: unitsFor(product, product.price, 0),
    };
  });

  /* 탭마다 묻는 게 다르다.
       인기순  오늘 많이 나간 순      — 남들이 뭘 샀나
       관심순  내가 담아둔 순         — 내 것부터
       전체    오늘 할인 큰 순        — 목록이지 순위가 아니다

     어느 탭이든 두 가지가 먼저다. 살 수 없는 빵(품절)은 맨 뒤로, 오늘 할인 대상이
     아닌 빵(라인 밖)은 그 앞으로. 살 수 있는 것이 위에 오지 않으면 진열이 아니다. */
  const byTab = (a: TodayOffer, b: TodayOffer) => {
    if (sort === 'watched') return qtyOf(portfolio, b.product.productNo) - qtyOf(portfolio, a.product.productNo) || b.saved - a.saved;
    if (sort === 'popular') return filledOf(b) - filledOf(a) || b.saved - a.saved;
    return b.saved - a.saved || a.product.price - b.product.price;
  };
  const sorted = (sort === 'all' ? [...shelf] : [...offers]).sort((a, b) =>
    Number(b.product.inStock) - Number(a.product.inStock)
    || Number(b.saved > 0) - Number(a.saved > 0)
    || byTab(a, b));
  const ranking = offers.map(o => ({ o, n: filledOf(o) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
  const selectedOffer = shelf.find(o => o.product.productNo === selected) ?? null;

  /* ── MY ── */
  /* 마운트 시점 순서를 고정한다 — 수량을 바꿀 때 줄·조각이 튀지 않게 */
  const entries = useStableHoldings(portfolio);
  const pfTotal = entries.reduce((a, b) => a + b.qty, 0);
  /* 하나만 담아도 도넛을 보여준다. '3개부터'는 성급한 판정을 막자는 안이었지만, 담았는데 안 보이는 게 더 이상하다 */
  const actions = pfTotal;
  /* 이름은 오늘 진열이 아니라 전체 목록에서 찾는다.
     라인을 켜면서 '재고는 있는데 오늘 라인이 아닌 빵'이 생겼는데, offers에도
     soldOut에도 없어서 관심빵이 '#25'로 떨어졌다 — 담아둔 빵의 이름은 오늘
     팔든 안 팔든 알아야 한다 */
  const nameOf = (no: number) => today.all.find(p => p.productNo === no)?.name ?? `#${no}`;
  const slices: Slice[] = entries.map(e => {
    const o = offers.find(x => x.product.productNo === e.no);
    return { no: e.no, name: nameOf(e.no), emoji: EMOJI[e.no] ?? '🍞', share: Math.round((e.qty / pfTotal) * 100), today: Boolean(o), price: o?.price };
  });
  const hits = entries.map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o));
  /* 차트 툴팁에 보여줄 빵들 — 내 관심빵(오늘 빵장에 있는 것, 비중 순, 최대 3).
     없으면 빵을 보여주지 않고 "알림받기로 담아라" 안내만 한다 */
  /* 상위 3개는 담은 수 많은 순 → 같으면 최근 담은 순(sortHoldings). entries는 줄이 튀지 않게
     고정한 표시 순서라 여기 쓰면 먼저 담은 셋만 뽑힌다 */
  const watched = sortHoldings(portfolio).map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o)).slice(0, 3);
  const chartBreads = watched.map(o => ({ no: o.product.productNo, name: o.product.name, emoji: EMOJI[o.product.productNo] ?? '🍞', listPrice: o.product.price }));
  const tierLabel = live.tier.label;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={styles.page} data-side={mood.side}>
      <header className={styles.masthead}>
        <div><p className={styles.exchangeLabel}>MAKJI / BREAD EXCHANGE</p>
          <h1>국장이 끝나면,<br /><em>빵장</em>이 열립니다.</h1>
        </div>
        <div className={styles.mastheadAside}><span>시장을 읽고, 빵을 고르다.</span><p>오늘의 코스피가 만드는<br />오늘만의 빵 가격.</p><a href={holiday ? '#week' : '#today'}>{holiday ? '이번 주 빵장 보기' : '오늘의 빵 만나기'} <span aria-hidden="true">↘</span></a></div>
      </header>
      <nav className={styles.marketNav} aria-label="빵장 바로가기">
        <a href={holiday ? '#week' : '#today'}>{holiday ? '이번 주 빵장' : '오늘의 할인빵'} <span aria-hidden="true">↘</span></a>
        <a href="#foryou">내 포트폴리오 <span aria-hidden="true">↘</span></a>
      </nav>
      {/* ══ MARKET ══ */}
      <KospiLive k={k} mood={mood} rate={rate} phase={phase} closed={closed} openAt={openAt} tiers={tiers} breads={chartBreads} noWatch={watched.length === 0} tierLabel={tierLabel} base={live.base} bonus={live.bonus} />

      {/* ══ 휴장일 — 가격 대신 이번 주 결산. 국장이 쉬면 폭도 쉰다 ══ */}
      {holiday && (
        <section id="week" className={`${styles.card} ${styles.reveal}`} style={reveal(0)} aria-label="이번 주 빵장">
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>◍ MARKET CLOSED</span>
            <span className={styles.theme}>휴장일에는 정가</span>
          </div>
          <h2 className={styles.weekLead}>국장이 쉬는 동안,<br />이번 주 나의 빵장.</h2>

          {/* 주인공은 배당금이 아니라 결산이다. 배당을 앞에 세우면 쿠폰 페이지가 된다 */}
          {score && (
            <>
              <ul className={styles.scoreList}>
                <li data-on={score.watched}>
                  <i aria-hidden="true">{score.watched ? '✓' : '·'}</i>
                  <b>관심빵 담기</b>
                  <small>{score.watched ? '이번 주에 담았어요' : '아직 담은 빵이 없어요'}</small>
                  <em>{score.watched ? '+1' : '0'}</em>
                </li>
                <li data-on={score.bought}>
                  <i aria-hidden="true">{score.bought ? '✓' : '·'}</i>
                  <b>빵장에서 구매</b>
                  <small>{score.bought ? '이번 주에 샀어요' : '이번 주 구매가 없어요'}</small>
                  <em>{score.bought ? '+1' : '0'}</em>
                </li>
                <li data-on={score.attended}>
                  <i aria-hidden="true">{score.attended ? '✓' : '·'}</i>
                  <b>거래일 출석</b>
                  <small>{score.visitDays}일 방문 · {score.visitNeeded}일부터 인정{score.visitNeeded < 3 ? ' (휴장 주)' : ''}</small>
                  <em>{score.attended ? '+1' : '0'}</em>
                </li>
              </ul>

              <div className={styles.dividend} data-none={score.amount === 0}>
                <span className={styles.eyebrow}>WEEKEND DIVIDEND</span>
                {score.amount > 0 ? (
                  <>
                    <strong>{won(score.amount)}P</strong>
                    <p>주간 활동점수 <b>{score.score}점</b> · {wallet ? <>토요일에 <b>{wallet.mode === 'wallet' ? '배당금 통장' : '자사몰 적립금'}</b>으로 들어가요</> : '배당 지급을 준비하고 있어요'}</p>
                  </>
                ) : (
                  <>
                    <strong>0P</strong>
                    <p>이번 주에는 활동이 없었어요. 하나만 채워도 다음 주 배당이 생깁니다</p>
                  </>
                )}
              </div>
            </>
          )}

          {/* 점수 카드는 주말에만 뜨지만 통장은 휴장일이면 늘 보여준다 — 추석 목·금에도 쓸 수 있어야 한다 */}
          {wallet && <DividendLink initial={wallet.member} mode={wallet.mode} balance={wallet.balance} coupon={wallet.coupon} />}

          <h3 className={styles.weekSub}>이번 주 빵장은 이랬어요</h3>
          {week && week.fills > 0 ? (
            <ul className={styles.weekStats}>
              <li><b>{week.tradedDays}일</b><small>이번 주 거래일</small></li>
              <li><b>{Math.round(week.avgDepth * 100)}%</b><small>평균 할인 폭</small></li>
              <li><b>{week.fills}건</b><small>예약된 빵</small></li>
              {week.deepest && (
                <li><b>{Math.round(week.deepest.depth * 100)}%</b><small>가장 깊었던 날 · {week.deepest.day.slice(5).replace('-', '/')}</small></li>
              )}
            </ul>
          ) : (
            <p className={styles.empty}>이번 주에는 체결된 예약이 없었어요. <b>다음 거래일 {OPEN_AT}</b>에 새 장이 열립니다.</p>
          )}
          <p className={styles.hint}>
            빵장은 <b>주식시장이 열리는 날</b>만 엽니다. 휴장일에는 할인 대신 정가로 판매하고,
            아래에서 <b>관심빵</b>을 담아두면 다음 장이 열릴 때 알려드려요.
          </p>
        </section>
      )}

      {/* ══ 오늘의 결론 — 들어온 사람이 가장 먼저 알아야 할 한 줄.
             근거(구간·하락장 보정)는 위 히어로의 '할인 기준 보기'에 접어 두고,
             여기에는 결과만 세운다. 서랍 안에 있으면 아무도 안 연다.
             '모든 빵'이라고 쓰지 않는다 — SKU 보정이 붙어 빵마다 폭이 다르다 ══ */}
      {/* ══ TODAY ══ */}
      {/* 휴장일에도 목록은 연다. 숨기면 관심빵 하트를 누를 곳이 없어져서, 다음 장 알림도
          주간 관심 점수도 쌓이지 않는다. 대신 가격은 정가만, 잔량·할인 결론은 뺀다 */}
      <section id="today" className={`${styles.card} ${styles.reveal}`} style={reveal(0)} aria-label={holiday ? '다음 장 관심빵 담기' : '오늘의 할인 빵'}>
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>{holiday ? '01 / NEXT SESSION' : '01 / TODAY’S BREAD'}</span>{!holiday && <span className={styles.theme}>{mood.theme}</span>}</div>
        {/* 오늘의 결론을 목록 바로 위에 세운다. 컨테이너 밖에 따로 떠 있으면
            무엇에 대한 결론인지가 끊긴다 — 이 숫자가 아래 목록의 근거다 */}
        {!holiday && <div className={styles.todayCall}>
          <span className={styles.eyebrow}>
            {phase === 'live'
              ? '지금 마감한다면'
              : <>오늘은 {k.changePct > 0 ? '상승' : k.changePct < 0 ? '하락' : '보합'} 마감<span className={styles.stamp}>확정 ✓</span></>}
          </span>
          <strong>기본 할인 <b>{Math.round(rate * 100)}%</b></strong>
        </div>}
        <header className={styles.cardHead}>
          <h2>{holiday
            ? <>다음 장에 담아둘 빵 <small>오늘은 {closed?.closedFor ?? '휴장'} · 정가 판매 · ♡ 담아두면 {closed?.nextOpen ?? '다음 거래일'} {openAt}에 알려드려요</small></>
            : <>{phase === 'live' ? '지금 예상되는 오늘의 할인 빵' : '오늘의 할인 빵'} <small>{offers.length}종 할인 · 상품별 할인율·예약 한도 확인</small></>}</h2>
          <div className={styles.sort} role="group" aria-label="정렬">
            <button type="button" aria-pressed={sort === 'popular'} onClick={() => setSort('popular')}>인기순</button>
            <button type="button" aria-pressed={sort === 'watched'} onClick={() => setSort('watched')}>관심순</button>
            <button type="button" aria-pressed={sort === 'all'} onClick={() => setSort('all')}>전체</button>
          </div>
        </header>

        {/* 화면과 키보드 탐색이 같은 정렬 순서를 따른다. */}
        <ul className={styles.grid}>
          {sorted.map((o, i) => {
            const no = o.product.productNo, remaining = remainingOf(o), n = qtyOf(portfolio, no);
            /* 메달은 순위가 있는 탭에서만. 전체는 목록이라 1·2·3등이 없다.
               그리고 셀 것이 0이면 메달을 붙이지 않는다 — 아무도 안 산 날의 🥇은 거짓말이다 */
            const ranked = sort === 'popular' ? filledOf(o) > 0 : sort === 'watched' ? n > 0 : false;
            const step = stepOf.get(no) ?? i;      // 등장·사진·가격 굴림에 쓰는 고정 순서
            const rank = i;      // 지금 정렬에서 몇 번째로 보이는가
            return (
              <li key={no} className={`${styles.reveal} ${styles.cell}`} style={reveal(1 + step)}>
                <button type="button" className={styles.topCard} data-sold-out={!o.product.inStock} style={{ ['--ph' as string]: `${step * 5}s` }} onClick={() => openFromList(no)}>
                  {ranked && rank < 3 && <span className={styles.medal}>{MEDAL[rank]}</span>}
                  {!o.onLine && <span className={styles.offLine}>{o.product.inStock ? '오늘 라인 밖' : '품절'}</span>}
                  <span className={styles.topPhoto}><ProductPhoto productNo={no} name={o.product.name} /></span>
                  <b>{o.product.name}</b>
                  <span className={styles.topPrice}>
                    {o.saved > 0 && !holiday ? (
                      <>
                        <strong><RollingPrice from={o.product.price} to={o.price} delay={base + (1 + step) * 90 + 500} />원</strong>
                        <del>{won(o.product.price)}원</del>
                      </>
                    ) : (
                      /* 오늘 할인 대상이 아니다 — 정가만 보여주고 취소선을 긋지 않는다 */
                      <strong>{won(o.product.price)}원</strong>
                    )}
                  </span>
                  {holiday ? (
                    <small>{o.product.inStock ? '다음 장 할인은 그날 종가로 정해져요' : '지금은 품절이에요'}</small>
                  ) : phase === 'locked' ? (
                    <small>🔒 {openAt} 공개</small>
                  ) : (
                    <>
                      {o.saved > 0 ? (
                        <>
                          <span className={styles.topMeter} aria-hidden="true"><i style={{ width: `${Math.round((remaining / o.allotment) * 100)}%` }} data-low={remaining <= o.allotment * 0.2} /></span>
                          <small>{remaining > 0 ? `남음 ${remaining} / ${o.allotment}` : '오늘 물량 끝'}{phase === 'live' ? ' · 지금 기준 예상' : ''}</small>
                        </>
                      ) : (
                        <small>{o.product.inStock ? '오늘은 정가로 판매해요' : '지금은 품절이에요'}</small>
                      )}
                    </>
                  )}
                </button>
                {/* 카드 전체가 이미 버튼이라 안에 넣을 수 없다. 형제로 두고 위에 얹는다 */}
                <button
                  type="button"
                  className={styles.watch}
                  aria-pressed={n > 0}
                  aria-label={`${o.product.name} 관심 ${n > 0 ? '해제' : '담기'}`}
                  onClick={() => setQty(no, n > 0 ? 0 : 1)}
                >
                  {n > 0 ? '♥' : '♡'}
                </button>
              </li>
            );
          })}
        </ul>

        {/* 품절 목록을 따로 접어두지 않는다 — '전체' 탭이 품절까지 회색으로
            보여주므로 같은 것을 두 군데서 말하게 된다 */}

        <dl className={styles.roles}>
          <div><dt>할인 폭</dt><dd>오늘 KOSPI <b>변동폭</b> 기준</dd></div>
          <div><dt>할인 라인·기분</dt><dd>KOSPI <b>방향</b> 기준</dd></div>
          <div><dt>수량</dt><dd>상품별 <b>재고</b> 기준</dd></div>
        </dl>
      </section>

      {!holiday && ranking.length > 0 && (
        <>
        <p className={`${styles.lead} ${styles.reveal}`} style={reveal(5)}>먼저 고른 사람이, <b>먼저 가져갑니다.</b></p>
        <section className={`${styles.card} ${styles.reveal}`} style={reveal(5)} aria-label="오늘 많이 산 빵">
          <header className={styles.cardHead}><h2>오늘 많이 산 빵 <small>30초마다 갱신</small></h2></header>
          <ol className={styles.rankList}>{ranking.map(({ o, n }, i) => <li key={o.product.productNo}><i>{i + 1}</i><b>{o.product.name}</b><small>{n}개</small></li>)}</ol>
        </section>
        </>
      )}

      {/* ══ MY ══ */}
      <section id="foryou" className={`${styles.card} ${styles.portfolioCard} ${styles.reveal}`} style={reveal(6)} aria-label="내 빵 포트폴리오">
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>02 / MY BREAD</span>{pfTotal > 0 && <span className={styles.theme}>관심빵 {entries.length}종{hits.length > 0 && !holiday && ` · 오늘 ${hits.length}종 할인`}</span>}</div>

        {reservationError && <p className={styles.sheetNote} role="status">{reservationError}</p>}
        {Object.entries(bids).some(([, bid]) => bid.status === 'filled') && (
          <div className={styles.topPick}>
            <h2>예약한 빵 · 결제 이어가기</h2>
            <p>놓고 간 빵이 있어요. 아래에서 구매를 이어가세요.</p>
            <ul className={styles.pfList}>
              {Object.entries(bids).filter(([, bid]) => bid.status === 'filled').map(([no]) => (
                <li key={no}><button type="button" className={styles.ghost} onClick={() => openFromPortfolio(Number(no))}>
                  {nameOf(Number(no))} · 결제 안내
                </button></li>
              ))}
            </ul>
          </div>
        )}
        {actions === 0 ? (
          <div className={styles.emptyBox}>
            <h2>취향을 담아두세요.</h2>
            <div className={styles.emptyMark} aria-hidden="true">♡</div>
            <p>마음에 드는 빵의 하트를 눌러보세요.<br />오늘 할인하는 관심빵을 모아드릴게요.</p>
            <div className={styles.emptyBtns} data-single="true">
              <button type="button" className={styles.ghost} onClick={() => scrollTo('today')}>♡ 빵 둘러보기</button>
            </div>
          </div>
        ) : (
          <>
            <header className={styles.cardHead}><h2>내 빵 포트폴리오</h2></header>
            <Portfolio offers={shelf} entries={entries} bids={bids} onPick={openFromPortfolio}
              unitOf={unitOf} bulk={bulk}
              onUnit={(no, code) => setUnits(previous => ({ ...previous, [no]: code }))}
              onBuyAll={buyAll} />
            <button type="button" className={styles.expand} onClick={() => setPfOpen(v => !v)} aria-expanded={pfOpen} aria-controls="portfolio-details">취향 비중 {pfOpen ? '접기 ▴' : '보기 ▾'}</button>
            {pfOpen && <div id="portfolio-details"><Donut slices={slices} onPick={openFromPortfolio} /></div>}
            {/* 알림은 담아둔 빵이 있는 자리에서만 권한다 — 페이지 열자마자 묻는 창은
                대부분 거절당하고, 한 번 거절하면 브라우저가 다시 묻지 않는다 */}
            <PushToggle />
          </>
        )}
      </section>

      {/* ══ NEXT — 다음에 나올 빵 ══
           내 것을 다 본 사람에게 마지막 질문이 이어진다:
           MARKET(지금 국장) → TODAY(오늘 살 빵) → MY(내 것) → NEXT(다음에 나올 빵)
           탭이 아니라 스크롤 순서 안에 둔다 — 탭으로 빼면 처음 온 사람은 영영 못 본다. */}
      {ipoOn && round && (
        <>
        <p className={`${styles.lead} ${styles.reveal}`} style={reveal(7)}>다음에 나올 빵은, <b>오늘 산 사람</b>이 정합니다.</p>
        <section id="next" className={`${styles.card} ${styles.reveal}`} style={reveal(7)} aria-label="다음 빵 공모">
          <IpoTab round={round} view={ipo} onChange={setIpo} />
        </section>
        </>
      )}

      <p className={`${styles.fine} ${styles.reveal}`} style={reveal(8)}>
        {today.kospiLive ? '' : '⚠️ 코스피 수집에 실패해 샘플 값입니다. '}
        예약 한도는 상품·옵션별로 다르며, 남은 재고에 따라 달라집니다.
        {test && <> <b>지금은 테스트로 24시간 열어두었습니다</b> — 원래는 {openAt}~24:00.</>}
        {' '}<button type="button" className={styles.link} onClick={() => setInfoOpen(v => !v)} aria-expanded={infoOpen}>오늘 가격은 어떻게 정해지나 {infoOpen ? '▴' : '→'}</button>
      </p>
      {infoOpen && (
        <section className={`${styles.card} ${styles.pop}`} aria-label="오늘 가격은 어떻게 정해지나">
          <header className={styles.cardHead}><h2>오늘 가격은 어떻게 정해지나</h2></header>
          <InfoTab today={today} />
        </section>
      )}

      {selectedOffer && (
        <OfferSheet key={selectedOffer.product.productNo} offer={selectedOffer} mood={mood} changePct={k.changePct} rate={selectedOffer.saved > 0 && !holiday ? withSkuBonus(rate, selectedOffer.demandBonus, selectedOffer.inventoryBonus) : 0} estimate={phase === 'live'}
          remaining={remainingOf(selectedOffer)} bid={bids[selectedOffer.product.productNo]} watching={qtyOf(portfolio, selectedOffer.product.productNo)}
          canBuy={canBuy && selectedOffer.saved > 0 && selectedOffer.product.inStock} lockNote={lockNote}
          canBid={ipoOn && ipo.canBid && !ipo.bidFor}
          unit={unitOf(selectedOffer)}
          onNext={() => { setSelected(null); scrollTo('next'); }}
          onBuy={() => buy(selectedOffer)} onQty={next => setQty(selectedOffer.product.productNo, next)}
          onUnit={code => setUnits(prev => ({ ...prev, [selectedOffer.product.productNo]: code }))}
          onClose={closeSheet} />
      )}
    </div>
  );
}
