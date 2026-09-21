-- 공모 회차를 관리자가 직접 연다 — 절기 자동 편성을 걷어낸다
--
-- 왜 바꾸나. 절기는 "15일마다 자동"이라는 주기를 공짜로 줬지만, 후보를 절기
-- 제철 재료에서 기계적으로 만들었다. 현직자 지적이 정확했다 —
-- "백로에 포도 띄우고 포도 상품이 없으면 그건 죽은 데이터."
-- 기업이 실제로 만들 수 있는 빵만 후보에 올라야 공모가 지킬 수 있는 약속이 된다.
-- 그래서 회차도 후보도 막지가 직접 넣고 뺀다.
--
-- 회차가 하나도 없으면 공모 섹션은 그냥 안 뜬다. 빈 회차를 억지로 만들지 않는다.
create table if not exists ipo_rounds (
  id         text        primary key,
  -- 손님에게 보이는 이름. "2026 가을 공모"
  name       text        not null,
  opens_on   date        not null,
  closes_on  date        not null,
  -- 손님에게 던지는 질문. 비우면 코드 기본 문구를 쓴다
  ask        text,
  created_at timestamptz not null default now(),
  check (closes_on >= opens_on)
);

comment on table ipo_rounds is '공모 회차. 관리자가 기간을 직접 정한다(절기 자동 편성 폐기)';

create index if not exists ipo_rounds_window_idx on ipo_rounds (opens_on, closes_on);

-- 후보 빵. id는 회차 안에서만 유일하면 된다 — 청약 기록(ipo_bids.candidate)이 이 값을 쓴다.
create table if not exists ipo_candidates (
  round_id   text     not null references ipo_rounds(id) on delete cascade,
  id         text     not null,
  name       text     not null,
  -- 왜 이 후보인가. 화면에 근거로 뜬다
  note       text,
  -- 자사몰에 이미 있는 상품이면 번호, 아직 없는 신제품이면 null
  product_no integer,
  -- 첫 출시 수량. 경쟁률 "N : 1"의 분모
  allotment  smallint not null default 30,
  sort       smallint not null default 0,
  primary key (round_id, id)
);

comment on table ipo_candidates is '회차별 후보 빵. 막지가 직접 넣고 뺀다';

-- ⚠️ 개인정보가 들어오는 자리다.
--
-- 0006은 "개인 식별 값은 없다"고 적어 두었다. 그 전제가 여기서 깨진다 —
-- 당첨 시 청약자에게 쿠폰을 주려면 누구인지 알아야 하고, 이 서비스에는 로그인이
-- 없으므로 자사몰 회원 ID를 직접 받는다.
--
-- 그래서 지켜야 할 것:
--   · 청약 폼에 수집·이용 목적과 보유 기간을 반드시 적는다(개인정보처리방침 포함)
--   · 쿠폰 발급이 끝난 회차의 member는 지운다 — 목적이 끝나면 보관 근거가 없다
--   · 이 열은 서버(service_role)만 읽는다. RLS가 켜져 있어 anon 키로는 안 보인다
alter table ipo_bids add column if not exists member text;
comment on column ipo_bids.member is '자사몰 회원 ID. 당첨 쿠폰 발급 목적으로만 쓰고 발급 후 삭제한다';

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table ipo_rounds     enable row level security;
alter table ipo_candidates enable row level security;
