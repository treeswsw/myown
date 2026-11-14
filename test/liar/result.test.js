import test from 'node:test';
import assert from 'node:assert/strict';
import { winnerText, nameFor } from '../../client/src/liar/ui/result.js';

test('winnerText: 이긴 쪽과 이유 7가지', () => {
  const cases = [
    [{ winner: 'citizens', reason: 'executedLiar', guessed: false }, '시민 승리'],
    [{ winner: 'liar', reason: 'executedLiar', guessed: true }, '라이어 승리'],
    [{ winner: 'liar', reason: 'executedCitizen', guessed: false }, '라이어 승리'],
    [{ winner: 'liar', reason: 'tie', guessed: true }, '라이어 승리'],
    [{ winner: 'liar', reason: 'noVotes', guessed: false }, '라이어 승리'],
    [{ winner: 'citizens', reason: 'liarLeft', guessed: null }, '시민 승리'],
    [{ winner: 'void', reason: 'tooFew' }, '무효'],
    [{ winner: 'void', reason: 'hostEnded' }, '무효'],
  ];
  const subs = new Set();
  for (const [r, title] of cases) {
    const w = winnerText(r);
    assert.equal(w.title, title);
    assert.ok(w.sub.length > 0, r.reason);
    subs.add(w.sub);
  }
  assert.ok(subs.size >= 7);
  assert.deepEqual(winnerText(null), { title: '', sub: '' });
});

test('nameFor: players → liarName → ?', () => {
  const s = { players: [{ id: 'a', name: '민수' }], result: { liarId: 'b', liarName: '서아' } };
  assert.equal(nameFor(s, 'a'), '민수');
  assert.equal(nameFor(s, 'b'), '서아');
  assert.equal(nameFor(s, 'c'), '?');
  assert.equal(nameFor({ players: [], result: { liarId: 'b' } }, 'b'), '?');
  assert.equal(nameFor(null, 'a'), '?');
});
