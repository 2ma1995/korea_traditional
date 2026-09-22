/**
 * 방문자 표식 쿠키의 이름·모양·설정. 여기에만 둔다.
 *
 * lib/visitor.ts(서버 컴포넌트·라우트 핸들러)와 proxy.ts(요청 앞단)가 둘 다 쓴다.
 * 이 파일이 아무것도 import하지 않는 이유가 있다 — proxy는 렌더 코드와 모듈을
 * 공유하면 안 된다(next/dist/docs .../proxy.md: "you should not attempt relying on
 * shared modules or globals"). next/headers가 딸려 들어가면 proxy 번들이 깨진다.
 * 상수만 든 파일이라 안전하게 양쪽에서 부를 수 있다.
 */

export const VISITOR = 'bm_v';

/** 30일. 집계 창이 7일이라 그보다 넉넉하면 되고, 더 길게 들고 있을 이유가 없다 */
export const MAX_AGE = 60 * 60 * 24 * 30;

/** UUID v4 모양만 받는다. 손으로 넣은 값으로 표를 더럽히지 않게 */
export const WELL_FORMED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
} as const;
