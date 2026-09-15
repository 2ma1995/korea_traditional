'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './AdminConsole.module.css';

/** 관리자 로그인 — 비밀번호 하나. 맞으면 서버가 서명 쿠키를 심고 화면을 새로 그린다. */
export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setPassword('');
        router.refresh();
        return;
      }
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? '로그인에 실패했습니다.');
    } catch {
      setError('서버에 닿지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.login} onSubmit={submit}>
      <label className={styles.field}>
        <span>관리자 비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
        />
      </label>
      <button type="submit" className={styles.submit} disabled={!password || busy}>
        {busy ? '확인 중…' : '들어가기'}
      </button>
      {error && <p className={styles.loginError}>{error}</p>}
      <p className={styles.formNote}>
        출품 검수와 할인 반영을 하는 화면입니다. 비밀번호는 팀에서 공유한 값을 쓰세요.
      </p>
    </form>
  );
}
