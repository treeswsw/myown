// 오목 (자유룰: 5개 이상 연속이면 승). 15x15, board[y][x] = null|0|1, 수 {x,y}.
export const SIZE = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function init() {
  return { board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)), turn: 0, winner: null, last: null };
}

export function legalMoves(s) {
  const out = [];
  if (s.winner !== null) return out;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (s.board[y][x] === null) out.push({ x, y });
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
    if (n >= 5) return true;
  }
  return false;
}

export function apply(s, m) {
  if (s.winner !== null || !m || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return null;
  if (m.x < 0 || m.y < 0 || m.x >= SIZE || m.y >= SIZE || s.board[m.y][m.x] !== null) return null;
  const board = s.board.map((r) => r.slice());
  board[m.y][m.x] = s.turn;
  let winner = null;
  if (wins(board, m.x, m.y, s.turn)) winner = s.turn;
  else if (board.every((r) => r.every((c) => c !== null))) winner = 'draw';
  return { board, turn: 1 - s.turn, winner, last: { x: m.x, y: m.y } };
}
