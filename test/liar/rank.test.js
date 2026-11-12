import test from 'node:test';
import assert from 'node:assert/strict';
import { rankLines } from '../../client/src/liar/ui/rank.js';

test('rankLines: 점수가 같으면 같은 순위, 다음은 건너뜀', () => {
  const { rows } = rankLines([{ name: 'a', score: 9, games: 3 }, { name: 'b', score: 7, games: 2 }, { name: 'c', score: 7, games: 5 }, { name: 'd', score: 1, games: 1 }], null);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 2, 4]);
});
test('rankLines: 내 순위 글자', () => {
  assert.equal(rankLines([], { rank: 3, score: 12 }).mine, '내 순위 3위 · 12점');
  assert.equal(rankLines([], { rank: null, score: 0 }).mine, '아직 순위 없음');
  assert.equal(rankLines([], null).mine, '아직 순위 없음');
});
test('rankLines: 빈 목록·잘못된 값', () => {
  assert.deepEqual(rankLines(null, null).rows, []);
  assert.equal(rankLines([{ name: 'x' }], null).rows[0].score, 0);
});
