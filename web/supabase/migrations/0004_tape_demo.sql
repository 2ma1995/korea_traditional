-- 시황 화면 확인용 샘플 데이터
--
-- 집계가 0명이면 "오늘 68%가 위로가를 골랐습니다" 화면이 어떻게 생겼는지
-- 볼 수가 없다. 그래서 샘플을 넣되, **샘플이라는 사실이 화면에 남도록** 한다.
--
-- ⚠️ demo 칼럼이 그 표시다. 이게 없으면 지어낸 숫자를 진짜 집계처럼 보여주게
--    된다 — 발표에서 기업·멘토가 보는 화면이라 그건 하면 안 된다.
--
-- 이 파일은 몇 번을 다시 실행해도 된다. 오늘 샘플을 지우고 다시 넣는다.
-- 날짜가 바뀌어 화면이 비면 그냥 다시 실행하면 된다.

alter table settlement_events
  add column if not exists demo boolean not null default false;

comment on column settlement_events.demo is '화면 확인용 샘플. 진짜 정산과 구분해 화면에 표시한다';

-- 오늘 샘플만 지운다. 진짜 정산(demo = false)은 건드리지 않는다
delete from settlement_events
where demo = true
  and day = (now() at time zone 'Asia/Seoul')::date;

-- 34명 — 위로 23 · 본전 3 · 자축 8 (위로가 68%)
-- 코스피가 0.8~1.5% 움직인 날이라 호가 칸이 3개(0·1·2) 열린 상황을 가정한다
insert into settlement_events (day, side, seat, demo)
select
  (now() at time zone 'Asia/Seoul')::date,
  case when i <= 23 then 'loss' when i <= 26 then 'flat' else 'gain' end,
  case when i % 3 = 0 then 2 when i % 3 = 1 then 1 else 0 end,
  true
from generate_series(1, 34) as i;
