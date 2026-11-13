// Shop stock (SPEC 22-18): two personal rows that change on wall-clock periods.
import { item } from './shop.js';

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
