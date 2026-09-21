-- 주말 배당 — 주간 활동점수의 재료 둘
--
-- 점수는 셋을 각각 주 1회만 센다.
--   관심빵 담기        watches   ✅ 0007에서 이미 사람 단위로 센다
--   Bread Market 구매  fills     ← 여기서 visitor를 붙인다
--   거래일 출석        visits    ← 여기서 새로 만든다
--
-- 왜 지금까지 못 셌나 —
-- fills에는 (day, product_no, depth, slot)만 있어 선착순 경합은 막지만 "누가
-- 샀는지"를 모른다. 그래서 개인 주간 결산도, 배당 자격도 계산할 수 없었다.
-- watches가 쓰는 것과 같은 난수 표식(lib/visitor.ts)을 그대로 붙인다 —
-- 로그인도 개인정보도 없이 같은 브라우저인지만 안다.
--
-- ⚠️ 쿠키를 지우면 다른 사람으로 세는 한계가 있다. watches·bidRight가 이미 같은
--    한계를 안고 있고, 발표에서 밝히는 쪽으로 정했다.

-- ── ① 구매에 방문자 표식 ──────────────────────────────────────────────────
--
-- nullable로 둔다. 이 마이그레이션 전에 쌓인 체결에는 표식이 없고, 그것들을
-- 지우거나 임의의 값으로 채우면 기존 잔량 계산(day, product_no, depth, slot)이
-- 흔들린다. 배당 점수는 표식이 있는 건만 센다.
alter table fills add column if not exists visitor text;

comment on column fills.visitor is
  '서버 발급 난수(lib/visitor.ts). 주간 활동점수의 구매 항목을 사람 단위로 세는 데 쓴다. 0010 이전 기록은 null';

-- 주간 점수는 "이 사람이 이 주에 샀나"만 본다 — 날짜와 방문자로 찾는다
create index if not exists fills_visitor_day_idx on fills (visitor, day);

-- ── ② 거래일 출석 ────────────────────────────────────────────────────────
--
-- 하루에 몇 번 들어오든 1회로 센다. (day, visitor) unique가 그 역할을 한다 —
-- 새로고침을 반복해 점수를 쌓는 것을 막는다. watches가 (day, product_no, visitor)로
-- 사람 단위를 만든 것과 같은 방식이다.
--
-- 주간 점수 기준은 '거래일 3일 이상'이다. 주말·공휴일 방문은 기록은 하되
-- 점수에는 넣지 않는다 — 배당을 쓰러 온 방문이 다음 배당을 만들면 순환논리가 된다.
create table if not exists visits (
  id         bigserial   primary key,
  day        date        not null,
  visitor    text        not null,
  created_at timestamptz not null default now(),
  unique (day, visitor)
);

comment on table visits is
  '거래일 출석. (day, visitor) unique로 하루 1회만 센다. 주간 활동점수의 출석 항목';

-- 주간 집계는 [월요일, 토요일) 구간을 방문자별로 센다
create index if not exists visits_visitor_day_idx on visits (visitor, day);

-- watches와 같다 — RLS만 켜고 정책은 두지 않는다. 기록도 집계도 서버가 하므로
-- 브라우저에서 직접 닿을 일이 없고, 열어두면 남의 출석을 넣을 수 있다.
alter table visits enable row level security;
