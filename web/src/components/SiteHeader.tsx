'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 헤더.
 *
 * 빵장('/')이 본편이고, 접었던 절기 화면('/season')과 절기 기록장('/archive')을
 * 나란히 둔다. 둘을 오가며 비교할 수 있어야 해서 메뉴로 노출한다.
 *
 * 절기 화면의 오프닝은 URL에 해시가 없으면 재생된다(Intro.getSkipPreference).
 * 메뉴에서 '/season'으로 들어가면 매번 오프닝부터 본다 — 그게 의도다.
 */
const links = [
  { href: '/', label: '빵장' },
  { href: '/season', label: '절기' },
  { href: '/archive', label: '스물네 절기' },
  { href: '/#foryou', label: 'MY' },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark" aria-label="막지 빵장 홈">
            막지<span className="brand-seal" aria-hidden="true">빵<br />장</span><small>BREAD MARKET</small>
          </Link>
          <nav aria-label="주 메뉴">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
          <a className="shop-link" href="https://makji.kr" target="_blank" rel="noopener noreferrer">
            막지 공식몰 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
    </>
  );
}
