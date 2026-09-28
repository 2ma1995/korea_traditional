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
import { byProduct, keyOf, qtyOf, sortHoldings, splitKey, usePortfolio, useStableHoldings } from '@/lib/portfolioStore';
import { useKospiLive, type Point } from '@/lib/useKospiLive';
import styles from './Market.module.css';
import DividendLink from '@/components/DividendLink';
import { shopListUrl } from '@/lib/shop';

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
  /** 휴장일에만 온다. 이번 주 내 빵장(예약 수·아낀 금액), 주말인가, 이번 주 배당 지급 기록, 등급별 금액 */
  myWeek: {
    count: number; saved: number; weekend: boolean;
    payout: { status: string; amount: number } | null;
    tiers: [number, number, number] | null;
  } | null;
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

export default function Market({ today, points, kospi, tiers, round, ipo: initialIpo, ipoOn, week, score, wallet, myWeek }: Props) {
  const k = useKospiLive({ value: kospi.value, changePct: kospi.changePct, marketOpen: kospi.marketOpen, live: kospi.live, points });
  const [filled, setFilled] = useState<Record<string, number>>({});
  /* 오늘 예약 — "번호:품목코드" 키. 옵션마다 한 자리라(0019) 빵 번호만으로는 못 가른다 */
  const [bids, setBids] = useState<Record<string, Bid>>({});
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
  /* 빵의 특정 옵션으로 시트를 연다 — 포트폴리오·예약 목록은 옵션 줄이다 */
  const openSeat = (no: number, unit: string | null) => {
    if (unit) setUnits(prev => ({ ...prev, [no]: unit }));
    setSelected(no);
  };
  const pending = useRef(new Set<string>());
  const [pfOpen, setPfOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { portfolio, setQty, toggleProduct, moveKey } = usePortfolio();
  const [ipo, setIpo] = useState(initialIpo);

  /* ── KOSPI 상태 → 아래로 전파 ── */
  const liveOn = k.marketOpen === true;
  const mood = moodFor(k.changePct);
  const live = rateFor(k.changePct, tiers);                         // 장중엔 '지금 기준 예상'
  const rate = live.rate;
  const test = today.hours.reason === 'test';
  const phase: Phase = liveOn ? 'live' : today.hours.open ? 'open' : today.hours.reason === 'before' ? 'locked' : 'closed';
  /* 시세를 못 받은 날(샘플 값)엔 예약을 받지 않는다 — 서버(api/fill)도 같은 이유로 거절한다 */
  const canBuy = today.hours.open && today.kospiLive && (phase !== 'live' || test);
  const lockNote = today.hours.open && !today.kospiLive ? '코스피 시세 확인 중 · 잠시 뒤 새로고침' : today.hours.reason === 'holiday' ? '다음 거래일에 열려요' : phase === 'live' ? `${OPEN_AT} 확정과 함께 열려요` : phase === 'locked' ? `🔒 ${OPEN_AT} 공개` : phase === 'closed' ? `다음 거래일 ${OPEN_AT}에 열려요` : '휴장';
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
  /* 휴장일엔 폭이 0이다 — 정가로 판다. 여기서 한 번 0으로 두면 정렬·뱃지·포트폴리오·도넛이
     전부 '정가'로 읽는다. 전엔 직전 거래일 폭이 남아 휴장일에도 '할인'·'라인 밖 · 할인'이 떴다 */
  const offers: TodayOffer[] = today.offers.map(o => {
    const r = holiday ? 0 : withSkuBonus(rate, o.demandBonus, o.inventoryBonus);
    return {
      ...o,
      ...priceAt(o.product.price, r),
      units: o.units.map(u => ({ ...u, price: priceAt(o.product.price, r).price + priceAt(u.listPrice - o.product.price, r).price })),
    };
  });

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
            /* 한 옵션에 여러 자리를 쥘 수 있다(0020) — 옵션마다 한 묶음으로 합친다.
               가장 먼저 잡은 자리, 가장 이른 결제 기한, 전부 결제됐을 때만 'paid' */
            const bySeat = new Map<string, (Bid & { productNo: number })[]>();
            for (const bid of json.reservations as (Bid & { productNo: number })[]) {
              const seat = keyOf(bid.productNo, bid.unit ?? null);
              bySeat.set(seat, [...(bySeat.get(seat) ?? []), bid]);
            }
            for (const [seat, rows] of bySeat) {
              if (pending.current.has(seat)) continue;
              const first = [...rows].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))[0];
              const merged: Bid = {
                ...first, count: rows.length,
                expiresAt: rows.map(r => r.expiresAt).filter((at): at is string => Boolean(at)).sort()[0] ?? null,
                settled: rows.every(r => r.settled === 'paid') ? 'paid' : 'open',
                short: next[seat]?.short,
              };
              const had = next[seat];
              if (had?.status !== 'filled' || merged.settled === 'paid' || (had.count ?? 1) !== merged.count) next[seat] = merged;
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
  /* 이 옵션의 오늘 남은 자리. 물량은 옵션마다 따로 연다(0015) — 빵 전체로 세면
     '5개'가 다 나가도 '1개'가 남아 있다는 이유로 남음 n을 말한다 */
  const unitLeft = (o: TodayOffer, code: string | null) => {
    const u = code ? o.units.find(x => x.code === code) : undefined;
    if (!u) return remainingOf(o);
    return Math.max(0, u.allotment - (filled[`${key(o.product.productNo, o.rate)}:${u.code}`] ?? 0));
  };

  /**
   * 한 종을 예약한다. 실패하면 **이유까지** 돌려준다.
   *
   * 예전에는 catch가 오류를 통째로 삼키고 전부 '미체결'로 표시했다. 그래서 장이
   * 닫혀 있어도, 폭이 어긋나도, 품절이어도 화면은 똑같이 "오늘 물량이 끝났습니다"
   * 라고 말했다 — 손님에게 거짓말이고, 우리도 원인을 못 봤다.
   * lib/fills.ts가 "저장소 없음"을 "품절"이라고 말하던 것과 같은 실수다.
   */
  async function buy(offer: TodayOffer, unit: string | null = unitOf(offer), count = 1): Promise<{ ok: boolean; error?: string }> {
    const no = offer.product.productNo;
    /* 자리는 옵션마다 센다(0019) — 같은 빵이라도 옵션이 다르면 따로 잡는다.
       count는 이 옵션을 몇 개 원하는가 — 서버가 이미 쥔 만큼은 빼고 모자란 만큼만 채운다(0020) */
    const seat = keyOf(no, unit);
    if (bids[seat]?.status === 'filled' && (bids[seat].count ?? 1) >= count) { openSeat(no, unit); return { ok: true }; }
    if (pending.current.has(seat)) return { ok: false };
    pending.current.add(seat);
    setBids(prev => ({ ...prev, [seat]: { status: 'busy', slot: null } }));
    try {
      /* 자사몰 재고는 품목 단위로 관리된다 — 어느 옵션을 잡았는지 같이 보내야
         "5개"를 예약해놓고 "1개" 재고를 깎는 일이 안 생긴다(lib/inventory) */
      const res = await fetch('/api/fill', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productNo: no, depth: offer.rate, unit, count }) });
      const json = await res.json();
      if (!json?.ok) {
        const error = String(json?.error ?? '예약에 실패했습니다.');
        setBids(prev => ({ ...prev, [seat]: { status: 'missed', slot: null, error } }));
        return { ok: false, error };
      }
      setBids(prev => ({ ...prev, [seat]: { status: json.filled ? 'filled' : 'missed', count: json.count ?? 1, short: json.short ?? null, slot: json.slot ?? null, stored: json.stored, coupon: json.coupon ?? null, expiresAt: json.expiresAt ?? null, delivery: json.delivery, unit: json.unit ?? unit, depth: json.depth ?? offer.rate, settled: json.settled } }));
      /* 서버가 준 수량은 고른 옵션의 것이다 — 옵션 칸에 적는다. 빵 전체 수는 다음 조회가 맞춘다 */
      if (typeof json.quantity === 'number' && typeof json.remaining === 'number') {
        const group = key(no, offer.rate);
        setFilled(prev => ({ ...prev, [unit ? `${group}:${unit}` : group]: json.quantity - json.remaining }));
      }
      /* 구매가 체결되면 서버가 공모 청약권을 발급한다(lib/bidRight).
         아직 오늘 청약하지 않았다면 NEXT의 버튼이 지금 열린다 */
      if (json.filled) setIpo(prev => (prev.bidFor ? prev : { ...prev, canBid: true }));
      /* filled=false는 진짜 물량이 끝난 경우다 — 서버가 ok로 답했으니.
         일부만 잡혔으면 잡힌 것은 살리고 이유를 같이 돌려준다 */
      return { ok: Boolean(json.filled), error: json.short ?? undefined };
    } catch {
      const error = '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      setBids(prev => ({ ...prev, [seat]: { status: 'missed', slot: null, error } }));
      return { ok: false, error };
    } finally {
      pending.current.delete(seat);
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
  async function buyAll(list: { offer: TodayOffer; unit: string | null; count: number }[]) {
    setBulk({ busy: true, done: 0, missed: 0 });
    let done = 0, missed = 0, error: string | undefined;
    for (const { offer, unit, count } of list) {
      const result = await buy(offer, unit, count);
      /* 일부만 잡혔어도 잡힌 줄은 성공으로 세고, 이유는 남긴다 */
      if (result.ok) { done += 1; error ??= result.error; continue; }
      missed += 1;
      /* 첫 실패 이유만 남긴다 — 여러 개가 같은 이유로 막히는 게 보통이다 */
      error ??= result.error;
    }
    setBulk({ busy: false, done, missed, error });
  }

  /**
   * 상품마다 지금 고른 자사몰 옵션(시트·카드 하트가 쓴다). 안 골랐으면 예약해 둔 옵션,
   * 그것도 없으면 첫 판매중 옵션이다 — 선택을 강요하지 않되, 예약이 엉뚱한 품목으로
   * 가지 않게 기본값을 정해 둔다. 예약한 옵션은 품절돼도 결제 안내를 봐야 해서 고를 수 있다.
   */
  function unitOf(offer: TodayOffer): string | null {
    const no = offer.product.productNo;
    const bookedHere = (code: string) => bids[keyOf(no, code)]?.status === 'filled';
    const picked = units[no];
    if (picked && offer.units.some(u => u.code === picked && (u.sellable || bookedHere(u.code)))) return picked;
    return offer.units.find(u => bookedHere(u.code))?.code ?? offer.units.find(u => u.sellable)?.code ?? null;
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

  /* 세 탭 모두 막지의 모든 빵을 보여주고, 두 단계로 줄 세운다.

     1단계 — 어느 탭이든 같다. 오늘 살 이유가 큰 것부터.
       ① 오늘 라인 할인   오늘 시장이 고른 빵(상승=식사형 · 하락=디저트)
       ② 채워 넣은 할인   라인 빵이 모자라 라인 밖에서 채운 빵 — 할인은 되지만 오늘의 주인공이 아니다
       ③ 정가            오늘 할인 대상이 아니다
       ④ 품절

     2단계 — 같은 묶음 안에서 탭마다 묻는 게 다르다.
       전체    할인율(%) 큰 순   — 금액으로 세면 비싼 빵이 늘 위라 사실상 '비싼 순'이었다
       관심순  내가 담은 개수 순  — 내 것부터
       인기순  오늘 예약 수 순    — 남들이 뭘 샀나
     같으면 할인율, 그다음 정가 낮은 순.

     전에는 관심순·인기순이 오늘 할인 빵만 보여줘서, 정가인 날 담아둔 빵이 관심순에서 사라졌다 */
  const groupOf = (o: TodayOffer) => (!o.product.inStock ? 3 : o.saved <= 0 ? 2 : o.onLine ? 0 : 1);
  const rateOf = (o: TodayOffer) => (o.product.price > 0 ? o.saved / o.product.price : 0);
  const keyOfTab = (o: TodayOffer) =>
    sort === 'watched' ? qtyOf(portfolio, o.product.productNo) : sort === 'popular' ? filledOf(o) : rateOf(o);
  const sorted = [...shelf].sort((a, b) =>
    groupOf(a) - groupOf(b)
    || keyOfTab(b) - keyOfTab(a)
    || rateOf(b) - rateOf(a)
    || a.product.price - b.product.price);
  /* 메달은 그 탭의 진짜 1~3위에 붙인다 — 묶음 순서로 자른 자리에 붙이면, 정가라 아래로 간
     '가장 많이 담은 빵'은 못 받고 1개 담은 할인 빵이 🥇을 받는다. 0이면 메달이 없다 */
  const medalOf = new Map(
    sort === 'all' ? [] : [...shelf]
      .map(o => ({ no: o.product.productNo, n: sort === 'watched' ? qtyOf(portfolio, o.product.productNo) : filledOf(o) }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((x, place) => [x.no, MEDAL[place]] as const),
  );
  const ranking = offers.map(o => ({ o, n: filledOf(o) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);
  const selectedOffer = shelf.find(o => o.product.productNo === selected) ?? null;

  /* ── MY ── */
  /* 마운트 시점 순서를 고정한다 — 수량을 바꿀 때 줄·조각이 튀지 않게 */
  const entries = useStableHoldings(portfolio);
  /* 도넛·"오늘 n종 할인"·차트의 빵은 빵 단위다 — 옵션 셋을 담은 휘낭시에는 한 조각이다.
     포트폴리오 목록만 옵션마다 한 줄이다 */
  const breads = byProduct(entries);
  const pfTotal = breads.reduce((a, b) => a + b.qty, 0);
  /* 하나만 담아도 도넛을 보여준다. '3개부터'는 성급한 판정을 막자는 안이었지만, 담았는데 안 보이는 게 더 이상하다 */
  const actions = pfTotal;
  /* 이름은 오늘 진열이 아니라 전체 목록에서 찾는다.
     라인을 켜면서 '재고는 있는데 오늘 라인이 아닌 빵'이 생겼는데, offers에도
     soldOut에도 없어서 관심빵이 '#25'로 떨어졌다 — 담아둔 빵의 이름은 오늘
     팔든 안 팔든 알아야 한다 */
  const nameOf = (no: number) => today.all.find(p => p.productNo === no)?.name ?? `#${no}`;
  const unitLabel = (no: number, code: string) => today.all.find(p => p.productNo === no)?.options?.find(o => o.code === code)?.label ?? code;
  /* 도넛은 포트폴리오 목록과 같은 단위로 — 옵션마다 한 조각, 비중은 담은 개수로 */
  const slices: Slice[] = entries.map(e => {
    const o = offers.find(x => x.product.productNo === e.no);
    const u = e.unit ? o?.units.find(x => x.code === e.unit) : undefined;
    return {
      key: e.key, no: e.no, unit: e.unit,
      name: e.unit ? `${nameOf(e.no)} · ${unitLabel(e.no, e.unit)}` : nameOf(e.no),
      emoji: EMOJI[e.no] ?? '🍞', share: Math.round((e.qty / pfTotal) * 100),
      /* 오늘 살 수 있는 조각만 진하게 — 할인 중이고 그 옵션을 팔고 있다 */
      today: Boolean(o && o.saved > 0) && (!e.unit || Boolean(u?.sellable)),
      price: u?.price ?? o?.price,
      note: closed ? `${closed.closedFor} · 정가` : !o || (e.unit && !u?.sellable) ? '오늘은 품절' : o.saved > 0 ? '오늘 할인' : '오늘은 할인 밖 · 정가',
    };
  });
  const hits = breads.map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o));
  /* 차트 툴팁에 보여줄 빵들 — 내 관심빵(오늘 빵장에 있는 것, 비중 순, 최대 3).
     없으면 빵을 보여주지 않고 "알림받기로 담아라" 안내만 한다 */
  /* 상위 3개는 담은 수 많은 순 → 같으면 최근 담은 순(sortHoldings). entries는 줄이 튀지 않게
     고정한 표시 순서라 여기 쓰면 먼저 담은 셋만 뽑힌다 */
  const watched = byProduct(sortHoldings(portfolio)).sort((a, b) => b.qty - a.qty || b.at - a.at).map(e => offers.find(o => o.product.productNo === e.no)).filter((o): o is TodayOffer => Boolean(o)).slice(0, 3);
  const chartBreads = watched.map(o => ({ no: o.product.productNo, name: o.product.name, emoji: EMOJI[o.product.productNo] ?? '🍞', listPrice: o.product.price }));
  const tierLabel = live.tier.label;

  /* 시트는 고른 옵션 하나를 본다 — 예약·관심 모두 그 옵션의 것이다 */
  const sheetUnit = selectedOffer ? unitOf(selectedOffer) : null;
  const sheetSeat = selectedOffer ? keyOf(selectedOffer.product.productNo, sheetUnit) : '';
  /* 옵션을 관심에 담는다. 옵션 없이 담아둔 옛 관심이 있으면 새로 만들지 않고 그 옵션으로 옮긴다 —
     안 그러면 같은 빵이 '옵션을 골라 주세요' 줄과 옵션 줄로 두 번 남는다 */
  const watchSeat = (offer: TodayOffer, unit: string | null, qty: number) => {
    const no = offer.product.productNo, seat = keyOf(no, unit), bare = keyOf(no);
    if (unit && qty > 0 && portfolio[bare] && !portfolio[seat]) { moveKey(bare, seat); return; }
    setQty(seat, qty);
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ── 휴장일 결산 ──
     주말(토·일)은 DIVIDEND DAY — 이번 주 점수·배당이 주인공이다. 평일 휴장일(추석 등)은 배당이 없어
     휴장 안내와 쓸 수 있는 배당금 쿠폰, 다음 장 준비만 보여준다(배당은 토요일에 결산한다).
     숫자는 전부 실제로 셀 수 있는 것만 쓴다 — 장바구니·알림 반응은 측정할 방법이 없어 '2단계'로 둔다.
     구매는 결제 확인(주문 연동) 전이라 예약 기준이다 */
  const weekendDay = myWeek?.weekend ?? false;
  const tierName = (points: number) => ['', 'BASIC', 'PLUS', 'PRIME'][points] ?? '';
  const paid = myWeek?.payout?.status === 'paid';
  const newest = [...entries].sort((a, b) => b.at - a.at)[0];
  const dividendTiers = myWeek?.tiers ?? [300, 500, 800];
  const holidaySection = holiday ? (
    <section id="week" className={`${styles.card} ${styles.reveal}`} style={reveal(0)} aria-label={weekendDay ? '주말 배당' : '휴장일 안내'}>
      <div className={styles.dayBanner}>
        <span className={styles.closedPill}>MARKET CLOSED</span>
        <h2>{weekendDay ? 'DIVIDEND DAY' : `오늘은 ${closed?.closedFor ?? ''} 휴장`}</h2>
        <p>{weekendDay ? '이번 주 빵장 활동을 결산했어요' : '코스피가 쉬는 날은 빵장도 쉽니다'}</p>
        <small>{weekendDay ? '평일에 쌓은 활동이 주말 배당으로 돌아옵니다.' : '빵은 정가로 판매하고, 모아둔 배당금 쿠폰은 오늘도 쓸 수 있어요. 배당 결산은 토요일이에요.'}</small>
      </div>

      <span className={styles.eyebrow}>MY BREAD WEEKLY REPORT</span>
      <h3 className={styles.reportTitle}>이번 주 나의 빵장</h3>
      <ul className={styles.reportStats}>
        <li><small>빵장 예약</small><b>{myWeek?.count ?? 0}회</b></li>
        <li><small>관심 등록</small><b>{breads.length}종</b></li>
        <li><small>최근 담은 빵</small><b>{newest ? nameOf(newest.no) : '—'}</b></li>
        <li><small>평일 빵장 절약액</small><b>{won(myWeek?.saved ?? 0)}원</b></li>
      </ul>
      <p className={styles.fine}>예약·절약액은 예약 기준이에요. 결제 확인은 자사몰 주문 연동 뒤에 반영돼요.</p>

      {score && (
        <div className={styles.pointRow}>
          <div><small>주간 활동점수</small><b>{score.score} POINT</b></div>
          <span className={styles.pointBar} aria-hidden="true"><i style={{ width: `${Math.round((score.score / 3) * 100)}%` }} /></span>
          <span className={styles.tierChip} data-none={score.score === 0}>
            {score.score ? `★ 이번 주 ${tierName(score.score)} · ${paid ? '지급됨' : '지급 예정'}` : '이번 주 배당 없음'}
          </span>
        </div>
      )}

      {(wallet || score) && (
        <div className={styles.divCard}>
          {/* 누적 잔액은 아래 DividendLink가 보여준다(쿠폰으로 나간 금액까지 합쳐서) — 여기선 이번 주 몫만 */}
          {score && (
            <div className={styles.divNums} data-none={score.amount === 0}>
              <span className={styles.eyebrow}>{score.score ? `${tierName(score.score)} · WEEKEND DIVIDEND` : 'WEEKEND DIVIDEND'}</span>
              <small>이번 주 배당</small>
              <strong>{score.amount > 0 ? `+${won(score.amount)}P` : '0P'}</strong>
              <em>{score.amount > 0
                ? (paid ? `${wallet?.mode === 'mileage' ? '자사몰 적립금' : '배당금 통장'}에 들어왔어요` : '토요일 결산 뒤 들어와요')
                : '활동 하나만 채워도 다음 주 배당이 생겨요'}</em>
            </div>
          )}
          {wallet?.mode === 'wallet' ? (
            <ul className={styles.ruleChips} aria-label="배당금 사용 조건">
              <li><b>휴장일 쿠폰</b><small>주말·공휴일 00:05 자동</small></li>
              <li><b>최대 15%</b><small>결제금액 기준</small></li>
              <li><b>잔액 전액 1장</b><small>최소 주문 = 금액 ÷ 15%</small></li>
              <li><b>다음 장 15:00까지</b><small>안 쓰면 잔액으로</small></li>
            </ul>
          ) : wallet?.mode === 'mileage' ? (
            <p className={styles.fine}>배당금은 자사몰 적립금으로 들어가요. 사용 조건은 자사몰 적립금 정책을 따라요.</p>
          ) : (
            <p className={styles.fine}>배당 지급을 준비하고 있어요.</p>
          )}
          {wallet?.mode === 'wallet' && <p className={styles.fine}>평일 빵장 할인과는 쓰는 시간이 겹치지 않아요.</p>}
          {wallet && <DividendLink initial={wallet.member} mode={wallet.mode} balance={wallet.balance} coupon={wallet.coupon} />}
          <a className={`${styles.primary} ${styles.divCta}`} href={shopListUrl} target="_blank" rel="noopener noreferrer">배당금으로 빵 둘러보기 ↗</a>
        </div>
      )}

      {score && (
        <>
          <h3 className={styles.weekSub}>이번 주 배당 점수</h3>
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
              <small>{score.bought ? '이번 주에 예약했어요' : '이번 주 예약이 없어요'}</small>
              <em>{score.bought ? '+1' : '0'}</em>
            </li>
            <li data-on={score.attended}>
              <i aria-hidden="true">{score.attended ? '✓' : '·'}</i>
              <b>거래일 출석</b>
              <small>{score.visitDays}일 방문 · {score.visitNeeded}일부터 인정{score.visitNeeded < 3 ? ' (휴장 주)' : ''}</small>
              <em>{score.attended ? '+1' : '0'}</em>
            </li>
            <li data-off="true">
              <i aria-hidden="true">·</i>
              <b>장바구니 담기</b>
              <small>2단계 — 자사몰 장바구니 연동 뒤</small>
              <em>—</em>
            </li>
            <li data-off="true">
              <i aria-hidden="true">·</i>
              <b>가격 알림 반응</b>
              <small>2단계 — 알림 반응 기록 뒤</small>
              <em>—</em>
            </li>
          </ul>
          <p className={styles.scoreTotal}>★ 총 {score.score} POINT → {score.score ? `${tierName(score.score)} · +${won(score.amount)}P` : '이번 주 배당 없음'}</p>
        </>
      )}

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
        <p className={styles.empty}>이번 주에는 체결된 예약이 없었어요.</p>
      )}

      <h3 className={styles.weekSub}>자주 묻는 질문</h3>
      <div className={styles.faq}>
        <details>
          <summary>등급은 어떻게 정해지나요?</summary>
          <p>평일 활동 세 가지 — 관심빵 담기 · 빵장에서 구매 · 거래일 출석 — 를 주 1회씩 셉니다. 1점 BASIC {won(dividendTiers[0])}P · 2점 PLUS {won(dividendTiers[1])}P · 3점 PRIME {won(dividendTiers[2])}P예요. 출석은 그 주 거래일 3일부터(휴장일이 낀 주는 거래일 − 1일부터) 인정돼요.</p>
        </details>
        <details>
          <summary>배당금은 언제 쓸 수 있나요?</summary>
          <p>토요일에 이번 주 배당을 결산해 배당금 통장에 넣고, 휴장일(주말·공휴일) 00:05에 잔액만큼 할인 쿠폰이 자사몰 쿠폰함에 들어가요. 다음 거래일 15:00까지 쓸 수 있고, 안 쓰면 잔액으로 돌아와 다음 휴장일에 다시 들어가요. 그 달 안에 쓰지 않은 배당금은 월말에 소멸돼요. 처음 한 번 자사몰 아이디를 연결해야 받을 수 있어요.</p>
        </details>
        <details>
          <summary>한 번에 얼마나 쓸 수 있나요?</summary>
          <p>쿠폰 한 장에 잔액 전액이 들어가고, 결제금액의 15%까지 할인돼요. 그래서 쿠폰 금액의 약 6.7배 이상 주문해야 쓸 수 있어요 — 800P면 5,340원, 1,900P면 12,670원부터예요.</p>
        </details>
        <details>
          <summary>평일 할인과 같이 쓸 수 있나요?</summary>
          <p>쓰는 시간이 달라 겹치지 않아요. 배당금 쿠폰은 휴장일부터 다음 거래일 15:00까지, 빵장 할인은 거래일 {OPEN_AT}부터 자정까지예요.</p>
        </details>
      </div>

      <div className={styles.nextMarket}>
        <span className={styles.closedPill}>NEXT MARKET</span>
        <b>{closed?.nextOpen ?? '다음 거래일'} · 09:00 코스피 LIVE · {OPEN_AT} 빵장 개장</b>
        <small>아래에서 관심빵을 담아두면 {OPEN_AT}에 할인 소식을 알려드려요.</small>
      </div>
    </section>
  ) : null;

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
      {/* ══ 휴장일 — 가격 대신 이번 주 결산. 주말엔 배당이 주인공이라 히어로보다 먼저 ══ */}
      {holidaySection}
      {/* ══ MARKET ══ */}
      <KospiLive k={k} mood={mood} rate={rate} phase={phase} closed={closed} openAt={openAt} tiers={tiers} breads={chartBreads} noWatch={watched.length === 0} tierLabel={tierLabel} base={live.base} bonus={live.bonus} />

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
            const medal = medalOf.get(no);
            const step = stepOf.get(no) ?? i;      // 등장·사진·가격 굴림에 쓰는 고정 순서
            return (
              <li key={no} className={`${styles.reveal} ${styles.cell}`} style={reveal(1 + step)}>
                <button type="button" className={styles.topCard} data-sold-out={!o.product.inStock} style={{ ['--ph' as string]: `${step * 5}s` }} onClick={() => openFromList(no)}>
                  {medal && <span className={styles.medal}>{medal}</span>}
                  {/* 라인 빵은 배지가 없다. 채워 넣은 할인 빵과 정가 빵은 뜻이 달라 이름도 다르게 */}
                  {groupOf(o) > 0 && !(holiday && groupOf(o) === 2) && <span className={styles.offLine}>{['', '라인 밖 · 할인', '정가', '품절'][groupOf(o)]}</span>}
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
                  onClick={() => toggleProduct(no, unitOf(o))}
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
        <div className={styles.eyebrowRow}><span className={styles.eyebrow}>02 / MY BREAD</span>{pfTotal > 0 && <span className={styles.theme}>관심빵 {breads.length}종{hits.length > 0 && !holiday && ` · 오늘 ${hits.length}종 할인`}</span>}</div>

        {reservationError && <p className={styles.sheetNote} role="status">{reservationError}</p>}
        {Object.entries(bids).some(([, bid]) => bid.status === 'filled') && (
          <div className={styles.topPick}>
            <h2>예약한 빵 · 결제 이어가기</h2>
            <p>놓고 간 빵이 있어요. 아래에서 구매를 이어가세요.</p>
            <ul className={styles.pfList}>
              {Object.entries(bids).filter(([, bid]) => bid.status === 'filled').map(([seat]) => {
                const { no, unit } = splitKey(seat);
                return <li key={seat}><button type="button" className={styles.ghost} onClick={() => openSeat(no, unit)}>
                  {nameOf(no)}{unit ? ` · ${unitLabel(no, unit)}` : ''} · 결제 안내
                </button></li>;
              })}
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
            <Portfolio offers={shelf} entries={entries} bids={bids} left={unitLeft}
              canBuy={canBuy} closedNote={lockNote} holidayNote={closed ? `${closed.closedFor} · 정가 · 다음 장 ${closed.nextOpen} ${OPEN_AT}` : null}
              onPick={openSeat} onMove={moveKey} bulk={bulk} onBuyAll={buyAll} />
            <button type="button" className={styles.expand} onClick={() => setPfOpen(v => !v)} aria-expanded={pfOpen} aria-controls="portfolio-details">취향 비중 {pfOpen ? '접기 ▴' : '보기 ▾'}</button>
            {pfOpen && <div id="portfolio-details"><Donut slices={slices} onPick={openSeat} /></div>}
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
          remaining={unitLeft(selectedOffer, sheetUnit)} bid={bids[sheetSeat]} watching={portfolio[sheetSeat]?.qty ?? 0}
          watchedUnits={selectedOffer.units.filter(u => portfolio[keyOf(selectedOffer.product.productNo, u.code)]).map(u => u.code)}
          bookedUnits={selectedOffer.units.filter(u => bids[keyOf(selectedOffer.product.productNo, u.code)]?.status === 'filled').map(u => u.code)}
          canBuy={canBuy && selectedOffer.saved > 0 && selectedOffer.product.inStock} lockNote={lockNote}
          canBid={ipoOn && ipo.canBid && !ipo.bidFor}
          unit={sheetUnit}
          onNext={() => { setSelected(null); scrollTo('next'); }}
          onBuy={() => buy(selectedOffer, sheetUnit, Math.max(1, portfolio[sheetSeat]?.qty ?? 1))} onQty={next => watchSeat(selectedOffer, sheetUnit, next)}
          onUnit={code => setUnits(prev => ({ ...prev, [selectedOffer.product.productNo]: code }))}
          onClose={closeSheet} />
      )}
    </div>
  );
}
