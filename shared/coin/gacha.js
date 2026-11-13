// 카드 뽑기 표와 추첨 (SPEC 22-15, 22-14). 난수는 부르는 쪽이 rng() 로 준다.
export const COST = 5;
export const TEN = 10;
export const PITY = 60; // 대박(tier 3) 이상이 안 나온 59장 뒤의 60장째는 대박 이상 확정
export const ROLL = 100000;
export const POOL_START = 10000;
export const POOL_STEP = 20;
export const GUARANTEE_CHIPS = 1000;
export const JACKPOT_TIER = 5;
// tier 5 의 chips 는 표시용(0). 실제로는 금고 전부.
export const TIERS = [
  { tier: 0, chips: 200, w: 58000, name: '동', color: '#8d7b68' },
  { tier: 1, chips: 500, w: 30000, name: '은', color: '#c0c8d4' },
  { tier: 2, chips: 1000, w: 9000, name: '금', color: '#f2c444' },
  { tier: 3, chips: 2500, w: 2400, name: '대박', color: '#ff453a' },
  { tier: 4, chips: 10000, w: 500, name: '잭팟', color: '#7fd4ff' },
  { tier: 5, chips: 0, w: 100, name: '갱식 잭팟', color: 'rainbow' },
];

function tierOf(roll) {
  let acc = 0;
  for (const t of TIERS) {
    acc += t.w;
    if (roll < acc) return t.tier;
  }
  return TIERS.length - 1;
}

// rng() 는 0 이상 1 미만. n 은 1 또는 10. pool 은 금고(칩).
export function draw(rng, n, pity = 0, pool = POOL_START) {
  if (n !== 1 && n !== TEN) throw new RangeError('draw: n must be 1 or 10');
  let p = Number.isInteger(pity) && pity >= 0 ? pity : 0;
  let pl = Number.isInteger(pool) && pool >= 0 ? pool : POOL_START;
  let jackpot = false;
  const pulls = [];
  for (let i = 0; i < n; i++) {
    pl += POOL_STEP; // 평가 전에 금고가 먼저 자란다
    const roll = Math.min(ROLL - 1, Math.max(0, Math.floor(rng() * ROLL)));
    let tier = tierOf(roll);
    if (tier < 3 && p >= PITY - 1) tier = 3; // 천장
    p = tier >= 3 ? 0 : p + 1;
    let chips = TIERS[tier].chips;
    if (tier === JACKPOT_TIER) {
      chips = pl;
      pl = POOL_START;
      jackpot = true;
    }
    pulls.push({ chips, tier });
  }
  // 10장 보장: 금 이상이 없으면 마지막 장을 금으로 (천장 계산 뒤)
  if (n === TEN && pulls.every((x) => x.tier < 2)) pulls[n - 1] = { chips: GUARANTEE_CHIPS, tier: 2 };
  return { pulls, chips: pulls.reduce((s, x) => s + x.chips, 0), pity: p, pool: pl, jackpot };
}

// 무료 뽑기 (SPEC 22-15): 2시간마다 1장 충전, 최대 2장. free = {n, at}, 서버 시계로 게으르게 계산한다.
export const FREE_MS = 2 * 60 * 60 * 1000;
export const FREE_MAX = 2;
export function freeNow(free, now) {
  let n = free && Number.isInteger(free.n) && free.n >= 0 ? Math.min(FREE_MAX, free.n) : FREE_MAX;
  let at = free && Number.isFinite(free.at) ? free.at : now;
  if (at > now) at = now; // 시계가 되감겨도 멈추지 않게
  if (n < FREE_MAX) {
    const k = Math.floor((now - at) / FREE_MS);
    if (k > 0) {
      n = Math.min(FREE_MAX, n + k);
      at += k * FREE_MS;
    }
  }
  if (n >= FREE_MAX) at = now;
  return { n, at };
}
// 다음 충전까지 남은 ms (가득이면 null)
export const freeNext = (f, now) => (f.n >= FREE_MAX ? null : Math.max(0, f.at + FREE_MS - now));
