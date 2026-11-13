// 커넥트포. 가로 7 x 세로 6, board[y][x] = null|0|1 (y=5 가 맨 아래), 수 {x}(열). 4개 연속이면 승.
export const W = 7;
export const H = 6;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function init() {
  return { board: Array.from({ length: H }, () => Array(W).fill(null)), turn: 0, winner: null, last: null };
}

export function legalMoves(s) {
  if (s.winner !== null) return [];
  const out = [];
  for (let x = 0; x < W; x++) if (s.board[0][x] === null) out.push({ x });
  return out;
}

function wins(board, x, y, p) {
  for (const [dx, dy] of DIRS) {
    let n = 1;
    for (const sg of [1, -1]) {
      for (let k = 1; ; k++) {
        if (board[y + dy * k * sg]?.[x + dx * k * sg] !== p) break;
        n++;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

export function apply(s, m) {
  if (s.winner !== null || !m || !Number.isInteger(m.x) || m.x < 0 || m.x >= W) return null;
  let y = H - 1;
  while (y >= 0 && s.board[y][m.x] !== null) y--;
  if (y < 0) return null;
  const board = s.board.map((r) => r.slice());
  board[y][m.x] = s.turn;
  let winner = null;
  if (wins(board, m.x, y, s.turn)) winner = s.turn;
  else if (board[0].every((c) => c !== null)) winner = 'draw';
  return { board, turn: 1 - s.turn, winner, last: { x: m.x, y } };
}
