// FEN -> 체스 상태(shared/mini/chess.js). client/src/mini/bots/fen.js 의 stateToFen 과 왕복이 맞는다.
import * as chess from './chess.js';

const FILES = 'abcdefgh';

function attackedBy(b, x, y, by) {
  const inb = (cx, cy) => cx >= 0 && cy >= 0 && cx < 8 && cy < 8;
  const pd = by === 'w' ? 1 : -1;
  for (const dx of [-1, 1]) if (b[y + pd]?.[x + dx] === by + 'P') return true;
  for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    if (b[y + dy]?.[x + dx] === by + 'N') return true;
  }
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && b[y + dy]?.[x + dx] === by + 'K') return true;
  for (const [dirs, kinds] of [[[[1, 0], [-1, 0], [0, 1], [0, -1]], 'RQ'], [[[1, 1], [1, -1], [-1, 1], [-1, -1]], 'BQ']]) {
    for (const [dx, dy] of dirs) {
      let cx = x + dx, cy = y + dy;
      while (inb(cx, cy)) {
        const p = b[cy][cx];
        if (p) { if (p[0] === by && kinds.includes(p[1])) return true; break; }
        cx += dx; cy += dy;
      }
    }
  }
  return false;
}

export function fromFen(fen) {
  const [place, side, rights = '-', ep = '-', half = '0', full = '1'] = String(fen).trim().split(/\s+/);
  const rows = place.split('/');
  if (rows.length !== 8) throw new Error('bad fen: ' + fen);
  const board = rows.map((r) => {
    const row = [];
    for (const ch of r) {
      if (/[1-8]/.test(ch)) for (let i = 0; i < Number(ch); i++) row.push(null);
      else row.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
    }
    if (row.length !== 8) throw new Error('bad fen: ' + fen);
    return row;
  });
  const turn = side === 'b' ? 1 : 0;
  const s = chess.init();
  s.board = board;
  s.turn = turn;
  s.castling = { wK: rights.includes('K'), wQ: rights.includes('Q'), bK: rights.includes('k'), bQ: rights.includes('q') };
  s.ep = ep === '-' ? null : { x: FILES.indexOf(ep[0]), y: 8 - Number(ep[1]) };
  s.half = Number(half) || 0;
  // stateToFen 은 reps 합 - 1 = ply 로 풀무브를 센다: 현재 국면 1 + 앞선 수만큼 더미
  const plies = (Math.max(1, Number(full) || 1) - 1) * 2 + turn;
  s.reps = { ['fen:' + place + side + rights + ep]: 1 };
  if (plies) s.reps.pre = plies;
  const c = turn === 0 ? 'w' : 'b';
  let kx = -1, ky = -1;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (board[y][x] === c + 'K') { kx = x; ky = y; }
  s.check = kx >= 0 && attackedBy(board, kx, ky, c === 'w' ? 'b' : 'w');
  return s;
}
