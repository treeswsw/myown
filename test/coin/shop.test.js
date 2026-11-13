import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, ITEMS, GRADES, item } from '../../shared/coin/shop.js';

// docs/COIN-ITEMS.md 의 품목 수 (슬롯별, 등급 0~4)
const COUNTS = {
  title: [26, 15, 18, 14, 7],
  hat: [5, 5, 5, 3, 2],
  acc: [5, 5, 6, 4, 2],
  face: [5, 5, 6, 4, 2],
  frame: [1, 2, 1, 1, 1],
  color: [2, 2, 1, 1, 1],
  suit: [2, 2, 1, 1, 1],
};

test('슬롯과 등급', () => {
  assert.deepEqual(SLOTS, ['title', 'hat', 'acc', 'face', 'frame', 'color', 'suit']);
  assert.deepEqual(GRADES.map((g) => g.g), [0, 1, 2, 3, 4]);
  assert.deepEqual(GRADES.map((g) => g.name), ['잡템', '흔템', '컨셉', '레전드', '갱식']);
  assert.equal(GRADES[0].color, '#9a9a9a');
  assert.equal(GRADES[4].color, 'rainbow');
});

test('품목: id 유일, 슬롯마다 비어 있지 않고 수가 문서와 같다', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  for (const s of SLOTS) {
    assert.ok(ITEMS.some((i) => i.slot === s), s);
    for (let g = 0; g < 5; g++) {
      assert.equal(ITEMS.filter((i) => i.slot === s && i.g === g).length, COUNTS[s][g], `${s} g${g}`);
    }
  }
  assert.equal(ITEMS.length, 164);
});

test('품목 모양, 상점·가격·캡슐 규칙', () => {
  for (const i of ITEMS) {
    assert.ok(SLOTS.includes(i.slot), i.id);
    assert.ok(/^[a-z]+\.[a-z0-9]+$/.test(i.id) && i.id.startsWith(i.slot + '.') && i.id.length <= 40, i.id);
    assert.ok(Number.isInteger(i.g) && i.g >= 0 && i.g <= 4, i.id);
    assert.ok(typeof i.name === 'string' && i.name.length > 0, i.id);
    assert.equal(typeof i.shop, 'boolean');
    assert.equal(typeof i.cap, 'boolean');
    assert.ok(i.v && typeof i.v === 'object', i.id);
    if (i.shop) {
      assert.ok(i.g <= 1, i.id);
      assert.ok(Number.isInteger(i.price), i.id);
      if (i.g === 0) assert.ok(i.price >= 20 && i.price <= 60, i.id);
      else assert.ok(i.price >= 80 && i.price <= 150, i.id);
    } else {
      assert.equal(i.price, undefined, i.id);
      assert.ok(i.g >= 2, i.id);
    }
    if (i.g <= 1) assert.equal(i.shop, true, i.id);
    if (i.slot === 'title') {
      assert.equal(i.v.text, i.name);
      if (i.g >= 3) assert.ok(/^[a-z]+$/.test(i.v.fx), i.id);
      else assert.equal(i.v.fx, undefined);
    }
    if (i.slot === 'color' || i.slot === 'frame') assert.ok(Number.isInteger(i.v.hex), i.id);
    if (i.slot === 'suit') assert.ok(Number.isInteger(i.v.suit) && Number.isInteger(i.v.tie), i.id);
    if (['hat', 'acc', 'face'].includes(i.slot)) {
      assert.ok(i.art && ['edge', 'cover', 'sticker'].includes(i.art.type), i.id);
      assert.equal(i.art.key, i.id);
      if (i.art.type === 'edge') assert.ok(['top', 'side', 'bottom', 'ring'].includes(i.art.at), i.id);
    }
    if (i.slot === 'hat') assert.deepEqual([i.art.type, i.art.at], ['edge', 'top']);
  }
});

test('특별 칭호', () => {
  const jp = item('title.jackpot');
  assert.deepEqual([jp.g, jp.cap, jp.shop, jp.name], [4, false, false, '잭팟의 주인']);
  const tk = item('title.trashking');
  assert.deepEqual([tk.g, tk.cap, tk.shop, tk.name], [4, false, false, '좆븅신 중의 좆븅신']);
  assert.deepEqual(ITEMS.filter((i) => !i.cap).map((i) => i.id).sort(), ['title.jackpot', 'title.trashking']);
  for (const id of ['frame.silver', 'color.sky', 'color.rose', 'suit.navy', 'suit.white']) assert.ok(item(id), id);
  assert.equal(item('frame.gold'), null);
});

test('item(id)', () => {
  assert.equal(item('title.jotbyin').slot, 'title');
  assert.equal(item('nope'), null);
  assert.equal(item(null), null);
  assert.equal(item(undefined), null);
  assert.equal(item('toString'), null);
  assert.equal(item('__proto__'), null);
  assert.equal(item(5), null);
});
