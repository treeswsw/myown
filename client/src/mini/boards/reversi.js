// 리버시 8×8 — 수 {x,y}. 둘 수 있는 곳에 은은한 점. 뒤집힌 알은 칸마다 시차를 두고 돈다.
import { stone, same, frame, hit } from './util.js';

const M = 4, W = 80 + M * 2;
const P = (v) => M + v * 10 + 5;

export function view(c) {
  const { board, last } = c.state;
  let s = frame(W, W, M, 'mn-rv-bd');
  let d = '';
  for (let i = 1; i < 8; i++) d += `M${M} ${M + i * 10}H${W - M}M${M + i * 10} ${M}V${W - M}`;
  s += `<path class="mn-rv-ln" d="${d}"/>`;
  for (const y of [2, 6]) for (const x of [2, 6]) s += `<circle class="mn-rv-dot" cx="${M + x * 10}" cy="${M + y * 10}" r="0.8"/>`;
  const flips = new Map();
  if (c.prev && last && last.flips) last.flips.forEach((p, i) => flips.set(p.x + ',' + p.y, Math.min(i, 8) * 35));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = board[y][x];
    if (v == null) continue;
    const isLast = same(last, { x, y }), fl = flips.get(x + ',' + y);
    if (fl != null) {
      s += `<g class="mn-flip-out" style="animation-delay:${fl}ms">${stone(P(x), P(y), 4.1, v ? 'b' : 'w')}</g>` +
        `<g class="mn-flip-in" style="animation-delay:${fl + 140}ms">${stone(P(x), P(y), 4.1, v ? 'w' : 'b')}</g>`;
      continue;
    }
    s += `<g${isLast && c.prev ? ' class="mn-place"' : ''}>${stone(P(x), P(y), 4.1, v ? 'w' : 'b')}</g>`;
    if (isLast) s += `<circle class="mn-last" cx="${P(x)}" cy="${P(y)}" r="1.1"/>`;
  }
  for (const m of c.moves) s += `<circle class="mn-dot" cx="${P(m.x)}" cy="${P(m.y)}" r="1.5"/>` + hit(m.x, m.y, M + m.x * 10, M + m.y * 10);
  return { w: W, h: W, html: s };
}

export const tap = (d) => ({ x: +d.x, y: +d.y });
