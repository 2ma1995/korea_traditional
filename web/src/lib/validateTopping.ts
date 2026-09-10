import { BLOCKED_WORDS, isKnownIngredient } from '@/data/pairingDictionary';
import { isInSeason, SEASONAL_INGREDIENTS, type SeasonalIngredient } from '@/data/seasonalIngredients';

export const CUSTOM_MAX_LENGTH = 12;

export type ToppingCheck =
  | { ok: true; value: string }
  | { ok: false; message: string; /** 목록에서 대신 고르게 할 재료 */ suggestCode?: string };

interface Context {
  /** 이번 달 제철이라 화면에 떠 있는 재료 */
  onScreen: SeasonalIngredient[];
  /** 이미 올린 재료 이름 (제철에서 고른 것 + 직접 적은 것) */
  alreadyAdded: string[];
  /** 제철 판정 기준 월 (1-12) */
  month: number;
}

const MONTH_LABEL = (from: number, to: number) => (from === to ? `${from}월` : `${from}~${to}월`);

/** 받침 유무로 은/는을 고른다. 「감귤는」 같은 문장이 나오지 않게 한다. */
function withTopicParticle(word: string) {
  const code = word.charCodeAt(word.length - 1);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  return `${word}${isHangul && (code - 0xac00) % 28 !== 0 ? '은' : '는'}`;
}

/**
 * 「기타」 입력 검증.
 *
 * 검사 순서가 곧 안내 우선순위다. 앞쪽에서 걸리면 뒤는 보지 않는다.
 *   1 형식 → 2 비속어 → 3 이미 올림 → 4 목록에 있음 → 5 철 지남 → 6 사전에 없음
 *
 * 4번과 5번을 사전 검사보다 앞에 두는 이유: 「포도」는 사전에도 있어서
 * 그냥 통과시키면 목록에 있는 재료가 칩으로 두 번 생긴다.
 */
export function validateCustomTopping(raw: string, { onScreen, alreadyAdded, month }: Context): ToppingCheck {
  const value = raw.trim().replace(/\s+/g, ' ');

  // 1. 형식
  if (!value) return { ok: false, message: '재료 이름을 적어주세요.' };
  if (value.length > CUSTOM_MAX_LENGTH) {
    return { ok: false, message: `${CUSTOM_MAX_LENGTH}글자까지 적을 수 있어요.` };
  }
  // 완성형 한글과 공백만. 자모(ㅋㅋㅋ)·숫자·영문·특수문자를 한 번에 걸러낸다.
  if (!/^[가-힣][가-힣 ]*$/.test(value)) {
    return { ok: false, message: '재료 이름은 한글로만 적어주세요.' };
  }
  if (/(.)\1{2,}/.test(value.replace(/\s/g, ''))) {
    return { ok: false, message: '재료 이름을 정확히 적어주세요.' };
  }

  // 2. 비속어
  const compact = value.replace(/\s/g, '');
  if (BLOCKED_WORDS.some((word) => compact.includes(word))) {
    return { ok: false, message: '사용할 수 없는 표현이에요.' };
  }

  // 3. 이미 올린 재료
  if (alreadyAdded.includes(value)) {
    return { ok: false, message: '이미 올린 재료예요.' };
  }

  // 4. 화면 목록에 있는 재료 — 직접 적지 말고 버튼으로 고르게 한다
  const listed = onScreen.find((ingredient) => ingredient.name === value);
  if (listed) {
    return { ok: false, message: `위 목록에 있어요. ${listed.emoji} 버튼으로 골라주세요.`, suggestCode: listed.code };
  }

  // 5. 마스터에는 있지만 이번 달 제철이 아닌 재료
  const offSeason = SEASONAL_INGREDIENTS.find((ingredient) => ingredient.name === value);
  if (offSeason && !isInSeason(offSeason, month)) {
    const { from, to } = offSeason.season;
    return { ok: false, message: `${withTopicParticle(value)} ${MONTH_LABEL(from, to)}이 제철이에요.` };
  }

  // 6. 사전에 없는 말
  if (!isKnownIngredient(value)) {
    return { ok: false, message: '빵에 올릴 재료만 적을 수 있어요.' };
  }

  return { ok: true, value };
}
