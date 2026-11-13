// 체커 (미국식). 8x8, board[y][x] = null|{p:0|1,k:bool}, 어두운 칸은 (x+y)가 홀수.
// seat 0 은 아래(y=5..7)에서 위로, seat 1 은 위(y=0..2)에서 아래로. 수 {from:{x,y}, to:{x,y}}.
// 잡을 수 있으면 반드시 잡는다. 연속 점프는 같은 말이 이어서(state.chain 동안 turn 유지).
// 말이 끝줄에 닿아 킹이 되면 그 수로 차례가 끝난다. 둘 수 없으면 패. 잡기·말 이동 없이 80수면 무승부.
export const N = 8;
export const QUIET_LIMIT = 80;

export function init() {
  const board = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if ((x + y) % 2 !== 1) continue;
      if (y <= 2) board[y][x] = { p: 1, k: false };
      else if (y >= 5) board[y][x] = { p: 0, k: false };
    }
  }
  return { board, turn: 0, winner: null, last: null, chain: null, quiet: 0 };
}

const dirsOf = (c) => (c.k ? [-1, 1] : c.p === 0 ? [-1] : [1]);

function jumps(board, x, y) {
  const c = board[y][x];
  const out = [];
  for (const dy of dirsOf(c)) {
    for (const dx of [-1, 1]) {
      const over = board[y + dy]?.[x + dx];
      if (over && over.p !== c.p && board[y + 2 * dy]?.[x + 2 * dx] === null) {
        out.push({ from: { x, y }, to: { x: x + 2 * dx, y: y + 2 * dy } });
      }
    }
  }
  return out;
}

function steps(board, x, y) {
  const c = board[y][x];
  const out = [];
  for (const dy of dirsOf(c)) {
    for (const dx of [-1, 1]) {
      if (board[y + dy]?.[x + dx] === null) out.push({ from: { x, y }, to: { x: x + dx, y: y + dy } });
    }
  }
  return out;
}

export function legalMoves(s) {
  if (s.winner !== null) return [];
  if (s.chain) return jumps(s.board, s.chain.x, s.chain.y);
  const mine = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (s.board[y][x]?.p === s.turn) mine.push([x, y]);
  const caps = mine.flatMap(([x, y]) => jumps(s.board, x, y));
  if (caps.length) return caps;
  return mine.flatMap(([x, y]) => steps(s.board, x, y));
}

export function apply(s, m) {
  if (s.winner !== null || !m?.from || !m?.to) return null;
  const legal = legalMoves(s).find((l) => l.from.x === m.from.x && l.from.y === m.from.y && l.to.x === m.to.x && l.to.y === m.to.y);
  if (!legal) return null;
  const board = s.board.map((r) => r.slice());
  const piece = { ...board[legal.from.y][legal.from.x] };
  board[legal.from.y][legal.from.x] = null;
  const jumped = Math.abs(legal.to.x - legal.from.x) === 2;
  let captured = null;
  if (jumped) {
    captured = { x: (legal.to.x + legal.from.x) / 2, y: (legal.to.y + legal.from.y) / 2 };
    board[captured.y][captured.x] = null;
  }
  const farRow = piece.p === 0 ? 0 : N - 1;
  let crowned = false;
  if (!piece.k && legal.to.y === farRow) { piece.k = true; crowned = true; }
  board[legal.to.y][legal.to.x] = piece;
  const last = { from: legal.from, to: legal.to, captured };
  const next = {
    board, turn: s.turn, winner: null, last, chain: null,
    quiet: jumped || !s.board[legal.from.y][legal.from.x].k ? 0 : s.quiet + 1,
  };
  if (jumped && !crowned && jumps(board, legal.to.x, legal.to.y).length) {
    next.chain = { x: legal.to.x, y: legal.to.y };
    return next;
  }
  next.turn = 1 - s.turn;
  if (legalMoves(next).length === 0) next.winner = s.turn;
  else if (next.quiet >= QUIET_LIMIT) next.winner = 'draw';
  return next;
}
