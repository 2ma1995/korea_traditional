-- ============================================================================
-- 지금 실행할 SQL — 0005 · 0006 · 0007 한 장
--
--   어디서   Supabase 대시보드 → SQL Editor → 붙여넣고 Run
--   무엇을   예약(fills) · 공모 청약(ipo_bids) · 관심 담기(watches)
--   왜       셋 다 지금은 **서버 메모리에만** 저장된다. 서버가 재시작되면 사라진다.
--            화면은 정상 동작하고 "이번 서버 세션의 메모리에만 기록됩니다"라고 밝힌다.
--
--   ⚠️ 여러 번 돌려도 안전하다 — 전부 if not exists / add column if not exists다.
--      중간에 실패하면 통째로 되돌아가니(begin~commit) 고쳐서 다시 돌리면 된다.
--
--   이미 들어가 있어야 하는 것: 0001~0004 (daily_plans · discount_tiers ·
--   product_links · cafe24_tokens). 맨 아래 확인 쿼리가 빠진 것을 알려준다.
--
--   설계 의도 전문은 supabase/migrations/0005_fills.sql · 0006_ipo.sql ·
--   0007_watches.sql에 있다. 여기는 실행용 사본이다.
-- ============================================================================

begin;

-- ── 0005 · 예약 ─────────────────────────────────────────────────────────────
-- 한정 호가의 선착순 즉시 체결. 두 사람이 마지막 1개를 같은 순간에 누를 수 있어
-- slot(순번)에 unique를 건다. 채워진 수 + 1을 slot으로 넣으면 한 명이 unique
-- 위반으로 튕기고, 튕긴 쪽은 다시 세서 한 번 더 시도한다. 잠금 없이 원자성을
-- 얻는 가장 싼 방법이다.
--
-- 개인 식별 값은 없다. 누가 샀는지는 자사몰 주문이 안다.
create table if not exists fills (
  id         bigserial   primary key,
  day        date        not null,
  product_no integer     not null,
  -- 정가 대비 할인 폭. 0.150 = 15%
  depth      numeric(4,3) not null check (depth > 0 and depth < 1),
  -- 이 칸에서 몇 번째 체결인가. 1부터
  slot       smallint    not null check (slot >= 1),
  created_at timestamptz not null default now(),
  unique (day, product_no, depth, slot)
);

comment on table fills is '한정 호가 체결 기록. (day, product_no, depth, slot) unique로 선착순 경합을 막는다';

create index if not exists fills_day_product_idx on fills (day, product_no);


-- ── 0006 · 공모 청약 ────────────────────────────────────────────────────────
-- 다음 절기빵 후보에 청약 → 경쟁률 매일 공개 → 1위 출시.
-- 개인 식별 값은 없다. 청약 자격은 서버 발급 HttpOnly 쿠키로 확인한다(lib/bidRight).
create table if not exists ipo_bids (
  id         bigserial   primary key,
  -- 회차. "2026-180" = 2026년 황경 180도(추분)
  round      text        not null,
  candidate  text        not null,
  -- 화면 확인용 샘플인가. 진짜 청약과 구분해 화면에 밝힌다
  demo       boolean     not null default false,
  created_at timestamptz not null default now()
);

comment on table ipo_bids is '절기빵 공모주 청약. 회차·후보만 저장, 개인 식별 값 없음';

create index if not exists ipo_bids_round_idx on ipo_bids (round);

-- 2026-09-18 재설계 — 회차 모드. 'restock'(품절 재입고) / 'new'(절기 신제품).
-- "어느 쪽 참여가 높았나"가 다음 회차 구성의 근거가 된다.
-- ⚠️ 코드(lib/ipo.ts)가 insert에 mode를 넣는다. 이 줄이 빠지면 청약이 전부 실패한다.
alter table ipo_bids add column if not exists mode text;


-- ── 0007 · 관심 담기 ────────────────────────────────────────────────────────
-- 수요 보정(+3%p)의 분모. 최근 7일 전환율(체결 ÷ 관심)이 그 빵의 보정을 정한다.
--
-- '몇 번 담겼나'가 아니라 '몇 명이 담았나'로 센다. 스테퍼로 수량을 5로 올린 한
-- 사람을 표본 5로 세면 분모만 부풀어 그 빵이 근거 없이 싸진다. 할인은 실제
-- 돈이므로 (day, product_no, visitor)에 unique를 걸어 사람 단위로 센다.
--
-- visitor는 서버가 발급한 난수다(lib/visitor.ts). 누구인지는 모르고 같은
-- 브라우저인지만 안다.
create table if not exists watches (
  id         bigserial   primary key,
  day        date        not null,
  product_no integer     not null,
  -- 서버 발급 난수. 개인 정보가 아니라 중복 제거용 표식이다
  visitor    text        not null,
  created_at timestamptz not null default now(),
  unique (day, product_no, visitor)
);

comment on table watches is '관심 담기 기록. (day, product_no, visitor) unique로 사람 단위로 센다. 수요 보정의 분모';

create index if not exists watches_day_product_idx on watches (day, product_no);


-- ── 권한 · RLS ──────────────────────────────────────────────────────────────
-- RLS는 정책 없이 켜 둔다. anon 키로는 아무것도 안 보이고 service_role만 통과한다.
-- 서버만 이 표들을 읽고 쓴다(lib/supabase.ts).
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table fills    enable row level security;
alter table ipo_bids enable row level security;
alter table watches  enable row level security;

commit;


-- ============================================================================
-- 확인 — 코드가 쓰는 표 일곱 개가 다 있는가
-- 없는 것이 위로 올라온다. fills·ipo_bids·watches 말고 다른 게 ❌면
-- 0001~0004 중 안 돌아간 것이 있다는 뜻이다.
-- ============================================================================
select
  expected.name                                         as "표",
  case when c.oid is null then '❌ 없음' else '✅ 있음' end as "상태",
  expected.made_by                                      as "만드는 마이그레이션",
  expected.used_by                                      as "쓰는 곳"
from (values
  ('fills',          '0005', '예약 — lib/fills.ts'),
  ('ipo_bids',       '0006', '공모 청약 — lib/ipo.ts'),
  ('watches',        '0007', '관심 담기 — lib/watches.ts'),
  ('daily_plans',    '0001', '자사몰 가격 복원 근거 — lib/priceSync.ts'),
  ('cafe24_tokens',  '0001', '카페24 토큰 — lib/cafe24.ts'),
  ('discount_tiers', '0002', '할인 구간 — lib/settings.ts'),
  ('product_links',  '0002', '상품 링크 — api/admin/links')
) as expected(name, made_by, used_by)
left join pg_class c
  on  c.relname     = expected.name
  and c.relnamespace = 'public'::regnamespace
  and c.relkind      = 'r'
order by (c.oid is null) desc, expected.name;

-- ipo_bids.mode 컬럼까지 들어갔는지 (이게 없으면 청약 insert가 전부 실패한다)
select
  case when count(*) = 1 then '✅ ipo_bids.mode 있음' else '❌ ipo_bids.mode 없음' end as "mode 컬럼"
from information_schema.columns
where table_schema = 'public' and table_name = 'ipo_bids' and column_name = 'mode';
