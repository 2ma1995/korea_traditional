'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: '절기상점' },
  { href: '/event', label: '나만의 절기상' },
  { href: '/contest', label: '모두의 절기상' },
  { href: '/archive', label: '스물네 절기' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <div className="announcement">계절을 따라, 맛을 따라. <span>막지의 스물네 가지 계절 이야기</span></div>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark" aria-label="막지 절기상점 홈">막지<span className="brand-seal" aria-hidden="true">절기<br />상점</span><small>MAKJI</small></Link>
          <nav aria-label="주 메뉴">{links.map(({ href, label }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>
          <a className="shop-link" href="https://makji.kr" target="_blank" rel="noopener noreferrer">막지 공식몰 <span aria-hidden="true">↗</span></a>
        </div>
      </header>
    </>
  );
}
