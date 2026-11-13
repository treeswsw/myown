// 체커 8×8 — 수 {from,to}. 말을 누르면 갈 곳에 점. seat 1 은 판을 뒤집어 본다.
import { stone, same, frame, hit, squares, lastCells, moveFx } from './util.js';

const M = 4, W = 80 + M * 2;
const CROWN = 'M-2.1 1.3L-2.5-1.2L-1.1 0L0-1.8L1.1 0L2.5-1.2L2.1 1.3Z';

const man = (v, cx, cy) =>
  stone(cx, cy, 3.9, v.p ? 'w' : 'b') + `<circle class="mn-ck-ring mn-ck-ring-${v.p}" cx="${cx}" cy="${cy}" r="2.8"/>` +
  (v.k ? `<path class="mn-ck-crown" transform="translate(${cx} ${cy})" d="${CROWN}"/>` : '');

export function view(c) {
  const { board, last, chain } = c.state;
  const k = c.flip ? -1 : 1;
  const px = (v) => M + (c.flip ? 7 - v : v) * 10;
  const sel = c.ui.sel || (c.can && chain) || null;
  const fx = moveFx(c, (v) => v.p);
  let s = frame(W, W, M, 'mn-sq-l') + squares(M);
  for (const p of lastCells(last)) s += `<rect class="mn-sq-last" x="${px(p.x)}" y="${px(p.y)}" width="10" height="10"/>`;
  if (sel) s += `<rect class="mn-sq-sel" x="${px(sel.x)}" y="${px(sel.y)}" width="10" height="10"/>`;
  if (fx) for (const g of fx.gone) s += `<g class="mn-gone">${man(g.v, px(g.x) + 5, px(g.y) + 5)}</g>`;
  let top = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = board[y][x];
    if (!v) continue;
    const m = man(v, px(x) + 5, px(y) + 5);
    if (fx && same(fx.to, { x, y })) top = `<g class="mn-slide" style="--mn-dx:${fx.dx * 10 * k}px;--mn-dy:${fx.dy * 10 * k}px">${m}</g>`;
    else s += m;
  }
  s += top;
  if (sel) for (const m of c.moves) if (same(m.from, sel)) s += `<circle class="mn-dot" cx="${px(m.to.x) + 5}" cy="${px(m.to.y) + 5}" r="1.6"/>`;
  if (c.can) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) s += hit(x, y, px(x), px(y));
  return { w: W, h: W, html: s };
}

export function tap(d, c) {
  const p = { x: +d.x, y: +d.y }, ui = c.ui;
  const sel = ui.sel || c.state.chain || null;
  if (sel) {
    const m = c.moves.find((v) => same(v.from, sel) && same(v.to, p));
    if (m) { ui.sel = null; return { from: m.from, to: m.to }; }
  }
  ui.sel = !same(sel, p) && c.moves.some((v) => same(v.from, p)) ? p : null;
  return null;
}
