-- 0013 · 예약이 잡은 자사몰 품목
--
-- 자사몰은 품목(variant) 단위로 재고를 센다. 모닝롤은 1개/3개/5개가 각각 다른
-- 품목이고, 대만식 샌드위치는 여덟이다. 지금까지는 어느 품목을 잡았는지 남기지
-- 않아 재고 조정이 늘 **첫 품목**으로 갔다 — "5개"를 예약하고 "1개" 재고를 깎았다.
--
-- 기한이 지나 반납할 때(lib/settle) 되돌릴 품목도 이 값으로 찾는다.
-- 0013 이전 기록은 null이고, 그때는 예전처럼 첫 품목으로 간다.

alter table fills add column if not exists unit text;
comment on column fills.unit is '카페24 품목코드(variant_code). 0013 이전 기록은 null';
