import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 접속 — 서버 전용.
 *
 * service_role 키를 쓰므로 이 파일을 클라이언트 컴포넌트에서 import하면 안 된다.
 * 키가 브라우저 번들에 들어가면 누구나 DB를 읽고 쓸 수 있다.
 * (환경변수 이름에 NEXT_PUBLIC_ 접두사를 붙이지 않는 것도 같은 이유다)
 *
 * 스키마는 supabase/migrations/0001_init.sql 에 있다. RLS는 정책 없이 켜져 있어
 * anon 키로는 아무것도 보이지 않고, service_role만 통과한다.
 */

let client: SupabaseClient | null = null;

/** 환경변수가 없으면 null. 호출부가 "아직 연결 전"을 구분할 수 있게 던지지 않는다. */
export function supabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** 저장소가 반드시 있어야 하는 곳에서 쓴다. 메시지에 원인을 적어 둔다. */
export function requireSupabase(): SupabaseClient {
  const db = supabase();
  if (!db) {
    throw new Error(
      'Supabase 환경변수가 없습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 Vercel에 넣고 재배포하세요.',
    );
  }
  return db;
}
