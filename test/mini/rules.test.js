// 미니게임 규칙 시험: 게임별 핵심만.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, NAMES } from '../../shared/mini/index.js';

const { gomoku, connect4, reversi, checkers, chess } = GAMES;
const empty = (n = 8) => Array.from({ length: n }, () => Array(n).fill(null));
const mv = (s, m) => {
  const n = chess.apply(s, m);
  assert.ok(n, `illegal ${JSON.stringify(m)}`);
  return n;
};
const sq = (x, y, tx, ty, promo) => ({ from: { x, y }, to: { x: tx, y: ty }, ...(promo ? { promo } : {}) });

test('index: five games with names, init has the common shape', () => {
  assert.deepEqual(Object.keys(GAMES).sort(), Object.keys(NAMES).sort());
  for (const g of Object.values(GAMES)) {
    const s = g.init();
    assert.equal(s.turn, 0);
    assert.equal(s.winner, null);
    assert.ok(g.legalMoves(s).length > 0);
    assert.equal(g.apply(s, { bogus: 1 }), null);
  }
});

test('gomoku: five in a row wins, occupied cell is refused, state is not mutated', () => {
  let s = gomoku.init();
  const orig = JSON.stringify(s);
  assert.ok(gomoku.apply(s, { x: 7, y: 7 }));
  assert.equal(JSON.stringify(s), orig);
  for (let i = 0; i < 4; i++) {
    s = gomoku.apply(s, { x: i, y: 0 }); // 흑
    s = gomoku.apply(s, { x: i, y: 5 }); // 백
  }
  assert.equal(gomoku.apply(s, { x: 0, y: 0 }), null);
  assert.equal(s.winner, null);
  s = gomoku.apply(s, { x: 4, y: 0 });
  assert.equal(s.winner, 0);
  assert.equal(gomoku.apply(s, { x: 9, y: 9 }), null);
  assert.deepEqual(gomoku.legalMoves(s), []);
});

test('gomoku: diagonal five, and six in a row also wins (free rule)', () => {
  let s = gomoku.init();
  for (let i = 0; i < 4; i++) {
    s = gomoku.apply(s, { x: i, y: i });
    s = gomoku.apply(s, { x: 10 + i, y: 0 });
  }
  s = gomoku.apply(s, { x: 4, y: 4 });
  assert.equal(s.winner, 0);
  const b = gomoku.init();
  b.board[3] = b.board[3].map((_, x) => (x === 0 || x === 1 || x === 2 || x === 4 || x === 5 ? 0 : null));
  const w = gomoku.apply(b, { x: 3, y: 3 });
  assert.equal(w.winner, 0);
});

test('connect4: pieces drop, 4 in a row wins, full column refused', () => {
  let s = connect4.init();
  s = connect4.apply(s, { x: 3 });
  assert.deepEqual(s.last, { x: 3, y: 5 });
  s = connect4.apply(s, { x: 3 });
  assert.deepEqual(s.last, { x: 3, y: 4 });
  s = connect4.init();
  for (let i = 0; i < 3; i++) {
    s = connect4.apply(s, { x: i }); // 빨강 바닥
    s = connect4.apply(s, { x: i }); // 노랑 위
  }
  s = connect4.apply(s, { x: 3 });
  assert.equal(s.winner, 0);
  let c = connect4.init();
  for (let i = 0; i < 6; i++) c = connect4.apply(c, { x: 0 });
  assert.equal(c.winner, null);
  assert.equal(connect4.apply(c, { x: 0 }), null);
  assert.equal(connect4.legalMoves(c).length, 6);
  assert.equal(connect4.apply(c, { x: 7 }), null);
});

test('connect4: vertical four', () => {
  let s = connect4.init();
  for (let i = 0; i < 3; i++) {
    s = connect4.apply(s, { x: 0 });
    s = connect4.apply(s, { x: 1 });
  }
  s = connect4.apply(s, { x: 0 });
  assert.equal(s.winner, 0);
});

test('reversi: start position, flips, illegal move, auto pass, game end', () => {
  let s = reversi.init();
  assert.equal(reversi.legalMoves(s).length, 4);
  assert.equal(reversi.apply(s, { x: 0, y: 0 }), null);
  const n = reversi.apply(s, { x: 2, y: 3 });
  assert.deepEqual(n.last.flips, [{ x: 3, y: 3 }]);
  assert.equal(n.board[3][3], 0);
  assert.equal(n.turn, 1);
  assert.deepEqual(reversi.count(n), [4, 1]);
  // 자동 패스·끝
  s = { board: empty(), turn: 0, winner: null, last: null, passed: false };
  s.board[0][0] = 0; s.board[0][1] = 1; // 흑이 (2,0) 에 두면 (1,0) 뒤집힘
  const p = reversi.apply(s, { x: 2, y: 0 });
  assert.equal(p.board[0][1], 0);
  // 백 돌이 없어졌으니 백은 못 두고 흑도 못 둔다 -> 끝, 흑 승
  assert.equal(p.winner, 0);
  // 패스만 일어나는 경우: 백 돌이 남아 있고 백은 둘 수 없으나 흑은 둘 수 있다
  s = { board: empty(), turn: 0, winner: null, last: null, passed: false };
  s.board[0][0] = 0; s.board[0][1] = 1; s.board[7][7] = 1; s.board[7][6] = 0; s.board[7][5] = 1;
  const q = reversi.apply(s, { x: 2, y: 0 });
  assert.equal(q.winner, null);
  assert.equal(q.turn, 0); // 백은 둘 곳이 없어 패스
  assert.equal(q.passed, true);
  assert.ok(reversi.legalMoves(q).length > 0);
});

test('checkers: initial layout, forced capture, multi-jump keeps the turn, king', () => {
  let s = checkers.init();
  assert.equal(s.board[5][0].p, 0);
  assert.equal(s.board[2][1].p, 1);
  assert.equal(checkers.legalMoves(s).length, 7);
  assert.equal(checkers.apply(s, { from: { x: 0, y: 5 }, to: { x: 1, y: 3 } }), null);
  // 강제 잡기
  s = { board: empty(), turn: 0, winner: null, last: null, chain: null, quiet: 0 };
  s.board[5][2] = { p: 0, k: false };
  s.board[4][3] = { p: 1, k: false };
  s.board[6][1] = { p: 0, k: false }; // 다른 말: 일반 이동은 막힌다
  s.board[0][1] = { p: 1, k: false };
  const ms = checkers.legalMoves(s);
  assert.equal(ms.length, 1);
  assert.deepEqual(ms[0].to, { x: 4, y: 3 });
  assert.equal(checkers.apply(s, { from: { x: 1, y: 6 }, to: { x: 0, y: 5 } }), null);
  // 연속 점프
  s = { board: empty(), turn: 0, winner: null, last: null, chain: null, quiet: 0 };
  s.board[7][0] = { p: 0, k: false };
  s.board[6][1] = { p: 1, k: false };
  s.board[4][3] = { p: 1, k: false };
  s.board[0][7] = { p: 1, k: false };
  let n = checkers.apply(s, { from: { x: 0, y: 7 }, to: { x: 2, y: 5 } });
  assert.equal(n.turn, 0);
  assert.deepEqual(n.chain, { x: 2, y: 5 });
  assert.equal(n.board[6][1], null);
  assert.equal(checkers.legalMoves(n).length, 1);
  n = checkers.apply(n, { from: { x: 2, y: 5 }, to: { x: 4, y: 3 } });
  assert.equal(n.chain, null);
  // 킹: 끝줄 도달
  s = { board: empty(), turn: 0, winner: null, last: null, chain: null, quiet: 0 };
  s.board[1][2] = { p: 0, k: false };
  s.board[7][6] = { p: 1, k: false };
  n = checkers.apply(s, { from: { x: 2, y: 1 }, to: { x: 1, y: 0 } });
  assert.equal(n.board[0][1].k, true);
  assert.equal(n.turn, 1);
});

test('checkers: a side with no moves loses', () => {
  const t = { board: empty(), turn: 0, winner: null, last: null, chain: null, quiet: 0 };
  t.board[5][2] = { p: 0, k: false };
  t.board[4][3] = { p: 1, k: false };
  const n = checkers.apply(t, { from: { x: 2, y: 5 }, to: { x: 4, y: 3 } });
  assert.equal(n.winner, 0);
  assert.deepEqual(checkers.legalMoves(n), []);
});

test('chess: initial moves, illegal moves refused', () => {
  const s = chess.init();
  assert.equal(chess.legalMoves(s).length, 20);
  assert.equal(chess.apply(s, sq(4, 6, 4, 3)), null); // 폰 세 칸
  assert.equal(chess.apply(s, sq(4, 7, 4, 6)), null); // 킹이 자기 폰 위로
  const n = mv(s, sq(4, 6, 4, 4));
  assert.equal(n.turn, 1);
  assert.deepEqual(n.ep, { x: 4, y: 5 });
});

test('chess: fool\'s mate is checkmate (black wins)', () => {
  let s = chess.init();
  s = mv(s, sq(5, 6, 5, 5)); // f3
  s = mv(s, sq(4, 1, 4, 3)); // e5
  s = mv(s, sq(6, 6, 6, 4)); // g4
  s = mv(s, sq(3, 0, 7, 4)); // Qh4#
  assert.equal(s.check, true);
  assert.equal(s.winner, 1);
  assert.equal(s.end, 'checkmate');
  assert.deepEqual(chess.legalMoves(s), []);
});

test('chess: castling both sides, and not through check', () => {
  const base = () => {
    const s = chess.init();
    s.board = empty();
    s.board[7][4] = 'wK'; s.board[7][0] = 'wR'; s.board[7][7] = 'wR'; s.board[0][4] = 'bK'; s.board[0][0] = 'bR';
    return s;
  };
  let s = base();
  const k = chess.apply(s, sq(4, 7, 6, 7));
  assert.equal(k.board[7][6], 'wK');
  assert.equal(k.board[7][5], 'wR');
  assert.equal(k.board[7][7], null);
  assert.equal(k.castling.wK, false);
  const q = chess.apply(s, sq(4, 7, 2, 7));
  assert.equal(q.board[7][2], 'wK');
  assert.equal(q.board[7][3], 'wR');
  s = base();
  s.board[3][5] = 'bR'; // f 열의 룩이 f1 을 노린다
  assert.equal(chess.apply(s, sq(4, 7, 6, 7)), null);
  assert.ok(chess.apply(s, sq(4, 7, 2, 7)));
  s = base();
  s.castling.wK = false;
  assert.equal(chess.apply(s, sq(4, 7, 6, 7)), null);
});

test('chess: en passant only right after the double step', () => {
  let s = chess.init();
  s = mv(s, sq(4, 6, 4, 4)); // e4
  s = mv(s, sq(0, 1, 0, 2)); // a6
  s = mv(s, sq(4, 4, 4, 3)); // e5
  s = mv(s, sq(3, 1, 3, 3)); // d5
  const ep = mv(s, sq(4, 3, 3, 2)); // exd6 e.p.
  assert.equal(ep.board[3][3], null);
  assert.equal(ep.board[2][3], 'wP');
  // 한 수 늦으면 못 한다
  let t = mv(s, sq(7, 6, 7, 5));
  t = mv(t, sq(7, 1, 7, 2));
  assert.equal(chess.apply(t, sq(4, 3, 3, 2)), null);
});

test('chess: promotion (choice and default queen)', () => {
  const s = chess.init();
  s.board = empty();
  s.board[1][0] = 'wP'; s.board[7][4] = 'wK'; s.board[0][7] = 'bK';
  assert.equal(chess.legalMoves(s).filter((m) => m.from.x === 0 && m.from.y === 1).length, 4);
  assert.equal(chess.apply(s, sq(0, 1, 0, 0, 'X')), null);
  assert.equal(chess.apply(s, sq(0, 1, 0, 0, 'N')).board[0][0], 'wN');
  assert.equal(chess.apply(s, sq(0, 1, 0, 0)).board[0][0], 'wQ');
});

test('chess: stalemate and insufficient material are draws', () => {
  const t = chess.init();
  t.board = empty();
  t.board[0][0] = 'bK'; t.board[7][7] = 'wK'; t.board[3][1] = 'wQ'; // 퀸 b5
  const n = chess.apply(t, sq(1, 3, 1, 2)); // Qb6 : a8 킹은 a7 b7 b8 이 모두 공격받고 체크는 아님
  assert.equal(n.winner, 'draw');
  assert.equal(n.end, 'stalemate');
  const u = chess.init();
  u.board = empty();
  u.board[0][0] = 'bK'; u.board[7][7] = 'wK'; u.board[6][6] = 'wN'; u.board[7][0] = 'bR';
  const v = chess.apply(u, sq(7, 7, 7, 6)); // 흑 룩이 남아 있어 아직 계속
  assert.equal(v.winner, null);
  const w = chess.init();
  w.board = empty();
  w.board[0][0] = 'bK'; w.board[7][7] = 'wK'; w.board[3][3] = 'wB'; w.board[4][3] = 'bP';
  w.turn = 1;
  const x = chess.apply(w, sq(0, 0, 1, 0));
  assert.equal(x.winner, null);
  const y = chess.init();
  y.board = empty();
  y.board[0][0] = 'bK'; y.board[7][7] = 'wK'; y.board[3][3] = 'wB'; y.board[0][1] = 'wN';
  y.turn = 1;
  const z = chess.apply(y, sq(0, 0, 1, 0)); // 킹이 나이트를 잡아 K+B vs K
  assert.equal(z.winner, 'draw');
  assert.equal(z.end, 'insufficient');
});

test('chess: threefold repetition is a draw', () => {
  let s = chess.init();
  const shuffle = [sq(6, 7, 5, 5), sq(6, 0, 5, 2), sq(5, 5, 6, 7), sq(5, 2, 6, 0)];
  for (let r = 0; r < 2; r++) for (const m of shuffle) s = mv(s, m);
  assert.equal(s.winner, 'draw');
  assert.equal(s.end, 'repetition');
});
