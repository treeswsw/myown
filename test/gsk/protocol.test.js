// 갱스껄 요청 속 모양 검사 시험 (GDD 9-1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGk } from '../../shared/gsk/protocol.js';

const okOf = (m) => { const r = parseGk(m); assert.equal(r.ok, true, JSON.stringify(m)); return r.msg; };
const badOf = (m) => {
  const r = parseGk(m);
  assert.equal(r.ok, false, JSON.stringify(m));
  assert.equal(r.code, 'gk_bad');
  assert.equal(typeof r.error, 'string');
};

test('올바른 요청은 정리된 객체로 돌아온다(모르는 필드는 버림)', () => {
  assert.deepEqual(okOf({ t: 'gk', a: 'color', c: 5, x: 1 }), { a: 'color', c: 5 });
  assert.deepEqual(okOf({ a: 'place', k: 'F' }), { a: 'place', k: 'F' });
  assert.deepEqual(okOf({ a: 'place', k: 'S' }), { a: 'place', k: 'S' });
  assert.deepEqual(okOf({ a: 'bid', n: 7 }), { a: 'bid', n: 7 });
  assert.deepEqual(okOf({ a: 'pass', z: 3 }), { a: 'pass' });
  assert.deepEqual(okOf({ a: 'flip', p: 'abc' }), { a: 'flip', p: 'abc' });
  assert.deepEqual(okOf({ a: 'discard', i: 0 }), { a: 'discard', i: 0 });
  assert.deepEqual(okOf({ a: 'discard', i: 3 }), { a: 'discard', i: 3 });
  assert.deepEqual(okOf({ a: 'discard', k: 'S' }), { a: 'discard', k: 'S' });
});

test('받은 객체를 고치지 않는다', () => {
  const m = Object.freeze({ a: 'bid', n: 2, extra: true });
  assert.deepEqual(okOf(m), { a: 'bid', n: 2 });
});

test('봉투가 이상하면 거절', () => {
  for (const m of [null, undefined, 5, 'x', [], {}, { a: 1 }, { a: '' }, { a: 'x'.repeat(21) }, { a: 'nope' }]) badOf(m);
});

test('color: 0~5 정수만', () => {
  for (const c of [-1, 6, 1.5, '1', null, undefined, NaN]) badOf({ a: 'color', c });
});

test('place: F 또는 S 만', () => {
  for (const k of ['f', 'X', '', 1, null, undefined]) badOf({ a: 'place', k });
});

test('bid: 1 이상 정수만', () => {
  for (const n of [0, -1, 1.2, '3', null, undefined, NaN, Infinity, 25]) badOf({ a: 'bid', n });
});

test('flip: 글자만', () => {
  for (const p of ['', 5, null, undefined, {}, 'x'.repeat(101)]) badOf({ a: 'flip', p });
});

test('discard: i 또는 k 중 정확히 하나', () => {
  badOf({ a: 'discard' });
  badOf({ a: 'discard', i: 0, k: 'F' });
  badOf({ a: 'discard', i: -1 });
  badOf({ a: 'discard', i: 4 });
  badOf({ a: 'discard', i: 1.5 });
  badOf({ a: 'discard', i: '1' });
  badOf({ a: 'discard', k: 'Z' });
});
