import { cookies } from 'next/headers';
import { COOKIE_NAME, revokeAll } from '@/lib/adminAuth';

export async function POST() {
  await revokeAll();
  (await cookies()).delete(COOKIE_NAME);
  return Response.json({ ok: true });
}
