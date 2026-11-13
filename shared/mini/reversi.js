// 리버시. 8x8, board[y][x] = null|0|1. seat 0 = 흑(먼저). 수 {x,y}.
// 둘 곳이 없으면 apply 안에서 자동 패스(turn 유지, passed:true), 둘 다 없으면 끝(많은 쪽 승).
export const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function init() {
  const board = Array.from({ length: N }, () => Array(N).fill(null));
  board[3][3] = 1; board[4][4] = 1; board[3][4] = 0; board[4][3] = 0;
  return { board, turn: 0, winner: null, last: null, passed: false };
}

function flipsOf(board, x, y, p) {
  if (board[y][x] !== null) return [];
  const out = [];
  for (const [dx, dy] of DIRS) {
    const line = [];
    let cx = x + dx, cy = y + dy;
    while (board[cy]?.[cx] === 1 - p) { line.push({ x: cx, y: cy }); cx += dx; cy += dy; }
    if (line.length && board[cy]?.[cx] === p) out.push(...line);
  }
  return out;
}

function movesFor(board, p) {
  const out = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (flipsOf(board, x, y, p).length) out.push({ x, y });
  return out;
}

export function count(s) {
  const c = [0, 0];
  for (const r of s.board) for (const v of r) if (v !== null) c[v]++;
  return c;
}

export function legalMoves(s) {
  return s.winner !== null ? [] : movesFor(s.board, s.turn);
}

export function apply(s, m) {
  if (s.winner !== null || !m || !Number.isInteger(m.x) || !Number.isInteger(m.y)) return null;
  if (m.x < 0 || m.y < 0 || m.x >= N || m.y >= N) return null;
  const flips = flipsOf(s.board, m.x, m.y, s.turn);
  if (!flips.length) return null;
  const board = s.board.map((r) => r.slice());
  board[m.y][m.x] = s.turn;
  for (const f of flips) board[f.y][f.x] = s.turn;
  let turn = 1 - s.turn;
  let passed = false;
  let winner = null;
  if (!movesFor(board, turn).length) {
    if (movesFor(board, s.turn).length) {
      turn = s.turn;
      passed = true;
    } else {
      const c = count({ board });
      winner = c[0] === c[1] ? 'draw' : c[0] > c[1] ? 0 : 1;
    }
  }
  return { board, turn, winner, last: { x: m.x, y: m.y, flips }, passed };
}
