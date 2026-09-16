import Link from 'next/link';
import Intro from '@/components/Intro';
import KospiQuote from '@/components/KospiQuote';
import DiscountList, { type DiscountRow } from '@/components/DiscountList';
import ScrollReveal from '@/components/ScrollReveal';
import WeatherTile from '@/components/WeatherTile';
import FxSparkline from '@/components/FxSparkline';
import TermBar from '@/components/TermBar';
import SeasonJourney, { type JourneySeason } from '@/components/SeasonJourney';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { loadTiers } from '@/lib/settings';
import { currentTerm, nextTerm, groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';
import styles from '../landing.module.css';
import { SEASON_STORIES } from '@/data/seasonStories';

const won = (value: number) => value.toLocaleString('ko-KR');

/**
 * 절기 화면 — 빵장으로 전환하며 접었던 첫 기획을 그대로 되살린 것.
 *
 * 오프닝 → 계절 여정(스물네 절기) → 오늘의 시장(절기·코스피·날씨·환율) → 갈래.
 * 빵장('/')과 나란히 두고 헤더에서 오간다. 대회 갈래만 빼고 빵장 카드로 바꿨다.
 * 할인 계산(buildDailyPlan)은 방향으로 대상 라인을 고르는 옛 규칙이라 빵장과 다르다.
 */
export default async function Home() {
  const today = new Date();
  const market = await getMarketSnapshot(today);
  /* 관리자가 바꾼 구간을 손님 화면도 그대로 따라야 한다.
     둘이 다르면 "우리 사이트 30%인데 자사몰은 20%"가 된다. */
  const plan = buildDailyPlan(market, undefined, await loadTiers());
  const term = currentTerm(today);
  const upcoming = nextTerm(today);
  const seasons: JourneySeason[] = groupBySeason(termsInTraditionalOrder(today)).map(({ items }, index) => ({
    ...SEASON_STORIES[index],
    terms: items.map(item => item.term),
  }));
  const up = market.kospi.changePct >= 0;
  // 판매중을 앞에, 품절을 뒤에 둔다. 품절도 남겨야 "여섯 종 중 넷이 품절"이 읽힌다.
  const discountRows: DiscountRow[] = [
    ...plan.items.map(item => ({
      productNo: item.product.productNo,
      name: item.product.name,
      price: item.product.price,
      finalPrice: item.finalPrice,
      soldOut: false,
    })),
    ...plan.soldOut.map(product => ({
      productNo: product.productNo,
      name: product.name,
      price: product.price,
      soldOut: true,
    })),
  ];
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
            <div className={styles.marketHeading}><h2 id="market-title" tabIndex={-1}>계절이 고른 재료.<br /><em>오늘이 정한 혜택.</em></h2></div>
          </ScrollReveal>
          <ScrollReveal>
            <div className={styles.kospiContainer}>
              <div className={styles.kospiQuote}>
                <TermBar label="오늘의 절기" name={term.ko} hanja={term.hanja} note={term.food} nextName={upcoming.term.ko} daysLeft={upcoming.daysLeft} date={market.date} />
                <KospiQuote initial={{ value: market.kospi.value, changePct: market.kospi.changePct, live: market.kospi.live, marketOpen: market.kospiMarketOpen }} />
                <div className={styles.marketExtras}>
                  <WeatherTile tempC={market.tempC} weatherCode={market.weatherCode} isDay={market.isDay} live={market.tempLive} />
                  <div className={styles.fxTile}>
                    <div className={styles.fxHead}>
                      <span>원 / 달러</span>
                      <small>{market.fxUsdKrw.live ? '시장 데이터' : '샘플 데이터'}</small>
                    </div>
                    <div className={styles.fxReading}>
                      <strong>{won(market.fxUsdKrw.value)}</strong>
                      <span className={market.fxUsdKrw.changePct >= 0 ? styles.up : styles.down}>
                        {market.fxUsdKrw.changePct >= 0 ? '▲' : '▼'} {Math.abs(market.fxUsdKrw.changePct).toFixed(2)}%
                        <small>전일 대비</small>
                      </span>
                    </div>
                    <FxSparkline series={market.fxSeries} label="원 달러 환율" />
                  </div>
                </div>
              </div>
              <div className={styles.todayBenefit}>
                <div className={styles.benefitTop}><span className="eyebrow">TODAY’S BREAD BENEFIT</span><span className={styles.benefitSeal}>오늘<br />혜택</span></div>
                <h3>{up ? '오르는 날에도,' : '잠시 쉬어가는 날에도,'}<br />기분 좋은 한 입.</h3>
                <div className={styles.benefitRate}><strong>{Math.round(plan.rate * 100)}<span>%</span></strong><p>오늘의 빵<br />할인 혜택</p></div>
                {targetCount > 0 ? (
                  <DiscountList rows={discountRows} targetCount={targetCount} onSale={plan.items.length} />
                ) : <p className={styles.soldOut}>오늘 할인 대상 빵이 모두 품절되었습니다.</p>}
                <a href="https://makji.kr/product/list.html?cate_no=24" target="_blank" rel="noopener noreferrer" className={styles.benefitLink}>할인 제품 둘러보기 <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className={`${styles.participation} page-width`} aria-labelledby="participation-title">
        <ScrollReveal><div className={styles.participationHeading}><span className="eyebrow">이제, 당신의 계절을 차릴 차례</span><h2 id="participation-title">어떤 맛으로<br />참여하고 싶으세요?</h2></div></ScrollReveal>
        <div className={styles.choiceGrid}>
          <ScrollReveal><Link href="/" className={`${styles.choiceCard} ${styles.contestChoice}`}><div className={styles.choiceTop}><span>01 / AFTER THE BELL</span><span aria-hidden="true">↗</span></div><div className={styles.choiceArt} aria-hidden="true"><span>정산</span><i>장이<br />끝나면</i></div><h3>빵장</h3><p>주식장이 끝나면 빵장이 열립니다.<br />오늘 내 종목이 오늘 내 빵값을 정합니다.</p><span className={styles.choiceButton}>빵장 가기 <span aria-hidden="true">→</span></span></Link></ScrollReveal>
          <ScrollReveal><Link href="/archive" className={`${styles.choiceCard} ${styles.readChoice}`}><div className={styles.choiceTop}><span>02 / READ THE SEASONS</span><span aria-hidden="true">↗</span></div><div className={styles.choiceArt} aria-hidden="true"><span>읽다</span><i>스물네<br />마디</i></div><h3>스물네 절기 이야기</h3><p>절기마다 어떤 재료와 맛이 있었는지<br />절기 기록장을 펼쳐보세요.</p><span className={styles.choiceButton}>절기 기록장 펼치기 <span aria-hidden="true">→</span></span></Link></ScrollReveal>
        </div>
        <p className={styles.ending}>계절은 흐르고, 우리의 맛은 쌓입니다. <span>막지</span></p>
      </section>
    </main>
  );
}
