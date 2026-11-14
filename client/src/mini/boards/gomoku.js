// 오목 15×15 — 교차점에 돌. 수 {x,y}
import { stone, same, winLine, rim, finish, glow } from './util.js';

const N = 15, M = 10, W = M * 2 + (N - 1) * 10;
const P = (v) => M + v * 10;

export function view(c) {
  const { board, last, winner } = c.state;
  // 비자나무 판: 바탕색 위에 노란 물 + 나뭇결 + 광택
  let s = rim(W, W) + `<rect class="mn-inset" x="2.6" y="2.6" width="${W - 5.2}" height="${W - 5.2}" rx="1.5"/>` +
    `<rect class="mn-gm-bd" x="3" y="3" width="${W - 6}" height="${W - 6}" rx="1.2"/>` +
    `<rect x="3" y="3" width="${W - 6}" height="${W - 6}" rx="1.2" fill="url(#mn-g-kaya)"/>` + finish(3, 3, W - 6, W - 6, 'grain', .75);
  let d = '';
  for (let i = 0; i < N; i++) d += `M${P(0)} ${P(i)}H${P(N - 1)}M${P(i)} ${P(0)}V${P(N - 1)}`;
  s += `<path class="mn-gm-ln" d="${d}"/>`;
  for (const y of [3, 7, 11]) for (const x of [3, 7, 11]) s += `<circle class="mn-gm-star" cx="${P(x)}" cy="${P(y)}" r="0.9"/>`;
  const ok = new Set(c.moves.map((m) => m.x + ',' + m.y));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = board[y][x];
    if (v != null) {
      const isLast = same(last, { x, y });
      s += `<g${isLast && c.prev ? ' class="mn-bd-land"' : ''}>${stone(P(x), P(y), 4.55, v ? 'w' : 'b')}</g>`;
      if (isLast) s += `<circle class="mn-last" cx="${P(x)}" cy="${P(y)}" r="1.3"/>`;
    } else if (ok.has(x + ',' + y)) {
      s += `<circle class="mn-hit mn-ghost mn-ghost-${c.mySeat ? 'w' : 'b'}" data-x="${x}" data-y="${y}" cx="${P(x)}" cy="${P(y)}" r="4.8"/>`;
    }
  }
  if (winner === 0 || winner === 1) winLine(board, 5, winner).forEach((p, i) => { s += `<circle class="mn-win" cx="${P(p.x)}" cy="${P(p.y)}" r="4.9"/>` + glow(P(p.x), P(p.y), 4.9, i); });
  return { w: W, h: W, html: s };
}

export const tap = (d) => ({ x: +d.x, y: +d.y });
