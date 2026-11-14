// 보드판 공용 도우미 (SVG 문자열 조각). 사용자 글자는 다루지 않는다(숫자·고정 문자열만).
export const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

// 알(돌) 하나: 번지는 그림자(.mn-bd-s) + 몸통(.mn-bd-b: 그라디언트 원 + 빛 반사 한 점 + extra)
// 그림자와 몸통을 나눠 두어 내려앉는 효과에서 따로 움직인다.
const HL = { b: .3, w: .8, r: .55, y: .6 };
const shadow = (cx, cy, r) => `<circle class="mn-bd-s" cx="${cx + r * 0.05}" cy="${cy + r * 0.2}" r="${r * 1.12}" fill="url(#mn-g-sh)"/>`;
const shine = (cx, cy, r, grad) =>
  `<ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.4}" rx="${r * 0.46}" ry="${r * 0.27}" transform="rotate(-28 ${cx - r * 0.3} ${cy - r * 0.4})" fill="url(#mn-g-hl)" opacity="${HL[grad]}"/>`;
export const stone = (cx, cy, r, grad, extra = '') =>
  shadow(cx, cy, r) + `<g class="mn-bd-b"><circle class="mn-st" cx="${cx}" cy="${cy}" r="${r}" fill="url(#mn-g-${grad})"/>` + shine(cx, cy, r, grad) + extra + '</g>';

// 두께가 있는 납작한 알(리버시·체커): 아래로 옆면(side 색)이 살짝 보인다
export const disc = (cx, cy, r, grad, side, extra = '') =>
  shadow(cx, cy + 0.35, r) + `<g class="mn-bd-b"><circle cx="${cx}" cy="${cy + 0.55}" r="${r}" fill="${side}" stroke="rgba(0,0,0,.45)" stroke-width=".18"/>` +
  `<circle class="mn-st" cx="${cx}" cy="${cy}" r="${r}" fill="url(#mn-g-${grad})"/>` + shine(cx, cy, r, grad) + extra + '</g>';

// 이긴 줄 위로 차례차례 흐르는 은은한 빛
export const glow = (cx, cy, r, i) => `<circle class="mn-bd-glow" style="animation-delay:${i * 110}ms" cx="${cx}" cy="${cy}" r="${r}"/>`;

// 말 이동(체커·체스): 바깥은 옮겨 가고 안쪽은 살짝 들렸다 놓인다
export const hop = (inner, dx, dy) =>
  `<g class="mn-bd-hop" style="--mn-dx:${dx}px;--mn-dy:${dy}px"><g class="mn-bd-lift">${inner}</g></g>`;

// 누르는 칸(투명 사각형)
export const hit = (x, y, px, py) =>
  `<rect class="mn-hit" data-x="${x}" data-y="${y}" x="${px}" y="${py}" width="10" height="10"/>`;

// 나무 테두리(결·모서리 빛) — 판 바깥 틀만
export const rim = (w, h) =>
  `<rect class="mn-frame" width="${w}" height="${h}" rx="2.4"/>` +
  `<rect width="${w}" height="${h}" rx="2.4" fill="url(#mn-p-grain)"/>` +
  `<rect x=".3" y=".3" width="${w - 0.6}" height="${h - 0.6}" rx="2.1" fill="none" stroke="url(#mn-g-bevel)" stroke-width=".6"/>`;

// 나무 테두리 + 금색 선 + 안쪽 판
export const frame = (w, h, m, innerCls) => rim(w, h) +
  `<rect x="${m - 1.25}" y="${m - 1.25}" width="${w - 2 * m + 2.5}" height="${h - 2 * m + 2.5}" rx="1.2" fill="none" stroke="#e6c683" stroke-width=".22" opacity=".6"/>` +
  `<rect class="mn-inset" x="${m - 0.6}" y="${m - 0.6}" width="${w - 2 * m + 1.2}" height="${h - 2 * m + 1.2}" rx="0.8"/>` +
  `<rect class="${innerCls}" x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}"/>`;

// 판 위에 덮는 무늬(결·펠트·대리석)와 비스듬한 광택. 칸 다음, 표시·말보다 먼저 그린다.
export const finish = (x, y, w, h, pattern, op = 1) =>
  (pattern ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#mn-p-${pattern})" opacity="${op}"/>` : '') +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#mn-g-gloss)"/>`;

// 8×8 체크 무늬 칸. 색을 주면(light, dark) 그 색으로, 없으면 나무 색(mn-sq-l / mn-sq-d).
export function squares(m, light, dark) {
  let s = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = (x + y) % 2;
    s += `<rect ${light ? `fill="${d ? dark : light}"` : `class="${d ? 'mn-sq-d' : 'mn-sq-l'}"`} x="${m + x * 10}" y="${m + y * 10}" width="10" height="10"/>`;
  }
  return s;
}

// 마지막 수에서 칸 목록 뽑기({x,y} 또는 {from,to} 둘 다 받는다)
export function lastCells(last) {
  if (!last) return [];
  const out = [];
  if (last.from) out.push(last.from);
  if (last.to) out.push(last.to);
  if (!out.length && last.x != null && last.y != null) out.push(last);
  return out;
}

// 이긴 줄 찾기(오목 5, 커넥트포 4). 없으면 빈 배열.
export function winLine(board, n, who) {
  const H = board.length, W = board[0].length;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (board[y][x] !== who) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const px = x - dx, py = y - dy;
      if (px >= 0 && py >= 0 && py < H && board[py][px] === who) continue; // 줄의 시작점만
      const line = [];
      let cx = x, cy = y;
      while (cx >= 0 && cx < W && cy >= 0 && cy < H && board[cy][cx] === who) { line.push({ x: cx, y: cy }); cx += dx; cy += dy; }
      if (line.length >= n) return line;
    }
  }
  return [];
}

// 말 이동 효과(체커·체스 공용): 미끄러질 거리와 잡힌 말 목록.
// colorOf(칸값) → 0|1. 이전 상태가 없으면(처음 그림·다시 그림) null.
export function moveFx(c, colorOf) {
  const prev = c.prev, last = c.state.last;
  if (!prev || !last || !last.from || !last.to) return null;
  const mover = c.state.board[last.to.y][last.to.x];
  if (!mover) return null;
  const who = colorOf(mover), gone = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const was = prev.board[y][x], now = c.state.board[y][x];
    if (was && colorOf(was) !== who && (!now || colorOf(now) === who)) gone.push({ x, y, v: was });
  }
  return { to: last.to, dx: last.from.x - last.to.x, dy: last.from.y - last.to.y, gone };
}
