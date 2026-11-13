// 점수 계산 — 요트다이스 공식 룰 (GDD 3-2). 순수 함수, 주사위 순서는 상관없다.
import { CATS, UPPER, BONUS_AT, BONUS } from './constants.js';

function counts(dice) {
  if (!Array.isArray(dice) || dice.length !== 5) throw new TypeError('dice must be 5 numbers');
  const c = [0, 0, 0, 0, 0, 0, 0]; // c[1..6]
  for (const v of dice) {
    if (!Number.isInteger(v) || v < 1 || v > 6) throw new RangeError('die must be 1..6');
    c[v]++;
  }
  return c;
}
const sum = (dice) => dice.reduce((a, b) => a + b, 0);
const hasRun = (c, from, len) => { for (let v = from; v < from + len; v++) if (!c[v]) return false; return true; };

export function scoreOf(cat, dice) {
  const c = counts(dice);
  const i = UPPER.indexOf(cat);
  if (i >= 0) return c[i + 1] * (i + 1);
  const max = Math.max(c[1], c[2], c[3], c[4], c[5], c[6]);
  switch (cat) {
    case 'choice': return sum(dice);
    case 'fourKind': return max >= 4 ? sum(dice) : 0;
    case 'fullHouse': return c.includes(3) && c.includes(2) ? sum(dice) : 0; // 같은 눈 5개는 풀하우스가 아니다
    case 'smallStraight': return hasRun(c, 1, 4) || hasRun(c, 2, 4) || hasRun(c, 3, 4) ? 15 : 0;
    case 'largeStraight': return hasRun(c, 1, 5) || hasRun(c, 2, 5) ? 30 : 0;
    case 'yacht': return max === 5 ? 50 : 0;
    default: throw new RangeError(`unknown category: ${cat}`);
  }
}

// 빈칸마다 지금 주사위로 받을 점수.
export function previewOf(dice, scores) {
  const out = {};
  for (const cat of CATS) if (scores[cat] == null) out[cat] = scoreOf(cat, dice);
  return out;
}

export function totals(scores) {
  let upper = 0, rest = 0;
  for (const cat of CATS) {
    const n = scores[cat];
    if (n == null) continue;
    if (UPPER.includes(cat)) upper += n; else rest += n;
  }
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  return { upper, bonus, total: upper + bonus + rest };
}

// 굴린 다섯 눈만 보고 정하는 족보 알림 (GDD 3-3). 여럿에 맞으면 앞의 것 하나.
export function comboOf(dice) {
  if (scoreOf('yacht', dice)) return 'yacht';
  if (scoreOf('largeStraight', dice)) return 'largeStraight';
  if (scoreOf('fourKind', dice)) return 'fourKind';
  if (scoreOf('fullHouse', dice)) return 'fullHouse';
  if (scoreOf('smallStraight', dice)) return 'smallStraight';
  return null;
}
