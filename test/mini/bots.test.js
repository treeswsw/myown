// 미니게임 봇 시험: 바로 이기기 / 바로 막기 / 모든 단계 합법 수 / 시간 / 봇끼리 한 판.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../shared/mini/index.js';
import { pickMove as gomoku } from '../../client/src/mini/bots/gomoku.js';
import { pickMove as connect4 } from '../../client/src/mini/bots/connect4.js';
import { pickMove as reversi } from '../../client/src/mini/bots/reversi.js';
import { pickMove as checkers } from '../../client/src/mini/bots/checkers.js';

const BOTS = { gomoku, connect4, reversi, checkers };
const LEVELS = ['easy', 'mid', 'hard'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isLegal = (game, s, m) => GAMES[game].legalMoves(s).some((l) => same(l, m));

// 판을 문자 그림으로 만든다 ('x' = seat0, 'o' = seat1, '.' = 빈칸)
function boardOf(rows, w) {
  const b = Array.from({ length: rows.length }, () => Array(w).fill(null));
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') b[y][x] = 0; else if (c === 'o') b[y][x] = 1; }));
  return b;
}

test('오목: 바로 이길 수 있으면 둔다(5목 완성), 모든 단계', () => {
  const s = GAMES.gomoku.init();
  s.board[7][3] = 0; s.board[7][4] = 0; s.board[7][5] = 0; s.board[7][6] = 0;
  s.board[3][3] = 1; s.board[3][5] = 1; s.board[9][9] = 1; s.board[1][1] = 1;
  s.turn = 0;
  const m = gomoku(s, 'hard', 1000);
  assert.ok(m.x === 2 || m.x === 7);
  assert.equal(m.y, 7);
  assert.ok(GAMES.gomoku.apply(s, m).winner === 0);
});

test('오목: 상대의 4를 막는다', () => {
  const s = GAMES.gomoku.init();
  for (let i = 0; i < 4; i++) s.board[5][4 + i] = 1; // 상대 4개 (x=4..7, y=5), 한쪽 끝만 열림
  s.board[5][3] = 0;
  s.board[9][9] = 0; s.board[10][2] = 0; s.board[2][12] = 0;
  s.turn = 0;
  for (const lv of ['mid', 'hard']) assert.deepEqual(gomoku(s, lv, 1500), { x: 8, y: 5 }, lv);
});

test('오목: 첫 수는 가운데', () => {
  assert.deepEqual(gomoku(GAMES.gomoku.init(), 'hard', 500), { x: 7, y: 7 });
});

test('커넥트포: 바로 이긴다 / 상대의 3을 막는다', () => {
  const g = GAMES.connect4;
  const win = { ...g.init(), board: boardOf(['.......', '.......', '.......', '.......', 'oo.....', 'xxx.o..'], 7), turn: 0 };
  for (const lv of LEVELS) assert.deepEqual(connect4(win, lv, 800), { x: 3 }, lv);
  const blk = { ...g.init(), board: boardOf(['.......', '.......', '.......', '.......', '.......', 'xooo...'], 7), turn: 0 };
  for (const lv of ['mid', 'hard']) assert.deepEqual(connect4(blk, lv, 800), { x: 4 }, lv);
});

test('리버시: 모서리를 가져간다 (hard)', () => {
  const s = GAMES.reversi.init();
  s.board = boardOf(['.ox.....', '........', '........', '...ox...', '...xo...', '........', '........', '........'], 8);
  s.turn = 0;
  // seat0(x)가 (0,0)에 두면 (1,0) o 를 뒤집는다
  const moves = GAMES.reversi.legalMoves(s);
  assert.ok(moves.some((m) => m.x === 0 && m.y === 0));
  assert.deepEqual(reversi(s, 'hard', 1500), { x: 0, y: 0 });
});

test('체커: 강제 잡기를 한다', () => {
  const s = GAMES.checkers.init();
  s.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  s.board[5][2] = { p: 0, k: false };
  s.board[4][3] = { p: 1, k: false };
  s.board[7][6] = { p: 0, k: false };
  s.board[0][1] = { p: 1, k: false };
  s.turn = 0;
  for (const lv of LEVELS) assert.deepEqual(checkers(s, lv, 800), { from: { x: 2, y: 5 }, to: { x: 4, y: 3 } }, lv);
});

test('체커: 연속 점프(chain)를 이어간다', () => {
  const s = GAMES.checkers.init();
  s.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  s.board[5][2] = { p: 0, k: false };
  s.board[4][3] = { p: 1, k: false };
  s.board[2][3] = { p: 1, k: false };
  s.board[0][7] = { p: 1, k: false };
  s.turn = 0;
  const m1 = checkers(s, 'hard', 800);
  const s2 = GAMES.checkers.apply(s, m1);
  assert.ok(s2.chain);
  const m2 = checkers(s2, 'hard', 800);
  assert.ok(GAMES.checkers.apply(s2, m2));
});

test('모든 단계가 합법 수를 낸다 (처음 상태와 몇 수 둔 뒤)', () => {
  for (const game of Object.keys(BOTS)) {
    for (const lv of LEVELS) {
      let s = GAMES[game].init();
      for (let i = 0; i < 6; i++) {
        const m = BOTS[game](s, lv === 'hard' ? 'mid' : lv, 300);
        assert.ok(isLegal(game, s, m), `${game} ${lv}`);
        s = GAMES[game].apply(s, m);
      }
      const m = BOTS[game](s, lv, 600);
      assert.ok(isLegal(game, s, m), `${game} ${lv}`);
    }
  }
});

test('hard 는 시간 안에 끝난다', () => {
  const limits = { gomoku: 2500, connect4: 1500, reversi: 1800, checkers: 1000 };
  for (const game of Object.keys(BOTS)) {
    let s = GAMES[game].init();
    for (let i = 0; i < 10 && s.winner === null; i++) { // 판을 조금 진행해 복잡하게
      const m = BOTS[game](s, 'easy');
      s = GAMES[game].apply(s, m);
    }
    const t0 = Date.now();
    const m = BOTS[game](s, 'hard');
    const dt = Date.now() - t0;
    assert.ok(isLegal(game, s, m), game);
    assert.ok(dt < limits[game] + 700, `${game} ${dt}ms`);
    // 짧은 deadline 도 지킨다
    const t1 = Date.now();
    BOTS[game](s, 'hard', 200);
    assert.ok(Date.now() - t1 < 900, `${game} deadline`);
  }
});

test('봇끼리 한 판씩 끝까지 둔다 (오류 없음)', () => {
  const cap = { gomoku: 225, connect4: 42, reversi: 80, checkers: 400 };
  for (const game of Object.keys(BOTS)) {
    let s = GAMES[game].init();
    let n = 0;
    while (s.winner === null && n++ < cap[game]) {
      const lv = s.turn === 0 ? 'mid' : 'easy';
      const m = BOTS[game](s, lv, 150);
      assert.ok(isLegal(game, s, m), `${game} #${n}`);
      s = GAMES[game].apply(s, m);
      assert.ok(s, `${game} apply #${n}`);
    }
    assert.ok(s.winner !== null || n > cap[game] - 1, game);
  }
});
