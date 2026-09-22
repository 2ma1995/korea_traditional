'use client';

import { useEffect, useState } from 'react';

import styles from '@/components/Market.module.css';

/**
 * 담아둔 빵이 할인되면 알림 받기.
 *
 * 로그인이 없으므로 브라우저 푸시를 쓴다. 권한은 **손님이 누를 때만** 물어본다 —
 * 페이지가 열리자마자 묻는 창은 거의 다 거절당하고, 한 번 거절하면 브라우저가
 * 다시 묻지 않는다. 그래서 담아둔 빵이 있는 자리에서만 띄운다.
 *
 * ⚠️ iOS 사파리는 홈 화면에 추가한 경우에만 푸시를 받는다. 지원 여부를 우리가
 *    추측하지 않고 브라우저에게 묻는다(PushManager 존재). 안 되는 기기에서는
 *    버튼을 감추는 대신 왜 안 되는지 적는다 — 아무 말 없이 사라지면 고장으로 보인다.
 */

type State = 'checking' | 'unsupported' | 'ios' | 'idle' | 'busy' | 'on' | 'denied' | 'failed';

/** base64url(VAPID 공개키) → Uint8Array. 브라우저가 이 형태만 받는다 */
function toKey(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || (navigator as { standalone?: boolean }).standalone === true;

export default function PushToggle() {
  const [state, setState] = useState<State>('checking');
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

  /* 판정은 전부 여기서 한다. 서버 렌더에는 없는 값들(navigator·Notification)이라
     첫 상태는 'checking'으로 두고, 브라우저에서만 한 번 정한다.
     판정 자체를 async로 감싸는 이유는 렌더 도중 setState를 하지 않기 위해서다 */
  useEffect(() => {
    let alive = true;
    void (async (): Promise<State> => {
      if (!key) return 'unsupported';
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        /* iOS는 홈 화면에 추가하기 전까지 PushManager 자체가 없다 — 왜 없는지 구분해 준다 */
        return isIOS() && !standalone() ? 'ios' : 'unsupported';
      }
      if (Notification.permission === 'denied') return 'denied';
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        return (await registration?.pushManager.getSubscription()) ? 'on' : 'idle';
      } catch {
        return 'idle';
      }
    })().then(next => { if (alive) setState(next); });
    return () => { alive = false; };
  }, [key]);

  async function turnOn() {
    setState('busy');
    try {
      const granted = await Notification.requestPermission();
      if (granted !== 'granted') { setState(granted === 'denied' ? 'denied' : 'idle'); return; }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(key) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });
      const json = await res.json().catch(() => null);
      /* 브라우저에는 구독이 생겼는데 서버가 못 받았으면 켜졌다고 하면 안 된다 —
         알림이 영영 안 오는데 화면만 "켜짐"인 상태가 된다 */
      setState(json?.ok ? 'on' : 'failed');
    } catch {
      setState('failed');
    }
  }

  async function turnOff() {
    setState('busy');
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe();
      }
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  if (state === 'checking' || state === 'unsupported') return null;

  return (
    <div className={styles.pushRow}>
      {state === 'ios' ? (
        <span className={styles.pushFine}>
          🔔 알림을 받으려면 <b>공유 → 홈 화면에 추가</b> 후 다시 열어 주세요. (iPhone은 이 방법만 됩니다)
        </span>
      ) : state === 'denied' ? (
        <span className={styles.pushFine}>
          🔔 알림이 차단돼 있어요. 주소창의 자물쇠 → 알림 허용으로 바꾸면 받을 수 있습니다.
        </span>
      ) : (
        <>
          <button type="button" className={styles.pushButton} data-on={state === 'on'}
            disabled={state === 'busy'} onClick={() => (state === 'on' ? turnOff() : turnOn())}>
            {state === 'busy' ? '…' : state === 'on' ? '🔔 알림 켜짐' : '🔔 할인되면 알림 받기'}
          </button>
          <span className={styles.pushFine}>
            {state === 'failed' ? '알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요.'
              : state === 'on' ? '담아둔 빵이 할인되는 날 15:30에 알려드려요.'
              : '담아둔 빵이 할인되는 날에만 보냅니다. 언제든 끌 수 있어요.'}
          </span>
        </>
      )}
    </div>
  );
}
