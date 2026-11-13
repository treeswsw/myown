import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDelta, champions, unflushed, addToTotal, flushEntry, roundStats } from '../../server/liar/scores.js';

test('applyDelta: 음수 가능, 새 사람은 0에서, 원본 안 바뀜', () => {
  const s = Object.freeze({ a: 2, b: 0 });
  const d = Object.freeze({ a: -1, b: 3, c: -1 });
  const out = applyDelta(s, d);
  assert.deepEqual(out, { a: 1, b: 3, c: -1 });
  assert.deepEqual(s, { a: 2, b: 0 });
  assert.notEqual(out, s);
  assert.deepEqual(applyDelta({ a: 0 }, { a: -2 }), { a: -2 });
  assert.deepEqual(applyDelta({ a: 5 }, {}), { a: 5 });
});

test('champions: goal 0 = null, 못 닿음 = null', () => {
  assert.equal(champions({ a: 99 }, 0), null);
  assert.equal(champions({ a: 9, b: 3 }, 10), null);
  assert.equal(champions({}, 10), null);
});
test('champions: 한 명, 공동, 목표를 넘긴 사람이 여럿이면 최고점만', () => {
  assert.deepEqual(champions({ a: 10, b: 4 }, 10), ['a']);
  assert.deepEqual(champions({ a: 11, b: 11, c: 3 }, 10), ['a', 'b']);
  assert.deepEqual(champions({ a: 10, b: 12, c: 11 }, 10), ['b']);
});

test('unflushed: score - flushed, 음수 가능', () => {
  assert.equal(unflushed({ score: 7, flushed: 3 }), 4);
  assert.equal(unflushed({ score: -2, flushed: 0 }), -2);
  assert.equal(unflushed({ score: 3, flushed: 3 }), 0);
  assert.equal(unflushed({ score: 3 }), 3);
});

test('addToTotal: 0 아래로 안 내려가고 나머지 칸 그대로, 원본 안 바뀜', () => {
  const st = Object.freeze({ score: 5, games: 2, wins: 1, liarGames: 1, liarWins: 0 });
  assert.deepEqual(addToTotal(st, 3), { score: 8, games: 2, wins: 1, liarGames: 1, liarWins: 0 });
  assert.equal(addToTotal(st, -9).score, 0);
  assert.equal(st.score, 5);
});

test('addToTotal + unflushed: 두 번 더해지지 않는다', () => {
  let entry = { score: 4, flushed: 0 };
  let total = { score: 10, games: 0, wins: 0, liarGames: 0, liarWins: 0 };
  total = addToTotal(total, unflushed(entry));
  entry = { ...entry, flushed: entry.score };
  total = addToTotal(total, unflushed(entry));
  assert.equal(total.score, 14);
  entry = { score: 1, flushed: 4 }; // 방 점수가 내려간 경우
  assert.equal(addToTotal(total, unflushed(entry)).score, 11);
});

test('flushEntry (v0.12-1): 깎이지 못한 몫은 반영된 것으로 치지 않는다', () => {
  const st0 = Object.freeze({ score: 0, games: 1, wins: 0, liarGames: 0, liarWins: 0 });
  let e = { score: -1, flushed: 0 };
  let r = flushEntry(st0, e);
  assert.equal(r.stats.score, 0);
  assert.equal(r.flushed, 0); // -1 은 반영 안 됨
  assert.equal(r.stats.games, 1);
  e = { score: 2, flushed: r.flushed };
  r = flushEntry(r.stats, e);
  assert.equal(r.stats.score, 2); // +3 아님
  assert.equal(r.flushed, 2);
  assert.equal(flushEntry(r.stats, { score: 2, flushed: 2 }).stats.score, 2); // 두 번 안 더함
  r = flushEntry({ score: 1 }, { score: -3, flushed: 0 }); // 일부만 깎임
  assert.equal(r.stats.score, 0);
  assert.equal(r.flushed, -1);
  assert.equal(st0.score, 0);
});

test('roundStats: 시민 승', () => {
  const r = { winner: 'citizens', liarId: 'L' };
  assert.deepEqual(roundStats(r, ['L', 'a', 'b']), {
    L: { games: 1, wins: 0, liarGames: 1, liarWins: 0 },
    a: { games: 1, wins: 1, liarGames: 0, liarWins: 0 },
    b: { games: 1, wins: 1, liarGames: 0, liarWins: 0 },
  });
});
test('roundStats: 라이어 승', () => {
  const r = { winner: 'liar', liarId: 'L' };
  assert.deepEqual(roundStats(r, ['L', 'a']), {
    L: { games: 1, wins: 1, liarGames: 1, liarWins: 1 },
    a: { games: 1, wins: 0, liarGames: 0, liarWins: 0 },
  });
});
test('roundStats: 무효는 빈 객체, 빠진 사람은 안 센다', () => {
  assert.deepEqual(roundStats({ winner: 'void', liarId: 'L' }, ['L', 'a']), {});
  const out = roundStats({ winner: 'citizens', liarId: 'L' }, ['a']);
  assert.deepEqual(Object.keys(out), ['a']);
});
