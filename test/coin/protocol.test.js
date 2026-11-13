import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoin, parsePin, PIN_RE } from '../../shared/coin/protocol.js';

const badc = (m) => assert.deepEqual(parseCoin(m), { ok: false, code: 'coin_bad' }, JSON.stringify(m));
const badp = (m) => assert.deepEqual(parsePin(m), { ok: false, code: 'pin_fmt' }, JSON.stringify(m));

test('PIN_RE', () => {
  assert.ok(PIN_RE.test('0123'));
  for (const s of ['123', '12345', 'abcd', '12 3', '１２３４', '123\n', '']) assert.ok(!PIN_RE.test(s), s);
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
  assert.deepEqual(parseCoin({ t: 'coin', a: 'buy', id: 'title.rookie' }).msg, { t: 'coin', a: 'buy', id: 'title.rookie' });
  for (const id of ['', 'x'.repeat(41), 5, null, undefined, {}]) badc({ t: 'coin', a: 'buy', id });
  assert.equal(parseCoin({ t: 'coin', a: 'buy', id: 'x'.repeat(40) }).ok, true);
});

test('equip', () => {
  assert.deepEqual(parseCoin({ t: 'coin', a: 'equip', slot: 'frame', id: 'frame.gold' }).msg, { t: 'coin', a: 'equip', slot: 'frame', id: 'frame.gold' });
  assert.deepEqual(parseCoin({ t: 'coin', a: 'equip', slot: 'suit', id: null }).msg, { t: 'coin', a: 'equip', slot: 'suit', id: null });
  badc({ t: 'coin', a: 'equip', slot: 'hat', id: null });
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
