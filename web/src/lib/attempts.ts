import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { loadSetting, saveSetting } from '@/lib/appSettings';

/**
 * IP별 시도 횟수 제한 — 무한히 두드리면 열리는 문을 막는다.
 *
 *   관리자 로그인   비밀번호 대입
 *   배당 아이디 연결 "이 아이디가 있나"를 떠보는 창구(회원 조회)
 *
 * 서버가 여러 대라 메모리가 아니라 app_settings에 센다. IP는 해시만 남긴다.
 * ponytail: 읽고-더해-쓰기라 같은 순간 몇 번은 더 들어갈 수 있다 — 대입을 막는 데는 충분하다.
 */

interface Count { count: number; since: number }
const asCount = (raw: unknown): Count | null => {
  const v = raw as Count | null;
  return v && typeof v.count === 'number' && typeof v.since === 'number' ? v : null;
};

async function keyFor(scope: string): Promise<string> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return `${scope}:${createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
}

export function limiter(scope: string, limit: number, windowMs: number) {
  return {
    /** 막혀 있으면 풀리기까지 남은 분, 아니면 null */
    async locked(): Promise<number | null> {
      const { value } = await loadSetting(await keyFor(scope), null as Count | null, asCount);
      if (!value || value.count < limit) return null;
      const left = value.since + windowMs - Date.now();
      return left > 0 ? Math.ceil(left / 60000) : null;
    },
    /** 한 번 셌다 */
    async hit(): Promise<void> {
      const key = await keyFor(scope);
      const { value } = await loadSetting(key, null as Count | null, asCount);
      const fresh = !value || Date.now() - value.since > windowMs;
      await saveSetting(key, fresh ? { count: 1, since: Date.now() } : { count: value.count + 1, since: value.since });
    },
    /** 성공했으니 처음부터 */
    async reset(): Promise<void> {
      await saveSetting(await keyFor(scope), { count: 0, since: Date.now() });
    },
  };
}
