import Link from 'next/link';
import Intro from '@/components/Intro';
import LiveTicker from '@/components/LiveTicker';
import ProductPhoto from '@/components/ProductPhoto';
import ScrollReveal from '@/components/ScrollReveal';
import SeasonJourney, { type JourneySeason } from '@/components/SeasonJourney';
import { buildDailyPlan } from '@/lib/discount';
import { getMarketSnapshot } from '@/lib/market';
import { currentTerm, nextTerm, groupBySeason, termsInTraditionalOrder } from '@/lib/solarTerm';
import styles from './landing.module.css';

const won = (value: number) => value.toLocaleString('ko-KR');
const seasonStories = [
  { hanja: '春', english: 'SPRING', title: '봄이 오면,\n다시 피어나는 맛.', description: '얼어 있던 땅이 풀리고, 식탁에도 초록이 돋아납니다. 향긋한 봄의 재료로 한 해의 첫 맛을 깨워보세요.', ingredients: ['쑥', '딸기', '봄나물'], defaultTerm: '청명' },
  { hanja: '夏', english: 'SUMMER', title: '여름의 볕을,\n한 입 가득.', description: '길어진 햇살 아래 과일은 달아지고, 초록은 짙어집니다. 싱그러운 여름의 맛을 빵 위에 더해보세요.', ingredients: ['복숭아', '감자', '수박'], defaultTerm: '하지' },
  { hanja: '秋', english: 'AUTUMN', title: '가을이 익으면,\n마음도 넉넉하게.', description: '서늘해진 바람과 함께 찾아온 수확의 계절. 잘 여문 열매와 곡식으로 풍성한 한 상을 차립니다.', ingredients: ['포도', '고구마', '사과'], defaultTerm: '백로' },
  { hanja: '冬', english: 'WINTER', title: '겨울의 온기를,\n서로 나누는 맛.', description: '긴 밤에는 따뜻한 한 입이 필요하니까. 팥과 견과의 깊은 맛을 나누며 다음 봄을 기다립니다.', ingredients: ['팥', '감귤', '견과'], defaultTerm: '동지' },
];

export default async function Home() {
  const today = new Date();
  const market = await getMarketSnapshot(today);
  const plan = buildDailyPlan(market);
  const term = currentTerm(today);
  const upcoming = nextTerm(today);
  const seasons: JourneySeason[] = groupBySeason(termsInTraditionalOrder(today)).map(({ label, items }, index) => ({
    ...seasonStories[index],
    name: label,
    terms: items.map(item => item.term),
  }));
  const up = market.kospi.changePct >= 0;
  const featured = plan.items[0];

  return (
    <main id="main-content" className={styles.landing}>
      <Intro />
      <section className={`${styles.opening} page-width`} aria-labelledby="landing-title">
        <div className={styles.openingCopy}>
          <span className="eyebrow">MAKJI · THE TASTE OF TWENTY-FOUR SEASONS</span>
          <h1 id="landing-title">우리의 계절에는<br /><em>스물네 가지</em> 맛이 있다.</h1>
          <p>계절을 읽던 지혜, 제철을 즐기던 우리 식탁.<br />스크롤을 내려 막지의 사계절을 만나보세요.</p>
          <div className={styles.openingActions}>
            <a href="#season-journey" className="button button-primary">계절의 문 열기 <span aria-hidden="true">↓</span></a>
            <Link href="/event">빵 만들기 ↗</Link>
            <Link href="/contest">콘테스트 ↗</Link>
          </div>
        </div>
        <div className={styles.openingArt}>
          <div className={styles.orbit} aria-hidden="true"><span>春</span><span>夏</span><span>秋</span><span>冬</span></div>
          <div className={styles.todaySeal}>
            <span>오늘, 우리가 머무는 절기</span>
            <strong>{term.ko}</strong>
            <span className={styles.todayHanja}>{term.hanja}</span>
            <small>{String(term.month).padStart(2, '0')}.{String(term.day).padStart(2, '0')} — {upcoming.term.ko}까지 D–{upcoming.daysLeft}</small>
          </div>
          <span className={styles.artCaption}>一 年 二 十 四 味</span>
        </div>
        <div className={styles.openingBottom}><span>24절기 · 태양의 움직임에 따라 나눈 한 해의 스물네 마디</span><a href="#season-journey">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></a></div>
      </section>

      <SeasonJourney seasons={seasons} currentLongitude={term.longitude} />

      <section id="today-market" className={styles.marketSection} aria-labelledby="market-title">
        <div className="page-width">
          <ScrollReveal>
            <div className={styles.marketHeading}><span className="eyebrow">계절을 읽고, 오늘의 시장을 읽다</span><h2 id="market-title">계절이 고른 재료.<br /><em>오늘이 정한 혜택.</em></h2><p>절기는 빵에 어울리는 재료를,<br />코스피는 오늘의 빵 혜택을 알려줍니다.</p></div>
          </ScrollReveal>
          <ScrollReveal>
            <div className={styles.kospiContainer}>
              <div className={styles.kospiQuote}>
                <div className={styles.quoteHeader}><span>오늘의 코스피 <b>KOSPI</b></span><span className={market.kospi.live ? styles.liveBadge : styles.sampleBadge}>{market.kospi.live ? '시장 데이터' : '샘플 데이터'}</span></div>
                <strong className={styles.indexValue}>{market.kospi.value.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                <span className={`${styles.indexChange} ${up ? styles.up : styles.down}`}>{up ? '▲' : '▼'} {Math.abs(market.kospi.changePct).toFixed(2)}% <small>전일 대비</small></span>
                <div className={styles.marketStatus}><LiveTicker quoteUpdatedAt={market.kospi.updatedAt} fetchedAt={market.fetchedAt} marketOpen={market.kospiMarketOpen} sourceLabel={market.kospi.live ? '시장 데이터' : '샘플 데이터'} /></div>
                <div className={styles.marketExtras}><div><span>원 / 달러</span><strong>{won(market.fxUsdKrw.value)}</strong><small>{market.fxUsdKrw.live ? '시장 데이터' : '샘플 데이터'}</small></div><div><span>서울 기온</span><strong>{market.tempC}°C</strong><small>{market.tempLive ? '관측 데이터' : '샘플 데이터'}</small></div><div><span>오늘의 절기</span><strong>{term.ko}</strong><small>{market.date}</small></div></div>
              </div>
              <div className={styles.todayBenefit}>
                <div className={styles.benefitTop}><span className="eyebrow">TODAY’S BREAD BENEFIT</span><span className={styles.benefitSeal}>오늘<br />혜택</span></div>
                <h3>{up ? '오르는 날에도,' : '잠시 쉬어가는 날에도,'}<br />기분 좋은 한 입.</h3>
                <div className={styles.benefitRate}><strong>{Math.round(plan.rate * 100)}<span>%</span></strong><p>오늘의 빵<br />할인 혜택</p></div>
                {featured ? <div className={styles.featuredBread}><ProductPhoto productNo={featured.product.productNo} name={featured.product.name} /><div><span>오늘의 할인 대상</span><strong>{featured.product.name}</strong><p>{won(featured.finalPrice)}원 <del>{won(featured.product.price)}원</del></p></div></div> : <p className={styles.soldOut}>오늘 할인 대상 빵은 모두 품절되었습니다. 조합 만들기는 계속 즐길 수 있어요.</p>}
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
