import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRows, winnerText, fmtDelta, nameFor } from '../../client/src/liar/ui/result.js';

const P = (id, name, score, extra = {}) => ({ id, name, color: '#fff', score, spectating: false, ...extra });
const st = (players, result = {}, you = 'a') => ({ you, players, result: { liarId: 'b', delta: {}, ...result } });

test('rankRows: 점수 높은 순, 같으면 이름순, 공동 순위', () => {
  const rows = rankRows(st([P('a', '하린', 3), P('b', '민수', 5), P('c', '가영', 3), P('d', '서아', -1)], { delta: { a: 2, d: -1 } }));
  assert.deepEqual(rows.map((r) => r.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 2, 4]);
  assert.equal(rows.find((r) => r.id === 'a').delta, 2);
  assert.equal(rows.find((r) => r.id === 'd').delta, -1);
  assert.equal(rows.find((r) => r.id === 'c').delta, 0);
  assert.equal(rows.find((r) => r.id === 'a').isYou, true);
  assert.equal(rows.find((r) => r.id === 'b').isLiar, true);
});

test('rankRows: 관전자는 점수 변화가 없으면 뺀다, 입력은 안 바뀐다', () => {
  const s = st([P('a', 'a', 1), P('s', 'spec', 0, { spectating: true })]);
  const copy = JSON.stringify(s);
  assert.deepEqual(rankRows(s).map((r) => r.id), ['a']);
  assert.equal(JSON.stringify(s), copy);
  assert.deepEqual(rankRows(null), []);
});

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

test('fmtDelta', () => {
  assert.equal(fmtDelta(2), '+2');
  assert.equal(fmtDelta(0), '0');
  assert.equal(fmtDelta(-1), '−1');
  assert.equal(fmtDelta(undefined), '0');
});

test('nameFor: players → liarName → ?', () => {
  const s = { players: [{ id: 'a', name: '민수' }], result: { liarId: 'b', liarName: '서아' } };
  assert.equal(nameFor(s, 'a'), '민수');
  assert.equal(nameFor(s, 'b'), '서아');
  assert.equal(nameFor(s, 'c'), '?');
  assert.equal(nameFor({ players: [], result: { liarId: 'b' } }, 'b'), '?');
  assert.equal(nameFor(null, 'a'), '?');
});
