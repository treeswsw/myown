import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../../shared/mini/index.js';
import { stateToFen, uciToMove } from '../../client/src/mini/bots/fen.js';

const { chess } = GAMES;
const at = (n) => ({ x: n.charCodeAt(0) - 97, y: 8 - Number(n[1]) });
const play = (s, ...moves) => moves.reduce((st, u) => {
  const n = chess.apply(st, uciToMove(u));
  assert.ok(n, `불법 수 ${u}`);
  return n;
}, s);

test('시작 상태 FEN', () => {
  assert.equal(stateToFen(chess.init()), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('몇 수 뒤: 앙파상 칸과 번호', () => {
  const s = play(chess.init(), 'e2e4');
  assert.equal(stateToFen(s), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const s2 = play(s, 'c7c5', 'g1f3');
  assert.equal(stateToFen(s2), 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
});

test('캐슬링 권리 변화', () => {
  let s = play(chess.init(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'h1g1');
  assert.match(stateToFen(s), / b Qkq - 5 4$/);
  s = play(s, 'f8c5', 'e1e2');
  assert.match(stateToFen(s), / b kq - 7 5$/);
  const t = play(chess.init(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1');
  assert.equal(stateToFen(t), 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4');
});

test('UCI 변환', () => {
  assert.deepEqual(uciToMove('e2e4'), { from: at('e2'), to: at('e4') });
  assert.deepEqual(uciToMove('e7e8q'), { from: at('e7'), to: at('e8'), promo: 'Q' });
  assert.equal(uciToMove('a2a1n').promo, 'N');
  assert.equal(uciToMove('zz'), null);
  assert.equal(uciToMove(null), null);
});
