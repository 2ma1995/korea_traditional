-- ============================================================================
-- 지금 실행할 SQL — 0005 ~ 0012 한 장
--
--   어디서   Supabase 대시보드 → SQL Editor → 붙여넣고 Run
--   무엇을   예약(fills) · 공모 청약(ipo_bids) · 관심 담기(watches)
--            운영 스위치(app_settings) · 공모 회차(ipo_rounds · ipo_candidates)
--            주말 배당 재료(fills.visitor · visits) · 할인코드(coupons)
--            예약 결제 기한(fills.expires_at · settled)
--   왜       없으면 전부 **서버 메모리에만** 저장된다. 서버가 재시작되면 사라진다.
--            화면은 정상 동작하고 "이번 서버 세션의 메모리에만 기록됩니다"라고 밝힌다.
--
--   ⚠️ 여러 번 돌려도 안전하다 — 전부 if not exists / add column if not exists다.
--      중간에 실패하면 통째로 되돌아가니(begin~commit) 고쳐서 다시 돌리면 된다.
--
--   이미 들어가 있어야 하는 것: 0001~0004 (daily_plans · discount_tiers ·
--   product_links · cafe24_tokens). 맨 아래 확인 쿼리가 빠진 것을 알려준다.
--
--   설계 의도 전문은 supabase/migrations/ 의 각 파일에 있다. 여기는 실행용 사본이다.
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


-- ── 0008 · 운영 스위치 ──────────────────────────────────────────────────────
-- 관리자가 화면에서 껐다 켜는 값. 지금은 공모주 노출 하나다.
-- 코드 상수(ALWAYS_OPEN · PRICE_SYNC_ENABLED)와 역할이 다르다 — 그 둘은 켜면
-- 진짜 자사몰 가격이 바뀌는 값이라 관리자 화면에 두지 않는다.
create table if not exists app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table app_settings is '관리자가 운영 중에 바꾸는 스위치. 값 모양은 lib/appSettings.ts가 검증한다';


-- ── 0009 · 공모 회차 ────────────────────────────────────────────────────────
-- 절기 자동 편성을 걷어내고 막지가 직접 회차를 연다.
-- 현직자 지적이 근거다 — "백로에 포도 띄우고 포도 상품이 없으면 그건 죽은 데이터."
-- 기업이 실제로 만들 수 있는 빵만 후보에 올라야 지킬 수 있는 약속이 된다.
-- 열린 회차가 없으면 손님 화면에서 공모 섹션이 아예 안 뜬다.
create table if not exists ipo_rounds (
  id         text        primary key,
  name       text        not null,
  opens_on   date        not null,
  closes_on  date        not null,
  ask        text,
  created_at timestamptz not null default now(),
  check (closes_on >= opens_on)
);

comment on table ipo_rounds is '공모 회차. 관리자가 기간을 직접 정한다(절기 자동 편성 폐기)';

create index if not exists ipo_rounds_window_idx on ipo_rounds (opens_on, closes_on);

create table if not exists ipo_candidates (
  round_id   text     not null references ipo_rounds(id) on delete cascade,
  id         text     not null,
  name       text     not null,
  note       text,
  product_no integer,
  allotment  smallint not null default 30,
  sort       smallint not null default 0,
  primary key (round_id, id)
);

comment on table ipo_candidates is '회차별 후보 빵. 막지가 직접 넣고 뺀다';

-- ⚠️ 개인정보가 들어오는 자리다. 0006은 "개인 식별 값은 없다"고 적어 두었는데
--    그 전제가 여기서 깨진다 — 당첨자에게 쿠폰을 주려면 누구인지 알아야 하고,
--    이 서비스에는 로그인이 없어 자사몰 회원 ID를 직접 받는다.
--      · 청약 폼에 수집·이용 목적과 보유 기간을 적는다(개인정보처리방침 포함)
--      · 쿠폰 발급이 끝난 회차의 member는 지운다
--      · 이 열은 서버(service_role)만 읽는다
alter table ipo_bids add column if not exists member text;
comment on column ipo_bids.member is '자사몰 회원 ID. 당첨 쿠폰 발급 목적으로만 쓰고 발급 후 삭제한다';


-- ── 0010 · 주말 배당 ────────────────────────────────────────────────────────
-- 주간 활동점수의 재료 둘. 관심빵(0007)은 이미 사람 단위로 세고 있다.
alter table fills add column if not exists visitor text;
comment on column fills.visitor is '서버 발급 난수(lib/visitor.ts). 0010 이전 기록은 null';
create index if not exists fills_visitor_day_idx on fills (visitor, day);

create table if not exists visits (
  id         bigserial   primary key,
  day        date        not null,
  visitor    text        not null,
  created_at timestamptz not null default now(),
  unique (day, visitor)
);
comment on table visits is '거래일 출석. (day, visitor) unique로 하루 1회만 센다';
create index if not exists visits_visitor_day_idx on visits (visitor, day);
alter table visits enable row level security;

-- ── 0011 · 할인코드 ────────────────────────────────────────────────────────
-- 설계도 최상단의 문제를 푸는 자리다 — "싸다고 보여주고 정가로 보낸다."
-- 예약이 잡히면 그 폭만큼의 코드를 카페24에서 발급해 손님에게 준다.
-- 자사몰 판매가는 건드리지 않는다.
--
-- §9는 쿠폰을 "회원 계정에 발급되는 구조라 로그인 없이는 못 쓴다"고 접었는데,
-- 2026-09-22에 체험몰에서 확인한 결과 절반만 맞았다 — 발급에는 회원 식별이
-- 필요 없고, 손님은 자사몰에서 코드를 입력하면 된다.
--
-- 개인 식별 값은 없다. 누가 받았는지는 자사몰 주문이 안다.
create table if not exists coupons (
  id         bigserial   primary key,
  day        date        not null,
  product_no integer     not null,
  code       text        not null unique,
  -- 정가 대비 할인 폭. 0.300 = 30%
  rate       numeric(4,3) not null check (rate > 0 and rate < 1),
  -- 카페24가 매긴 번호. 회수·조회할 때 쓴다
  cafe24_no  integer,
  expires_on date        not null,
  created_at timestamptz not null default now()
);

comment on table coupons is '예약 시 발급한 카페24 할인코드. 개인 식별 값 없음';

create index if not exists coupons_day_idx on coupons (day, product_no);


-- ── 0012 · 예약 결제 기한 ───────────────────────────────────────────────────
-- 예약은 결제가 아니다. 결제하지 않은 사람이 자리를 붙들면 살 사람이 못 사고,
-- 자사몰 재고까지 차감하면 그 손해가 빵장 밖으로 나간다.
-- 그래서 예약에 1시간 기한을 준다(단 빵장 마감 24:00을 넘기지 않는다).
--   결제함    할인코드의 issued_count가 1  → 확정
--   미결제    1시간이 지나도 0           → 자리 반납 · 카페24 재고 복원 · 코드 삭제
--
-- 정리는 크론이 아니라 요청이 들어올 때 한다. Vercel 무료 플랜 크론은 하루 한 번만
-- 돌아 1시간 주기를 맡길 수 없고, 빵장은 장중에 사람이 계속 들어와 그 방문이 타이머가 된다.
alter table fills add column if not exists expires_at  timestamptz;
alter table fills add column if not exists settled     text not null default 'open';
alter table fills add column if not exists coupon_code text;

comment on column fills.expires_at  is '결제 기한. 지나고 미결제면 자리를 반납한다';
comment on column fills.settled     is 'open · paid · expired';
comment on column fills.coupon_code is '이 예약에 발급된 할인코드. 결제 확인에 쓴다';

-- ⚠️ slot에서 not null을 뗀다.
-- slot은 (day, product_no, depth, slot) unique로 선착순 경합을 막는 장치인데(0005),
-- 반납으로 번호가 비면 다음 사람이 같은 번호에서 튕긴다 — 자리가 남았는데도.
-- 반납한 줄은 slot을 null로 비운다. Postgres는 unique에서 null을 서로 다른 값으로 보므로
-- 여러 줄이 null이어도 충돌하지 않고, 줄은 남아 "몇 명이 예약만 하고 안 샀나"를 답한다.
alter table fills alter column slot drop not null;

create index if not exists fills_live_idx on fills (day, product_no, settled);


-- ── 권한 · RLS ──────────────────────────────────────────────────────────────
-- RLS는 정책 없이 켜 둔다. anon 키로는 아무것도 안 보이고 service_role만 통과한다.
-- 서버만 이 표들을 읽고 쓴다(lib/supabase.ts).
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table fills          enable row level security;
alter table ipo_bids       enable row level security;
alter table watches        enable row level security;
alter table app_settings   enable row level security;
alter table ipo_rounds     enable row level security;
alter table ipo_candidates enable row level security;
alter table coupons        enable row level security;

commit;


-- ============================================================================
-- 확인 — 한 번에 본다. ❌가 하나라도 있으면 그 줄의 '만드는 것'을 다시 돌린다.
--
--   표          코드가 여는 열 개
--   붙는 열      표가 있어도 열이 빠지면 insert가 통째로 실패한다
-- ============================================================================
select * from (
  -- ① 표
  select
    1                                                       as "순서",
    expected.name                                           as "확인 대상",
    case when c.oid is null then '❌ 없음' else '✅ 있음' end  as "상태",
    expected.made_by                                        as "만드는 것",
    expected.used_by                                        as "쓰는 곳"
  from (values
    ('fills',          '0005', '예약 — lib/fills.ts'),
    ('ipo_bids',       '0006', '공모 청약 — lib/ipo.ts'),
    ('watches',        '0007', '관심 담기 — lib/watches.ts'),
    ('app_settings',   '0008', '운영 스위치 — lib/appSettings.ts'),
    ('ipo_rounds',     '0009', '공모 회차 — lib/ipo.ts'),
    ('ipo_candidates', '0009', '후보 빵 — lib/ipo.ts'),
  ('coupons',        '0011', '할인코드 — lib/coupon.ts'),
    ('visits',         '0010', '거래일 출석 — lib/visits.ts'),
    ('daily_plans',    '0001', '자사몰 가격 복원 — lib/priceSync.ts'),
    ('cafe24_tokens',  '0001', '카페24 토큰 — lib/cafe24.ts'),
    ('discount_tiers', '0002', '할인 구간 — lib/settings.ts'),
    ('product_links',  '0002', '상품 링크 — api/admin/links')
  ) as expected(name, made_by, used_by)
  left join pg_class c
    on  c.relname      = expected.name
    and c.relnamespace = 'public'::regnamespace
    and c.relkind      = 'r'

  union all

  -- ② 표에 붙는 열 — 표 목록만 봐서는 빠진 걸 못 잡는다
  select
    2,
    want.label,
    case when count(col.column_name) = 1 then '✅ 있음' else '❌ 없음' end,
    want.made_by,
    want.used_by
  from (values
    ('ipo_bids', 'mode',    'ipo_bids.mode',    '0006', '회차 모드 — 없으면 청약 insert 실패'),
    ('ipo_bids', 'member',  'ipo_bids.member',  '0006', '청약자 — lib/ipo.ts'),
    ('fills',    'visitor', 'fills.visitor',    '0010', '구매 표식 — 주간 활동점수')
  ) as want(tbl, col, label, made_by, used_by)
  left join information_schema.columns col
    on  col.table_schema = 'public'
    and col.table_name   = want.tbl
    and col.column_name  = want.col
  group by want.label, want.made_by, want.used_by
) as checks
order by "상태" desc, "순서", "확인 대상";
