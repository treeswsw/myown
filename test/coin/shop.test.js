import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, ITEMS, item } from '../../shared/coin/shop.js';

test('슬롯', () => {
  assert.deepEqual(SLOTS, ['title', 'frame', 'color', 'suit']);
});

test('품목: 슬롯마다 2개, 총 8개, 값 범위, id 중복 없음', () => {
  const sold = ITEMS.filter((i) => i.shop !== false);
  assert.equal(sold.length, 8);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const s of SLOTS) assert.equal(sold.filter((i) => i.slot === s).length, 2, s);
  const jp = item('title.jackpot');
  assert.equal(jp.shop, false); assert.equal(jp.slot, 'title'); assert.equal(jp.name, '잭팟의 주인'); assert.equal(jp.v.text, '잭팟의 주인');
  for (const i of sold) {
    assert.ok(i.id.startsWith(i.slot + '.'), i.id);
    assert.ok(i.id.length <= 40);
    assert.ok(typeof i.name === 'string' && i.name.length > 0);
    assert.ok(Number.isInteger(i.price) && i.price >= 20 && i.price <= 200, i.id);
    assert.ok(i.v && typeof i.v === 'object');
    if (i.slot === 'title') assert.equal(typeof i.v.text, 'string');
    if (i.slot === 'color' || i.slot === 'frame') assert.ok(Number.isInteger(i.v.hex));
    if (i.slot === 'suit') {
      assert.ok(Number.isInteger(i.v.suit));
      assert.ok(Number.isInteger(i.v.tie));
    }
  }
});

test('item(id)', () => {
  assert.equal(item('title.rookie').slot, 'title');
  assert.equal(item('nope'), null);
  assert.equal(item(null), null);
  assert.equal(item(undefined), null);
  assert.equal(item('toString'), null);
  assert.equal(item('__proto__'), null);
  assert.equal(item(5), null);
});
