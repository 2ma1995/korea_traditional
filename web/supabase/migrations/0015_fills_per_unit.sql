-- 0015 · 자리를 옵션별로 세고, 한 사람이 한 자리만 잡게 한다
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
create unique index if not exists fills_one_per_visitor
  on fills (day, product_no, visitor)
  where visitor is not null and settled is distinct from 'expired';
comment on index fills_one_per_visitor is '같은 날 같은 빵은 한 사람당 한 자리. 반납된 예약은 비켜 간다 — 0015';
