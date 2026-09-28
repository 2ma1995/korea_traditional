-- 0020 · 한 사람이 한 옵션을 여러 개 — 담은 개수만큼 예약한다
--
-- 포트폴리오의 − n + 는 살 개수다. 모닝롤 3개를 담았으면 3자리를 잡아야
-- "3개 예약"이 거짓말이 아니다. 그런데 0019는 한 사람 한 옵션 한 자리였다.
--
-- 자리(slot)·IP(ip_seq)와 같은 방식으로 막는다. 한 사람이 한 옵션에 쥔 자리에
-- 1..N 번호(visitor_seq)를 매기고 unique를 건다. N은 서버가 정한다(orderbook.SEATS_PER_OPTION, 5).
-- 화면은 "목표 개수까지"만 채워 달라고 보내므로, 같은 요청을 두 번 보내도 번호가 겹쳐
-- 더 잡히지 않는다 — 0015 ②의 멱등성이 그대로 남는다.
-- 한 IP 한 빵 N자리(0017)도 그대로라, 한 사람이 한 빵을 쓸어 담지는 못한다.
--
-- 옛 줄은 visitor_seq가 null이다 — coalesce로 1번으로 본다. 반납된 줄은 비켜 간다.
-- 코드는 이 마이그레이션 전에도 돌아간다. 열이 없으면 번호 없이 넣고, 옛 인덱스에 걸려
-- 한 옵션 한 자리로 남는다(화면이 "n개 중 1개만 예약됐어요"라고 밝힌다).

alter table fills add column if not exists visitor_seq smallint;
drop index if exists fills_one_per_visitor_unit;
create unique index if not exists fills_visitor_seq
  on fills (day, product_no, coalesce(unit, ''), visitor, coalesce(visitor_seq, 1))
  where visitor is not null and settled is distinct from 'expired';
comment on index fills_visitor_seq is '한 사람이 한 옵션에 쥔 자리 번호 1..N. 반납된 예약은 비켜 간다 — 0020';
