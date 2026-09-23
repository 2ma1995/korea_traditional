import { couponUsedBy, createAmountCoupon, deleteCoupon, givePoints, issueCouponTo, memberExists, payoutMode, recaptureCoupon } from '@/lib/cafe24';
import { loadDividendPolicy, MAX_DIVIDEND_RATE } from '@/lib/appSettings';
import { seoulDateString } from '@/lib/market';
import { KRX_HOLIDAYS, marketHours } from '@/lib/orderbook';
import { weeklyScoreFor, weekWindow } from '@/lib/dividend';
import { supabase } from '@/lib/supabase';

/**
 * 주말 배당 지급 — 계산만 하던 배당을 실제로 준다.
 *
 *   손님   배당 카드에서 자사몰 아이디를 한 번 연결한다(linkMember)
 *   관리자 토요일에 지급 버튼을 누른다 — 미리보기(previewPayout)로 금액을 보고 지급(runPayout)
 *   자동   휴장이 시작되면 잔액만큼 할인 쿠폰이 쿠폰함에 들어가고, 장이 다시 열리면 안 쓴 쿠폰을
 *          거둬 잔액으로 돌린다. 다음 휴장엔 새로 쌓인 것과 합쳐 다시 한 장(syncCoupons, 매일 00:05)
 *
 * 주는 방식은 두 가지다(lib/cafe24.payoutMode).
 *   wallet   배당금 통장. 우리가 잔액을 들고, 쓸 때 쿠폰으로 꺼낸다 — 지금 쓰는 방식
 *   mileage  카페24 적립금으로 바로. 적립금 권한을 받으면 켠다
 *
 * 이 서비스에는 로그인이 없어 누구의 계정에 넣을지를 손님이 직접 알려줘야 한다.
 * 공모 청약이 회원 ID를 받는 것과 같은 이유다(api/ipo).
 *
 * ⚠️ 한 아이디는 한 주에 한 번(0018 기본키). 쿠키를 여러 개 만들어 한 아이디에 몰아도
 *    가장 높은 점수 하나만 나간다.
 * ⚠️ 지급 줄을 카페24 호출 **전에** 적는다. 두 번 눌러도 두 번 안 나간다.
 */

/** 카페24 적립금 API의 member_id 한도(20자) — apidocs.cafe24.com/docs/admin/post-points */
const MEMBER_MAX = 20;

export interface PayoutLine {
  member: string;
  visitor: string;
  score: number;
  amount: number;
  status?: 'pending' | 'paid' | 'failed';
  note?: string | null;
}

export interface PayoutPreview {
  /** 지급 대상 주 [from, to) */
  from: string;
  to: string;
  lines: PayoutLine[];
  total: number;
  budget: number;
  /** 이미 지급(또는 진행 중)된 줄 — 다시 나가지 않는다 */
  done: PayoutLine[];
}

/** 이 방문자가 연결해 둔 아이디. 없으면 null */
export async function linkedMember(visitor: string | null): Promise<string | null> {
  const db = supabase();
  if (!db || !visitor) return null;
  const { data } = await db.from('dividend_links').select('member').eq('visitor', visitor).maybeSingle();
  return (data?.member as string | undefined) ?? null;
}

/** 아이디 연결. 카페24에 실제로 있는 회원인지 확인한다 — 오타 난 아이디로 적립금이 새지 않게 */
export async function linkMember(visitor: string, raw: unknown): Promise<{ member: string } | { error: string; status: number }> {
  if (!payoutMode()) return { error: '배당 지급을 준비 중이에요.', status: 503 };
  const member = String(raw ?? '').trim();
  if (!member) return { error: '자사몰 아이디를 적어주세요.', status: 400 };
  if (member.length > MEMBER_MAX) return { error: '아이디가 너무 깁니다.', status: 400 };
  const db = supabase();
  if (!db) return { error: '저장소가 없어 연결할 수 없습니다.', status: 503 };

  /* ponytail: 있는 아이디인지 알려주는 창구가 된다(아이디 추측). 막으려면 IP 시도 제한을 붙인다 */
  if (!(await memberExists(member))) {
    return { error: '자사몰에 없는 아이디예요. 이메일로 가입했다면 @ 앞부분이 아이디일 수 있어요.', status: 404 };
  }

  const { error } = await db.from('dividend_links')
    .upsert({ visitor, member, linked_at: new Date().toISOString() }, { onConflict: 'visitor' });
  if (error) return { error: `연결 저장 실패: ${error.message}`, status: 500 };
  return { member };
}

/**
 * 지급할 주. 주말(토·일)에 누르면 이번 주, 평일에 누르면 지난주다.
 * 월요일에 늦게 눌러도 지난주 것이 나가고, 이번 주 반쪽 점수로 주지 않는다.
 */
export function payWeekDate(at: Date): Date {
  const { to } = weekWindow(at);
  const saturday = new Date(`${to}T00:00:00+09:00`);
  return saturday.getTime() <= at.getTime() ? at : new Date(at.getTime() - 7 * 24 * 3600 * 1000);
}

export async function previewPayout(at: Date = new Date()): Promise<PayoutPreview> {
  const weekDate = payWeekDate(at);
  const { from, to } = weekWindow(weekDate);
  const policy = await loadDividendPolicy();
  const empty: PayoutPreview = { from, to, lines: [], total: 0, budget: policy.budget, done: [] };
  const db = supabase();
  if (!db) return empty;

  const [{ data: links }, { data: paid }] = await Promise.all([
    db.from('dividend_links').select('visitor, member'),
    db.from('dividend_payouts').select('member, visitor, score, amount, status, note').eq('week_from', from),
  ]);

  /* 아이디마다 가장 높은 점수 하나 */
  /* ponytail: 연결한 사람마다 점수 쿼리 3번 — 수백 명까지는 버튼 한 번에 충분하다 */
  const best = new Map<string, PayoutLine>();
  for (const link of (links ?? []) as { visitor: string; member: string }[]) {
    const score = await weeklyScoreFor(link.visitor, weekDate);
    if (score.amount <= 0) continue;
    const seen = best.get(link.member);
    if (!seen || score.amount > seen.amount) {
      best.set(link.member, { member: link.member, visitor: link.visitor, score: score.score, amount: score.amount });
    }
  }

  const done = (paid ?? []) as PayoutLine[];
  const closed = new Set(done.filter(line => line.status !== 'failed').map(line => line.member));
  const lines = [...best.values()].filter(line => !closed.has(line.member));
  return { from, to, lines, total: lines.reduce((sum, line) => sum + line.amount, 0), budget: policy.budget, done };
}

export async function runPayout(at: Date = new Date()): Promise<PayoutPreview & { refused?: string }> {
  const preview = await previewPayout(at);
  const mode = payoutMode();
  if (!mode) return { ...preview, refused: '배당 지급이 꺼져 있습니다(DIVIDEND_PAYOUT=wallet 또는 mileage + 재인증).' };
  const db = supabase();
  if (!db) return { ...preview, refused: '저장소가 없어 지급 기록을 남길 수 없습니다 — 지급하지 않습니다.' };
  const already = preview.done.filter(line => line.status !== 'failed').reduce((sum, line) => sum + line.amount, 0);
  if (preview.budget > 0 && already + preview.total > preview.budget) {
    return { ...preview, refused: `주간 예산 ${preview.budget.toLocaleString()}P를 넘습니다(이미 ${already.toLocaleString()}P + 이번 ${preview.total.toLocaleString()}P). 예산을 올리거나 확인 후 다시 누르세요.` };
  }

  const reason = `막지 빵장 주말 배당 ${preview.from}~${preview.to}`;
  const now = () => new Date().toISOString();
  const results: PayoutLine[] = [];
  for (const line of preview.lines) {
    /* 먼저 적는다. 이미 있으면(다른 탭에서 동시에 눌렀다) 이 아이디는 건너뛴다.
       실패했던 줄만 다시 'pending'으로 되살린다 */
    /* 통장 방식은 밖으로 보낼 것이 없어 적는 순간 지급이다 */
    const row = {
      week_from: preview.from, member: line.member, visitor: line.visitor, score: line.score, amount: line.amount,
      channel: mode, status: mode === 'wallet' ? 'paid' : 'pending', note: null, paid_at: mode === 'wallet' ? now() : null,
    };
    const { error: insertError } = await db.from('dividend_payouts').insert(row);
    if (insertError) {
      if (insertError.code !== '23505') { results.push({ ...line, status: 'failed', note: insertError.message }); continue; }
      const { data: revived } = await db.from('dividend_payouts').update(row)
        .eq('week_from', preview.from).eq('member', line.member).eq('status', 'failed').select('member');
      if (!revived?.length) continue;
    }
    if (mode === 'wallet') {
      results.push({ ...line, status: 'paid' });
      /* 휴장일에 쌓였으면 크론을 기다리지 않고 쿠폰을 합쳐 다시 준다 */
      if (inHoliday(new Date())) await refreshMember(line.member).catch(() => undefined);
      continue;
    }

    try {
      await givePoints(line.member, line.amount, reason);
      await db.from('dividend_payouts').update({ status: 'paid', paid_at: now() })
        .eq('week_from', preview.from).eq('member', line.member);
      results.push({ ...line, status: 'paid' });
    } catch (cause) {
      const note = cause instanceof Error ? cause.message.slice(0, 500) : String(cause);
      await db.from('dividend_payouts').update({ status: 'failed', note })
        .eq('week_from', preview.from).eq('member', line.member);
      results.push({ ...line, status: 'failed', note });
    }
  }
  return { ...preview, lines: results };
}

/* ── 배당금 통장 ─────────────────────────────────────────────────────────── */

/**
 * 카페24 쿠폰 기간 형식 — "2026-09-24T12:00:00+09:00", **정각만**.
 * toISOString()의 Z·밀리초는 422(Invalid date format), 분·초가 붙으면 422(date range not valid) —
 * 2026-09-23 테스트몰에서 17:00·18:00은 통과, 15:29:59·23:59:59는 거절됐다. 그래서 시(時)로 내린다.
 */
export function kstDateTime(at: Date): string {
  const kst = new Date(at.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 13);
  return `${kst}:00:00+09:00`;
}

/** 이번 달(KST) 1일 00:00 — 잔액은 이 달 것만 센다. 달이 바뀌면 남은 배당금은 소멸한다 */
function monthStart(at: Date): string {
  return `${seoulDateString(at).slice(0, 8)}01T00:00:00+09:00`;
}

/** 이 아이디의 이번 달 배당금 잔액 */
export async function walletBalance(member: string | null, at: Date = new Date()): Promise<number> {
  const db = supabase();
  if (!db || !member) return 0;
  const since = new Date(monthStart(at)).toISOString();
  const [{ data: credits }, { data: debits }] = await Promise.all([
    db.from('dividend_payouts').select('amount').eq('member', member).eq('channel', 'wallet').eq('status', 'paid').gte('paid_at', since),
    db.from('dividend_redemptions').select('amount').eq('member', member).in('status', SPENT).gte('created_at', since),
  ]);
  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((total, row) => total + row.amount, 0);
  return Math.max(0, sum(credits) - sum(debits));
}

/**
 * 쿠폰을 쓸 수 있는 마지막 시각 — 다음 거래일 15:00(장 시작 15:30 전 정각), 이번 달 말 23:00을 넘지 않게.
 * 배당은 휴장일에 정가로 살 때 쓰는 것이라, 평일 할인과 겹치지 않게 다음 장이 열리기 전에 닫는다.
 */
export function redeemWindowEnd(at: Date): string {
  const today = seoulDateString(at);
  const next = new Date(`${today}T00:00:00Z`);
  do next.setUTCDate(next.getUTCDate() + 1);
  while ([0, 6].includes(next.getUTCDay()) || KRX_HOLIDAYS.has(next.toISOString().slice(0, 10)));
  const opens = `${next.toISOString().slice(0, 10)}T15:00:00+09:00`;
  const [y, m] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const monthEnd = `${lastDay}T23:00:00+09:00`;
  return new Date(opens) < new Date(monthEnd) ? opens : monthEnd;
}

/* 잔액에서 빠지는 상태 — 쿠폰으로 나가 있거나(issued) 이미 썼다(used).
   거둬들인 것(returned)·실패(failed)는 잔액으로 돌아온다 */
const SPENT = ['pending', 'issued', 'used'];

interface Redemption { id: number; member: string; amount: number; coupon_no: string | null; created_at: string }

/** 이 아이디 쿠폰함에 지금 나가 있는 배당금 쿠폰. 화면이 "쿠폰함에 N원" 을 보여줄 때 쓴다 */
export async function activeCoupon(member: string | null): Promise<{ amount: number; until: string } | null> {
  const db = supabase();
  if (!db || !member) return null;
  const { data } = await db.from('dividend_redemptions').select('amount, created_at')
    .eq('member', member).eq('status', 'issued').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return { amount: data.amount as number, until: redeemWindowEnd(new Date(data.created_at as string)) };
}

/**
 * 나가 있는 쿠폰을 정리한다 — 썼으면 used, 안 썼으면 거둬서 returned(잔액으로 돌아온다).
 * force가 아니면 기한(다음 거래일 15:00)이 지난 것만 본다.
 */
async function settleOut(member: string, at: Date, force: boolean): Promise<void> {
  const db = supabase();
  if (!db) return;
  const { data } = await db.from('dividend_redemptions').select('id, member, amount, coupon_no, created_at')
    .eq('member', member).eq('status', 'issued');
  for (const row of (data ?? []) as Redemption[]) {
    if (!row.coupon_no) continue;
    if (!force && new Date(redeemWindowEnd(new Date(row.created_at))) > at) continue;
    const used = await couponUsedBy(row.coupon_no, member).catch(() => null);
    /* 모르면 건드리지 않는다 — 쓴 쿠폰을 잔액으로 되돌리면 두 번 쓰게 된다 */
    if (used === null) continue;
    if (used) { await db.from('dividend_redemptions').update({ status: 'used' }).eq('id', row.id); continue; }
    await recaptureCoupon(row.coupon_no, member);
    await deleteCoupon(row.coupon_no).catch(() => undefined);
    await db.from('dividend_redemptions').update({ status: 'returned' }).eq('id', row.id);
  }
}

/**
 * 잔액 전부를 정액 할인 쿠폰 한 장으로 만들어 그 회원 쿠폰함에 넣는다.
 *
 * 한 번 결제에 쓸 수 있는 배당은 결제액의 MAX_DIVIDEND_RATE까지다. 쿠폰의 최소 주문금액을
 * 금액 ÷ 비율로 걸어 카페24가 막게 한다(1,500원 쿠폰이면 10,000원 이상 주문).
 */
async function issueBalance(member: string, at: Date): Promise<{ amount: number; minPrice: number; until: string } | { error: string; status: number }> {
  const db = supabase();
  if (!db) return { error: '저장소가 없어 쓸 수 없습니다.', status: 503 };
  const amount = await walletBalance(member, at);
  if (amount <= 0) return { error: '쓸 수 있는 배당금이 없어요.', status: 409 };

  /* 먼저 적는다 — 동시에 두 번 불려도 pending은 한 줄만 들어간다(0018 부분 unique) */
  const { data: row, error } = await db.from('dividend_redemptions').insert({ member, amount, status: 'pending' }).select('id').single();
  if (error) return { error: error.code === '23505' ? '쿠폰을 만드는 중이에요. 잠시 뒤 쿠폰함을 확인해 주세요.' : `기록 실패: ${error.message}`, status: 409 };

  const minPrice = Math.ceil(amount / MAX_DIVIDEND_RATE / 10) * 10;
  const until = redeemWindowEnd(at);
  let couponNo: string | null = null;
  try {
    couponNo = await createAmountCoupon({ name: `빵장 배당금 ${amount.toLocaleString()}원`, amount, begin: kstDateTime(at), end: until, minPrice });
    await issueCouponTo(couponNo, member);
    await db.from('dividend_redemptions').update({ status: 'issued', coupon_no: couponNo }).eq('id', row.id);
    return { amount, minPrice, until };
  } catch (cause) {
    const note = cause instanceof Error ? cause.message.slice(0, 500) : String(cause);
    /* 발급까지 못 갔으면 빈 쿠폰을 지우고 잔액을 되돌린다(failed는 잔액에서 빠지지 않는다) */
    if (couponNo) await deleteCoupon(couponNo).catch(() => undefined);
    await db.from('dividend_redemptions').update({ status: 'failed', coupon_no: couponNo, note }).eq('id', row.id);
    return { error: '쿠폰을 만들지 못했어요. 잠시 뒤 다시 해주세요.', status: 502 };
  }
}

const inHoliday = (at: Date) => ['holiday', 'test'].includes(marketHours(at).reason);

/**
 * 한 아이디의 쿠폰을 지금 상태에 맞춘다 — 자동 발급의 한 칸.
 *
 *   휴장일   새로 쌓인 배당금이 있으면, 나가 있는 쿠폰을 거두고 합친 금액으로 다시 한 장
 *   거래일   기한이 지난 쿠폰을 정리 — 안 썼으면 거둬서 잔액으로 돌린다
 *
 * 월말이 지나면 지난달 적립분은 잔액에 안 잡혀(walletBalance) 자연히 소멸한다.
 * 쿠폰 기한도 그달 말을 넘지 않는다(redeemWindowEnd).
 */
export async function refreshMember(member: string, at: Date = new Date()) {
  if (payoutMode() !== 'wallet') return null;
  if (!inHoliday(at)) { await settleOut(member, at, false); return null; }
  if ((await walletBalance(member, at)) <= 0) return null;
  await settleOut(member, at, true);
  return issueBalance(member, at);
}

/** 매일 00:05 크론 — 연결된 모든 아이디의 쿠폰을 맞춘다(api/cron/dividend) */
export async function syncCoupons(at: Date = new Date()) {
  const db = supabase();
  const report = { members: 0, issued: 0, errors: [] as string[] };
  if (!db || payoutMode() !== 'wallet') return report;
  const [{ data: links }, { data: out }] = await Promise.all([
    db.from('dividend_links').select('member'),
    db.from('dividend_redemptions').select('member').eq('status', 'issued'),
  ]);
  const members = [...new Set([...(links ?? []), ...(out ?? [])].map(row => row.member as string))];
  report.members = members.length;
  /* ponytail: 아이디마다 카페24 호출 몇 번 — 수백 명까지는 60초 안에 끝난다 */
  for (const member of members) {
    try {
      const result = await refreshMember(member, at);
      if (result && 'amount' in result) report.issued += 1;
      else if (result && 'error' in result && result.status >= 500) report.errors.push(`${member}: ${result.error}`);
    } catch (cause) {
      report.errors.push(`${member}: ${cause instanceof Error ? cause.message.slice(0, 200) : String(cause)}`);
    }
  }
  return report;
}

/** 손님이 "지금 받기"를 누를 때 — 크론을 기다리지 않고 그 자리에서 맞춘다 */
export async function redeem(visitor: string, at: Date = new Date()): Promise<{ amount: number; minPrice: number; until: string } | { error: string; status: number }> {
  if (payoutMode() !== 'wallet') return { error: '배당금 쓰기를 준비 중이에요.', status: 503 };
  if (!inHoliday(at)) return { error: '배당금은 휴장일에 정가로 살 때 써요. 평일엔 빵장 할인을 이용해 주세요.', status: 409 };
  const member = await linkedMember(visitor);
  if (!member) return { error: '먼저 배당 받을 자사몰 아이디를 연결해 주세요.', status: 400 };
  const result = await refreshMember(member, at);
  return result ?? { error: '쓸 수 있는 배당금이 없어요.', status: 409 };
}
