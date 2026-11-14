// 체스 8×8 — 수 {from,to,promo?}. y=0 이 8랭크. seat 1(흑)은 판을 뒤집어 본다.
// 말은 직접 그린 입체감 있는 SVG(100×100 기준) — 외부 그림·글꼴 없음.
import { same, frame, hit, squares, lastCells, moveFx, finish, hop } from './util.js';

const M = 5, W = 80 + M * 2;
// 말 몸통은 왼쪽 빛·오른쪽 그늘 그라디언트, 목·받침에 띠를 둘러 깎은 나무 말처럼 보이게 한다.
const BASE = '<path d="M30 78q0-5 5-5h30q5 0 5 5z"/><path d="M22 90v-5q0-6 6-6h44q6 0 6 6v5z"/>';
const SKIRT = 'M39 60C39 67 36 70 33 74H67C64 70 61 67 61 60z';
const band = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3"/>`;
const SHAPE = {
  P: `<path d="M50 40C42 51 37 61 34 74H66C63 61 58 51 50 40z"/>${band(37, 40, 26)}<circle cx="50" cy="29" r="12"/>`,
  R: `<path d="M34 46L32 74H68L66 46z"/><path d="M28 43V20h9v8h8v-8h10v8h8v-8h9v23z"/>${band(29, 42, 42)}`,
  N: `<path d="M33 74C33 60 45 55 43 44L31 51L23 42L37 25L39 13L47 21C63 21 71 39 68 74z"/><path fill="none" stroke="@" opacity=".5" d="M52 26C60 32 63 44 62 58"/><circle fill="@" stroke="none" cx="40" cy="31" r="2.4"/>`,
  B: `<path d="M43 52C42 62 38 68 34 74H66C62 68 58 62 57 52z"/><path d="M50 16C63 28 66 41 58 51H42C34 41 37 28 50 16z"/><path fill="none" stroke="@" d="M55 26L48 37"/>${band(38, 49, 24)}<circle cx="50" cy="12" r="4.8"/>`,
  Q: `<path d="${SKIRT}"/><path d="M24 31L36 59H64L76 31L63 47L50 23L37 47z"/>${band(34, 56, 32)}<circle cx="24" cy="29" r="4.6"/><circle cx="50" cy="20" r="4.6"/><circle cx="76" cy="29" r="4.6"/>`,
  K: `<path d="${SKIRT}"/><path d="M46.5 7h7v7h7v7h-7v9h-7v-9h-7v-7h7z"/><path d="M50 30C68 30 74 45 62 59H38C26 45 32 30 50 30z"/>${band(34, 56, 32)}`,
};
const INK = { w: ['#4a3724', '#4a3724'], b: ['#0a0807', '#e9dfcd'] }; // [윤곽선, 눈·홈 같은 세부 선]

const piece = (code, x, y) => {
  const [line, detail] = INK[code[0]];
  return `<g transform="translate(${x - 0.9} ${y - 1}) scale(.118)" fill="url(#mn-g-p${code[0]})" stroke="${line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">` +
    `<ellipse cx="52" cy="89" rx="33" ry="6" fill="#000" stroke="none" opacity=".3"/>${SHAPE[code[1]].replace(/@/g, detail)}${BASE}</g>`;
};

export function view(c) {
  const { board, last, turn, check } = c.state;
  const k = c.flip ? -1 : 1;
  const px = (v) => M + (c.flip ? 7 - v : v) * 10;
  const { sel, promo } = c.ui;
  const fx = moveFx(c, (v) => (v[0] === 'w' ? 0 : 1));
  let s = frame(W, W, M, 'mn-sq-l') + squares(M) + finish(M, M, 80, 80, 'grain', .6);
  for (let i = 0; i < 8; i++) {
    s += `<text class="mn-ch-lb" x="${px(i) + 5}" y="${W - 1.5}">${'abcdefgh'[i]}</text>` +
      `<text class="mn-ch-lb" x="2.5" y="${px(i) + 6}">${8 - i}</text>`;
  }
  for (const p of lastCells(last)) s += `<rect class="mn-sq-last" x="${px(p.x)}" y="${px(p.y)}" width="10" height="10"/>`;
  if (sel) s += `<rect class="mn-sq-sel" x="${px(sel.x)}" y="${px(sel.y)}" width="10" height="10"/>`;
  if (fx) for (const g of fx.gone) s += `<g class="mn-bd-gone">${piece(g.v, px(g.x), px(g.y))}</g>`;
  const king = (turn ? 'b' : 'w') + 'K';
  let top = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = board[y][x];
    if (!v) continue;
    if (check && v === king) s += `<rect class="mn-sq-check" x="${px(x)}" y="${px(y)}" width="10" height="10"/>`;
    if (fx && same(fx.to, { x, y })) top = hop(piece(v, px(x), px(y)), fx.dx * 10 * k, fx.dy * 10 * k);
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
