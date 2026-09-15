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

create trigger discount_tiers_touch before update on discount_tiers
  for each row execute function touch_updated_at();
create trigger product_links_touch before update on product_links
  for each row execute function touch_updated_at();
