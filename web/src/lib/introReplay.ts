/**
 * 로고 클릭 → 오프닝 다시 재생.
 *
 * Intro는 랜딩('/')에만 있고, 헤더는 모든 페이지에 있다. 헤더가 Intro를 직접
 * 들고 있으면 WeatherScene·seasonStories까지 전 페이지 번들에 끌려오므로
 * 이벤트 이름만 공유하고 신호를 던진다.
 */
export const INTRO_REPLAY = 'makji:intro-replay';

/**
 * 랜딩에 머문 채로 오프닝을 처음부터 다시 튼다.
 *
 * 해시가 남아 있으면 지운다 — Intro의 딥링크 판정이 해시를 보기 때문이다.
 * 동작 줄이기 설정이어도 막지 않는다. 그때는 Intro가 움직임 없는 정적 화면으로 보여준다.
 */
export function requestIntroReplay(): void {
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  window.dispatchEvent(new Event(INTRO_REPLAY));
}
