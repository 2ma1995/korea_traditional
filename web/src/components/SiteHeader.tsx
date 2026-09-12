'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';
import { requestIntroReplay } from '@/lib/introReplay';

const JOURNEY_ID = 'season-journey';

/**
 * GNB의 '절기상점'은 로고와 다르게 동작해야 한다.
 *
 *   로고        → '/'                  오프닝 애니메이션을 재생한다
 *   절기상점    → '/#season-journey'   애니메이션을 건너뛰고 '우리의 계절을 읽다'로 간다
 *
 * Intro가 URL 해시가 있으면 재생을 건너뛴다(Intro.getSkipPreference).
 * 그래서 해시를 붙이는 것만으로 두 동작이 갈린다 — '/'로 되돌리지 말 것.
 *
 * match는 aria-current 판정용이다. usePathname()은 해시를 돌려주지 않으므로
 * href와 그대로 비교하면 현재 페이지 표시가 영원히 켜지지 않는다.
 */
const links = [
  { href: '/#season-journey', label: '절기상점', match: '/' },
  { href: '/contest', label: '모두의 절기상' },
  { href: '/archive', label: '스물네 절기' },
];

export default function SiteHeader() {
  const pathname = usePathname();

  /**
   * 이미 랜딩에 있을 때의 '절기상점' 클릭.
   *
   * URL이 이미 /#season-journey면 브라우저가 같은 해시로의 이동을 무시한다.
   * 스크롤을 내려둔 상태에서 눌러도 아무 일이 없으므로 직접 올려준다.
   * behavior는 넘기지 않는다 — globals.css의 scroll-behavior가 정하게 두면
   * prefers-reduced-motion에서 smooth가 꺼지는 재정의까지 그대로 따라간다.
   * 다른 페이지에서는 Link 기본 동작에 맡긴다 — 해시가 붙은 채로 진입해야
   * Intro가 오프닝을 건너뛴다.
   */
  /**
   * 로고는 언제나 오프닝부터 보여준다.
   *
   * 랜딩에서 랜딩으로 가는 건 같은 라우트라 Intro가 다시 마운트되지 않는다.
   * '/#season-journey'에서 눌러도 마찬가지여서, 이동 대신 재생 신호를 보낸다.
   * 다른 페이지에서는 Link 기본 동작으로 '/'에 새로 들어가며 알아서 재생된다.
   */
  const replayIntro = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== '/') return;
    event.preventDefault();
    requestIntroReplay();
  };

  const goToJourney = (event: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== '/') return;
    event.preventDefault();
    document.getElementById(JOURNEY_ID)?.scrollIntoView({ block: 'start' });
    if (window.location.hash !== `#${JOURNEY_ID}`) {
      window.history.replaceState(null, '', `/#${JOURNEY_ID}`);
    }
  };

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <div className="announcement">계절을 따라, 맛을 따라. <span>막지의 스물네 가지 계절 이야기</span></div>
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="wordmark" aria-label="막지 절기상점 홈" onClick={replayIntro}>막지<span className="brand-seal" aria-hidden="true">절기<br />상점</span><small>MAKJI</small></Link>
          <nav aria-label="주 메뉴">{links.map(({ href, label, match }) => <Link key={href} href={href} onClick={href.includes(`#${JOURNEY_ID}`) ? goToJourney : undefined} aria-current={pathname === (match ?? href) ? 'page' : undefined}>{label}</Link>)}</nav>
          <a className="shop-link" href="https://makji.kr" target="_blank" rel="noopener noreferrer">막지 공식몰 <span aria-hidden="true">↗</span></a>
        </div>
      </header>
    </>
  );
}
