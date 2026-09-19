-- 관심 담기 — 수요 보정(+3%p)의 분모
--
-- 지금까지 관심 목록은 portfolioStore가 브라우저 localStorage에만 썼다. 서버로
-- 오지 않으니 전체 집계가 없고, skuSignals의 conversion이 늘 null이었다.
-- 그래서 38% 구조의 한 축인 수요 보정이 영원히 0이었다.
--
-- 왜 '몇 번 담겼나'가 아니라 '몇 명이 담았나'인가 —
-- 전환율은 "관심을 보인 사람 중 몇이 샀나"다. 스테퍼로 수량을 5로 올린 한 사람을
-- 표본 5로 세면 분모만 부풀어 그 빵이 근거 없이 싸진다. 할인은 실제 돈이므로
-- (day, product_no, visitor)에 unique를 걸어 사람 단위로 센다.
--
-- visitor는 서버가 발급한 난수다(lib/visitor.ts). 누구인지는 모르고 같은
-- 브라우저인지만 안다. 쿠키를 지우면 다시 한 명으로 세는 한계가 있는데,
-- 청약권(lib/bidRight)이 이미 같은 한계를 안고 있고 발표에서 밝히는 쪽이다.
--
-- 날짜별로 센다. 분자인 fills도 날짜별 건수라 분모와 단위가 맞는다 —
-- 사흘에 걸쳐 담은 사람은 표본 3이고, 사흘에 걸쳐 산 사람도 체결 3이다.
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

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table watches enable row level security;
