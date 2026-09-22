/*
 * 빵장 서비스워커 — 푸시 알림만 받는다.
 *
 * 캐싱은 하지 않는다. 가격이 하루에 두 번 바뀌는 서비스(15:30 반영 · 24:00 복원)에서
 * 오래된 화면을 캐시로 돌려주면 손님이 어제 가격을 보고 결제하러 간다.
 *
 * 알림을 누르면 이미 열려 있는 빵장 탭으로 보낸다 — 탭을 또 열지 않는다.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let note = { title: '빵장', body: '오늘의 할인이 시작됐어요.', url: '/' };
  try {
    if (event.data) note = { ...note, ...event.data.json() };
  } catch {
    /* 본문이 JSON이 아니면 기본 문구로 띄운다 — 알림을 통째로 날리지 않는다 */
  }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      icon: '/icon.png',
      badge: '/icon.png',
      /* 같은 태그면 새 알림이 옛 것을 덮는다 — 하루에 여러 번 쌓이지 않게 */
      tag: 'bread-market-today',
      data: { url: note.url },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
