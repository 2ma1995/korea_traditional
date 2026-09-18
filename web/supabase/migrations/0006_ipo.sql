-- 절기빵 공모주 — 다음 절기빵 후보에 청약한다
--
-- 2차 현직자 피드백: 절기와 레시피 콘테스트를 "주식 컨셉 밑으로" 넣는 방법으로
-- 공모주(청약)를 제안했다. 다음 절기빵 후보에 유저가 청약 → 경쟁률 매일 공개 →
-- 1위 출시 → 청약자에게 출시 쿠폰. 유저는 기여감·혜택·매일 방문 동기, 사업자는
-- 출시 전 수요 데이터. 콘테스트의 원래 목적(참여·확산)을 클릭 한 번 허들로 대신한다.
--
-- 개인 식별 값은 없다. 1인 1청약은 브라우저(localStorage)에서만 막는다 —
-- 회원 체계가 붙기 전까지의 한계이고, 화면에 그 사실을 적는다.
create table if not exists ipo_bids (
  id         bigserial   primary key,
  -- 회차. "2026-180" = 2026년 황경 180도(추분)
  round      text        not null,
  candidate  text        not null,
  -- 화면 확인용 샘플인가. 진짜 청약과 구분해 화면에 밝힌다
  demo       boolean     not null default false,
  created_at timestamptz not null default now()
);

comment on table ipo_bids is '절기빵 공모주 청약. 회차·후보만 저장, 개인 식별 값 없음';

create index if not exists ipo_bids_round_idx on ipo_bids (round);

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table ipo_bids enable row level security;

-- 2026-09-18 재설계 — 회차 모드를 남긴다.
-- 'restock'(품절 상품 재입고 공모) / 'new'(절기 신제품 공모).
-- 나중에 "어느 쪽 참여가 높았나"를 답할 수 있어야 다음 회차 구성의 근거가 된다.
alter table ipo_bids add column if not exists mode text;
