'use client';

import { useState } from 'react';
import styles from './AdminConsole.module.css';

/**
 * 카페24 연결 시험.
 *
 * 자사몰 판매가를 실제로 바꾸는 화면이다. 지금은 체험몰(makjitest)을 상대로
 * 연결이 되는지 확인하는 용도라, 상품번호를 직접 넣게 해 둔다.
 *
 * 실제 운영에서는 오늘의 할인안이 제품 목록을 들고 오므로 번호를 칠 일이 없다.
 * 다만 그러려면 우리 productNo와 자사몰 product_no를 잇는 표가 필요하고,
 * 그건 실제 몰에 연결한 뒤에 만든다 — 체험몰에는 막지 제품이 없다.
 *
 * 되돌리기는 이 화면에 머무는 동안만 가능하다. 바꾸기 전에 읽어둔 값을
 * 화면이 들고 있을 뿐이고, 새로고침하면 사라진다. 자동 복원은 저장을
 * 붙일 때 daily_plans에 원래 가격을 적는 방식으로 만든다.
 */

interface Product {
  productNo: number;
  name: string;
  price: string;
  retailPrice: string;
}

const won = (text: string) => Number(text).toLocaleString('ko-KR');

export default function Cafe24Panel() {
  const [no, setNo] = useState('9');
  const [product, setProduct] = useState<Product | null>(null);
  /** 바꾸기 직전의 판매가. 되돌리기 버튼이 이 값을 쓴다 */
  const [original, setOriginal] = useState<string | null>(null);
  const [nextPrice, setNextPrice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (run: () => Promise<Response>, done: (data: Product) => void) => {
    setBusy(true);
    setMessage('');
    try {
      const response = await run();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error ?? `실패 (${response.status})`);
        return;
      }
      done(data as Product);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const load = () => call(
    () => fetch(`/api/admin/cafe24/product?no=${encodeURIComponent(no)}`),
    data => {
      setProduct(data);
      setOriginal(null);
      setNextPrice('');
      setMessage(`${data.name} 을(를) 불러왔습니다.`);
    },
  );

  const apply = (price: string, restoring = false) => call(
    () => fetch('/api/admin/cafe24/product', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ no: Number(no), price: Number(price) }),
    }),
    data => {
      setProduct(data);
      if (restoring) {
        setOriginal(null);
        setMessage(`원래 가격 ${won(data.price)}원으로 되돌렸습니다.`);
      } else {
        setMessage(`자사몰 판매가를 ${won(data.price)}원으로 바꿨습니다. makjitest.cafe24.com 에서 확인해보세요.`);
      }
    },
  );

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2>카페24 연결 시험</h2>
        <span className={styles.count}>체험몰 makjitest</span>
      </div>

      <div className={styles.plan}>
        <div className={styles.cafe24Row}>
          <label className={styles.field}>
            <span>상품번호</span>
            <input value={no} onChange={event => setNo(event.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className={styles.outline} onClick={load} disabled={busy || !no}>
            불러오기
          </button>
        </div>

        {product && (
          <>
            <ul className={styles.planItems}>
              <li>
                <span>{product.name} (#{product.productNo})</span>
                <del>{won(product.retailPrice)}원</del>
                <b>{won(product.price)}원</b>
              </li>
            </ul>

            <div className={styles.cafe24Row}>
              <label className={styles.field}>
                <span>바꿀 판매가</span>
                <input
                  value={nextPrice}
                  onChange={event => setNextPrice(event.target.value)}
                  inputMode="numeric"
                  placeholder="3500"
                />
              </label>
              <button
                type="button"
                className={styles.submit}
                disabled={busy || !nextPrice}
                onClick={() => { setOriginal(product.price); apply(nextPrice); }}
              >
                자사몰에 반영
              </button>
              {original && (
                <button type="button" className={styles.outline} disabled={busy} onClick={() => apply(original, true)}>
                  {won(original)}원으로 되돌리기
                </button>
              )}
            </div>
          </>
        )}

        {message && <p className={styles.note} style={{ marginTop: 14 }}>{message}</p>}

        <p className={styles.note} style={{ marginTop: 12 }}>
          판매가(price)만 바꾸고 소비자가(retail_price)는 그대로 둡니다. 되돌리기는 이 화면에 머무는 동안만
          가능합니다 — 새로고침하면 원래 가격을 잃으니, 바꾸기 전 값을 따로 적어두세요.
        </p>
      </div>
    </section>
  );
}
