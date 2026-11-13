// 체스. 8x8, board[y][x] = null|'wK'|'bQ'... (w/b + K Q R B N P). y=0 이 8랭크(흑 쪽), seat 0 = 백(아래).
// 수 {from:{x,y}, to:{x,y}, promo?:'Q'|'R'|'B'|'N'} (promo 를 빼면 퀸). 캐슬링은 킹을 두 칸 옮기는 수.
// 체크메이트·스테일메이트·기물 부족·50수·3회 반복. state.check = 차례인 쪽이 체크 중. state.end = 끝난 이유.
const BACK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK = KING.slice(0, 4);
const BISHOP = KING.slice(4);
const PROMOS = ['Q', 'R', 'B', 'N'];

const inb = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8;
const colorOf = (turn) => (turn === 0 ? 'w' : 'b');

export function init() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let x = 0; x < 8; x++) {
    board[0][x] = 'b' + BACK[x];
    board[1][x] = 'bP';
    board[6][x] = 'wP';
    board[7][x] = 'w' + BACK[x];
  }
  const s = {
    board, turn: 0, winner: null, last: null, check: false,
    castling: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, half: 0, reps: {}, end: null,
  };
  s.reps[key(s)] = 1;
  return s;
}

function key(s) {
  const c = s.castling;
  return s.board.map((r) => r.map((p) => p ?? '--').join('')).join('/') + s.turn +
    (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') + (s.ep ? `${s.ep.x}${s.ep.y}` : '');
}

function attacked(b, x, y, by) {
  const pd = by === 'w' ? 1 : -1; // 백 폰은 (x±1, y+1) 에서 (x,y) 를 노린다
  for (const dx of [-1, 1]) if (b[y + pd]?.[x + dx] === by + 'P') return true;
  for (const [dx, dy] of KNIGHT) if (b[y + dy]?.[x + dx] === by + 'N') return true;
  for (const [dx, dy] of KING) if (b[y + dy]?.[x + dx] === by + 'K') return true;
  for (const [dirs, kinds] of [[ROOK, 'RQ'], [BISHOP, 'BQ']]) {
    for (const [dx, dy] of dirs) {
      let cx = x + dx, cy = y + dy;
      while (inb(cx, cy)) {
        const p = b[cy][cx];
        if (p) {
          if (p[0] === by && kinds.includes(p[1])) return true;
          break;
        }
        cx += dx; cy += dy;
      }
    }
  }
  return false;
}

function findKing(b, c) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (b[y][x] === c + 'K') return { x, y };
  return null;
}

const inCheck = (b, c) => {
  const k = findKing(b, c);
  return !!k && attacked(b, k.x, k.y, c === 'w' ? 'b' : 'w');
};

function pseudo(s, c) {
  const b = s.board;
  const opp = c === 'w' ? 'b' : 'w';
  const out = [];
  const add = (x, y, tx, ty, extra) => out.push({ from: { x, y }, to: { x: tx, y: ty }, ...extra });
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = b[y][x];
      if (!p || p[0] !== c) continue;
      const t = p[1];
      if (t === 'P') {
        const d = c === 'w' ? -1 : 1;
        const promoRow = c === 'w' ? 0 : 7;
        const push = (tx, ty) => {
          if (ty === promoRow) for (const promo of PROMOS) add(x, y, tx, ty, { promo });
          else add(x, y, tx, ty);
        };
        if (b[y + d]?.[x] === null) {
          push(x, y + d);
          if (y === (c === 'w' ? 6 : 1) && b[y + 2 * d][x] === null) add(x, y, x, y + 2 * d);
        }
        for (const dx of [-1, 1]) {
          const q = b[y + d]?.[x + dx];
          if (q && q[0] === opp) push(x + dx, y + d);
          else if (q === null && s.ep && s.ep.x === x + dx && s.ep.y === y + d) add(x, y, x + dx, y + d);
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dx, dy] of t === 'N' ? KNIGHT : KING) {
          if (!inb(x + dx, y + dy)) continue;
          const q = b[y + dy][x + dx];
          if (!q || q[0] === opp) add(x, y, x + dx, y + dy);
        }
        if (t === 'K' && x === 4 && y === (c === 'w' ? 7 : 0) && !attacked(b, 4, y, opp)) {
          if (s.castling[c + 'K'] && b[y][5] === null && b[y][6] === null && b[y][7] === c + 'R' &&
            !attacked(b, 5, y, opp) && !attacked(b, 6, y, opp)) add(4, y, 6, y);
          if (s.castling[c + 'Q'] && b[y][1] === null && b[y][2] === null && b[y][3] === null && b[y][0] === c + 'R' &&
            !attacked(b, 3, y, opp) && !attacked(b, 2, y, opp)) add(4, y, 2, y);
        }
      } else {
        for (const [dx, dy] of t === 'R' ? ROOK : t === 'B' ? BISHOP : KING) {
          let cx = x + dx, cy = y + dy;
          while (inb(cx, cy)) {
            const q = b[cy][cx];
            if (!q) add(x, y, cx, cy);
            else {
              if (q[0] === opp) add(x, y, cx, cy);
              break;
            }
            cx += dx; cy += dy;
          }
        }
      }
    }
  }
  return out;
}

// 수를 판에 적용한 새 판. (잡기 여부도 돌려준다)
function play(s, m) {
  const b = s.board.map((r) => r.slice());
  const p = b[m.from.y][m.from.x];
  let capture = b[m.to.y][m.to.x] !== null;
  b[m.from.y][m.from.x] = null;
  if (p[1] === 'P' && m.from.x !== m.to.x && !capture) { // 앙파상
    b[m.from.y][m.to.x] = null;
    capture = true;
  }
  if (p[1] === 'K' && Math.abs(m.to.x - m.from.x) === 2) { // 캐슬링: 룩도 옮긴다
    const rx = m.to.x === 6 ? 7 : 0;
    b[m.from.y][m.to.x === 6 ? 5 : 3] = b[m.from.y][rx];
    b[m.from.y][rx] = null;
  }
  b[m.to.y][m.to.x] = m.promo ? p[0] + m.promo : p;
  return { b, capture };
}

export function legalMoves(s) {
  if (s.winner !== null) return [];
  const c = colorOf(s.turn);
  return pseudo(s, c).filter((m) => !inCheck(play(s, m).b, c));
}

function insufficient(b) {
  const rest = [];
  const bishopSquares = []; // 비숍이 선 칸 색 (x+y 의 홀짝)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = b[y][x];
      if (!p || p[1] === 'K') continue;
      rest.push(p[1]);
      if (p[1] === 'B') bishopSquares.push((x + y) % 2);
    }
  }
  if (rest.length === 0 || (rest.length === 1 && (rest[0] === 'B' || rest[0] === 'N'))) return true;
  // 킹+비숍 대 킹+비숍 도 비숍이 같은 색 칸이면 체크메이트를 만들 수 없다
  return rest.every((t) => t === 'B') && bishopSquares.every((c) => c === bishopSquares[0]);
}

export function apply(s, m) {
  if (s.winner !== null || !m?.from || !m?.to) return null;
  const legal = legalMoves(s).filter((l) => l.from.x === m.from.x && l.from.y === m.from.y && l.to.x === m.to.x && l.to.y === m.to.y);
  if (!legal.length) return null;
  let mv;
  if (legal[0].promo) {
    mv = legal.find((l) => l.promo === (m.promo ?? 'Q'));
    if (!mv) return null;
  } else mv = legal[0];
  const piece = s.board[mv.from.y][mv.from.x];
  const { b, capture } = play(s, mv);
  const castling = { ...s.castling };
  if (piece[1] === 'K') { castling[piece[0] + 'K'] = false; castling[piece[0] + 'Q'] = false; }
  for (const sq of [mv.from, mv.to]) {
    if (sq.y === 7 && sq.x === 0) castling.wQ = false;
    if (sq.y === 7 && sq.x === 7) castling.wK = false;
    if (sq.y === 0 && sq.x === 0) castling.bQ = false;
    if (sq.y === 0 && sq.x === 7) castling.bK = false;
  }
  const turn = 1 - s.turn;
  const next = {
    board: b, turn, winner: null,
    last: mv.promo ? { from: mv.from, to: mv.to, promo: mv.promo } : { from: mv.from, to: mv.to },
    check: false, castling,
    ep: piece[1] === 'P' && Math.abs(mv.to.y - mv.from.y) === 2 ? { x: mv.from.x, y: (mv.from.y + mv.to.y) / 2 } : null,
    half: piece[1] === 'P' || capture ? 0 : s.half + 1,
    reps: { ...s.reps }, end: null,
  };
  const k = key(next);
  next.reps[k] = (next.reps[k] ?? 0) + 1;
  next.check = inCheck(b, colorOf(turn));
  if (legalMoves(next).length === 0) {
    if (next.check) { next.winner = s.turn; next.end = 'checkmate'; } else { next.winner = 'draw'; next.end = 'stalemate'; }
  } else if (insufficient(b)) { next.winner = 'draw'; next.end = 'insufficient'; }
  else if (next.half >= 100) { next.winner = 'draw'; next.end = 'fifty'; }
  else if (next.reps[k] >= 3) { next.winner = 'draw'; next.end = 'repetition'; }
  return next;
}
