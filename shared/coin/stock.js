// Shop stock (SPEC 22-18): two personal rows that change on wall-clock periods.
import { item, ITEMS } from './shop.js';

export const ROWS = {
  a: { n: 5, ms: 300000, w: [[0, 85], [1, 15]] },
  b: { n: 5, ms: 3600000, w: [[1, 77], [2, 20], [3, 3]] },
};
export const GRADE_PRICE = { 2: 400, 3: 1500 };
export const NEVER = ['title.jackpot', 'title.trashking'];

// Price in coins: the item's own price, else the grade price. null = not sellable.
export function priceOf(itOrId) {
  const it = typeof itOrId === 'string' ? item(itOrId) : itOrId;
  if (!it || NEVER.includes(it.id) || it.g >= 4) return null;
  if (Number.isFinite(it.price)) return it.price;
  return GRADE_PRICE[it.g] ?? null;
}

// Which period of this row `now` falls in.
export const periodOf = (row, now) => Math.floor(now / row.ms);

// ms until this row changes.
export const leftOf = (row, p, now) => Math.max(0, (p + 1) * row.ms - now);

// Pick a grade by weight from row.w ([[grade, weight], ...]) using rng() in [0,1).
function pickGrade(rng, row) {
  const total = row.w.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [g, w] of row.w) {
    if (r < w) return g;
    r -= w;
  }
  return row.w[row.w.length - 1][0];
}

// Roll one row: ids[row.n], null for an empty slot. Pure; the only randomness is `rng`.
// owned / exclude: arrays (or Sets) of ids that must not appear. No duplicates inside the row.
export function rollRow(rng, row, owned = [], exclude = []) {
  const skip = new Set([...owned, ...exclude, ...NEVER].filter((x) => typeof x === 'string'));
  const pool = ITEMS.filter((i) => i.cap === true && i.g < 4);
  const out = [];
  for (let k = 0; k < row.n; k++) {
    const g0 = pickGrade(rng, row);
    // nearest lower grades first, then higher
    const order = [];
    for (let g = g0; g >= 0; g--) order.push(g);
    for (let g = g0 + 1; g <= 3; g++) order.push(g);
    let id = null;
    for (const g of order) {
      const cand = pool.filter((i) => i.g === g && !skip.has(i.id));
      if (cand.length) {
        id = cand[Math.min(cand.length - 1, Math.floor(rng() * cand.length))].id;
        break;
      }
    }
    if (id) skip.add(id);
    out.push(id);
  }
  return out;
}
