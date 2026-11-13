// 요트다이스 상수 (GDD 3절, SPEC 19절). 순서 = 점수표 위 → 아래.
export const CATS = Object.freeze(['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht']);
export const UPPER = Object.freeze(CATS.slice(0, 6));
export const ROUNDS = 12, MAX_ROLLS = 3, DICE = 5, BONUS_AT = 63, BONUS = 35, MIN_PLAYERS = 2, MAX_PLAYERS = 4;
