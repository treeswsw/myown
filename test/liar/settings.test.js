import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleTopic, timeLabel } from '../../client/src/liar/ui/settings.js';

const T = (...on) => ['a', 'b', 'c'].map((name) => ({ name, on: on.includes(name) }));

test('toggleTopic: 켜진 것을 끄고 꺼진 것을 켠다, 원본은 그대로', () => {
  const src = T('a', 'b');
  const off = toggleTopic(src, 'a');
  assert.deepEqual(off.filter((t) => t.on).map((t) => t.name), ['b']);
  assert.deepEqual(toggleTopic(src, 'c').filter((t) => t.on).map((t) => t.name), ['a', 'b', 'c']);
  assert.deepEqual(src, T('a', 'b'));
  assert.equal(off.length, 3);
});

test('toggleTopic: 마지막 켜진 하나는 못 끈다(null), 없는 이름·잘못된 값도 null', () => {
  assert.equal(toggleTopic(T('b'), 'b'), null);
  assert.ok(toggleTopic(T('b'), 'a'));
  assert.equal(toggleTopic(T('a'), 'zz'), null);
  assert.equal(toggleTopic(null, 'a'), null);
});

test('timeLabel', () => {
  assert.equal(timeLabel(45), '45초');
  assert.equal(timeLabel(60), '1분');
  assert.equal(timeLabel(120), '2분');
  assert.equal(timeLabel(90), '1분 30초');
  assert.equal(timeLabel(0), '0초');
});
