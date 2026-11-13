import test from 'node:test';
import assert from 'node:assert/strict';
import { canLate } from '../../client/src/liar/ui/firstsays.js';
import { fixture } from './ui/firstsays/fixtures.js';

test('canLate: speak 에서 차례 지남 + 빈 칸 → 참', () => {
  assert.equal(canLate(fixture('speak-missed')), true);
  assert.equal(canLate(fixture('speak-missed', 3)), true);
});
test('canLate: 지금 내 차례 → 거짓', () => {
  assert.equal(canLate(fixture('speak-me')), false);
  assert.equal(canLate(fixture('speak-me', 3)), false);
});
test('canLate: 차례 전(칸 없음) → 거짓', () => {
  assert.equal(canLate(fixture('speak')), false);
});
test('canLate: 이미 씀 → 거짓', () => {
  const s = fixture('speak-missed');
  s.firstSays = s.firstSays.map((f) => (f.id === 'u0' ? { ...f, text: '썼음', late: true } : f));
  assert.equal(canLate(s), false);
});
test('canLate: accuseNo 1 의 discuss·revote → 참', () => {
  assert.equal(canLate(fixture('discuss-missed')), true);
  assert.equal(canLate(fixture('revote-missed')), true);
});
test('canLate: accuseNo 2 의 discuss → 거짓', () => {
  assert.equal(canLate(fixture('discuss2-missed')), false);
});
test('canLate: defense 이후·lobby·reveal·unmask·result → 거짓', () => {
  for (const n of ['defense', 'judge', 'unmask', 'result', 'lobby', 'reveal']) assert.equal(canLate(fixture(n)), false, n);
});
test('canLate: 관전자 → 거짓', () => {
  const s = fixture('speak-missed');
  s.players = s.players.map((p) => (p.id === 'u0' ? { ...p, spectating: true, seat: null } : p));
  assert.equal(canLate(s), false);
  const t = fixture('speak-missed');
  t.you = 'u9';
  assert.equal(canLate(t), false);
});
test('canLate: null → 거짓', () => {
  assert.equal(canLate(null), false);
  assert.equal(canLate(undefined), false);
});
