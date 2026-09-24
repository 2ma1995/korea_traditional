'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SHOP_BASE } from '@/lib/shop';

/**
 * 헤더.
 *
 * 메뉴는 '빵장' 하나다. 2026-09-20에 절기 화면('/season')·절기 기록장('/archive')과
 * 섹션 앵커(MY · NEXT)를 뺐다.
 *
 * 왜 — 절기는 '보여주는 화면'에서 '다음 상품을 정하는 자리'로 이미 옮겨졌다(lib/ipo.ts).
 * 설계도의 서비스 구조(MARKET → TODAY → MY → NEXT)에 절기 화면은 들어 있지 않다.
 * 메뉴에 남겨두면 본편이 아닌 화면으로 손님을 흘려보낸다.
 *
 * ⚠️ MY·NEXT는 다른 페이지가 아니라 빵장 안의 섹션 앵커다. 공모주_재설계.md가
 *    "NEXT가 없어 직접 갈 수 없다"며 일부러 넣었던 항목이니, 되살리려면 아래 배열에
 *    다시 넣으면 된다 — 그 외에 지운 것은 없다.
 *
 * 페이지 파일은 2026-09-24에 저장소의 old/web/으로 옮겼다 — 이제 URL로도 열리지 않는다.
 */
const links = [
  { href: '/', label: '빵장' },
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
          <a className="shop-link" href={SHOP_BASE} target="_blank" rel="noopener noreferrer">
            막지 공식몰 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
    </>
  );
}
