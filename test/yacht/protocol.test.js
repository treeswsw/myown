import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYt } from '../../shared/yacht/protocol.js';
import { CATS } from '../../shared/yacht/constants.js';

const ok = (m) => { const r = parseYt(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const no = (m) => { const r = parseYt(m); assert.equal(r.ok, false, JSON.stringify(m)); assert.equal(r.msg, undefined); };

test('봉투가 틀린 요청', () => {
  for (const m of [null, undefined, 'x', 5, [], {}, { a: 5 }, { a: 'nope' }, { a: '__proto__' }, { a: 'constructor' }, { a: '' }]) no(m);
});

test('roll', () => {
  assert.deepEqual(ok({ a: 'roll', junk: 1 }), { a: 'roll' });
});

test('shake', () => {
  assert.deepEqual(ok({ a: 'shake', on: true }), { a: 'shake', on: true });
  assert.deepEqual(ok({ a: 'shake', on: false }), { a: 'shake', on: false });
  no({ a: 'shake' }); no({ a: 'shake', on: 1 }); no({ a: 'shake', on: 'true' });
});

test('keep', () => {
  for (let i = 0; i <= 4; i++) assert.deepEqual(ok({ a: 'keep', i, on: i % 2 === 0 }), { a: 'keep', i, on: i % 2 === 0 });
  no({ a: 'keep', i: 5, on: true }); no({ a: 'keep', i: -1, on: true }); no({ a: 'keep', i: 1.5, on: true });
  no({ a: 'keep', i: '1', on: true }); no({ a: 'keep', i: 1 }); no({ a: 'keep', on: true }); no({ a: 'keep', i: 1, on: 'yes' });
});

test('pick', () => {
  for (const cat of CATS) assert.deepEqual(ok({ a: 'pick', cat }), { a: 'pick', cat });
  assert.deepEqual(ok({ a: 'pick', cat: null }), { a: 'pick', cat: null });
  no({ a: 'pick' }); no({ a: 'pick', cat: 'total' }); no({ a: 'pick', cat: 3 }); no({ a: 'pick', cat: '__proto__' }); no({ a: 'pick', cat: undefined });
});

test('score', () => {
  for (const cat of CATS) assert.deepEqual(ok({ a: 'score', cat }), { a: 'score', cat });
  no({ a: 'score' }); no({ a: 'score', cat: null }); no({ a: 'score', cat: 'bonus' }); no({ a: 'score', cat: ['ones'] });
});

test('받은 객체를 고치지 않는다', () => {
  const src = { a: 'keep', i: 2, on: true, extra: 9 };
  const copy = JSON.stringify(src);
  ok(src);
  assert.equal(JSON.stringify(src), copy);
});
