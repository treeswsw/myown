import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guesserPoints, guesserPointsAt, drawerPoints, rankPlayers } from '../../shared/draw/score.js';

test('맞힌 사람 점수: GDD 3-4절 예시', () => {
  // 2분 20초(140), 18초에 첫 정답 -> 남은 122초: 40 + 52 + 20 = 112
  assert.equal(guesserPoints({ remainingSec: 122, totalSec: 140, first: true }), 112);
  assert.equal(guesserPoints({ remainingSec: 25, totalSec: 140 }), 51);
  assert.equal(guesserPoints({ remainingSec: 14, totalSec: 140 }), 46);
});

test('맞힌 사람 점수: 범위 40~120, 자르기', () => {
  assert.equal(guesserPoints({ remainingSec: 0, totalSec: 140 }), 40);
  assert.equal(guesserPoints({ remainingSec: 140, totalSec: 140 }), 100);
  assert.equal(guesserPoints({ remainingSec: 140, totalSec: 140, first: true }), 120);
  assert.equal(guesserPoints({ remainingSec: -5, totalSec: 60 }), 40);
  assert.equal(guesserPoints({ remainingSec: 999, totalSec: 60 }), 100);
  assert.equal(guesserPoints({ remainingSec: 30, totalSec: 60 }), 70);
  assert.equal(guesserPoints({ remainingSec: 10, totalSec: 0 }), 40);
});

test('맞힌 사람 점수: 시각으로 계산', () => {
  assert.equal(guesserPointsAt({ endsAtMs: 140000, nowMs: 18000, totalSec: 140, order: 1 }), 112);
  assert.equal(guesserPointsAt({ endsAtMs: 140000, nowMs: 115000, totalSec: 140, order: 2 }), 51);
});

test('그린 사람 점수', () => {
  assert.equal(drawerPoints({ hits: 3, guessers: 5 }), 60);
  assert.equal(drawerPoints({ hits: 5, guessers: 5 }), 100);
  assert.equal(drawerPoints({ hits: 0, guessers: 5 }), 0);
  assert.equal(drawerPoints({ hits: 1, guessers: 3 }), 33);
  assert.equal(drawerPoints({ hits: 2, guessers: 3 }), 67);
  assert.equal(drawerPoints({ hits: 1, guessers: 0 }), 0);
  assert.equal(drawerPoints({ hits: 9, guessers: 5 }), 100);
});

test('순위: 점수 -> 맞힌 횟수 -> 공동 순위', () => {
  const r = rankPlayers([
    { id: 'a', score: 100, correct: 1 },
    { id: 'b', score: 200, correct: 2 },
    { id: 'c', score: 100, correct: 2 },
    { id: 'd', score: 100, correct: 1 },
    { id: 'e', score: 0, correct: 0 },
  ]);
  assert.deepEqual(r.map((x) => [x.id, x.rank]), [['b', 1], ['c', 2], ['a', 3], ['d', 3], ['e', 5]]);
});

test('순위: 입력을 바꾸지 않고 correct 가 없어도 된다', () => {
  const inp = [{ id: 'x', score: 5 }, { id: 'y', score: 5 }];
  const r = rankPlayers(inp);
  assert.deepEqual(r.map((x) => x.rank), [1, 1]);
  assert.equal(inp[0].rank, undefined);
  assert.deepEqual(rankPlayers([]), []);
});
