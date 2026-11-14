// 커넥트포 가로 7 × 세로 6 — 수 {x}(열). seat 0 빨강, seat 1 노랑. 놓인 알은 위에서 떨어진다.
import { stone, same, winLine, glow } from './util.js';

const M = 4, W = 70 + M * 2, H = 60 + M * 2;
const PX = (x) => M + x * 10 + 5, PY = (y) => M + y * 10 + 5;

export function view(c) {
  const { board, last, winner } = c.state;
  // 플라스틱 판: 위가 밝은 파랑 + 위쪽 광택 띠 + 모서리 빛
  let s = `<rect class="mn-c4-bd" width="${W}" height="${H}" rx="3"/><rect x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="2.2" fill="url(#mn-g-c4)"/>` +
    `<rect x="2" y="1.8" width="${W - 4}" height="9" rx="1.8" fill="#fff" opacity=".1"/>` +
    `<rect x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="2.2" fill="url(#mn-g-gloss)"/>` +
    `<rect x=".3" y=".3" width="${W - 0.6}" height="${H - 0.6}" rx="2.8" fill="none" stroke="url(#mn-g-bevel)" stroke-width=".5"/>`;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) {
    const v = board[y][x];
    s += `<circle cx="${PX(x)}" cy="${PY(y)}" r="4.45" fill="none" stroke="url(#mn-g-c4rim)" stroke-width=".5"/><circle cx="${PX(x)}" cy="${PY(y)}" r="4.2" fill="url(#mn-g-hole)"/>`;
    if (v == null) continue;
    const isLast = same(last, { x, y });
    s += `<g${isLast && c.prev ? ` class="mn-bd-fall" style="--mn-dy:${-(y + 1) * 10}px"` : ''}>${stone(PX(x), PY(y), 3.9, v ? 'y' : 'r')}<circle class="mn-c4-rim" cx="${PX(x)}" cy="${PY(y)}" r="2.7"/></g>`;
    if (isLast) s += `<circle class="mn-c4-last${c.prev ? ' mn-late' : ''}" cx="${PX(x)}" cy="${PY(y)}" r="3.9"/>`;
  }
  if (winner === 0 || winner === 1) winLine(board, 4, winner).forEach((p, i) => { s += `<circle class="mn-win" cx="${PX(p.x)}" cy="${PY(p.y)}" r="4.1"/>` + glow(PX(p.x), PY(p.y), 4.1, i); });
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
