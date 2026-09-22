-- 할인코드 발급 기록
--
-- 설계도 최상단의 문제를 푸는 자리다 — "싸다고 보여주고 정가로 보낸다."
-- 화면은 8,470원인데 자사몰로 넘기면 11,000원이었다. 예약 성공 시 그 폭만큼의
-- 할인코드를 카페24에서 발급해 손님에게 준다. 자사몰 판매가는 건드리지 않는다.
--
-- §9는 쿠폰을 "회원 계정에 발급되는 구조라 로그인 없이는 못 쓴다"고 접었는데,
-- 2026-09-22에 확인한 결과 절반만 맞았다. 발급에는 회원 식별이 필요 없다 —
-- 코드 문자열만 만들어진다. 손님은 자사몰에서 그 코드를 입력하면 된다.
--
-- 왜 기록을 남기나. 카페24가 코드를 갖고 있긴 하지만,
--   · 손님이 "아까 받은 코드 뭐였죠"를 물을 때 되찾아줘야 하고
--   · 얼마나 발급됐고 얼마가 실제로 쓰였는지는 기업이 봐야 하는 숫자이고
--   · 발급이 실패한 예약도 남아야 나중에 채워줄 수 있다
-- 그래서 우리 쪽에도 남긴다.
--
-- 개인 식별 값은 없다. 누가 받았는지는 자사몰 주문이 안다.
create table if not exists coupons (
  id             bigserial   primary key,
  day            date        not null,
  product_no     integer     not null,
  -- 손님에게 주는 코드 문자열
  code           text        not null unique,
  -- 정가 대비 할인 폭. 0.300 = 30%
  rate           numeric(4,3) not null check (rate > 0 and rate < 1),
  -- 카페24가 매긴 번호. 회수·조회할 때 쓴다
  cafe24_no      integer,
  -- 코드를 쓸 수 있는 마지막 날
  expires_on     date        not null,
  created_at     timestamptz not null default now()
);

comment on table coupons is '예약 시 발급한 카페24 할인코드. 개인 식별 값 없음';

create index if not exists coupons_day_idx on coupons (day, product_no);

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table coupons enable row level security;
