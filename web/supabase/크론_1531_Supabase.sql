-- ─────────────────────────────────────────────────────────────────────────────
-- 15:31 자사몰 가격 반영 알람 — Supabase가 대신 울린다
--
-- 왜: Vercel 무료(Hobby) 요금제의 크론은 정한 시각부터 1시간 안 아무 때나 울린다.
--     실제로 15:30 알람이 매일 16:14쯤 울려, 44분 동안 빵장 화면은 할인가인데
--     자사몰은 정가였다. Supabase의 pg_cron은 분 단위로 정확하다.
--     (Vercel Pro 요금제면 이 파일은 필요 없다 — vercel.json 크론이 15:30에 정확히 돈다)
--
-- 두 번 불려도 안전하다: Vercel 알람이 뒤늦게 또 울리면 "오늘 이미 바꿨다"로 거절한다(lib/priceSync.claimDay).
-- 휴장일에는 서버가 알아서 아무것도 하지 않는다(api/cron/publish).
--
-- 쓰는 법: 아래 두 곳을 바꾸고 Supabase → SQL Editor → New query에 붙여넣고 Run.
--   ① 여기에_CRON_SECRET  → Vercel 환경변수 CRON_SECRET 값 그대로
--   ② 빵장 주소            → 지금은 https://korea-traditional.vercel.app
-- 여러 번 돌려도 된다(알람은 지우고 다시 건다, 암호는 바꿔 넣는다).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 크론 암호는 금고(vault)에 넣는다 — 알람 본문(cron.job)에 암호가 그대로 남지 않게
do $$
begin
  if exists (select 1 from vault.secrets where name = 'bread_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'bread_cron_secret'), '여기에_CRON_SECRET');
  else
    perform vault.create_secret('여기에_CRON_SECRET', 'bread_cron_secret', '빵장 크론 암호(CRON_SECRET)');
  end if;
end $$;

-- 같은 이름의 알람이 있으면 지우고 새로 건다. 시각은 UTC — 06:31 UTC = 15:31 KST, 월~금
select cron.unschedule('bread-publish') where exists (select 1 from cron.job where jobname = 'bread-publish');
select cron.schedule('bread-publish', '31 6 * * 1-5', $job$
  select net.http_get(
    url := 'https://korea-traditional.vercel.app/api/cron/publish',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bread_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);

-- 연결 점검 — 가격은 안 바꾸는 /api/health를 같은 암호로 한 번 불러 본다
select net.http_get(
  url := 'https://korea-traditional.vercel.app/api/health',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bread_cron_secret')),
  timeout_milliseconds := 30000
) as health_request_id;

-- 확인 ① 알람이 걸렸는가 — bread-publish · 31 6 * * 1-5 · true 가 보이면 된다
select jobname, schedule, active from cron.job where jobname = 'bread-publish';

-- 확인 ② (몇 초 뒤 이 줄만 다시 Run) 점검 호출이 200이면 암호·주소가 맞다. 401이면 암호가 틀렸다
-- select status_code, left(content::text, 80) as body from net._http_response order by id desc limit 1;
