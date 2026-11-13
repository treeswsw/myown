// 뽑기 표와 추첨 (SPEC 22-4, 22-14). 난수는 부르는 쪽이 rng() 로 준다.
export const COST = 10;
export const TEN = 10;
export const PITY = 80;
export const ROLL = 10000;
export const TIERS = [
  { tier: 0, chips: 500, w: 7310, name: '동', color: '#8d7b68' },
  { tier: 1, chips: 2000, w: 2500, name: '은', color: '#3d8bff' },
  { tier: 2, chips: 5000, w: 169, name: '금', color: '#b45cff' },
  { tier: 3, chips: 20000, w: 20, name: '잭팟', color: '#ffc93c' },
  { tier: 4, chips: 100000, w: 1, name: '갱식 잭팟', color: 'rainbow' },
];

function tierOf(roll) {
  let acc = 0;
  for (const t of TIERS) {
    acc += t.w;
    if (roll < acc) return t.tier;
  }
  return TIERS.length - 1;
}

// rng() 는 0 이상 1 미만. n 은 1 또는 10.
export function draw(rng, n, pity = 0) {
  if (n !== 1 && n !== TEN) throw new RangeError('draw: n must be 1 or 10');
  let p = Number.isInteger(pity) && pity >= 0 ? pity : 0;
  const tiers = [];
  for (let i = 0; i < n; i++) {
    const roll = Math.min(ROLL - 1, Math.max(0, Math.floor(rng() * ROLL)));
    let tier = tierOf(roll);
    if (tier < 2 && p >= PITY - 1) tier = 2; // 천장: 80번째
    p = tier >= 2 ? 0 : p + 1;
    tiers.push(tier);
  }
  // 10연 보장: 천장 계산을 마친 뒤 적용
  if (n === TEN && tiers.every((t) => t === 0)) tiers[n - 1] = 1;
  const pulls = tiers.map((tier) => ({ chips: TIERS[tier].chips, tier }));
  return { pulls, chips: pulls.reduce((s, x) => s + x.chips, 0), pity: p };
}
