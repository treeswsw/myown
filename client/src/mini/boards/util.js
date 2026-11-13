// 보드판 공용 도우미 (SVG 문자열 조각). 사용자 글자는 다루지 않는다(숫자·고정 문자열만).
export const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;

// 알(돌) 하나: 옅은 그림자 + 그라디언트 원
export const stone = (cx, cy, r, grad) =>
  `<circle class="mn-sh" cx="${cx + r * 0.06}" cy="${cy + r * 0.14}" r="${r}"/>` +
  `<circle class="mn-st" cx="${cx}" cy="${cy}" r="${r}" fill="url(#mn-g-${grad})"/>`;

// 누르는 칸(투명 사각형)
export const hit = (x, y, px, py) =>
  `<rect class="mn-hit" data-x="${x}" data-y="${y}" x="${px}" y="${py}" width="10" height="10"/>`;

// 나무 테두리 + 안쪽 판
export const frame = (w, h, m, innerCls) =>
  `<rect class="mn-frame" width="${w}" height="${h}" rx="2.4"/>` +
  `<rect class="mn-inset" x="${m - 0.6}" y="${m - 0.6}" width="${w - 2 * m + 1.2}" height="${h - 2 * m + 1.2}" rx="0.8"/>` +
  `<rect class="${innerCls}" x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}"/>`;

// 8×8 체크 무늬 칸
export function squares(m) {
  let s = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    s += `<rect class="${(x + y) % 2 ? 'mn-sq-d' : 'mn-sq-l'}" x="${m + x * 10}" y="${m + y * 10}" width="10" height="10"/>`;
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
