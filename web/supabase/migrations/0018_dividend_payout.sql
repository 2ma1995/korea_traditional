-- 주말 배당을 실제 적립금으로.
--
-- 지금까지 배당은 "이번 주 얼마"를 계산해 보여주기만 했다. 이 서비스에는 로그인이
-- 없어 누구의 자사몰 계정에 넣을지 몰랐기 때문이다. 손님이 자사몰 아이디를 한 번
-- 연결하면(dividend_links), 관리자가 토요일에 지급 버튼을 눌러 카페24 적립금으로
-- 넣는다(dividend_payouts, lib/payout).
--
-- 한 아이디는 한 주에 한 번만 받는다 — (week_from, member)가 기본키다. 쿠키를 여러 개
-- 만들어 한 아이디에 몰아도 가장 높은 점수 하나만 나간다.
--
-- 지급 줄은 카페24를 부르기 **전에** 'pending'으로 먼저 넣는다. 두 번 눌러도 두 번
-- 나가지 않는다. 카페24 호출 뒤 끊기면 'pending'으로 남는다 — 자동으로 다시 보내지
-- 않고 관리자가 카페24 적립금 내역에서 확인한다(두 번 주는 것보다 한 번 확인이 낫다).
--
-- member는 개인정보다. 목적(적립금 지급) 밖으로 쓰지 않고 서버(service_role)만 읽는다.

create table if not exists dividend_links (
  visitor    text        primary key,
  member     text        not null,
  linked_at  timestamptz not null default now()
);
create index if not exists dividend_links_member_idx on dividend_links (member);
comment on table dividend_links is '방문자 → 자사몰 아이디. 주말 배당 적립금을 보낼 곳 — 0018';

create table if not exists dividend_payouts (
  week_from  date        not null,
  member     text        not null,
  visitor    text        not null,
  score      smallint    not null,
  amount     integer     not null check (amount > 0),
  status     text        not null default 'pending',   -- pending · paid · failed
  note       text,
  created_at timestamptz not null default now(),
  paid_at    timestamptz,
  primary key (week_from, member)
);
comment on table dividend_payouts is '주간 배당 지급 기록. 한 아이디 한 주 한 번 — 0018';

-- 배당금 통장(DIVIDEND_PAYOUT=wallet). 적립금 권한이 없어서 배당금은 우리가 들고,
-- 손님이 쓸 때 그 금액의 정액 할인 쿠폰을 카페24에서 만들어 그 회원에게 발급한다.
-- 잔액 = 이번 달 지급(channel='wallet', paid) − 이번 달 꺼낸 것(pending·issued). 달이 바뀌면 소멸.
alter table dividend_payouts add column if not exists channel text not null default 'wallet';  -- wallet · mileage

create table if not exists dividend_redemptions (
  id         bigserial   primary key,
  member     text        not null,
  amount     integer     not null check (amount > 0),
  coupon_no  text,
  status     text        not null default 'pending',   -- pending · issued · failed
  note       text,
  created_at timestamptz not null default now()
);
-- 한 아이디가 동시에 두 번 꺼내지 못하게 — 두 번 눌러도 쿠폰은 한 장
create unique index if not exists dividend_redemptions_one_pending
  on dividend_redemptions (member) where status = 'pending';
create index if not exists dividend_redemptions_member_idx on dividend_redemptions (member, created_at);
comment on table dividend_redemptions is '배당금을 할인 쿠폰으로 꺼낸 기록 — 0018';

alter table dividend_links   enable row level security;
alter table dividend_payouts enable row level security;
alter table dividend_redemptions enable row level security;
