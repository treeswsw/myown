// 캡슐 뽑기 (SPEC 22-16). 난수는 부르는 쪽이 rng() 로 준다(0 이상 1 미만).
import { ITEMS } from './shop.js';

export const COST = 10;
export const TEN = 10;
export const PITY = 80; // 레전드 이상이 안 나온 79개 뒤의 80개째는 레전드 이상 확정
export const WEIGHTS = [6000, 2800, 900, 270, 30]; // 등급 0~4, 합 10000
export const SHARD = [1, 3, 10, 30, 100];
export const CRAFT = 100;
export const TRASH_NEED = 20;

const POOL = [0, 1, 2, 3, 4].map((g) => ITEMS.filter((i) => i.g === g && i.cap === true));
const TOTAL = WEIGHTS.reduce((a, b) => a + b, 0);

const r01 = (rng) => Math.min(0.999999999, Math.max(0, Number(rng()) || 0));

function gradeOf(rng) {
  const roll = Math.floor(r01(rng) * TOTAL);
  let acc = 0;
  for (let g = 0; g < WEIGHTS.length; g++) {
    acc += WEIGHTS[g];
    if (roll < acc) return g;
  }
  return WEIGHTS.length - 1;
}
const pickIn = (rng, g) => POOL[g][Math.floor(r01(rng) * POOL[g].length)];

// n 은 1 또는 10. cpity = 레전드 이상이 안 나온 개수. owned = 이미 가진 id (Set 또는 배열).
export function capsule(rng, n, cpity = 0, owned = []) {
  if (n !== 1 && n !== TEN) throw new RangeError('capsule: n must be 1 or 10');
  const have = new Set(owned);
  let p = Number.isInteger(cpity) && cpity >= 0 ? cpity : 0;
  const picks = [];
  for (let i = 0; i < n; i++) {
    let g = gradeOf(rng);
    if (g < 3 && p >= PITY - 1) g = 3;
    p = g >= 3 ? 0 : p + 1;
    picks.push(pickIn(rng, g));
  }
  // 10개 보장: 컨셉 이상이 없으면 마지막을 컨셉으로 (천장 계산 뒤)
  if (n === TEN && picks.every((it) => it.g < 2)) picks[n - 1] = pickIn(rng, 2);
  const pulls = [];
  let shard = 0;
  for (const it of picks) {
    const dup = have.has(it.id);
    have.add(it.id);
    const s = dup ? SHARD[it.g] : 0;
    shard += s;
    pulls.push({ id: it.id, g: it.g, dup, shard: s });
  }
  return { pulls, shard, cpity: p };
}

// 수집 보상: 잡템 칭호 20개를 가졌고 아직 없으면 true
export function trashKingDue(owned) {
  const have = new Set(owned);
  if (have.has('title.trashking')) return false;
  let n = 0;
  for (const it of ITEMS) if (it.slot === 'title' && it.g === 0 && have.has(it.id)) n++;
  return n >= TRASH_NEED;
}
