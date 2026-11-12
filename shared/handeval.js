import { rankValue } from './cards.js';

export const HAND_NAMES = [
  '하이카드', '원페어', '투페어', '트리플', '스트레이트',
  '플러시', '풀하우스', '포카드', '스트레이트 플러시',
];
const ROYAL = '로열 플러시';

// Comparable array: [category, ...tiebreakers]. Compare lexicographically.
function score5(cards) {
  const ranks = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // wheel
  }
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, ...byGroup];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, ...byGroup];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...ranks];
}

export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// Display order: most significant cards first; the wheel's ace goes last.
function arrange(cards, score) {
  const counts = new Map();
  for (const c of cards) counts.set(rankValue(c), (counts.get(rankValue(c)) ?? 0) + 1);
  const wheel = (score[0] === 4 || score[0] === 8) && score[1] === 5;
  const key = (c) => {
    const v = rankValue(c);
    return wheel && v === 14 ? 1 : v;
  };
  return [...cards].sort((a, b) => counts.get(rankValue(b)) - counts.get(rankValue(a)) || key(b) - key(a));
}

function nameOf(score) {
  return score[0] === 8 && score[1] === 14 ? ROYAL : HAND_NAMES[score[0]];
}

// Best 5-card hand out of 5..7 cards.
export function evaluate(cards) {
  let best = null;
  let bestCards = null;
  const pick = [];
  const go = (start) => {
    if (pick.length === 5) {
      const s = score5(pick);
      if (!best || compareScores(s, best) > 0) {
        best = s;
        bestCards = [...pick];
      }
      return;
    }
    for (let i = start; i < cards.length; i++) {
      pick.push(cards[i]);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return { score: best, name: nameOf(best), cards: arrange(bestCards, best) };
}

// Name for any 2..7 cards (preflop hands have no 5-card rank).
export function describe(cards) {
  if (cards.length >= 5) return evaluate(cards).name;
  const ranks = cards.map(rankValue);
  return new Set(ranks).size < ranks.length ? HAND_NAMES[1] : HAND_NAMES[0];
}
