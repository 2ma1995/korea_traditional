-- ============================================================================
-- 지금 실행할 SQL — 0001 ~ 0017 한 장 (새 창고든 쓰던 창고든 이것 하나만 돌린다)
--
--   어디서   Supabase 대시보드 → SQL Editor → 붙여넣고 Run
--   무엇을   예약(fills) · 공모 청약(ipo_bids) · 관심 담기(watches)
--            운영 스위치(app_settings) · 공모 회차(ipo_rounds · ipo_candidates)
--            주말 배당 재료(fills.visitor · visits) · 할인코드(coupons)
--            예약 결제 기한(fills.expires_at · settled) · 웹 푸시(push_subscriptions)
--            한 예약 한 청약(ipo_bids.fill_id) · 한 IP 자리 한도(fills.ip_hash)
--   범위     0001 ~ 0017, 0003·0004 제외 (migrations/ 폴더와 같다 — 새 마이그레이션을 만들면 여기도 붙인다)
--   왜       없으면 전부 **서버 메모리에만** 저장된다. 서버가 재시작되면 사라진다.
--            화면은 정상 동작하고 "이번 서버 세션의 메모리에만 기록됩니다"라고 밝힌다.
--
--   ⚠️ 여러 번 돌려도 안전하다 — 전부 if not exists / add column if not exists다.
--      0001·0002의 create type은 이미 있으면 건너뛰고, create trigger는
--      create or replace trigger로 바꿔 같은 정의로 덮어쓴다.
--      중간에 실패하면 통째로 되돌아가니(begin~commit) 고쳐서 다시 돌리면 된다.
--
--   0003·0004(settlement_events)는 넣지 않았다 — 지금 코드가 쓰지 않는 표다.
--   맨 아래 확인 쿼리가 빠진 것을 알려준다.
--
--   설계 의도 전문은 supabase/migrations/ 의 각 파일에 있다. 여기는 실행용 사본이다.
-- ============================================================================

begin;

-- ── 0001 · 카페24 토큰 · 대회 출품 · 일일 할인안 ─────────────────────────────────────────────────────────────
-- 막지 절기상점 — 초기 스키마
--
-- 이 파일이 저장소에 있으면 어느 Supabase 계정에서든 같은 구조를 다시 만들 수 있다.
-- 나중에 기업 계정으로 넘길 때 "프로젝트 이전"이 막히더라도 이 파일로 새로 세우면 된다.
--
-- 접근 방식: 모든 읽기·쓰기를 Next.js 서버(서비스 롤 키)에서만 한다.
--   브라우저에서 직접 Supabase를 부르지 않으므로 anon 키를 배포에 넣지 않고,
--   RLS는 전부 거부 상태로 둔다. 서비스 롤은 RLS를 우회한다.
--   나중에 브라우저에서 직접 읽을 일이 생기면 그때 정책을 하나씩 연다.

-- ─────────────────────────────────────────────
-- 1. 카페24 토큰
--
-- access_token 2시간, refresh_token 2주. 서버리스라 메모리에 둘 수 없어 여기 보관한다.
-- 몰 하나만 쓰더라도 mall_id를 키로 둔다 — 체험몰 → 실제 자사몰로 옮길 때
-- 행만 하나 더 넣으면 되고, 기존 토큰을 덮어써 잃는 일이 없다.
-- ─────────────────────────────────────────────
create table if not exists cafe24_tokens (
  mall_id        text primary key,
  access_token   text        not null,
  refresh_token  text        not null,
  -- access_token 만료 시각. 이 시각 전에 갱신한다
  expires_at     timestamptz not null,
  -- refresh_token 만료 시각. 지나면 사용자가 다시 인증해야 한다
  refresh_expires_at timestamptz,
  scope          text,
  updated_at     timestamptz not null default now()
);

comment on table cafe24_tokens is '카페24 OAuth 토큰. 서버에서만 접근한다';

-- ─────────────────────────────────────────────
-- 2. 대회 출품
--
-- 멘션 웹훅으로 들어온 게시물과 관리자가 직접 넣은 게시물이 같은 표에 쌓인다.
-- 관리자가 approved로 바꾼 것만 손님 화면에 나간다.
-- ─────────────────────────────────────────────
do $$ begin create type entry_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists contest_entries (
  id             uuid primary key default gen_random_uuid(),
  -- Graph API IG Media id. 좋아요 재동기화의 키.
  -- 같은 게시물이 웹훅으로 두 번 와도 한 행만 남게 unique를 건다
  media_id       text        not null unique,
  permalink      text        not null,
  username       text,
  -- 작성자가 좋아요 수를 숨기면 API가 값을 주지 않는다 → null
  like_count     integer,
  like_count_at  timestamptz,
  title          text        not null,
  -- 빵 카테고리 = 막지 제품 번호. 제품명이 아니라 번호로 묶는다
  product_no     integer     not null,
  toppings       text[]      not null default '{}',
  note           text,
  status         entry_status not null default 'pending',
  -- 어디서 찾았는지: 멘션 / 수동 등록
  source_tag     text,
  -- 어느 절기 회차인지. 태양 황경(0, 15, 30 …)
  term_longitude integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 검수 화면은 항상 '대기 먼저, 최근 먼저'로 훑는다
create index if not exists contest_entries_status_idx
  on contest_entries (status, created_at desc);
-- 카테고리별 순위 조회
create index if not exists contest_entries_rank_idx
  on contest_entries (term_longitude, product_no, like_count desc);

comment on table contest_entries is '절기 조리법 대회 출품. approved만 노출한다';

-- ─────────────────────────────────────────────
-- 3. 일일 할인안 (승인 큐)
--
-- 코스피로 자동 생성한 할인안을 담당자가 승인해야 손님 화면에 나간다.
-- items를 jsonb로 통째 저장한다 — 승인 당시의 가격을 그대로 보존해야
-- 나중에 제품 가격이 바뀌어도 "그날 무엇을 얼마에 걸었는지"가 남는다.
-- ─────────────────────────────────────────────
do $$ begin create type plan_status as enum ('draft', 'approved', 'published', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists daily_plans (
  -- 하루 한 건. 같은 날 재생성은 갱신이다
  plan_date      date primary key,
  -- 적용 할인율 (0.30 = 30%)
  rate           numeric(4,3) not null,
  kospi_change   numeric(6,3),
  headline       text        not null,
  reason         text,
  items          jsonb       not null default '[]'::jsonb,
  status         plan_status not null default 'draft',
  approved_at    timestamptz,
  approved_by    text,
  -- 카페24 반영 결과. 지금은 수동 반영이라 메모로 쓴다
  cafe24_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table daily_plans is '일일 할인안. 승인 전에는 손님 화면에 내보내지 않는다';

-- ─────────────────────────────────────────────
-- 4. 좋아요 동기화 기록
--
-- 하루 1회 동기화가 실제로 돌았는지, 몇 건을 갱신했는지 남긴다.
-- 화면에 "○월 ○일 기준"을 표시하는 근거이기도 하다.
-- ─────────────────────────────────────────────
create table if not exists like_syncs (
  id           bigserial primary key,
  ran_at       timestamptz not null default now(),
  updated_rows integer     not null default 0,
  failed_rows  integer     not null default 0,
  error        text
);

-- ─────────────────────────────────────────────
-- 5. RLS — 전부 거부
--
-- 정책을 만들지 않은 상태로 RLS를 켜면 anon·authenticated 키로는 아무것도 못 읽는다.
-- 서버에서 쓰는 service_role 키만 통과한다. 키가 새더라도 anon 키로는 피해가 없다.
-- ─────────────────────────────────────────────
alter table cafe24_tokens   enable row level security;
alter table contest_entries enable row level security;
alter table daily_plans     enable row level security;
alter table like_syncs      enable row level security;

-- ─────────────────────────────────────────────
-- 6. updated_at 자동 갱신
-- ─────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger cafe24_tokens_touch   before update on cafe24_tokens
  for each row execute function touch_updated_at();
create or replace trigger contest_entries_touch before update on contest_entries
  for each row execute function touch_updated_at();
create or replace trigger daily_plans_touch     before update on daily_plans
  for each row execute function touch_updated_at();

-- ── 0002 · 할인 구간 · 상품 연결표 · 권한 ─────────────────────────────────────────────────────────────
-- 운영 설정 — 관리자가 화면에서 바꾸는 값들
--
-- 코드 상수(data/indicators.ts)는 기본값이자 폴백으로 남긴다.
-- 이 표가 비어 있거나 DB에 닿지 못하면 코드 값으로 돌아간다 —
-- 설정이 없다고 해서 할인이 0%가 되거나 화면이 비면 안 된다.

-- ─────────────────────────────────────────────
-- 1. 할인 구간
--
-- "코스피가 몇 % 움직이면 몇 % 할인" 을 관리자가 정한다.
-- 조회는 하한이 큰 것부터 — tierFor()가 처음 만나는 구간을 쓴다.
-- 상한 38%(기업 확인값)는 코드에서 한 번 더 막으므로 여기에 두지 않는다.
-- ─────────────────────────────────────────────
create table if not exists discount_tiers (
  -- 등락률 절대값 하한 (%). 1.5 = "1.5% 이상 움직이면"
  min_abs_change numeric(5,2) primary key,
  -- 0.300 = 30%
  rate           numeric(4,3) not null check (rate > 0 and rate <= 1),
  label          text         not null,
  updated_at     timestamptz  not null default now()
);

comment on table discount_tiers is '코스피 등락 구간별 할인율. 비어 있으면 코드 기본값을 쓴다';

-- ─────────────────────────────────────────────
-- 2. 상품 연결표
--
-- 우리 제품번호(data/products.ts)와 자사몰 상품번호는 다른 체계다.
-- 체험몰에는 막지 제품이 없어 시험용으로 아무 상품에나 이어 붙이고,
-- 실제 몰에 붙일 때 다시 맞춘다.
-- ─────────────────────────────────────────────
create table if not exists product_links (
  product_no        integer primary key,
  cafe24_product_no integer not null,
  updated_at        timestamptz not null default now()
);

comment on table product_links is '우리 productNo ↔ 자사몰 product_no';

-- ─────────────────────────────────────────────
-- 3. 권한
--
-- 새 secret 키가 쓰는 역할에 테이블 권한이 자동으로 붙지 않아
-- 0001 실행 뒤 permission denied가 났다. 표를 만들 때마다 같이 준다.
-- ─────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

alter table discount_tiers enable row level security;
alter table product_links  enable row level security;

create or replace trigger discount_tiers_touch before update on discount_tiers
  for each row execute function touch_updated_at();
create or replace trigger product_links_touch before update on product_links
  for each row execute function touch_updated_at();


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


-- ── 0013 · 예약이 잡은 자사몰 품목 ────────────────────────────────────────────
--
-- 자사몰은 품목(variant) 단위로 재고를 센다. 모닝롤은 1개/3개/5개가 각각 다른
-- 품목이고, 대만식 샌드위치는 여덟이다. 어느 품목을 잡았는지 안 남기면 재고
-- 조정이 늘 첫 품목으로 간다 — "5개"를 예약하고 "1개" 재고를 깎는다.
alter table fills add column if not exists unit text;
comment on column fills.unit is '카페24 품목코드(variant_code). 0013 이전 기록은 null';

-- ── 0015 · 자리를 옵션별로 세고, 한 사람이 한 자리만 잡게 한다
--
-- ① 선착순 경합 — 옵션까지 보고 센다
--    0005의 unique (day, product_no, depth, slot)은 상품 전체로 한 줄을 세웠다.
--    그런데 자사몰 재고는 옵션(품목)마다 따로다. "1개 30 · 3개 30 · 5개 30"인
--    상품에서 30자리를 열면, 30명이 전부 '5개'를 골라도 통과한다 — 5개짜리
--    재고는 30묶음뿐인데.
--
--    ⚠️ unit을 유니크 '제약'에 그냥 넣으면 안 된다. 포스트그레스는 NULL을 서로
--       다른 값으로 봐서, 옵션이 없는 상품(unit=null)은 같은 slot이 몇 번이고
--       들어간다 — 경합을 막던 장치가 그 상품들에서만 조용히 풀린다.
--       그래서 coalesce로 빈 문자열을 씌운 유니크 '인덱스'로 바꾼다.
--
-- ② 한 사람당 한 자리 — 멱등성
--    화면은 예약 버튼을 잠그지만 서버에는 방어가 없었다. 같은 요청을 두 번 보내면
--    자리 두 개를 먹는다. 빵 한 종에 서른 자리인 서비스에서 한 사람이 여러 자리를
--    먹으면 "선착순"이라는 말이 뜻을 잃는다.
--
--    기한이 지나 반납된 예약(settled='expired')은 세지 않는다. 그 줄까지 막으면
--    결제를 못 한 사람이 그날 다시는 예약할 수 없다.
--    표식이 없는 옛 기록(visitor is null)도 비켜 간다.

-- ① 옵션까지 보는 경합 잠금
alter table fills drop constraint if exists fills_day_product_no_depth_slot_key;
create unique index if not exists fills_slot_unique
  on fills (day, product_no, depth, coalesce(unit, ''), slot);
comment on index fills_slot_unique is '선착순 경합 잠금. 옵션(unit)까지 보고 센다 — 0015';

-- ② 한 사람 한 자리
--    이 인덱스가 막으려던 버그로 이미 중복 예약이 쌓여 있으면 인덱스 생성이 실패하고
--    begin~commit 전체가 되돌아간다. 먼저 정리한다 — 같은 사람·같은 날·같은 빵에서
--    결제된 줄이나 가장 먼저 잡은 줄만 남기고, 나머지 '열린' 줄은 반납 처리한다.
update fills f set settled = 'expired', slot = null
where f.visitor is not null and f.settled = 'open'
  and exists (
    select 1 from fills g
    where g.day = f.day and g.product_no = f.product_no and g.visitor = f.visitor
      and g.id <> f.id and g.settled is distinct from 'expired'
      and (g.settled = 'paid' or g.id < f.id)
  );
create unique index if not exists fills_one_per_visitor
  on fills (day, product_no, visitor)
  where visitor is not null and settled is distinct from 'expired';
comment on index fills_one_per_visitor is '같은 날 같은 빵은 한 사람당 한 자리. 반납된 예약은 비켜 간다 — 0015';

-- ── 0014 · 웹 푸시 구독 ──────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id          bigserial primary key,
  visitor     text not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  failed_at   timestamptz
);
comment on table push_subscriptions is '웹 푸시 구독. endpoint가 신원 — lib/push.ts';
create index if not exists push_subscriptions_visitor_idx on push_subscriptions (visitor);

-- ── 0016 · 한 예약 한 청약 ───────────────────────────────────────────────────
alter table ipo_bids add column if not exists fill_id bigint;
create unique index if not exists ipo_bids_fill_once on ipo_bids (fill_id);
comment on column ipo_bids.fill_id is '청약권을 준 예약(fills.id). 한 예약 한 청약 — 0016';

-- ── 0017 · 한 IP 한 빵 N자리 ─────────────────────────────────────────────────
alter table fills add column if not exists ip_hash text;
alter table fills add column if not exists ip_seq  smallint;
create unique index if not exists fills_ip_seq
  on fills (day, product_no, ip_hash, ip_seq)
  where ip_hash is not null and settled <> 'expired';
comment on index fills_ip_seq is '한 IP 한 빵 N자리 — 0017';

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
alter table push_subscriptions enable row level security;

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
    ('push_subscriptions', '0014', '웹 푸시 — lib/push.ts'),
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
    ('fills',    'visitor', 'fills.visitor',    '0010', '구매 표식 — 주간 활동점수'),
    ('fills',    'unit',    'fills.unit',       '0013', '자사몰 품목 — lib/inventory.ts'),
    ('fills',    'expires_at', 'fills.expires_at', '0012', '결제 기한 — lib/settle.ts'),
    ('ipo_bids', 'fill_id', 'ipo_bids.fill_id', '0016', '한 예약 한 청약 — lib/ipo.ts'),
    ('fills',    'ip_hash', 'fills.ip_hash',    '0017', 'IP 자리 한도 — api/fill')
  ) as want(tbl, col, label, made_by, used_by)
  left join information_schema.columns col
    on  col.table_schema = 'public'
    and col.table_name   = want.tbl
    and col.column_name  = want.col
  group by want.label, want.made_by, want.used_by
) as checks
order by "상태" desc, "순서", "확인 대상";
