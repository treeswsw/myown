import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toView } from '../../client/src/gsk/model.js';
import { penaltyPlan, rankRows, winnerInfo, winCaption, colorStates, waitInfo, ownCounts } from '../../client/src/gsk/ui/result.pure.js';

const players = (n = 4) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'N' + i, connected: true, spectating: false }));
const seat = (i, o = {}) => ({ id: 'p' + i, name: 'N' + i, color: i, points: 0, discs: 4, hand: 4, stack: 0, shown: [], placed: false, passed: false, out: null, ...o });
const base = (o = {}) => ({
  code: 'ABCD', mode: 'gsk', hostId: 'p0', you: 'p0', phase: 'playing', players: players(),
  seats: [0, 1, 2, 3].map((i) => seat(i)), step: 'penalty', round: 1, total: 0, bid: null, challenger: 'p1',
  penalty: { by: 'p1', target: 'p1', n: 3, faceUp: true }, mine: { hand: { F: 3, S: 1 }, stack: [], lost: [] }, result: null, ...o,
});

test('벌칙: 도전자(나)는 앞면 종류별 (손 + 더미)', () => {
  const v = toView(base({ penalty: { by: 'p0', target: 'p0', n: 3, faceUp: true }, challenger: 'p0', mine: { hand: { F: 2, S: 0 }, stack: ['S'], lost: [] } }), 'p0');
  const p = penaltyPlan(v);
  assert.equal(p.mode, 'front');
  assert.deepEqual(p.cells.map((c) => [c.key, c.count]), [['discard-F', 2], ['discard-S', 1]]);
  assert.deepEqual(ownCounts(v), { F: 2, S: 1 });
});

test('벌칙: 남이 고르는 중(이름은 penalty.by) / 다른 단계는 null', () => {
  const v = toView(base(), 'p0');
  assert.deepEqual(penaltyPlan(v), { mode: 'watch', name: 'N1' });
  assert.equal(penaltyPlan(toView(base({ step: 'turn', turn: 'p0' }), 'p0')), null);
  assert.equal(penaltyPlan(null), null);
});

test('결과: 순위 줄·승자', () => {
  const ranks = [
    { id: 'p1', name: 'N1', points: 2, discs: 3, rank: 1 },
    { id: 'p0', name: 'N0', points: 1, discs: 4, rank: 2 },
    { id: 'p3', name: 'N3', points: 0, discs: 0, rank: 3 },
  ];
  const v = toView(base({ phase: 'result', step: null, result: { reason: 'points', winner: 'p1', ranks }, seats: [0, 1, 2, 3].map((i) => seat(i, i === 3 ? { out: 'lost' } : {})) }), 'p0');
  const rows = rankRows(v);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].pips, [true, true]);
  assert.equal(rows[0].isWinner, true);
  assert.equal(rows[1].isMe, true);
  assert.equal(rows[2].out, true);
  const w = winnerInfo(v);
  assert.deepEqual([w.id, w.name, w.color], ['p1', 'N1', 1]);
  assert.equal(winCaption(w), '꽃만 두 번 뒤집었습니다');
  assert.equal(winCaption({ id: 'p1', reason: 'alone' }), '마지막까지 남았습니다');
  assert.equal(winCaption({ id: null }), '판이 끝났습니다');
  assert.deepEqual(rankRows(null), []);
});

test('대기: 색 고르기 상태', () => {
  const st = base({ phase: 'lobby', step: null, penalty: null, seats: [seat(0, { color: 2 }), seat(1, { color: 4 }), seat(2, { color: null })] });
  const v = toView(st, 'p0');
  const cs = colorStates(v);
  assert.equal(cs.length, 6);
  assert.equal(cs[2].state, 'mine');
  assert.equal(cs[4].state, 'taken');
  assert.equal(cs[4].by, 'N1');
  assert.equal(cs[0].state, 'free');
  const w = waitInfo(v);
  assert.equal(w.count, 3);
  assert.equal(w.canStart, true);
  assert.equal(w.isHost, true);
  const v2 = toView({ ...st, seats: st.seats.slice(0, 2), players: players(2) }, 'p0');
  assert.equal(waitInfo(v2).needMore, true);
  assert.equal(waitInfo(v2).canStart, false);
});
