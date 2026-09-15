import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/adminAuth';

export async function POST() {
  (await cookies()).delete(COOKIE_NAME);
  return Response.json({ ok: true });
}
