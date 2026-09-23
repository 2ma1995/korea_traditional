-- 한 예약 한 청약.
--
-- 청약권 쿠키(bm_bid)는 원래 날짜 문자열뿐이라 curl로 누구나 만들 수 있었고,
-- "청약했음" 쿠키만 지우면 같은 청약권을 몇 번이고 다시 낼 수 있었다.
-- 이제 쿠키는 "날짜.예약id.서명"이고(lib/bidRight), 청약에 그 예약 id를 남긴다.
-- unique라서 같은 예약으로 두 번째 청약은 DB가 거절한다 — 동시에 두 번 눌러도.
--
-- null은 서로 다른 값으로 보므로, 이 열이 생기기 전 청약 기록은 그대로 둔다.

alter table ipo_bids add column if not exists fill_id bigint;
create unique index if not exists ipo_bids_fill_once on ipo_bids (fill_id);
comment on column ipo_bids.fill_id is '청약권을 준 예약(fills.id). 한 예약 한 청약 — 0016';
