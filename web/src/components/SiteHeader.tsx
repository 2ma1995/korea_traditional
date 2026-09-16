'use client';

import Link from 'next/link';

/**
 * 헤더.
 *
 * 절기·대회 갈래를 폐기해 화면이 빵장 하나로 줄었다. 메뉴도 그에 맞춰
 * 로고와 공식몰 링크만 남긴다 — 갈 곳이 하나면 메뉴를 만들 이유가 없다.
 */
export default function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark" aria-label="막지 빵장 홈">
            막지<span className="brand-seal" aria-hidden="true">빵<br />장</span><small>BREAD MARKET</small>
          </Link>
          <a className="shop-link" href="https://makji.kr" target="_blank" rel="noopener noreferrer">
            막지 공식몰 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
    </>
  );
}
