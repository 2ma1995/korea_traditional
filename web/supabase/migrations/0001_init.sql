-- 막지 절기상점 — 초기 스키마
--
-- 이 파일이 저장소에 있으면 어느 Supabase 계정에서든 같은 구조를 다시 만들 수 있다.
-- 나중에 기업 계정으로 넘길 때 "프로젝트 이전"이 막히더라도 이 파일로 새로 세우면 된다.
--
-- 접근 방식: 모든 읽기·쓰기를 Next.js 서버(서비스 롤 키)에서만 한다.
--   브라우저에서 직접 Supabase를 부르지 않으므로 anon 키를 배포에 넣지 않고,
--   RLS는 전부 거부 상태로 둔다. 서비스 롤은 RLS를 우회한다.
--   나중에 브라우저에서 직접 읽을 일이 생기면 그때 정책을 하나씩 연다.

-- ─────────────────────────────────────────────
-- 1. 카페24 토큰
--
-- access_token 2시간, refresh_token 2주. 서버리스라 메모리에 둘 수 없어 여기 보관한다.
-- 몰 하나만 쓰더라도 mall_id를 키로 둔다 — 체험몰 → 실제 자사몰로 옮길 때
-- 행만 하나 더 넣으면 되고, 기존 토큰을 덮어써 잃는 일이 없다.
-- ─────────────────────────────────────────────
create table if not exists cafe24_tokens (
  mall_id        text primary key,
  access_token   text        not null,
  refresh_token  text        not null,
  -- access_token 만료 시각. 이 시각 전에 갱신한다
  expires_at     timestamptz not null,
  -- refresh_token 만료 시각. 지나면 사용자가 다시 인증해야 한다
  refresh_expires_at timestamptz,
  scope          text,
  updated_at     timestamptz not null default now()
);

comment on table cafe24_tokens is '카페24 OAuth 토큰. 서버에서만 접근한다';

-- ─────────────────────────────────────────────
-- 2. 대회 출품
--
-- 멘션 웹훅으로 들어온 게시물과 관리자가 직접 넣은 게시물이 같은 표에 쌓인다.
-- 관리자가 approved로 바꾼 것만 손님 화면에 나간다.
-- ─────────────────────────────────────────────
create type entry_status as enum ('pending', 'approved', 'rejected');

create table if not exists contest_entries (
  id             uuid primary key default gen_random_uuid(),
  -- Graph API IG Media id. 좋아요 재동기화의 키.
  -- 같은 게시물이 웹훅으로 두 번 와도 한 행만 남게 unique를 건다
  media_id       text        not null unique,
  permalink      text        not null,
  username       text,
  -- 작성자가 좋아요 수를 숨기면 API가 값을 주지 않는다 → null
  like_count     integer,
  like_count_at  timestamptz,
  title          text        not null,
  -- 빵 카테고리 = 막지 제품 번호. 제품명이 아니라 번호로 묶는다
  product_no     integer     not null,
  toppings       text[]      not null default '{}',
  note           text,
  status         entry_status not null default 'pending',
  -- 어디서 찾았는지: 멘션 / 수동 등록
  source_tag     text,
  -- 어느 절기 회차인지. 태양 황경(0, 15, 30 …)
  term_longitude integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 검수 화면은 항상 '대기 먼저, 최근 먼저'로 훑는다
create index if not exists contest_entries_status_idx
  on contest_entries (status, created_at desc);
-- 카테고리별 순위 조회
create index if not exists contest_entries_rank_idx
  on contest_entries (term_longitude, product_no, like_count desc);

comment on table contest_entries is '절기 조리법 대회 출품. approved만 노출한다';

-- ─────────────────────────────────────────────
-- 3. 일일 할인안 (승인 큐)
--
-- 코스피로 자동 생성한 할인안을 담당자가 승인해야 손님 화면에 나간다.
-- items를 jsonb로 통째 저장한다 — 승인 당시의 가격을 그대로 보존해야
-- 나중에 제품 가격이 바뀌어도 "그날 무엇을 얼마에 걸었는지"가 남는다.
-- ─────────────────────────────────────────────
create type plan_status as enum ('draft', 'approved', 'published', 'failed');

create table if not exists daily_plans (
  -- 하루 한 건. 같은 날 재생성은 갱신이다
  plan_date      date primary key,
  -- 적용 할인율 (0.30 = 30%)
  rate           numeric(4,3) not null,
  kospi_change   numeric(6,3),
  headline       text        not null,
  reason         text,
  items          jsonb       not null default '[]'::jsonb,
  status         plan_status not null default 'draft',
  approved_at    timestamptz,
  approved_by    text,
  -- 카페24 반영 결과. 지금은 수동 반영이라 메모로 쓴다
  cafe24_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table daily_plans is '일일 할인안. 승인 전에는 손님 화면에 내보내지 않는다';

-- ─────────────────────────────────────────────
-- 4. 좋아요 동기화 기록
--
-- 하루 1회 동기화가 실제로 돌았는지, 몇 건을 갱신했는지 남긴다.
-- 화면에 "○월 ○일 기준"을 표시하는 근거이기도 하다.
-- ─────────────────────────────────────────────
create table if not exists like_syncs (
  id           bigserial primary key,
  ran_at       timestamptz not null default now(),
  updated_rows integer     not null default 0,
  failed_rows  integer     not null default 0,
  error        text
);

-- ─────────────────────────────────────────────
-- 5. RLS — 전부 거부
--
-- 정책을 만들지 않은 상태로 RLS를 켜면 anon·authenticated 키로는 아무것도 못 읽는다.
-- 서버에서 쓰는 service_role 키만 통과한다. 키가 새더라도 anon 키로는 피해가 없다.
-- ─────────────────────────────────────────────
alter table cafe24_tokens   enable row level security;
alter table contest_entries enable row level security;
alter table daily_plans     enable row level security;
alter table like_syncs      enable row level security;

-- ─────────────────────────────────────────────
-- 6. updated_at 자동 갱신
-- ─────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cafe24_tokens_touch   before update on cafe24_tokens
  for each row execute function touch_updated_at();
create trigger contest_entries_touch before update on contest_entries
  for each row execute function touch_updated_at();
create trigger daily_plans_touch     before update on daily_plans
  for each row execute function touch_updated_at();
