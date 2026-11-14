import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoin, parsePin, PIN_RE } from '../../shared/coin/protocol.js';

const badc = (m) => assert.deepEqual(parseCoin(m), { ok: false, code: 'coin_bad' }, JSON.stringify(m));
const badp = (m) => assert.deepEqual(parsePin(m), { ok: false, code: 'pin_fmt' }, JSON.stringify(m));

test('PIN_RE', () => {
  assert.ok(PIN_RE.test('0123'));
  for (const s of ['123', '12345', 'abcd', '12 3', '１２３４', '123\n', '']) assert.ok(!PIN_RE.test(s), s);
});

test('back (칩 -> 코인)', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'back', n: 3 }), { ok: true, msg: { t: 'coin', a: 'back', n: 3 } });
  for (const n of [0, -1, 1.5, '3', null, undefined, NaN, Infinity, 2000000001]) badc({ t: 'coin', a: 'back', n });
});

test('swap', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'swap', n: 3 }), { ok: true, msg: { t: 'coin', a: 'swap', n: 3 } });
  for (const n of [0, -1, 1.5, '3', null, undefined, NaN, Infinity, 2000000001]) badc({ t: 'coin', a: 'swap', n });
});

test('draw', () => {
  assert.equal(parseCoin({ t: 'coin', a: 'draw', n: 1 }).ok, true);
  assert.equal(parseCoin({ t: 'coin', a: 'draw', n: 10 }).ok, true);
  for (const n of [0, 2, 5, 11, '1', null, undefined]) badc({ t: 'coin', a: 'draw', n });
});

test('buy', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'buy', id: 'title.jotbyin' }).msg, { t: 'coin', a: 'buy', id: 'title.jotbyin' });
  for (const id of ['', 'x'.repeat(41), 5, null, undefined, {}]) badc({ t: 'coin', a: 'buy', id });
  assert.equal(parseCoin({ t: 'coin', a: 'buy', id: 'x'.repeat(40) }).ok, true);
});

test('equip', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'equip', slot: 'frame', id: 'frame.platinum' }).msg, { t: 'coin', a: 'equip', slot: 'frame', id: 'frame.platinum' });
  assert.deepEqual(parseCoin({ t: 'coin', a: 'equip', slot: 'suit', id: null }).msg, { t: 'coin', a: 'equip', slot: 'suit', id: null });
  assert.equal(parseCoin({ t: 'coin', a: 'equip', slot: 'hat', id: null }).ok, true);
  badc({ t: 'coin', a: 'equip', slot: 'wing', id: null });
  badc({ t: 'coin', a: 'equip', id: 'a' });
  badc({ t: 'coin', a: 'equip', slot: 'title' });
  badc({ t: 'coin', a: 'equip', slot: 'title', id: '' });
  badc({ t: 'coin', a: 'equip', slot: 'title', id: 'y'.repeat(41) });
});

test('rank 와 잘못된 봉투, 여분 칸 제거', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'rank', junk: 1 }), { ok: true, msg: { t: 'coin', a: 'rank' } });
  assert.deepEqual(parseCoin({ t: 'coin', a: 'draw', n: 1, evil: 'x' }).msg, { t: 'coin', a: 'draw', n: 1 });
  badc({ t: 'coin', a: 'nope' });
  badc({ t: 'coin' });
  badc({ t: 'pin', a: 'rank' });
  badc(null);
  badc('coin');
  badc([]);
});

test('cap / craft / pos', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'cap', n: 10, x: 1 }), { ok: true, msg: { t: 'coin', a: 'cap', n: 10 } });
  assert.equal(parseCoin({ t: 'coin', a: 'cap', n: 1 }).ok, true);
  for (const n of [0, 2, 11, '1', null, undefined]) badc({ t: 'coin', a: 'cap', n });
  assert.deepEqual(parseCoin({ t: 'coin', a: 'craft', id: 'hat.crown' }).msg, { t: 'coin', a: 'craft', id: 'hat.crown' });
  for (const id of ['', 5, null, undefined, 'x'.repeat(41)]) badc({ t: 'coin', a: 'craft', id });
  const p = { t: 'coin', a: 'pos', id: 'face.mustache', x: 0.1, y: -0.5, s: 2, r: 180 };
  assert.deepEqual(parseCoin({ ...p, junk: 1 }), { ok: true, msg: p });
  assert.equal(parseCoin({ ...p, x: -0.5, y: 0.5, s: 0.3, r: -180 }).ok, true);
  for (const k of ['x', 'y']) for (const v of [0.51, -0.51, NaN, Infinity, '0', null, undefined]) badc({ ...p, [k]: v });
  for (const v of [0.29, 2.01, NaN, '1', null, undefined]) badc({ ...p, s: v });
  for (const v of [181, -181, NaN, -Infinity, '0', undefined]) badc({ ...p, r: v });
  badc({ ...p, id: '' });
});

test('pin set / clear / forget', () => {
  assert.deepEqual(parsePin({ t: 'pin', a: 'set', pin: '1234' }), { ok: true, msg: { t: 'pin', a: 'set', pin: '1234' } });
  assert.deepEqual(parsePin({ t: 'pin', a: 'set', pin: '1234', cur: '0000' }).msg, { t: 'pin', a: 'set', pin: '1234', cur: '0000' });
  assert.equal(parsePin({ t: 'pin', a: 'set', pin: '1234', cur: null }).ok, true);
  badp({ t: 'pin', a: 'set', pin: '12' });
  badp({ t: 'pin', a: 'set', pin: 1234 });
  badp({ t: 'pin', a: 'set' });
  badp({ t: 'pin', a: 'set', pin: '1234', cur: 'abcd' });
  assert.deepEqual(parsePin({ t: 'pin', a: 'clear', cur: '4321' }).msg, { t: 'pin', a: 'clear', cur: '4321' });
  badp({ t: 'pin', a: 'clear' });
  badp({ t: 'pin', a: 'clear', cur: '43' });
  assert.deepEqual(parsePin({ t: 'pin', a: 'forget', x: 1 }), { ok: true, msg: { t: 'pin', a: 'forget' } });
  badp({ t: 'pin', a: 'x' });
  badp({ t: 'coin', a: 'forget' });
  badp(undefined);
});
