import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GAMES } from '../../shared/mini/index.js';
import { fromFen } from '../../shared/mini/fen.js';
import { stateToFen, uciToMove } from '../../client/src/mini/bots/fen.js';
import { loadPuzzles, pickPuzzle, checkMove } from '../../server/mini/puzzles.js';

const { chess } = GAMES;
const rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
const norm = (f) => f.split(' ').slice(0, 4).join(' '); // 풀무브·하프무브 빼고 비교

test('파일: 2만 개 안팎, rating 오름차순, 600~2900', () => {
  const p = loadPuzzles();
  assert.ok(p.length > 15000 && p.length < 30000, `개수 ${p.length}`);
  for (let i = 1; i < p.length; i++) assert.ok(p[i][3] >= p[i - 1][3]);
  assert.ok(p[0][3] >= 600 && p.at(-1)[3] < 3000);
  assert.equal(p[0].length, 4);
});

test('무작위 50문제: FEN 왕복, 수순 전부 합법, 마지막 수는 상대 수 아님', () => {
  const p = loadPuzzles();
  for (let n = 0; n < 50; n++) {
    const [id, fen, moves] = p[Math.floor(rng() * p.length)];
    let s = fromFen(fen);
    assert.equal(norm(stateToFen(s)), norm(fen), id);
    const us = moves.split(' ');
    assert.ok(us.length >= 2 && us.length % 2 === 0, id);
    us.forEach((u, i) => {
      s = chess.apply(s, uciToMove(u));
      assert.ok(s, `${id} ${i}번째 ${u} 불법`);
    });
  }
});

test('fromFen <-> stateToFen: 시작/중반/앙파상/캐슬링', () => {
  for (const f of [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    'r3k2r/pp3ppp/2n5/3pP3/8/2N5/PP3PPP/R3K2R w Kq d6 3 14',
  ]) assert.equal(stateToFen(fromFen(f)), f);
  assert.equal(fromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1').check, true);
});

test('pickPuzzle: 범위, recent 제외, 넓히기', () => {
  const p = pickPuzzle(1500, [], rng);
  assert.ok(Math.abs(p[3] - 1500) <= 150);
  const recent = new Set();
  for (let i = 0; i < 100; i++) { const q = pickPuzzle(1500, recent, rng); assert.ok(!recent.has(q[0])); recent.add(q[0]); }
  const hi = pickPuzzle(5000, [], rng);
  assert.ok(hi[3] > 2000);
  assert.ok(pickPuzzle(100, [], rng));
});

test('checkMove: 정답 수, 오답, 마지막 수 체크메이트 대체', () => {
  const puz = loadPuzzles()[500];
  const us = puz[2].split(' ');
  let s = fromFen(puz[1]);
  s = chess.apply(s, uciToMove(us[0]));
  const m = uciToMove(us[1]);
  const after = chess.apply(s, m);
  assert.equal(checkMove(puz, 1, m, after), true);
  const other = chess.legalMoves(s).find((l) => `${'abcdefgh'[l.from.x]}${8 - l.from.y}${'abcdefgh'[l.to.x]}${8 - l.to.y}` !== us[1].slice(0, 4));
  if (other) {
    const a2 = chess.apply(s, other);
    assert.equal(checkMove(puz, 1, other, a2), us.length - 1 === 1 && a2.end === 'checkmate');
  }
  // 메이트 문제: 마지막 수 자리에서 다른 메이트 수도 정답
  assert.equal(checkMove(puz, 1, m, { end: null }), true);
  assert.equal(checkMove(['x', puz[1], 'a1a2 b1b2', 1000], 1, uciToMove('c1c2'), { end: 'checkmate' }), true);
  assert.equal(checkMove(['x', puz[1], 'a1a2 b1b2 c1c2 d1d2', 1000], 1, uciToMove('c1c3'), { end: 'checkmate' }), false);
});
