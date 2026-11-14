import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDr } from '../../shared/draw/protocol.js';
import { GAME_NAME } from '../../shared/draw/name.js';
import * as K from '../../shared/draw/constants.js';

const ok = (m) => { const r = checkDr(m); assert.equal(r.ok, true, JSON.stringify(r)); return r.msg; };
const no = (m) => { const r = checkDr(m); assert.equal(r.ok, false, JSON.stringify(m)); assert.equal(typeof r.error, 'string'); };

test('이름과 상수', () => {
  assert.equal(GAME_NAME, '갱식마인드');
  assert.equal(K.COLORS.length, 12);
  assert.equal(K.COLORS[0].value, '#1c1c1e');
  assert.equal(K.COLORS[11].value, '#ff7eb8');
  assert.deepEqual([...K.WIDTH_QUICK], [4, 10, 24]);
  assert.deepEqual([...K.ROUND_CHOICES], [1, 2, 3, 5]);
  assert.deepEqual([...K.TIME_CHOICES], [60, 90, 140]);
  assert.equal(K.TIMES.pick, 10);
  assert.equal(K.TIMES.reveal, 5);
  assert.equal(K.TIMES.rush, 30);
  assert.equal(K.TIMES.idle, 20);
  assert.equal(K.TIMES.drawerAway, 15);
  assert.equal(K.SCORE.firstBonus, 20);
  assert.throws(() => { K.TIMES.pick = 1; });
  assert.throws(() => { K.COLORS.push(1); });
});

test('봉투가 틀린 요청', () => {
  for (const m of [null, undefined, 'x', 5, [], {}, { a: 5 }, { a: '' }, { a: 'nope' }, { a: '__proto__' }, { a: 'x'.repeat(21) }]) no(m);
});

test('단순 요청: 필드를 떼고 돌려준다', () => {
  for (const a of ['cx', 'undo', 'redo', 'clear', 'give', 'skip', 'end']) {
    assert.deepEqual(ok({ a, junk: 1 }), { a });
  }
});

test('옛 요청(settings/kick/lobby)은 공용 set·kick·start 로 대체됨', () => {
  no({ a: 'settings', rounds: 3 }); no({ a: 'kick', id: 'jiho' }); no({ a: 'lobby' });
});

test('pick', () => {
  for (const i of [0, 1, 2]) assert.deepEqual(ok({ a: 'pick', i }), { a: 'pick', i });
  for (const i of [-1, 3, 1.5, '1', null, undefined]) no({ a: 'pick', i });
});

test('st: 맞는 것', () => {
  assert.deepEqual(ok({ a: 'st', c: 0, w: 2, e: 0, p: [0, 0] }), { a: 'st', c: 0, w: 2, e: 0, p: [0, 0] });
  const m = ok({ a: 'st', c: 11, w: 40, e: 1, p: [1600, 1200, -1600, 1600, 5, -5], junk: 1 });
  assert.deepEqual(m, { a: 'st', c: 11, w: 40, e: 1, p: [1600, 1200, -1600, 1600, 5, -5] });
  ok({ a: 'st', c: 3, w: 10, e: 0, p: Array.from({ length: 128 }, () => 1) });
});

test('st: 틀린 것', () => {
  const base = { a: 'st', c: 3, w: 10, e: 0, p: [10, 10, 1, 1] };
  ok(base);
  no({ ...base, c: -1 });
  no({ ...base, c: 12 });
  no({ ...base, c: 1.5 });
  no({ ...base, w: 1 });
  no({ ...base, w: 41 });
  no({ ...base, w: '10' });
  no({ ...base, e: 2 });
  no({ ...base, e: true });
  no({ ...base, e: undefined });
  no({ ...base, p: [] });
  no({ ...base, p: [10] });
  no({ ...base, p: [10, 10, 1] });
  no({ ...base, p: [1601, 10] });
  no({ ...base, p: [10, 1201] });
  no({ ...base, p: [-1, 10] });
  no({ ...base, p: [10, 10, 1601, 0] });
  no({ ...base, p: [10, 10, 0, -1601] });
  no({ ...base, p: [10, 10, 1.5, 0] });
  no({ ...base, p: [10, '10'] });
  no({ ...base, p: [10, NaN] });
  no({ ...base, p: [10, Infinity] });
  no({ ...base, p: 'abc' });
  no({ ...base, p: { length: 2 } });
  no({ ...base, p: Array.from({ length: 130 }, () => 1) });
  no({ a: 'st' });
});

test('pt', () => {
  assert.deepEqual(ok({ a: 'pt', p: [1, -1] }), { a: 'pt', p: [1, -1] });
  assert.deepEqual(ok({ a: 'pt', p: [3, 4], f: 1, junk: 1 }), { a: 'pt', p: [3, 4], f: 1 });
  assert.deepEqual(ok({ a: 'pt', p: [], f: 1 }), { a: 'pt', p: [], f: 1 }); // 선 끝만
  ok({ a: 'pt', p: Array.from({ length: 128 }, () => -1600) });
  no({ a: 'pt', p: [] }); // f 없이 빈 배열은 의미 없음
  no({ a: 'pt' });
  no({ a: 'pt', p: [1] });
  no({ a: 'pt', p: [1601, 0] });
  no({ a: 'pt', p: [0, -1601] });
  no({ a: 'pt', p: [0.5, 0] });
  no({ a: 'pt', p: Array.from({ length: 130 }, () => 1) });
  no({ a: 'pt', p: [1, 1], f: 0 });
  no({ a: 'pt', p: [1, 1], f: true });
});

test('rm', () => {
  assert.deepEqual(ok({ a: 'rm', ids: [0, 5, 599] }), { a: 'rm', ids: [0, 5, 599] });
  assert.deepEqual(ok({ a: 'rm', ids: [3], g: 1, junk: 1 }), { a: 'rm', ids: [3], g: 1 });
  ok({ a: 'rm', ids: Array.from({ length: 50 }, (_, i) => i) });
  no({ a: 'rm' });
  no({ a: 'rm', ids: [] });
  no({ a: 'rm', ids: 3 });
  no({ a: 'rm', ids: [-1] });
  no({ a: 'rm', ids: [600] });
  no({ a: 'rm', ids: [1.5] });
  no({ a: 'rm', ids: ['1'] });
  no({ a: 'rm', ids: [1, 1] });
  no({ a: 'rm', ids: Array.from({ length: 51 }, (_, i) => i) });
  no({ a: 'rm', ids: [1], g: 2 });
});

test('받은 객체를 고치지 않고 배열은 복사본', () => {
  const p = [1, 2, 3, 4];
  const m = ok({ a: 'st', c: 0, w: 5, e: 0, p });
  assert.notEqual(m.p, p);
  const ids = [1, 2];
  assert.notEqual(ok({ a: 'rm', ids }).ids, ids);
});
