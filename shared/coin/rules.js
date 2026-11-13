// 갱식 코인 적립표 (SPEC 22-2, 22-14). 홀덤·표에 없는 mode 는 0.
export const COIN_RULES = {
  bluff: { finish: 1, win: 1, gapMs: 30000 },
  liar: { finish: 1, win: 1, gapMs: 45000 },
  draw: { finish: 2, win: 2, gapMs: 120000 },
  yacht: { finish: 3, win: 4, gapMs: 240000 },
};

// 받는 코인 = finish + (이겼으면 win × 상대 수). opp 는 부르는 쪽이 정한다.
export function coinsFor(mode, { won = false, opp = 0 } = {}) {
  if (!Object.prototype.hasOwnProperty.call(COIN_RULES, mode)) return 0;
  const r = COIN_RULES[mode];
  const o = Number.isInteger(opp) && opp > 0 ? opp : 0;
  return r.finish + (won ? r.win * o : 0);
}
