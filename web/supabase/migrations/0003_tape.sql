-- 오늘의 빵장 시황 — 정산 집계
--
-- 왜 필요한가. 잃은 날 가장 듣고 싶은 말은 "나만 그런 게 아니구나"다.
-- 오늘 몇 %가 위로가를 골랐는지 보여주면, 빵을 사지 않아도 보러 온다.
-- 이 표가 그 화면의 유일한 데이터다.
--
-- ⚠️ 개인을 식별하는 값은 넣지 않는다.
--    수익률 숫자도, 고른 종목도, 사용자 식별자도 저장하지 않는다.
--    남는 것은 "오늘 · 위로/자축/본전 · 몇 번째 칸" 세 가지뿐이고,
--    이 조합은 12가지밖에 없어 한 줄만으로는 누구도 특정되지 않는다.
--
-- 집계표(날짜별 카운터) 대신 이벤트 한 줄씩 넣는다. 동시 증가 경합을 신경 쓸
-- 필요가 없고, 나중에 "시간대별 분포"처럼 다른 각도로 다시 셀 수 있다.
-- 하루 수천 줄 수준이라 읽을 때 세도 문제없다.
create table if not exists settlement_events (
  id         bigserial primary key,
  -- KST 기준 날짜. 빵장은 20:00~24:00라 UTC로 두면 하루가 갈린다
  day        date        not null,
  side       text        not null check (side in ('gain', 'loss', 'flat')),
  -- 앉은 호가 칸 인덱스. 0이 가장 얕은 칸
  seat       smallint    not null check (seat >= 0 and seat <= 9),
  created_at timestamptz not null default now()
);

comment on table settlement_events is '정산 집계용 익명 이벤트. 개인 식별 값·수익률 숫자는 저장하지 않는다';

create index if not exists settlement_events_day_idx on settlement_events (day);

-- 권한 — 0002와 같은 이유로 표를 만들 때마다 같이 준다
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table settlement_events enable row level security;
