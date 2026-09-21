-- 운영 스위치 — 관리자가 화면에서 껐다 켜는 값
--
-- 지금까지 스위치는 전부 코드 상수였다(ALWAYS_OPEN · PRICE_SYNC_ENABLED · LINE_MODE).
-- 그 셋은 "기업 승인 전에는 절대 켜지지 않아야 하는" 값이라 코드에 두는 게 맞다 —
-- 관리자 화면에서 실수로 켜지면 진짜 자사몰 가격이 바뀐다.
--
-- 반면 공모주 노출 같은 값은 운영 중에 바꿔야 한다. 기업이 "이번 시즌은 공모를
-- 쉬겠다"고 하면 배포 없이 꺼야 한다. 그런 값을 여기 둔다.
--
-- key-value에 jsonb를 쓰는 이유 — 스위치마다 표를 만들면 표가 계속 늘어난다.
-- 값의 모양은 코드가 안다(lib/appSettings.ts). 읽을 때 검증하고, 이상하면
-- 코드 기본값으로 떨어진다.
create table if not exists app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table app_settings is '관리자가 운영 중에 바꾸는 스위치. 값 모양은 lib/appSettings.ts가 검증한다';

grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table app_settings enable row level security;
