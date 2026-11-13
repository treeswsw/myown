// 체스 8×8 — 수 {from,to,promo?}. y=0 이 8랭크. seat 1(흑)은 판을 뒤집어 본다.
// 말은 직접 그린 간단한 SVG(100×100 기준) — 외부 그림·글꼴 없음.
import { same, frame, hit, squares, lastCells, moveFx } from './util.js';

const M = 5, W = 80 + M * 2;
const BASE = 'M24 89v-6q0-6 6-6h40q6 0 6 6v6z';
const SKIRT = 'M38 60C38 68 35 72 31 77H69C65 72 62 68 62 60z';
const SHAPE = {
  P: `<circle cx="50" cy="32" r="11.5"/><path d="M50 40C41 52 35 62 32 77H68C65 62 59 52 50 40z"/>`,
  R: `<path d="M28 46V22h9v8h8v-8h10v8h8v-8h9v24z"/><path d="M33 46L30 77H70L67 46z"/>`,
  N: `<path d="M33 77C33 61 45 56 43 45L31 52L23 43L37 26L39 14L47 22C63 22 71 40 69 77z"/><circle class="mn-ch-eye" cx="40" cy="32" r="2.2"/>`,
  B: `<circle cx="50" cy="13" r="4.5"/><path d="M50 17C63 29 66 42 58 52H42C34 42 37 29 50 17z"/><path class="mn-ch-cut" d="M55 27L48 38"/><path d="M42 52C41 64 37 70 32 77H68C63 70 59 64 58 52z"/>`,
  Q: `<path d="M24 32L36 60H64L76 32L63 48L50 24L37 48z"/><circle cx="24" cy="30" r="4.5"/><circle cx="50" cy="21" r="4.5"/><circle cx="76" cy="30" r="4.5"/><path d="${SKIRT}"/>`,
  K: `<path d="M46.5 8h7v7h7v7h-7v9h-7v-9h-7v-7h7z"/><path d="M50 31C68 31 74 46 62 60H38C26 46 32 31 50 31z"/><path d="${SKIRT}"/>`,
};

const piece = (code, x, y) =>
  `<g class="mn-ch-${code[0]}" transform="translate(${x - 0.9} ${y - 1}) scale(.118)">${SHAPE[code[1]]}<path d="${BASE}"/></g>`;

export function view(c) {
  const { board, last, turn, check } = c.state;
  const k = c.flip ? -1 : 1;
  const px = (v) => M + (c.flip ? 7 - v : v) * 10;
  const { sel, promo } = c.ui;
  const fx = moveFx(c, (v) => (v[0] === 'w' ? 0 : 1));
  let s = frame(W, W, M, 'mn-sq-l') + squares(M);
  for (let i = 0; i < 8; i++) {
    s += `<text class="mn-ch-lb" x="${px(i) + 5}" y="${W - 1.5}">${'abcdefgh'[i]}</text>` +
      `<text class="mn-ch-lb" x="2.5" y="${px(i) + 6}">${8 - i}</text>`;
  }
  for (const p of lastCells(last)) s += `<rect class="mn-sq-last" x="${px(p.x)}" y="${px(p.y)}" width="10" height="10"/>`;
  if (sel) s += `<rect class="mn-sq-sel" x="${px(sel.x)}" y="${px(sel.y)}" width="10" height="10"/>`;
  if (fx) for (const g of fx.gone) s += `<g class="mn-gone">${piece(g.v, px(g.x), px(g.y))}</g>`;
  const king = (turn ? 'b' : 'w') + 'K';
  let top = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = board[y][x];
    if (!v) continue;
    if (check && v === king) s += `<rect class="mn-sq-check" x="${px(x)}" y="${px(y)}" width="10" height="10"/>`;
    if (fx && same(fx.to, { x, y })) top = `<g class="mn-slide" style="--mn-dx:${fx.dx * 10 * k}px;--mn-dy:${fx.dy * 10 * k}px">${piece(v, px(x), px(y))}</g>`;
    else s += piece(v, px(x), px(y));
  }
  s += top;
  if (sel) for (const m of c.moves) if (same(m.from, sel) && !(m.promo && m.promo !== 'Q')) {
    const cx = px(m.to.x) + 5, cy = px(m.to.y) + 5;
    s += board[m.to.y][m.to.x] ? `<circle class="mn-ring" cx="${cx}" cy="${cy}" r="4.3"/>` : `<circle class="mn-dot" cx="${cx}" cy="${cy}" r="1.6"/>`;
  }
  if (c.can) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += hit(x, y, px(x), px(y));
  if (promo) {
    const col = turn ? 'b' : 'w';
    s += `<rect class="mn-pm-dim" data-cancel="1" x="${M}" y="${M}" width="80" height="80"/><rect class="mn-pm-box" x="${W / 2 - 25}" y="${W / 2 - 8}" width="50" height="16" rx="1.6"/>`;
    'QRBN'.split('').forEach((p, i) => {
      const x = W / 2 - 23 + i * 12;
      s += `<rect class="mn-pm-opt" data-promo="${p}" x="${x}" y="${W / 2 - 6}" width="10" height="12" rx="1"/>` + piece(col + p, x, W / 2 - 5);
    });
  }
  return { w: W, h: W, html: s };
}

export function tap(d, c) {
  const ui = c.ui;
  if (d.promo) { const m = ui.promo; ui.promo = ui.sel = null; return m ? { from: m.from, to: m.to, promo: d.promo } : null; }
  if (d.cancel) { ui.promo = null; return null; }
  const p = { x: +d.x, y: +d.y }, sel = ui.sel;
  if (sel) {
    const ms = c.moves.filter((m) => same(m.from, sel) && same(m.to, p));
    if (ms.length) {
      const pc = c.state.board[sel.y][sel.x] || '';
      if (ms.some((m) => m.promo) || (pc[1] === 'P' && (p.y === 0 || p.y === 7))) { ui.promo = { from: sel, to: p }; return null; }
      ui.sel = null;
      return { from: ms[0].from, to: ms[0].to };
    }
  }
  ui.sel = !same(sel, p) && c.moves.some((m) => same(m.from, p)) ? p : null;
  return null;
}
