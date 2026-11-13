import test from 'node:test';
import assert from 'node:assert/strict';
import { roleText } from '../../client/src/liar/ui/role.js';
import { stateFor } from './ui/role/fixtures.js';

test('roleText word 방식 시민', () => {
  assert.deepEqual(roleText(stateFor('reveal', { my: { word: '도서관', role: null } })), { topic: '장소', text: '도서관' });
  assert.deepEqual(roleText(stateFor('reveal', { my: { word: '도서관', role: 'citizen' } })), { topic: '장소', text: '도서관' });
});

test('roleText word 방식 라이어는 시민과 같은 모양 (다른 단어만)', () => {
  const r = roleText(stateFor('reveal', { my: { word: '박물관', role: null } }));
  assert.deepEqual(r, { topic: '장소', text: '박물관' });
});

test('roleText null 과 citizen 은 같다', () => {
  assert.deepEqual(
    roleText(stateFor('speak', { my: { word: 'x', role: null } })),
    roleText(stateFor('speak', { my: { word: 'x', role: 'citizen' } })));
});

test('roleText notice 방식', () => {
  assert.deepEqual(roleText(stateFor('reveal', { my: { word: '도서관', role: 'citizen' } })), { topic: '장소', text: '도서관' });
  assert.deepEqual(roleText(stateFor('reveal', { my: { word: null, role: 'liar' } })), { topic: '장소', text: '당신은 라이어입니다' });
});

test('roleText 관전자·lobby·없음', () => {
  const spec = stateFor('reveal', { you: 'u5' });
  spec.players.find((p) => p.id === 'u5').spectating = true;
  assert.equal(roleText(spec), null);
  assert.equal(roleText(stateFor('lobby')), null);
  assert.equal(roleText(null), null);
  assert.equal(roleText(stateFor('reveal', { my: { word: null, role: null } })), null);
  assert.equal(roleText(stateFor('reveal', { my: null })), null);
});
