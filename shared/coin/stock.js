// Shop stock (SPEC 22-20): a 6-slot conveyor row (one new slot every 2 minutes) plus 2 hourly featured legends.
import { item, ITEMS } from './shop.js';

export const ROW_N = 6;
export const TICK_MS = 120000;
export const FEAT_N = 2;
export const FEAT_MS = 3600000;
// [grade, weight] for each newly entering slot (percent).
export const WEIGHTS = [[0, 70], [1, 25], [2, 4.5], [3, 0.5]];
export const GRADE_PRICE = { 2: 400, 3: 1500 };
export const NEVER = ['title.jackpot', 'title.trashking'];

// Price in coins: the item's own price, else the grade price. null = not sellable.
export function priceOf(itOrId) {
  const it = typeof itOrId === 'string' ? item(itOrId) : itOrId;
  if (!it || NEVER.includes(it.id) || it.g >= 4) return null;
  if (Number.isFinite(it.price)) return it.price;
  return GRADE_PRICE[it.g] ?? null;
}

export const tickOf = (now) => Math.floor(now / TICK_MS);
export const featOf = (now) => Math.floor(now / FEAT_MS);
// ms until the next row tick / featured change.
export const nextTickIn = (now) => (tickOf(now) + 1) * TICK_MS - now;
export const featLeft = (now) => (featOf(now) + 1) * FEAT_MS - now;
// ms until the slot that entered at tick `t` leaves the row.
export const slotLeft = (t, now) => Math.max(0, (t + ROW_N) * TICK_MS - now);

const POOL = ITEMS.filter((i) => i.cap === true && i.g < 4 && !NEVER.includes(i.id));
const cands = (g, skip) => POOL.filter((i) => i.g === g && !skip.has(i.id));
const pick = (rng, list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))].id;

function pickGrade(rng) {
  const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [g, w] of WEIGHTS) {
    if (r < w) return g;
    r -= w;
  }
  return WEIGHTS[WEIGHTS.length - 1][0];
}

const skipSet = (owned, exclude) => new Set([...owned, ...exclude, ...NEVER].filter((x) => typeof x === 'string'));

// One new slot: id or null (no candidate in any grade). Not owned, not in `exclude`. Pure; randomness only `rng`.
export function rollSlot(rng, owned = [], exclude = []) {
  const skip = skipSet(owned, exclude);
  const g0 = pickGrade(rng);
  const order = [];
  for (let g = g0; g >= 0; g--) order.push(g); // nearest lower grades first, then higher
  for (let g = g0 + 1; g <= 3; g++) order.push(g);
  for (const g of order) {
    const c = cands(g, skip);
    if (c.length) return pick(rng, c);
  }
  return null;
}

// n slots at once (no duplicates inside), e.g. for the first fill.
export function rollRow(rng, n = ROW_N, owned = [], exclude = []) {
  const out = [];
  const ex = [...exclude];
  for (let k = 0; k < n; k++) {
    const id = rollSlot(rng, owned, ex);
    if (id) ex.push(id);
    out.push(id);
  }
  return out;
}

// The hourly featured items: FEAT_N legends (g=3); short on legends -> concept (g=2); else null.
export function rollFeat(rng, owned = [], exclude = []) {
  const skip = skipSet(owned, exclude);
  const out = [];
  for (const g of [3, 2]) {
    while (out.length < FEAT_N) {
      const c = cands(g, skip);
      if (!c.length) break;
      const id = pick(rng, c);
      skip.add(id);
      out.push(id);
    }
  }
  while (out.length < FEAT_N) out.push(null);
  return out;
}
