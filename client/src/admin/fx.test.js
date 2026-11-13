// node --test client/src/admin/fx.test.js  (연출은 틀지 않고 목록 모양만 본다)
import test from 'node:test';
import assert from 'node:assert/strict';
import { FX, listFx } from './fx.js';

test('연출 목록 모양', () => {
  const ids = new Set();
  for (const e of FX) {
    assert.ok(e.mode && e.id && e.label && typeof e.play === 'function', e.id);
    assert.ok(!ids.has(e.id), '중복 ' + e.id);
    ids.add(e.id);
  }
});
test('listFx 걸러내기', () => {
  assert.equal(listFx().length, FX.length);
  assert.ok(listFx('liar').every((e) => e.mode === 'liar' || e.mode === 'all'));
  assert.ok(listFx('holdem').length > 0);
  assert.equal(listFx('draw').filter((e) => e.mode !== 'all').length, 0);
});
