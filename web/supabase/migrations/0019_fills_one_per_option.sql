-- 0019 · 한 사람 한 자리를 옵션마다로
--
-- 0015의 fills_one_per_visitor는 (day, product_no, visitor)였다 — 같은 날 같은 빵은 한 자리.
-- 그런데 물량은 옵션마다 따로 연다(0015 ①). 휘낭시에 코코넛·피칸·초코를 다 좋아하는
-- 손님은 하루에 하나만 잡을 수 있었다. 관심빵을 옵션별로 담게 하면서 예약도 옵션별로 연다.
--
-- 같은 옵션을 두 번 잡지는 못한다 — 같은 요청을 두 번 보내 자리 둘을 먹던 문제(0015 ②)는
-- 그대로 막힌다. 한 IP 한 빵 N자리(0017)는 상품 단위 그대로라, 옵션이 많은 빵이어도
-- 한 사람이 쓸어 담지 못한다.
--
-- coalesce(unit, '') — 옵션이 없는 빵(unit=null)도 한 사람 한 자리로 센다. 그냥 unit을 넣으면
-- 포스트그레스가 NULL을 서로 다른 값으로 봐서 그 빵들에서만 잠금이 풀린다(0015와 같은 이유).
--
-- 코드는 이 마이그레이션 전에도 돌아간다. 옛 인덱스가 남아 있으면 두 번째 옵션 예약이
-- 거기 걸리고, api/fill이 "이 빵은 이미 예약하셨어요"로 답한다 — 예전 규칙 그대로.

drop index if exists fills_one_per_visitor;
create unique index if not exists fills_one_per_visitor_unit
  on fills (day, product_no, coalesce(unit, ''), visitor)
  where visitor is not null and settled is distinct from 'expired';
comment on index fills_one_per_visitor_unit is '같은 날 같은 옵션은 한 사람당 한 자리. 반납된 예약은 비켜 간다 — 0019';
