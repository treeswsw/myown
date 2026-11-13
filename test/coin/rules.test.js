import test from 'node:test';
import assert from 'node:assert/strict';
import { COIN_RULES, coinsFor } from '../../shared/coin/rules.js';

test('4명 1등과 나머지 (22-12 시험 2)', () => {
  assert.equal(coinsFor('bluff', { won: true, opp: 3 }), 4);
  assert.equal(coinsFor('bluff', { won: false, opp: 3 }), 1);
  assert.equal(coinsFor('yacht', { won: true, opp: 3 }), 15);
  assert.equal(coinsFor('yacht', { won: false, opp: 3 }), 3);
  assert.equal(coinsFor('draw', { won: true, opp: 3 }), 8);
  assert.equal(coinsFor('draw', { won: false, opp: 3 }), 2);
});

test('라이어: 시민 승 2, 라이어 패 1, 라이어 승 4, 시민 패 1', () => {
  assert.equal(coinsFor('liar', { won: true, opp: 1 }), 2);
  assert.equal(coinsFor('liar', { won: false, opp: 3 }), 1);
  assert.equal(coinsFor('liar', { won: true, opp: 3 }), 4);
  assert.equal(coinsFor('liar', { won: false, opp: 1 }), 1);
});

test('홀덤·모르는 mode·이상한 opp 는 안전', () => {
  assert.equal(coinsFor('holdem', { won: true, opp: 5 }), 0);
  assert.equal(coinsFor('nope', { won: true, opp: 5 }), 0);
  assert.equal(coinsFor('toString', { won: true, opp: 5 }), 0);
  assert.equal(coinsFor('yacht', { won: true, opp: -2 }), 3);
  assert.equal(coinsFor('yacht', { won: true, opp: 1.5 }), 3);
  assert.equal(coinsFor('yacht', { won: true }), 3);
  assert.equal(coinsFor('yacht'), 3);
});

test('표 모양', () => {
  assert.deepEqual(COIN_RULES.yacht, { finish: 3, win: 4, gapMs: 240000 });
  assert.deepEqual(Object.keys(COIN_RULES), ['bluff', 'liar', 'draw', 'yacht']);
});
