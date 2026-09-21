'use client';

import { useState } from 'react';
import styles from './AdminConsole.module.css';

/**
 * 공모주 노출 스위치.
 *
 * 끄면 손님 화면에서 NEXT 섹션이 사라지고, 구매 시트의 청약권 안내도 같이
 * 사라진다(갈 곳 없는 버튼을 남기지 않는다). 서버도 청약 요청을 409로 막는다 —
 * 화면을 거치지 않고 부를 수 있는 경로라, 꺼진 회차에 표가 쌓이면 나중에
 * 그 회차를 되살릴 때 허수가 섞인다.
 *
 * 가격 동기화 스위치(PRICE_SYNC_ENABLED)는 여기 없다. 그건 켜는 순간 진짜
 * 자사몰 판매가가 바뀌는 값이라 코드에 둔다 — 관리자 화면에서 실수로 켜지면 안 된다.
 */

interface Props {
  initial: boolean;
  /** 설정이 DB에 닿았는가. false면 서버 재시작 시 기본값으로 돌아간다 */
  stored: boolean;
}

export default function IpoSettings({ initial, stored }: Props) {
  const [enabled, setEnabled] = useState(initial);
  const [persisted, setPersisted] = useState(stored);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/ipo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setEnabled(json.enabled);
      setPersisted(json.stored);
      setMessage(json.enabled ? '공모주를 켰습니다. 손님 화면에 NEXT 섹션이 보입니다.' : '공모주를 껐습니다. 손님 화면에서 NEXT 섹션이 사라집니다.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>공모주</h2>
        <span className={styles.count}>{enabled ? '켜짐 · 손님 화면에 보임' : '꺼짐 · 손님 화면에 없음'}</span>
      </div>

      <div className={styles.plan}>
        <p className={styles.note}>
          다음에 나올 빵을 손님이 청약으로 정하는 기능입니다.
          끄면 <b>NEXT 섹션과 구매 시트의 청약권 안내</b>가 함께 사라지고, 청약 요청도 서버에서 막힙니다.
          이미 쌓인 청약 기록은 지우지 않습니다 — 다시 켜면 그대로 이어집니다.
        </p>

        <div className={styles.planActions}>
          <button type="button" onClick={() => toggle(true)} disabled={busy || enabled} aria-pressed={enabled}>
            켜기
          </button>
          <button type="button" onClick={() => toggle(false)} disabled={busy || !enabled} aria-pressed={!enabled}>
            끄기
          </button>
        </div>

        {!persisted && (
          <p className={styles.note}>
            ⚠️ 저장소에 닿지 못했습니다. 이 값은 <b>이번 서버 세션 메모리에만</b> 있고 재시작하면 기본값(켜짐)으로 돌아갑니다.
            <code>0008_app_settings.sql</code>을 실행하면 영구 저장됩니다.
          </p>
        )}
        {message && <p className={styles.note} role="status">{message}</p>}
      </div>
    </section>
  );
}
