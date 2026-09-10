import Link from 'next/link';
import Intro from '@/components/Intro';
import KospiQuote from '@/components/KospiQuote';
import ProductPhoto from '@/components/ProductPhoto';
import ScrollReveal from '@/components/ScrollReveal';
import SeasonJourney, { type JourneySeason } from '@/components/SeasonJourney';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { currentTerm, groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';
import styles from './landing.module.css';
import { SEASON_STORIES } from '@/data/seasonStories';

const won = (value: number) => value.toLocaleString('ko-KR');

export default async function Home() {
  const today = new Date();
  const market = await getMarketSnapshot(today);
  const plan = buildDailyPlan(market);
  const term = currentTerm(today);
  const seasons: JourneySeason[] = groupBySeason(termsInTraditionalOrder(today)).map(({ items }, index) => ({
    ...SEASON_STORIES[index],
    terms: items.map(item => item.term),
  }));
  const up = market.kospi.changePct >= 0;
  // 품절 제품도 회색으로 함께 보여준다 — 오늘 대상 라인의 크기가 드러나야
  // 판매중이 2종뿐인 날에도 혜택이 빈약해 보이지 않는다.
  const targetCount = plan.items.length + plan.soldOut.length;

  return (
    <main id="main-content" className={styles.landing}>
      <Intro />
      <h1 id="landing-title" className="sr-only">우리의 계절에는 스물네 가지 맛이 있다.</h1>
      <SeasonJourney seasons={seasons} currentLongitude={term.longitude} />

      <section id="today-market" className={styles.marketSection} aria-labelledby="market-title">
        <div className="page-width">
          <ScrollReveal>
            <div className={styles.marketHeading}><span className="eyebrow">계절을 읽고, 오늘의 시장을 읽다</span><h2 id="market-title" tabIndex={-1}>계절이 고른 재료.<br /><em>오늘이 정한 혜택.</em></h2><p>절기는 빵에 어울리는 재료를,<br />코스피는 오늘의 빵 혜택을 알려줍니다.</p></div>
          </ScrollReveal>
          <ScrollReveal>
            <div className={styles.kospiContainer}>
              <div className={styles.kospiQuote}>
                <KospiQuote initial={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live }} />
                <div className={styles.marketExtras}><div><span>원 / 달러</span><strong>{won(market.fxUsdKrw.value)}</strong><small>{market.fxUsdKrw.live ? '시장 데이터' : '샘플 데이터'}</small></div><div><span>서울 기온</span><strong>{market.tempC}°C</strong><small>{market.tempLive ? '관측 데이터' : '샘플 데이터'}</small></div><div><span>오늘의 절기</span><strong>{term.ko}</strong><small>{market.date}</small></div></div>
              </div>
              <div className={styles.todayBenefit}>
                <div className={styles.benefitTop}><span className="eyebrow">TODAY’S BREAD BENEFIT</span><span className={styles.benefitSeal}>오늘<br />혜택</span></div>
                <h3>{up ? '오르는 날에도,' : '잠시 쉬어가는 날에도,'}<br />기분 좋은 한 입.</h3>
                <div className={styles.benefitRate}><strong>{Math.round(plan.rate * 100)}<span>%</span></strong><p>오늘의 빵<br />할인 혜택</p></div>
                {targetCount > 0 ? (
                  <div className={styles.featuredList}>
                    <p className={styles.featuredLabel}><span>오늘의 할인 대상</span><span>{targetCount}종 중 {plan.items.length}종 판매중</span></p>
                    <ul>
                      {plan.items.map(item => (
                        <li key={item.product.productNo} className={styles.featuredBread}>
                          <ProductPhoto productNo={item.product.productNo} name={item.product.name} />
                          <div>
                            <strong>{item.product.name}</strong>
                            <p>{won(item.finalPrice)}원 <del>{won(item.product.price)}원</del></p>
                          </div>
                        </li>
                      ))}
                      {plan.soldOut.map(product => (
                        <li key={product.productNo} className={`${styles.featuredBread} ${styles.soldOutBread}`}>
                          <ProductPhoto productNo={product.productNo} name={product.name} />
                          <div>
                            <strong>{product.name}</strong>
                            <p>{won(product.price)}원 <span className={styles.soldOutTag}>품절</span></p>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {plan.items.length === 0 && <p className={styles.soldOut}>오늘 할인 대상 빵은 모두 품절되었습니다. 조합 만들기는 계속 즐길 수 있어요.</p>}
                  </div>
                ) : <p className={styles.soldOut}>오늘 할인 대상 빵은 모두 품절되었습니다. 조합 만들기는 계속 즐길 수 있어요.</p>}
                <Link href="/event" className={styles.benefitLink}>혜택 확인하고 빵 만들기 <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
            <details className="market-details"><summary>코스피와 빵 혜택은 어떻게 연결되나요? <span aria-hidden="true">＋</span></summary><div className="market-detail-body"><p>{plan.reason}</p><p>코스피의 방향과 등락 폭을 기준으로 할인 대상과 할인율을 정합니다. 재료를 선택해도 할인율은 달라지지 않습니다.</p><p className="fine-print">{plan.guardrailApplied && '원가 상승으로 할인폭이 조정되었습니다. '}이벤트 할인은 시연용 계산입니다. 실제 구매 가격과 적용 혜택은 공식몰에서 확인해주세요.</p></div></details>
          </ScrollReveal>
        </div>
      </section>

      <section className={`${styles.participation} page-width`} aria-labelledby="participation-title">
        <ScrollReveal><div className={styles.participationHeading}><span className="eyebrow">이제, 당신의 계절을 차릴 차례</span><h2 id="participation-title">어떤 맛으로<br />참여하고 싶으세요?</h2></div></ScrollReveal>
        <div className={styles.choiceGrid}>
          <ScrollReveal><Link href="/event" className={`${styles.choiceCard} ${styles.makeChoice}`}><div className={styles.choiceTop}><span>01 / MAKE YOUR OWN</span><span aria-hidden="true">↗</span></div><div className={styles.choiceArt} aria-hidden="true"><span>만들다</span><i>나의<br />취향</i></div><h3>나만의 절기 빵 만들기</h3><p>마음에 드는 빵과 제철 재료를 골라<br />나만의 조합을 완성해보세요.</p><span className={styles.choiceButton}>빵 만들러 가기 <span aria-hidden="true">→</span></span></Link></ScrollReveal>
          <ScrollReveal><Link href="/contest" className={`${styles.choiceCard} ${styles.contestChoice}`}><div className={styles.choiceTop}><span>02 / SHARE THE TASTE</span><span aria-hidden="true">↗</span></div><div className={styles.choiceArt} aria-hidden="true"><span>나누다</span><i>함께<br />한 상</i></div><h3>절기 레시피 콘테스트</h3><p>다른 사람들의 조합을 구경하고<br />마음에 드는 절기상에 투표해보세요.</p><span className={styles.choiceButton}>콘테스트 보러 가기 <span aria-hidden="true">→</span></span></Link></ScrollReveal>
        </div>
        <p className={styles.ending}>계절은 흐르고, 우리의 맛은 쌓입니다. <span>막지</span></p>
      </section>
    </main>
  );
}
