import test from 'node:test';
import assert from 'node:assert/strict';
import { canPick, tallyOf, voterCount } from '../../client/src/liar/ui/vote.js';
import { fixture } from './ui/vote/fixtures.js';

test('canPick: discuss 에서 남은 가능, 나·없는 사람은 불가', () => {
  const s = fixture('discuss');
  assert.equal(canPick(s, 'u3'), true);
  assert.equal(canPick(s, 'u0'), false);
  assert.equal(canPick(s, 'zz'), false);
  assert.equal(canPick(null, 'u3'), false);
});

test('canPick: 지목 단계가 아니면 불가', () => {
  for (const p of ['lobby', 'reveal', 'speak', 'defense', 'judge', 'judged', 'unmask']) assert.equal(canPick(fixture(p), 'u3'), false, p);
});

test('canPick: revote 는 후보만', () => {
  const s = fixture('revote');
  assert.equal(canPick(s, 'u1'), true);
  assert.equal(canPick(s, 'u2'), true);
  assert.equal(canPick(s, 'u3'), false);
  // 후보 목록이 없으면 제한 없음
  assert.equal(canPick({ ...s, candidates: null }, 'u3'), true);
});

test('canPick: 관전자·앉지 않은 사람은 못 하고, 관전자는 대상도 아님', () => {
  const s = fixture('discuss');
  const spec = { ...s, you: 'u5', players: s.players.map((p) => (p.id === 'u5' ? { ...p, seat: null, spectating: true } : p)) };
  assert.equal(canPick(spec, 'u3'), false);
  assert.equal(canPick({ ...spec, you: 'u0' }, 'u5'), false);
});

test('tallyOf: 맞다/아니다 개수, 빈 값·이상한 값 무시', () => {
  assert.deepEqual(tallyOf({ a: 'yes', b: 'yes', c: 'no' }), { yes: 2, no: 1 });
  assert.deepEqual(tallyOf(null), { yes: 0, no: 0 });
  assert.deepEqual(tallyOf({}), { yes: 0, no: 0 });
  assert.deepEqual(tallyOf({ a: 'maybe', b: 'yes' }), { yes: 1, no: 0 });
});

test('voterCount: 앉아 있고 끊기지 않은 사람만', () => {
  const s = fixture('discuss');
  assert.equal(voterCount(s.players), s.players.length);
  const ps = s.players.map((p, i) => (i === 1 ? { ...p, connected: false } : i === 2 ? { ...p, seat: null, spectating: true } : p));
  assert.equal(voterCount(ps), s.players.length - 2);
  assert.equal(voterCount(null), 0);
});
