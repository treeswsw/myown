import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place, hexCss, gradeColor, nameColor, decorate, titleBadge, itemIcon } from '../../client/src/coin/look.js';

test('place: edge 는 값 그대로', () => {
  const g = place({ w: 0.9, dx: 0, dy: -0.55 }, null, 100);
  assert.equal(g.w, 90);
  assert.equal(g.cx, 50);
  assert.ok(Math.abs(g.cy - -5) < 1e-9);
  assert.equal(g.rot, 0);
});
test('place: sticker 는 더하기·곱하기·돌리기, 범위 밖은 자름', () => {
  const g = place({ w: 0.4, dx: 0, dy: 0.1 }, { x: 0.2, y: -0.1, s: 2, r: 400 }, 100);
  assert.ok(Math.abs(g.w - 80) < 1e-9);
  assert.ok(Math.abs(g.cx - 70) < 1e-9 && Math.abs(g.cy - 50) < 1e-9);
  assert.equal(g.rot, 180);
  assert.equal(place({ w: 1, dx: 0, dy: 0 }, { s: 99 }, 10).w, 20);
});
test('색 도우미', () => {
  assert.equal(hexCss(0x5ab4ff), '#5ab4ff');
  assert.equal(hexCss(0x0000ff), '#0000ff');
  assert.equal(gradeColor(4), 'rainbow');
  assert.equal(nameColor({ color: 'color.sky' }), '#5ab4ff');
  assert.equal(nameColor({}), null);
  assert.equal(nameColor(null), null);
});
test('look 없음은 안전', () => {
  assert.equal(titleBadge(null), null);
  assert.equal(decorate(null, null), null);
  assert.equal(typeof itemIcon, 'function');
});
