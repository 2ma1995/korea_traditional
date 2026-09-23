import { PRODUCTS } from '@/data/products';
import { seoulDateString } from '@/lib/market';
import { supabase } from '@/lib/supabase';

/**
 * 공모 — 다음에 나올 빵을 손님이 청약으로 정한다.
 *
 * 2026-09-21에 절기 자동 편성을 걷어냈다. 전에는 황경으로 회차를 끊고 제철
 * 재료에서 후보를 기계적으로 만들었는데, 현직자 지적이 정확했다 —
 * "백로에 포도 띄우고 포도 상품이 없으면 그건 죽은 데이터."
 * 기업이 실제로 만들 수 있는 빵만 후보에 올라야 공모가 지킬 수 있는 약속이 된다.
 *
 * 그래서 지금은 **회차도 후보도 관리자가 직접 넣는다**(api/admin/ipo/rounds).
 * 열린 회차가 없으면 null이고, 화면은 공모 섹션을 통째로 감춘다 —
 * 빈 회차를 억지로 만들어 "후보 없음"을 보여주지 않는다.
 *
 * 청약 자격은 여전히 '오늘 빵을 산 사람'이다(lib/bidRight). 구매가 증거금 역할을
 * 하고, 그래야 투표지가 아니라 공모가 된다.
 *
 * ⚠️ 저장소가 없으면 메모리로 받는다 — 로컬에서도 회차를 만들고 확인할 수 있어야 한다.
 */

export interface IpoCandidate {
  /** 회차 안에서만 유일하면 된다. 청약 기록(ipo_bids.candidate)이 이 값을 쓴다 */
  id: string;
  name: string;
  /** 왜 이 후보인가. 비어 있을 수 있다 */
  note: string;
  /** 자사몰에 이미 있는 상품이면 번호, 아직 없는 신제품이면 null */
  productNo: number | null;
  /** 재입고 후보의 정가. products.ts에서 채운다 */
  listPrice: number | null;
  /** 첫 출시 수량. 경쟁률의 분모 */
  allotment: number;
}

export interface IpoRound {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  opensOn: string;
  closesOn: string;
  /** 마감까지 남은 날. 오늘 마감이면 0 */
  daysLeft: number;
  /** 손님에게 던지는 질문 */
  ask: string;
  candidates: IpoCandidate[];
}

export interface IpoCounts {
  counts: Record<string, number>;
  /** 이 중 샘플이 몇 건인가 */
  demo: number;
  /** 저장소에 닿았는가. false면 메모리 폴백(이번 서버 세션만) */
  live: boolean;
}

/** 후보 수량 기본값 — 기업 협의로 바뀔 값 */
export const DEFAULT_ALLOTMENT = 30;
const DEFAULT_ASK = '다음엔 어떤 빵이 좋을까요?';

const missingTable = (code?: string) => code === 'PGRST205' || code === '42P01' || code === 'PGRST202';

/* ── 메모리 폴백 ─────────────────────────────────────────────────────────── */
const memRounds = new Map<string, IpoRound>();
const memCounts = new Map<string, Record<string, number>>();

const daysBetween = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);

/** 정가는 products.ts에서 채운다 — 관리자가 손으로 적게 하면 또 묵는다 */
const priceOf = (productNo: number | null) =>
  productNo === null ? null : (PRODUCTS.find(p => p.productNo === productNo)?.price ?? null);

function shape(row: {
  id: string; name: string; opens_on: string; closes_on: string; ask: string | null;
}, candidates: IpoCandidate[], today: string): IpoRound {
  return {
    id: row.id,
    name: row.name,
    opensOn: row.opens_on,
    closesOn: row.closes_on,
    daysLeft: Math.max(0, daysBetween(today, row.closes_on)),
    ask: row.ask?.trim() || DEFAULT_ASK,
    candidates,
  };
}

/**
 * 지금 열려 있는 회차. 없으면 null.
 *
 * 기간이 겹치는 회차가 둘 이상이면 늦게 시작한 것을 쓴다 — 관리자가 새 회차를
 * 만들었는데 옛 회차가 안 닫혀 있는 상황에서, 새 것이 보이는 쪽이 덜 놀랍다.
 */
export async function currentRound(at: Date = new Date()): Promise<IpoRound | null> {
  const today = seoulDateString(at);
  const db = supabase();

  if (!db) return memoryRound(today);

  const { data, error } = await db
    .from('ipo_rounds')
    .select('id, name, opens_on, closes_on, ask')
    .lte('opens_on', today)
    .gte('closes_on', today)
    .order('opens_on', { ascending: false })
    .limit(1);

  if (error) {
    if (missingTable(error.code)) return memoryRound(today);
    return null;
  }
  const row = data?.[0];
  if (!row) return null;

  const { data: rows } = await db
    .from('ipo_candidates')
    .select('id, name, note, product_no, allotment, sort')
    .eq('round_id', row.id)
    .order('sort', { ascending: true });

  const candidates = (rows ?? []).map<IpoCandidate>(c => ({
    id: c.id,
    name: c.name,
    note: c.note ?? '',
    productNo: c.product_no ?? null,
    listPrice: priceOf(c.product_no ?? null),
    allotment: c.allotment ?? DEFAULT_ALLOTMENT,
  }));

  /* 후보가 없는 회차는 열지 않는다 — 고를 것이 없는 공모는 공모가 아니다 */
  if (!candidates.length) return null;
  return shape(row, candidates, today);
}

function memoryRound(today: string): IpoRound | null {
  const open = [...memRounds.values()]
    .filter(r => r.opensOn <= today && r.closesOn >= today && r.candidates.length > 0)
    .sort((a, b) => (a.opensOn < b.opensOn ? 1 : -1));
  const round = open[0];
  if (!round) return null;
  return { ...round, daysLeft: Math.max(0, daysBetween(today, round.closesOn)) };
}

/* ── 관리자 편집 ─────────────────────────────────────────────────────────── */

export interface RoundInput {
  id?: string;
  name: string;
  opensOn: string;
  closesOn: string;
  ask?: string;
  candidates: { id?: string; name: string; note?: string; productNo?: number | null; allotment?: number }[];
}

/** 'r20260922' — 읽어서 언제 열린 회차인지 알 수 있게 만든다 */
const makeId = (opensOn: string) => `r${opensOn.replaceAll('-', '')}`;

export async function listRounds(): Promise<{ rounds: IpoRound[]; stored: boolean }> {
  const today = seoulDateString();
  const db = supabase();
  if (!db) return { rounds: [...memRounds.values()].map(r => ({ ...r })), stored: false };

  const { data, error } = await db
    .from('ipo_rounds')
    .select('id, name, opens_on, closes_on, ask')
    .order('opens_on', { ascending: false });
  if (error) return { rounds: [...memRounds.values()].map(r => ({ ...r })), stored: false };

  const { data: cands } = await db
    .from('ipo_candidates')
    .select('round_id, id, name, note, product_no, allotment, sort')
    .order('sort', { ascending: true });

  const byRound = new Map<string, IpoCandidate[]>();
  for (const c of cands ?? []) {
    const list = byRound.get(c.round_id) ?? [];
    list.push({
      id: c.id, name: c.name, note: c.note ?? '',
      productNo: c.product_no ?? null, listPrice: priceOf(c.product_no ?? null),
      allotment: c.allotment ?? DEFAULT_ALLOTMENT,
    });
    byRound.set(c.round_id, list);
  }
  return { rounds: (data ?? []).map(r => shape(r, byRound.get(r.id) ?? [], today)), stored: true };
}

/** 회차 하나를 통째로 저장한다. 후보는 지우고 다시 넣는다 — 순서 변경도 편집이다 */
export async function saveRound(input: RoundInput): Promise<{ id: string; stored: boolean }> {
  const today = seoulDateString();
  const id = input.id?.trim() || makeId(input.opensOn);
  const candidates = input.candidates.map<IpoCandidate>((c, i) => ({
    id: c.id?.trim() || `c${i + 1}`,
    name: c.name,
    note: c.note ?? '',
    productNo: c.productNo ?? null,
    listPrice: priceOf(c.productNo ?? null),
    allotment: c.allotment ?? DEFAULT_ALLOTMENT,
  }));

  const db = supabase();
  if (!db) {
    memRounds.set(id, shape(
      { id, name: input.name, opens_on: input.opensOn, closes_on: input.closesOn, ask: input.ask ?? null },
      candidates, today,
    ));
    return { id, stored: false };
  }

  const { error } = await db.from('ipo_rounds').upsert({
    id, name: input.name, opens_on: input.opensOn, closes_on: input.closesOn, ask: input.ask?.trim() || null,
  }, { onConflict: 'id' });
  if (error) {
    if (missingTable(error.code)) {
      memRounds.set(id, shape(
        { id, name: input.name, opens_on: input.opensOn, closes_on: input.closesOn, ask: input.ask ?? null },
        candidates, today,
      ));
      return { id, stored: false };
    }
    throw new Error(`회차 저장 실패: ${error.message}`);
  }

  /* 새 목록을 먼저 넣고, 빠진 후보만 지운다. 지우고 넣으면 넣기가 실패했을 때
     (중복 id 등) 회차의 후보가 통째로 사라진다 */
  if (candidates.length) {
    const { error: cErr } = await db.from('ipo_candidates').upsert(candidates.map((c, i) => ({
      round_id: id, id: c.id, name: c.name, note: c.note || null,
      product_no: c.productNo, allotment: c.allotment, sort: i,
    })), { onConflict: 'round_id,id' });
    if (cErr) throw new Error(`후보 저장 실패: ${cErr.message}`);
  }
  const keep = new Set(candidates.map(c => c.id));
  const { data: before } = await db.from('ipo_candidates').select('id').eq('round_id', id);
  const stale = (before ?? []).map(row => row.id as string).filter(cid => !keep.has(cid));
  if (stale.length) {
    const { error: dErr } = await db.from('ipo_candidates').delete().eq('round_id', id).in('id', stale);
    if (dErr) throw new Error(`빠진 후보 정리 실패: ${dErr.message}`);
  }
  return { id, stored: true };
}

export async function deleteRound(id: string): Promise<{ stored: boolean }> {
  const db = supabase();
  if (!db) { memRounds.delete(id); return { stored: false }; }
  const { error } = await db.from('ipo_rounds').delete().eq('id', id);
  if (error && !missingTable(error.code)) throw new Error(`회차 삭제 실패: ${error.message}`);
  memRounds.delete(id);
  return { stored: !error };
}

/* ── 청약 ────────────────────────────────────────────────────────────────── */

export async function loadIpoCounts(round: IpoRound): Promise<IpoCounts> {
  const db = supabase();
  const empty = Object.fromEntries(round.candidates.map(c => [c.id, 0]));

  if (!db) {
    const counts = { ...empty, ...(memCounts.get(round.id) ?? {}) };
    return { counts, demo: 0, live: false };
  }

  const { data, error } = await db.from('ipo_bids').select('candidate, demo').eq('round', round.id);
  if (error || !data) return { counts: empty, demo: 0, live: false };

  const counts = { ...empty };
  let demo = 0;
  for (const row of data as { candidate: string; demo: boolean }[]) {
    if (row.candidate in counts) counts[row.candidate] += 1;
    if (row.demo) demo += 1;
  }
  return { counts, demo, live: true };
}

/**
 * 청약을 넣는다.
 *
 * @param member 자사몰 회원 ID. 당첨 시 쿠폰을 보낼 곳이라 필요하다 —
 *   이 서비스에는 로그인이 없어 손님이 직접 적는다. 목적이 끝나면(쿠폰 발급)
 *   지워야 하는 개인정보다(0009 주석).
 */
export async function bidIpo(round: IpoRound, candidate: string, member: string, fillId: number | null = null): Promise<IpoCounts | { refused: string }> {
  const db = supabase();
  if (!db) {
    const counts = memCounts.get(round.id) ?? {};
    counts[candidate] = (counts[candidate] ?? 0) + 1;
    memCounts.set(round.id, counts);
    return loadIpoCounts(round);
  }
  /* 구매가 증거금이다 — 청약권을 준 예약이 결제 없이 반납됐으면 받지 않는다 */
  if (fillId === null) return { refused: '오늘 빵을 사면 청약할 수 있어요.' };
  const { data: fill } = await db.from('fills').select('settled').eq('id', fillId).maybeSingle();
  if (!fill || fill.settled === 'expired') return { refused: '결제하지 않고 반납된 예약이라 청약권이 사라졌어요.' };

  const row = { round: round.id, candidate, demo: false, member, fill_id: fillId };
  let { error } = await db.from('ipo_bids').insert(row);
  /* 0016 전인 DB — 서명이 위조는 막으니 한 예약 한 청약 없이 예전처럼 넣는다 */
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    ({ error } = await db.from('ipo_bids').insert({ ...row, fill_id: undefined }));
  }
  /* 같은 예약으로 두 번째 청약 — 쿠키를 되돌려 다시 냈거나 동시에 두 번 눌렀다 */
  if (error?.code === '23505') return { refused: '오늘은 이미 청약했습니다.' };
  if (error) throw new Error(`청약 저장 실패: ${error.message}`);
  return loadIpoCounts(round);
}
