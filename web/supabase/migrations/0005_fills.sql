-- 체결 — 한정 호가의 선착순 즉시 체결 (A안)
--
-- "이 가격에 걸기"를 누르면 그 자리에서 되거나 안 된다. 자정 일괄 배정(B안)은
-- 4시간을 기다려야 해서 접었다. 선착순이면 '걸기'가 사실상 '사기'라 호가창의
-- 은유가 약해지지만, 손님이 기다리지 않는 쪽이 먼저다.
--
-- 동시성 — 두 사람이 마지막 1개를 같은 순간에 누를 수 있다.
-- count → insert 사이에 끼어들면 둘 다 체결된다. 그래서 slot(순번)에 unique를
-- 걸어둔다. 채워진 수 + 1을 slot으로 넣으면, 같은 순간 둘이 같은 slot을 노려
-- 한 명은 unique 위반으로 튕긴다. 튕긴 쪽은 다시 세서 한 번 더 시도한다.
-- 잠금 없이 원자성을 얻는 가장 싼 방법이다.
--
-- 개인 식별 값은 없다. 누가 샀는지는 자사몰 주문이 안다. 여기는 "오늘 이 칸이
-- 몇 개 나갔나"만 안다.
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

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table fills enable row level security;
