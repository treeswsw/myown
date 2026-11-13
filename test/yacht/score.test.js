import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS, UPPER } from '../../shared/yacht/constants.js';
import { scoreOf, previewOf, totals, comboOf } from '../../shared/yacht/score.js';

// GDD 3-2 예시 표 20줄
const TABLE = [
  [[1, 1, 3, 4, 6], 'ones', 2], [[2, 3, 4, 5, 6], 'largeStraight', 30],
  [[1, 1, 3, 4, 6], 'fives', 0], [[2, 3, 4, 5, 6], 'smallStraight', 15],
  [[4, 4, 4, 6, 6], 'fours', 12], [[1, 3, 4, 5, 6], 'smallStraight', 15],
  [[4, 4, 4, 6, 6], 'fullHouse', 24], [[1, 3, 4, 5, 6], 'largeStraight', 0],
  [[4, 4, 4, 6, 6], 'fourKind', 0], [[1, 2, 3, 5, 6], 'smallStraight', 0],
  [[4, 4, 4, 4, 6], 'fourKind', 22], [[3, 3, 4, 5, 6], 'smallStraight', 15],
  [[4, 4, 4, 4, 6], 'fullHouse', 0], [[6, 6, 6, 6, 6], 'yacht', 50],
  [[5, 5, 5, 5, 5], 'fourKind', 25], [[6, 6, 6, 6, 5], 'yacht', 0],
  [[5, 5, 5, 5, 5], 'fullHouse', 0], [[6, 6, 6, 6, 6], 'choice', 30],
  [[1, 2, 3, 4, 5], 'largeStraight', 30], [[6, 6, 6, 6, 6], 'sixes', 30],
];

test('GDD 3-2 예시 표 20줄', () => {
  assert.equal(TABLE.length, 20);
  for (const [dice, cat, want] of TABLE) assert.equal(scoreOf(cat, dice), want, `${dice} ${cat}`);
});

test('주사위 순서는 상관없다', () => {
  for (const [dice, cat, want] of TABLE) assert.equal(scoreOf(cat, [...dice].reverse()), want);
  assert.equal(scoreOf('fullHouse', [6, 4, 6, 4, 4]), 24);
});

test('윗칸·초이스·스트레이트 경계', () => {
  assert.deepEqual(UPPER.map((c, i) => scoreOf(c, [1, 2, 3, 4, 5].map(() => i + 1))), [5, 10, 15, 20, 25, 30]);
  assert.equal(scoreOf('choice', [1, 1, 1, 1, 1]), 5);
  assert.equal(scoreOf('largeStraight', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreOf('smallStraight', [1, 2, 3, 4, 4]), 15);
  assert.equal(scoreOf('fullHouse', [1, 1, 2, 2, 2]), 8);
  assert.equal(scoreOf('fourKind', [2, 2, 2, 2, 2]), 10);
  assert.equal(scoreOf('yacht', [1, 1, 1, 1, 1]), 50);
});

test('잘못된 입력은 던진다', () => {
  assert.throws(() => scoreOf('nope', [1, 2, 3, 4, 5]));
  assert.throws(() => scoreOf('ones', [1, 2, 3, 4]));
  assert.throws(() => scoreOf('ones', [1, 2, 3, 4, 7]));
  assert.throws(() => scoreOf('ones', [1, 2, 3, 4, 1.5]));
});

test('보너스 62/63', () => {
  // 62 = 2 + 4 + 9 + 16 + 15 + 16 (ones 2, twos 4, threes 9, fours 16, fives 15, sixes 16)
  const s62 = { ones: 2, twos: 4, threes: 9, fours: 16, fives: 15, sixes: 16 };
  assert.equal(Object.values(s62).reduce((a, b) => a + b), 62);
  assert.deepEqual(totals(s62), { upper: 62, bonus: 0, total: 62 });
  const s63 = { ...s62, sixes: 17 };
  assert.deepEqual(totals(s63), { upper: 63, bonus: 35, total: 98 });
  const max = { ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30 };
  assert.deepEqual(totals(max), { upper: 105, bonus: 35, total: 140 });
  assert.deepEqual(totals({}), { upper: 0, bonus: 0, total: 0 });
});

test('최고 합계 323', () => {
  const best = { ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30, choice: 30, fourKind: 30, fullHouse: 28, smallStraight: 15, largeStraight: 30, yacht: 50 };
  assert.equal(totals(best).total, 323);
  // 각 칸의 최고점이 실제 주사위로 나오는지
  assert.equal(scoreOf('choice', [6, 6, 6, 6, 6]), 30);
  assert.equal(scoreOf('fourKind', [6, 6, 6, 6, 6]), 30);
  assert.equal(scoreOf('fullHouse', [6, 6, 6, 5, 5]), 28);
  let top = 0;
  for (const cat of CATS) {
    let m = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) for (let e = 1; e <= 6; e++) m = Math.max(m, scoreOf(cat, [a, b, c, d, e]));
    top += m;
  }
  assert.equal(top + 35, 323);
});

test('previewOf: 빈칸만', () => {
  const p = previewOf([4, 4, 4, 6, 6], { ones: 1, fours: null, fullHouse: 0 });
  assert.equal('ones' in p, false);
  assert.equal('fullHouse' in p, false);
  assert.equal(p.fours, 12);
  assert.equal(p.choice, 24);
  assert.equal(Object.keys(p).length, 10);
});

test('comboOf 우선순위', () => {
  assert.equal(comboOf([6, 6, 6, 6, 6]), 'yacht');
  assert.equal(comboOf([2, 3, 4, 5, 6]), 'largeStraight');
  assert.equal(comboOf([1, 2, 3, 4, 5]), 'largeStraight');
  assert.equal(comboOf([4, 4, 4, 4, 6]), 'fourKind');
  assert.equal(comboOf([4, 4, 4, 6, 6]), 'fullHouse');
  assert.equal(comboOf([1, 2, 3, 4, 4]), 'smallStraight');
  assert.equal(comboOf([1, 1, 3, 4, 6]), null);
  assert.equal(comboOf([5, 5, 5, 1, 2]), null);
});
