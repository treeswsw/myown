import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSel, handList, splitRows, bidNums, plan, normalizeLocal, slot } from '../../client/src/gsk/ui/hand.pure.js';

const view = (o = {}) => ({
  phase: 'playing', step: 'turn', me: { seated: true, hand: { F: 3, S: 1 } },
  actions: [{ key: 'place-F', a: 'place', k: 'F' }, { key: 'place-S', a: 'place', k: 'S' }, { key: 'bid-1', a: 'bid', n: 1 }, { key: 'bid-2', a: 'bid', n: 2 }],
  ranges: { bid: { min: 1, max: 2 } },
  ...o,
});

test('손패 목록: 꽃 먼저, pending 은 한 장 뺌', () => {
  assert.deepEqual(handList({ F: 2, S: 1 }), ['F', 'F', 'S']);
  assert.deepEqual(handList({ F: 2, S: 1 }, 'F'), ['F', 'S']);
  assert.deepEqual(handList({ F: 0, S: 1 }, 'F'), ['S']);
  assert.deepEqual(handList(null), []);
});

test('숫자 줄 나누기', () => {
  assert.deepEqual(splitRows([]), []);
  assert.equal(splitRows([1, 2, 3]).length, 1);
  const twelve = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.equal(splitRows(twelve).length, 1);
  const rows = splitRows(Array.from({ length: 24 }, (_, i) => i + 1));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.length), [12, 12]);
  assert.deepEqual(splitRows(Array.from({ length: 13 }, (_, i) => i + 1)).map((r) => r.length), [7, 6]);
});

test('도전 범위', () => {
  assert.deepEqual(bidNums({ ranges: { bid: { min: 3, max: 5 } } }), [3, 4, 5]);
  assert.deepEqual(bidNums({ ranges: { bid: null } }), []);
});

test('내 차례: 선택 버튼 둘', () => {
  const p = plan(view(), { mode: 'idle' }, null);
  assert.deepEqual(p.buttons.map((b) => b.key), ['choose-place', 'choose-bid']);
  assert.equal(p.open, false);
  assert.equal(p.discMode, 'open');
  assert.equal(p.caption, '내 원판 4');
});

test('원판 내기 갈래: 손패 펼침 + 취소', () => {
  const p = plan(view(), { mode: 'place' }, null);
  assert.equal(p.open, true);
  assert.equal(p.discMode, 'place');
  assert.equal(p.cancel, true);
  assert.equal(p.buttons.length, 0);
});

test('도전 갈래: 숫자 동전 + 취소', () => {
  const p = plan(view(), { mode: 'bid' }, null);
  assert.deepEqual(p.coins.rows, [[1, 2]]);
  assert.equal(p.coins.sel, 1);
  assert.deepEqual(p.coins.confirm, { key: 'bid-1', label: '1 도전', enabled: true });
  const q = plan(view(), { mode: 'bid', sel: 2 }, null);
  assert.equal(q.coins.sel, 2);
  assert.equal(q.coins.confirm.key, 'bid-2');
  assert.equal(q.coins.confirm.label, '2 도전');
  assert.equal(p.cancel, true);
  assert.equal(p.pass, false);
});

test('손패가 비면 도전만', () => {
  const v = view({ me: { seated: true, hand: { F: 0, S: 0 } }, actions: [{ key: 'bid-1', a: 'bid', n: 1 }] });
  const p = plan(v, { mode: 'idle' }, null);
  assert.deepEqual(p.buttons.map((b) => b.key), ['choose-bid']);
  assert.equal(p.discMode, null);
});

test('경매: 올리기 동전 + 패스', () => {
  const v = view({ step: 'bid', actions: [{ key: 'bid-4', a: 'bid', n: 4 }, { key: 'pass', a: 'pass' }], ranges: { bid: { min: 4, max: 4 } } });
  const p = plan(v, { mode: 'idle' }, null);
  assert.deepEqual(p.coins.rows, [[4]]);
  assert.deepEqual(p.coins.confirm, { key: 'bid-4', label: '4 올리기', enabled: true });
  assert.equal(plan(v, { mode: 'idle', sel: 9 }, null).coins.sel, 4);
  assert.equal(p.pass, true);
  assert.equal(p.cancel, false);
});

test('준비 단계: 안 놓았으면 바로 펼침, 놓았으면 작게', () => {
  const v = view({ step: 'setup', actions: [{ key: 'place-F', a: 'place', k: 'F' }] });
  const p = plan(v, { mode: 'idle' }, null);
  assert.equal(p.open, true);
  assert.equal(p.cancel, false);
  const done = plan(view({ step: 'setup', actions: [] }), { mode: 'idle' }, null);
  assert.equal(done.open, false);
  assert.equal(done.discMode, null);
});

test('남의 차례·참가자 아님·판 밖', () => {
  const idle = plan(view({ actions: [] }), { mode: 'place' }, null);
  assert.equal(idle.open, false);
  assert.equal(idle.visible, true);
  assert.equal(plan(view({ me: null }), null, null).visible, false);
  assert.equal(plan(view({ phase: 'lobby' }), null, null).visible, false);
  assert.equal(plan(null, null, null).visible, false);
});

test('갈래 정리: 차례가 지나가면 idle', () => {
  assert.deepEqual(normalizeLocal(view(), { mode: 'bid' }), { mode: 'bid' });
  assert.deepEqual(normalizeLocal(view({ actions: [] }), { mode: 'bid' }), { mode: 'idle' });
  assert.deepEqual(normalizeLocal(view({ step: 'bid' }), { mode: 'place' }), { mode: 'idle' });
});

test('손패 자리', () => {
  const o = slot(0, 3, true);
  assert.equal(o.y, 546);
  assert.equal(o.s, 1);
  assert.equal(slot(1, 3, true).x - o.x, 134);
  assert.deepEqual(slot(2, 3, false), { x: 36 + 68, y: 632, s: 0.5 });
  assert.equal(slot(0, 1, false, { x: 10, y: 20 }).x, 10);
});

test('고른 숫자: 범위 밖이면 최소값', () => {
  assert.equal(pickSel([3, 4, 5], 4), 4);
  assert.equal(pickSel([3, 4, 5], 1), 3);
  assert.equal(pickSel([3, 4, 5], undefined), 3);
  assert.equal(pickSel([], 2), null);
  assert.equal(normalizeLocal(view({ step: 'bid' }), { mode: 'idle', sel: 5 }).sel, 5);
});
