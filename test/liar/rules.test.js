import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleSections } from '../../client/src/liar/ui/rules.js';

const modes = (s) => ruleSections(s).find((x) => x.title === '라이어 방식').lines;

test('ruleSections: 세 덩어리, 진행 순서는 6줄', () => {
  const secs = ruleSections({ liarMode: 'word' });
  assert.deepEqual(secs.map((s) => s.title), ['진행 순서', '라이어 방식', '점수표']);
  assert.equal(secs[0].lines.length, 6);
});
test('"이 방" 표시: 다른 제시어(word)', () => {
  const m = modes({ liarMode: 'word' });
  assert.deepEqual(m.map((x) => [x.v, x.here]), [['word', true], ['notice', false]]);
});
test('"이 방" 표시: 라이어 알림(notice)', () => {
  const m = modes({ liarMode: 'notice' });
  assert.deepEqual(m.map((x) => [x.v, x.here]), [['word', false], ['notice', true]]);
});
test('설정이 없어도 죽지 않고 표시 없음', () => {
  for (const s of [undefined, null, {}]) assert.ok(modes(s).every((x) => !x.here));
});
test('점수 숫자는 GDD 5-1 과 같다: +3 +1 +1 0 / +2 +1 −1 0', () => {
  const t = ruleSections({}).find((x) => x.title === '점수표').table;
  assert.deepEqual(t.liar.map((r) => r[1]), ['+3', '+1', '+1', '0']);
  assert.deepEqual(t.citizen.rows.map((r) => r.cells), [['+2', '+1'], ['−1', '0']]);
  assert.equal(t.note, '살려 준 투표는 점수에 들어가지 않아요.');
});
test('내용은 역할과 무관: 같은 settings 면 결과가 같다', () => {
  assert.deepEqual(ruleSections({ liarMode: 'word', x: 1 }), ruleSections({ liarMode: 'word', x: 2 }));
});
