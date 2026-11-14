// 체스 상태(shared/mini/chess.js) -> FEN, UCI 수 -> 2절 move. 순수 함수.
const FILES = 'abcdefgh';
const sqName = ({ x, y }) => FILES[x] + (8 - y);

export function stateToFen(s) {
  const rows = s.board.map((row) => {
    let out = '', empty = 0;
    for (const p of row) {
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      out += p[0] === 'w' ? p[1] : p[1].toLowerCase();
    }
    return out + (empty || '');
  });
  const c = s.castling ?? {};
  const rights = (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') || '-';
  const ep = s.ep ? sqName(s.ep) : '-';
  // reps 는 지금까지 나온 국면 횟수의 합 = 수(ply) + 1. 이것으로 풀무브를 센다.
  const plies = Math.max(0, Object.values(s.reps ?? {}).reduce((a, n) => a + n, 0) - 1);
  const full = Math.floor(plies / 2) + 1;
  return `${rows.join('/')} ${s.turn === 0 ? 'w' : 'b'} ${rights} ${ep} ${s.half ?? 0} ${full}`;
}

// 'e2e4', 'e7e8q' -> {from:{x,y}, to:{x,y}, promo?:'Q'|'R'|'B'|'N'}. 모양이 틀리면 null.
export function uciToMove(uci) {
  if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const at = (i) => ({ x: uci.charCodeAt(i) - 97, y: 8 - Number(uci[i + 1]) });
  const m = { from: at(0), to: at(2) };
  if (uci[4]) m.promo = uci[4].toUpperCase();
  return m;
}
