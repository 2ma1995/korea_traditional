-- 한 IP 한 빵 N자리.
--
-- 방문자 쿠키(bm_v)는 지우면 새로 생긴다. 쿠키 없이 서른 번 부르면 매번 새 사람이라
-- 한 빵의 서른 자리가 결제 없이 다 찼다 — 1시간마다 반복하면 모든 빵이 늘 "물량 끝".
-- 0015의 1인 1자리는 쿠키 단위라 이걸 못 막는다.
--
-- 자리(slot)와 같은 방식으로 막는다. 한 IP가 쥔 자리에 1..N 번호(ip_seq)를 매기고
-- unique를 건다. 동시에 쏴도 N+1번째는 DB가 거절한다. N은 서버가 정한다(FILL_PER_IP).
-- 반납된 줄(settled='expired')은 빠진다 — 기한이 지나면 그 IP도 다시 잡을 수 있다.
--
-- ip_hash는 원문 IP가 아니라 서버 비밀로 만든 해시다.

alter table fills add column if not exists ip_hash text;
alter table fills add column if not exists ip_seq  smallint;
create unique index if not exists fills_ip_seq
  on fills (day, product_no, ip_hash, ip_seq)
  where ip_hash is not null and settled <> 'expired';
comment on index fills_ip_seq is '한 IP 한 빵 N자리 — 0017';
