-- 예약에 결제 기한을 준다 — 선착순을 진짜로 만든다
--
-- 지금까지 예약은 자리를 잡기만 하고 놓지 않았다. 결제하지 않은 사람이 자리를
-- 붙들고 있으면 정작 살 사람이 못 산다. 자사몰 재고까지 차감하면 그 손해가
-- 빵장 밖으로 나간다.
--
-- 그래서 예약에 1시간 기한을 둔다(단 빵장 마감 24:00을 넘기지 않는다).
--   결제함    코드의 issued_count가 1  → 확정
--   미결제    1시간이 지나도 0        → 자리 반납 · 카페24 재고 복원 · 코드 삭제
--
-- 정리는 크론이 아니라 요청이 들어올 때 한다(lazy). Vercel 무료 플랜은 크론이
-- 하루 한 번만 돌아 1시간 주기를 맡길 수 없고, 빵장은 장중에 사람이 계속 들어오는
-- 서비스라 그 방문이 곧 타이머가 된다. 크론은 마감 뒤 한 번 쓸어담는 안전망이다.
alter table fills add column if not exists expires_at timestamptz;

-- 'open' 기한 안 · 'paid' 결제 확인 · 'expired' 반납됨
-- 반납한 줄을 지우지 않고 남기는 이유 — 몇 명이 예약만 하고 안 샀는지가
-- 기업에게 필요한 숫자다. 지우면 그 사실이 사라진다.
alter table fills add column if not exists settled text not null default 'open';

-- 이 예약에 발급된 할인코드. 결제 여부를 이 코드로 확인한다(coupons.code)
alter table fills add column if not exists coupon_code text;

comment on column fills.expires_at is '결제 기한. 지나고 미결제면 자리를 반납한다';
comment on column fills.settled    is 'open · paid · expired';
comment on column fills.coupon_code is '이 예약에 발급된 할인코드. 결제 확인에 쓴다';

-- ⚠️ slot에서 not null을 뗀다.
--
-- slot은 "이 칸에서 몇 번째"이고, (day, product_no, depth, slot) unique가 선착순
-- 경합을 막는 장치다(0005). 그런데 만료로 자리를 반납하면 그 번호가 비고,
-- 다음 사람이 같은 번호를 노려 unique에 걸려 튕긴다 — 자리가 남았는데도.
--
-- 반납한 줄은 slot을 null로 비운다. Postgres는 unique에서 null을 서로 다른 값으로
-- 보므로 여러 줄이 null이어도 충돌하지 않고, 번호는 다시 쓸 수 있게 된다.
-- 줄 자체는 남아서 "몇 명이 예약만 하고 안 샀나"를 여전히 답한다.
alter table fills alter column slot drop not null;

-- 잔량 계산이 "오늘 · 이 상품 · 이 폭 · 아직 살아 있는 것"을 세므로 그 순서로 건다
create index if not exists fills_live_idx on fills (day, product_no, settled);
