// 커넥트포 가로 7 × 세로 6 — 수 {x}(열). seat 0 빨강, seat 1 노랑. 놓인 알은 위에서 떨어진다.
import { stone, same, winLine } from './util.js';

const M = 4, W = 70 + M * 2, H = 60 + M * 2;
const PX = (x) => M + x * 10 + 5, PY = (y) => M + y * 10 + 5;

export function view(c) {
  const { board, last, winner } = c.state;
  let s = `<rect class="mn-c4-bd" width="${W}" height="${H}" rx="3"/><rect class="mn-c4-in" x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="2.2"/>`;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
    const v = board[y][x];
    s += `<circle class="mn-c4-hole" cx="${PX(x)}" cy="${PY(y)}" r="4.1"/>`;
    if (v == null) continue;
    const isLast = same(last, { x, y });
    s += `<g${isLast && c.prev ? ` class="mn-drop" style="--mn-dy:${-(y + 1) * 10}px"` : ''}>${stone(PX(x), PY(y), 3.9, v ? 'y' : 'r')}<circle class="mn-c4-rim" cx="${PX(x)}" cy="${PY(y)}" r="2.7"/></g>`;
    if (isLast) s += `<circle class="mn-c4-last${c.prev ? ' mn-late' : ''}" cx="${PX(x)}" cy="${PY(y)}" r="3.9"/>`;
  }
  if (winner === 0 || winner === 1) for (const p of winLine(board, 4, winner)) s += `<circle class="mn-win" cx="${PX(p.x)}" cy="${PY(p.y)}" r="4.1"/>`;
  for (const m of c.moves) {
    let y = 5;
    while (y >= 0 && board[y][m.x] != null) y--;
    if (y < 0) continue;
    s += `<g class="mn-c4-col"><rect class="mn-hit" data-x="${m.x}" x="${M + m.x * 10}" y="0" width="10" height="${H}"/>` +
      `<circle class="mn-c4-ghost mn-c4-ghost-${c.mySeat ? 'y' : 'r'}" cx="${PX(m.x)}" cy="${PY(y)}" r="3.6"/></g>`;
  }
  return { w: W, h: H, html: s };
}

export const tap = (d) => ({ x: +d.x });
