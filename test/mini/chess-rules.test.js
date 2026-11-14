// 체스 국제 규정 점검: 이미 있는 것(rules.test.js)은 건드리지 않고 빠진 경우를 확인한다.
// 캐슬링 조건 전부, 앙파상 제약, 승급(잡으며 승급·체크메이트), 50수, 기물 부족(같은 색 비숍).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../shared/mini/index.js';

const { chess } = GAMES;
const sq = (x, y, tx, ty, promo) => ({ from: { x, y }, to: { x: tx, y: ty }, ...(promo ? { promo } : {}) });
// 칸 이름 'e1' -> {x, y}. y=0 이 8랭크.
const at = (n) => ({ x: n.charCodeAt(0) - 97, y: 8 - Number(n[1]) });
const mvN = (a, b, promo) => ({ from: at(a), to: at(b), ...(promo ? { promo } : {}) });
function pos(pieces, turn = 0, extra = {}) {
  const s = chess.init();
  s.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [name, p] of Object.entries(pieces)) { const { x, y } = at(name); s.board[y][x] = p; }
  s.turn = turn;
  s.castling = { wK: false, wQ: false, bK: false, bQ: false, ...extra.castling };
  s.ep = extra.ep ?? null;
  s.half = extra.half ?? 0;
  s.reps = {};
  return s;
}
const can = (s, a, b, promo) => chess.apply(s, mvN(a, b, promo)) !== null;

test('castling: needs king and rook unmoved, empty squares between, and no check on e/transit/target', () => {
  const base = { e1: 'wK', h1: 'wR', a1: 'wR', e8: 'bK' };
  const c = { castling: { wK: true, wQ: true } };
  assert.ok(can(pos(base, 0, c), 'e1', 'g1'));
  assert.ok(can(pos(base, 0, c), 'e1', 'c1'));
  // 사이 칸이 비어 있어야 한다 (킹쪽 f1 / 퀸쪽 b1·c1·d1 어느 하나라도 막히면 안 된다)
  assert.equal(can(pos({ ...base, f1: 'wB' }, 0, c), 'e1', 'g1'), false);
  assert.equal(can(pos({ ...base, g1: 'wN' }, 0, c), 'e1', 'g1'), false);
  assert.equal(can(pos({ ...base, b1: 'wN' }, 0, c), 'e1', 'c1'), false);
  assert.equal(can(pos({ ...base, d1: 'wB' }, 0, c), 'e1', 'c1'), false);
  // 킹이 체크 중이면 안 된다
  assert.equal(can(pos({ ...base, e5: 'bR' }, 0, c), 'e1', 'g1'), false);
  assert.equal(can(pos({ ...base, e5: 'bR' }, 0, c), 'e1', 'c1'), false);
  // 지나는 칸(f1 / d1)이 공격받으면 안 된다
  assert.equal(can(pos({ ...base, f8: 'bR' }, 0, c), 'e1', 'g1'), false);
  assert.equal(can(pos({ ...base, d8: 'bR' }, 0, c), 'e1', 'c1'), false);
  // 도착 칸(g1 / c1)이 공격받으면 안 된다
  assert.equal(can(pos({ ...base, g8: 'bR' }, 0, c), 'e1', 'g1'), false);
  assert.equal(can(pos({ ...base, c8: 'bR' }, 0, c), 'e1', 'c1'), false);
  // 퀸쪽 b1 이 공격받는 것은 괜찮다 (킹이 지나지 않는다)
  assert.ok(can(pos({ ...base, b8: 'bR' }, 0, c), 'e1', 'c1'));
});

test('castling: rights are lost when the king or a rook moves, or the rook is captured', () => {
  const base = { e1: 'wK', h1: 'wR', a1: 'wR', e8: 'bK', h8: 'bR' };
  let s = pos(base, 0, { castling: { wK: true, wQ: true } });
  // 룩이 갔다 돌아오면 그쪽 캐슬링은 못 한다
  s = chess.apply(s, mvN('h1', 'h2'));
  s = chess.apply(s, mvN('e8', 'd8'));
  s = chess.apply(s, mvN('h2', 'h1'));
  s = chess.apply(s, mvN('d8', 'e8'));
  assert.equal(can(s, 'e1', 'g1'), false);
  assert.ok(can(s, 'e1', 'c1'));
  // 킹이 갔다 오면 둘 다 못 한다
  let t = pos(base, 0, { castling: { wK: true, wQ: true } });
  t = chess.apply(t, mvN('e1', 'e2'));
  t = chess.apply(t, mvN('e8', 'd8'));
  t = chess.apply(t, mvN('e2', 'e1'));
  t = chess.apply(t, mvN('d8', 'e8'));
  assert.equal(can(t, 'e1', 'g1'), false);
  assert.equal(can(t, 'e1', 'c1'), false);
  // 룩이 잡히면 (새 룩이 그 칸에 와도) 그쪽 권리는 없다
  let u = pos({ e1: 'wK', h1: 'wR', e8: 'bK', h8: 'bR' }, 1, { castling: { wK: true, bK: true } });
  u = chess.apply(u, mvN('h8', 'h1')); // 흑 룩이 흰 룩을 잡는다 (+체크 아님: 킹 e1 옆)
  assert.equal(u.castling.wK, false);
  assert.equal(u.castling.bK, false, '움직인 룩의 권리도 없다');
});

test('castling: moves the rook, king ends two squares away (black too)', () => {
  const s = pos({ e1: 'wK', e8: 'bK', a8: 'bR', h8: 'bR' }, 1, { castling: { bK: true, bQ: true } });
  const k = chess.apply(s, mvN('e8', 'g8'));
  assert.equal(k.board[0][6], 'bK');
  assert.equal(k.board[0][5], 'bR');
  const q = chess.apply(s, mvN('e8', 'c8'));
  assert.equal(q.board[0][2], 'bK');
  assert.equal(q.board[0][3], 'bR');
});

test('en passant: capture only on the very next move, removes the pawn, not when it exposes the king', () => {
  let s = pos({ e1: 'wK', e8: 'bK', e5: 'wP', d7: 'bP' }, 1);
  s = chess.apply(s, mvN('d7', 'd5'));
  assert.deepEqual(s.ep, at('d6'));
  const ep = chess.apply(s, mvN('e5', 'd6'));
  assert.equal(ep.board[at('d5').y][at('d5').x], null, '지나간 폰이 사라진다');
  assert.equal(ep.board[at('d6').y][at('d6').x], 'wP');
  // 한 수 미루면 ep 는 사라진다
  let late = chess.apply(s, mvN('e1', 'e2'));
  late = chess.apply(late, mvN('e8', 'f8'));
  assert.equal(chess.apply(late, mvN('e5', 'd6')), null);
  // 앙파상이 내 킹을 열어 주면 불법: 킹 a5, 흑 룩 h5, 폰 e5/d5 가 같은 줄
  let p = pos({ a5: 'wK', e5: 'wP', d7: 'bP', h5: 'bR', h8: 'bK' }, 1);
  p = chess.apply(p, mvN('d7', 'd5'));
  assert.equal(chess.apply(p, mvN('e5', 'd6')), null);
  assert.ok(chess.apply(p, mvN('e5', 'e6')));
});

test('promotion: all four pieces, while capturing, and checkmate by promotion', () => {
  const s = pos({ e1: 'wK', a8: 'bK', c7: 'wP', b8: 'bN' }, 0);
  for (const p of ['Q', 'R', 'B', 'N']) {
    const n = chess.apply(s, mvN('c7', 'b8', p)); // 잡으며 승급
    assert.equal(n.board[0][1], 'w' + p);
  }
  assert.equal(chess.apply(s, mvN('c7', 'b8', 'K')), null);
  assert.equal(chess.apply(s, mvN('c7', 'b8', 'P')), null);
  const m = pos({ f6: 'wK', h8: 'bK', g7: 'wR', a7: 'wP' }, 0); // a8=Q 가 8랭크 체크메이트 (룩 g7 이 g8·h7 을 막고 킹 f6 이 룩을 지킨다)
  const mate = chess.apply(m, mvN('a7', 'a8', 'Q'));
  assert.equal(mate.check, true);
  assert.equal(mate.end, 'checkmate');
  assert.equal(mate.winner, 0);
  // 같은 수를 나이트로 하면 체크메이트가 아니다
  assert.notEqual(chess.apply(m, mvN('a7', 'a8', 'N')).end, 'checkmate');
});

test('stalemate is a draw, checkmate is a win for the mover', () => {
  const stale = pos({ a8: 'bK', c7: 'wK', b5: 'wQ' }, 0);
  const n = chess.apply(stale, mvN('b5', 'b6'));
  assert.equal(n.winner, 'draw');
  assert.equal(n.end, 'stalemate');
  const mate = pos({ a8: 'bK', c7: 'wK', b5: 'wQ' }, 0);
  const m = chess.apply(mate, mvN('b5', 'b7'));
  assert.equal(m.winner, 0);
  assert.equal(m.end, 'checkmate');
});

test('fifty-move rule: 100 half-moves without a pawn move or capture is a draw; a pawn move resets it', () => {
  const s = pos({ e1: 'wK', e8: 'bK', a1: 'wR', a7: 'bP' }, 0, { half: 98 });
  const n = chess.apply(s, mvN('a1', 'b1'));
  assert.equal(n.half, 99);
  assert.equal(n.winner, null);
  const d = chess.apply(n, mvN('e8', 'd8'));
  assert.equal(d.winner, 'draw');
  assert.equal(d.end, 'fifty');
  // 폰을 움직이면 0 으로
  const p = chess.apply(pos({ e1: 'wK', e8: 'bK', a1: 'wR', a7: 'bP' }, 1, { half: 99 }), mvN('a7', 'a6'));
  assert.equal(p.half, 0);
  assert.equal(p.winner, null);
  // 잡아도 0 으로
  const c = chess.apply(pos({ e1: 'wK', e8: 'bK', a1: 'wR', a7: 'bP' }, 0, { half: 99 }), mvN('a1', 'a7'));
  assert.equal(c.half, 0);
  assert.equal(c.winner, null);
});

test('insufficient material: bare kings, one minor piece, same-colour bishops; not opposite-colour bishops or a pawn', () => {
  // 킹 대 킹 (마지막 기물을 잡아서)
  const a = chess.apply(pos({ a1: 'wK', h8: 'bK', b2: 'bN' }, 0), mvN('a1', 'b2'));
  assert.equal(a.end, 'insufficient');
  // K+N 대 K
  const b = chess.apply(pos({ a1: 'wK', h8: 'bK', c3: 'wN', b2: 'bP' }, 1), mvN('b2', 'b1', 'Q'));
  assert.equal(b.winner, null, '승급한 퀸이 있으면 계속');
  // 같은 색 칸의 비숍 둘 (c1 = 어두운 칸, f4... 같은 색: c1(2,7)->(x+y)=9 홀수, e3(4,5)->9 홀수)
  const c = chess.apply(pos({ a1: 'wK', h8: 'bK', c1: 'wB', e3: 'bB', h7: 'bP' }, 1), mvN('h8', 'g8'));
  assert.equal(c.winner, null, '폰이 있으면 계속');
  const d = chess.apply(pos({ a1: 'wK', h8: 'bK', c1: 'wB', e3: 'bB' }, 1), mvN('h8', 'g8'));
  assert.equal(d.end, 'insufficient');
  // 다른 색 칸의 비숍 둘은 아직 메이트가 가능하다
  const e = chess.apply(pos({ a1: 'wK', h8: 'bK', c1: 'wB', d3: 'bB' }, 1), mvN('h8', 'g8'));
  assert.equal(e.winner, null);
});

test('threefold repetition counts positions with the same castling rights and side to move', () => {
  let s = pos({ e1: 'wK', e8: 'bK', a1: 'wR' }, 0);
  const seq = [mvN('a1', 'b1'), mvN('e8', 'd8'), mvN('b1', 'a1'), mvN('d8', 'e8')];
  let plies = 0;
  while (s.winner === null && plies < 20) { s = chess.apply(s, seq[plies % 4]); plies++; }
  assert.equal(plies, 9, '같은 모양이 세 번째 나온 그 수에서 무승부');
  assert.equal(s.end, 'repetition');
  assert.equal(s.winner, 'draw');
});

void sq;
