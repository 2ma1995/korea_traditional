-- 0014 · 웹 푸시 구독
--
-- 로그인이 없는 서비스라 사람을 방문자 표식(bm_v)으로만 안다(lib/visitor).
-- 구독은 브라우저마다 하나이고, 같은 사람이 폰과 PC에서 각각 구독하면 두 줄이다.
--
-- endpoint가 곧 구독의 신원이다 — 브라우저가 발급하는 URL이고, 만료되면 바뀐다.
-- 그래서 unique는 endpoint에 건다. 같은 방문자가 여러 줄을 가질 수 있다.
--
-- ⚠️ 여기 담긴 키는 이 브라우저에 알림을 보내는 권한이다. 누구인지는 모른다.
--    구독이 죽으면(410 Gone) 발송 쪽에서 지운다 — 죽은 구독에 계속 쏘지 않는다.

create table if not exists push_subscriptions (
  id          bigserial primary key,
  visitor     text not null,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  -- 마지막으로 보내려다 실패한 시각. 연달아 실패하면 지운다
  failed_at   timestamptz
);
comment on table push_subscriptions is '웹 푸시 구독. endpoint가 신원 — lib/push.ts';
create index if not exists push_subscriptions_visitor_idx on push_subscriptions (visitor);
alter table push_subscriptions enable row level security;
