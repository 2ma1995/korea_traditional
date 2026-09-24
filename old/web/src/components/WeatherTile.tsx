import styles from './WeatherTile.module.css';

/**
 * 서울 날씨 타일.
 *
 * 아이콘은 Meteocons (Bas Milius, MIT) — public/weather/ 에 필요한 것만 복사해 뒀다.
 * 애니메이션이 SVG 안에 SMIL로 들어있어 <img>로 불러도 그대로 움직인다.
 * 그래서 이 컴포넌트는 클라이언트 코드가 필요 없다 — 서버 컴포넌트로 두어야
 * 첫 페인트에 날씨가 비지 않는다.
 *
 * 출처와 아이콘 추가 방법은 public/weather/README.md 참고.
 */

interface Weather {
  /** public/weather/ 안의 파일 이름 (확장자 제외) */
  icon: string;
  label: string;
  /** 타일 배경 색조 */
  tone: 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
}

/**
 * WMO 날씨 코드 → 아이콘.
 *
 * Open-Meteo가 쓰는 표준 코드다. 낮/밤이 갈리는 것은 맑음·구름뿐이라
 * 그 둘만 isDay를 본다.
 */
function weatherOf(code: number | null, isDay: boolean): Weather {
  const dn = (base: string) => `${base}-${isDay ? 'day' : 'night'}`;

  switch (code) {
    case 0:
      return { icon: dn('clear'), label: '맑음', tone: 'clear' };
    case 1:
    case 2:
      return { icon: dn('partly-cloudy'), label: '구름 조금', tone: 'cloudy' };
    case 3:
      return { icon: 'overcast', label: '흐림', tone: 'cloudy' };
    case 45:
      return { icon: 'fog', label: '안개', tone: 'fog' };
    case 48:
      return { icon: 'mist', label: '짙은 안개', tone: 'fog' };
    case 51:
    case 53:
    case 55:
      return { icon: 'drizzle', label: '이슬비', tone: 'rain' };
    case 56:
    case 57:
      return { icon: 'sleet', label: '어는 이슬비', tone: 'snow' };
    case 61:
    case 63:
    case 65:
      return { icon: 'rain', label: '비', tone: 'rain' };
    case 66:
    case 67:
      return { icon: 'sleet', label: '어는 비', tone: 'snow' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { icon: 'snow', label: '눈', tone: 'snow' };
    case 80:
    case 81:
    case 82:
      return { icon: dn('partly-cloudy') + '-rain', label: '소나기', tone: 'rain' };
    case 85:
    case 86:
      return { icon: 'snow', label: '소낙눈', tone: 'snow' };
    case 95:
      return { icon: 'thunderstorms', label: '뇌우', tone: 'storm' };
    case 96:
    case 99:
      return { icon: 'thunderstorms-rain', label: '우박 동반 뇌우', tone: 'storm' };
    default:
      // 코드를 못 받았거나 표에 없는 값. 흐림으로 떨어뜨린다.
      return { icon: 'overcast', label: '흐림', tone: 'cloudy' };
  }
}

/** 절기 서사에 맞춘 한 줄. 하늘과 기온을 같이 읽는다. */
function noteFor(tone: Weather['tone'], tempC: number) {
  if (tone === 'rain') return '비 오는 날엔 오래 굽는 빵이 어울려요';
  if (tone === 'snow') return '눈 내리는 날, 따뜻한 한 입';
  if (tone === 'storm') return '천둥 치는 날엔 실내에서 느긋하게';
  if (tone === 'fog') return '안개 낀 아침, 잔잔한 단맛';
  if (tempC >= 28) return '더운 날엔 시원하게 식혀 드세요';
  if (tempC <= 5) return '추운 날, 데워 먹으면 더 좋아요';
  if (tone === 'clear') return '볕 좋은 날, 바깥에서 한 조각';
  return '선선한 날엔 진한 맛이 어울려요';
}

export default function WeatherTile({
  tempC,
  weatherCode,
  isDay,
  live,
}: {
  tempC: number;
  weatherCode: number | null;
  isDay: boolean;
  live: boolean;
}) {
  const weather = weatherOf(weatherCode, isDay);

  return (
    <div className={styles.tile} data-tone={weather.tone}>
      <div className={styles.head}>
        <span>서울 날씨</span>
        <small>{live ? '관측 데이터' : '샘플 데이터'}</small>
      </div>
      <div className={styles.body}>
        {/* next/image는 SVG 애니메이션을 최적화 과정에서 잃는다. 원본 그대로 쓴다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.icon} src={`/weather/${weather.icon}.svg`} alt={weather.label} width={72} height={72} />
        <div className={styles.reading}>
          <strong>
            {tempC}
            <span>°C</span>
          </strong>
          <span className={styles.condition}>{weather.label}</span>
        </div>
        <p className={styles.note}>{noteFor(weather.tone, tempC)}</p>
      </div>
    </div>
  );
}
