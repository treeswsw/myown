import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toView } from '../../client/src/gsk/model.js';
import * as A from '../../client/src/gsk/actions.js';

const players = (n = 4) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'N' + i, connected: true, awayUntil: null, spectating: false }));
const seat = (i, o = {}) => ({ id: 'p' + i, name: 'N' + i, color: i, points: 0, discs: 4, hand: 4, stack: 0, shown: [], placed: false, passed: false, out: null, ...o });
function base(o = {}) {
  return {
    code: 'ABCD', mode: 'gsk', hostId: 'p0', you: 'p0', now: 0, phase: 'playing', gameNo: 1,
    players: players(), seats: [0, 1, 2, 3].map((i) => seat(i)), step: 'turn', round: 1, starter: 'p0',
    turn: 'p0', waiting: null, total: 0, bid: null, challenger: null, need: 0, flipped: 0,
    outcome: null, penalty: null, endsAt: null,
    mine: { hand: { F: 3, S: 1 }, stack: [], lost: [] }, result: null, ...o,
  };
}
const keys = (v) => v.actions.map((a) => a.key);

test('lobby: 색 고르기와 시작', () => {
  const s = base({ phase: 'lobby', step: null, mine: null, seats: [0, 1, 2].map((i) => seat(i, { color: i === 0 ? null : i })), players: players(3) });
  const v = toView(s, 'p0');
  assert.deepEqual(v.ranges.colorsFree, [0, 3, 4, 5]);
  assert.ok(keys(v).includes('color-0') && !keys(v).includes('color-1'));
  assert.ok(keys(v).includes('start'));
  assert.match(v.center, /기다리는 중/);
  assert.ok(!keys(toView(s, 'p1')).includes('start'));
  const few = base({ phase: 'lobby', step: null, mine: null, seats: [0, 1].map((i) => seat(i)), players: players(2) });
  assert.ok(!keys(toView(few, 'p0')).includes('start'));
});

test('setup: 안 놓았으면 놓기만, 놓았으면 없음', () => {
  const s = base({ step: 'setup', turn: null, seats: [0, 1, 2, 3].map((i) => seat(i, { placed: i === 1 })) });
  const v = toView(s, 'p0');
  assert.deepEqual(keys(v), ['place-F', 'place-S']);
  assert.equal(v.center, '모두 원판을 1장씩 놓는 중 (1/4)');
  const s2 = base({ step: 'setup', turn: null, seats: [0, 1, 2, 3].map((i) => seat(i, { placed: i === 0 })) });
  assert.deepEqual(keys(toView(s2, 'p0')), []);
  const s3 = base({ step: 'setup', turn: null, mine: { hand: { F: 3, S: 0 }, stack: [], lost: [] } });
  assert.deepEqual(keys(toView(s3, 'p0')), ['place-F']);
});

test('turn: 내 차례면 놓기+도전 범위, 남 차례면 없음', () => {
  const s = base({ total: 3, seats: [0, 1, 2, 3].map((i) => seat(i, { stack: 1, hand: 3 })) });
  const v = toView(s, 'p0');
  assert.deepEqual(keys(v), ['place-F', 'place-S', 'bid-1', 'bid-2', 'bid-3']);
  assert.deepEqual(v.ranges.bid, { min: 1, max: 3 });
  assert.equal(v.center, 'N0 님 차례');
  const o = toView(s, 'p2');
  assert.deepEqual(keys(o), []);
  assert.equal(o.seats[0].id, 'p2');
});

test('bid: 올리기 범위와 패스', () => {
  const s = base({ step: 'bid', turn: 'p0', total: 6, bid: { n: 4, by: 'p1' } });
  const v = toView(s, 'p0');
  assert.deepEqual(keys(v), ['bid-5', 'bid-6', 'pass']);
  assert.equal(v.center, 'N1 님 도전 4 (N0 님 차례)');
  const full = base({ step: 'bid', turn: 'p0', total: 4, bid: { n: 4, by: 'p1' } });
  assert.deepEqual(keys(toView(full, 'p0')), ['pass']);
});

test('flip: 도전자만 남의 더미(남은 것 있는 곳)', () => {
  const seats = [seat(0, { stack: 2, shown: ['F', 'F'] }), seat(1, { stack: 2, shown: ['F'] }), seat(2, { stack: 1, shown: ['F'] }), seat(3, { stack: 0 })];
  const s = base({ step: 'flip', turn: 'p0', challenger: 'p0', need: 5, flipped: 3, seats });
  const v = toView(s, 'p0');
  assert.deepEqual(keys(v), ['flip-p1']);
  assert.equal(v.center, 'N0 님이 뒤집는 중 3 / 5');
  assert.deepEqual(keys(toView(s, 'p1')), []);
  // 자기 더미 자동 공개가 안 끝났으면 아직 누를 수 없다
  const early = base({ step: 'flip', turn: 'p0', challenger: 'p0', need: 5, seats: [seat(0, { stack: 2, shown: ['F'] }), ...seats.slice(1)] });
  assert.deepEqual(keys(toView(early, 'p0')), []);
});

test('reveal: 성공/실패 문구, 행동 없음', () => {
  const ok = base({ step: 'reveal', turn: null, challenger: 'p0', outcome: { ok: true, skullOf: null } });
  assert.equal(toView(ok, 'p0').center, '성공! N0 님');
  assert.deepEqual(keys(toView(ok, 'p0')), []);
  const bad = base({ step: 'reveal', turn: null, challenger: 'p0', outcome: { ok: false, skullOf: 'p1' } });
  assert.equal(toView(bad, 'p0').center, '해골! N0 님 실패');
});

test('penalty: 남이 고르면 칸 번호, 자기 해골이면 종류', () => {
  const s = base({ step: 'penalty', turn: null, challenger: 'p1', penalty: { by: 'p0', target: 'p1', n: 3, faceUp: false } });
  assert.deepEqual(keys(toView(s, 'p0')), ['discard-0', 'discard-1', 'discard-2']);
  assert.equal(toView(s, 'p0').center, '버릴 원판을 고르세요');
  assert.equal(toView(s, 'p2').center, 'N0 님이 버릴 원판을 고르는 중');
  assert.deepEqual(keys(toView(s, 'p2')), []);
  const self = base({ step: 'penalty', turn: null, challenger: 'p0', penalty: { by: 'p0', target: 'p0', n: 4, faceUp: true },
    mine: { hand: { F: 2, S: 0 }, stack: ['F', 'S'], lost: [] } });
  assert.deepEqual(keys(toView(self, 'p0')), ['discard-F', 'discard-S']);
});

test('between / result', () => {
  const b = base({ step: 'between', turn: null });
  assert.equal(toView(b, 'p0').center, '다음 라운드 준비 중');
  const r = base({ phase: 'result', step: null, turn: null, mine: null,
    result: { reason: 'points', winner: 'p2', ranks: [{ id: 'p2', name: 'N2', points: 2, discs: 3, rank: 1 }] } });
  const v = toView(r, 'p0');
  assert.equal(v.center, 'N2 님 승리!');
  assert.deepEqual(keys(v), ['start']);
  assert.equal(v.result.ranks[0].name, 'N2');
  assert.ok(!keys(toView(r, 'p1')).includes('start'));
});

test('관전자·탈락자·mine 없음에서도 오류 없이 행동 없음', () => {
  const s = base({ you: 'zz', mine: null, turn: 'p1' });
  const v = toView(s, 'zz');
  assert.deepEqual(keys(v), []);
  assert.equal(v.me, null);
  assert.equal(v.seats[0].id, 'p0');
  const out = base({ turn: 'p1', seats: [0, 1, 2, 3].map((i) => seat(i, { out: i === 0 ? 'lost' : null })) });
  assert.deepEqual(keys(toView(out, 'p0')), []);
  assert.equal(toView(null, 'p0'), null);
  assert.doesNotThrow(() => toView({ phase: 'lobby' }, 'a'));
});

test('actions 모양', () => {
  assert.deepEqual(A.place('F'), { t: 'gk', a: 'place', k: 'F' });
  assert.deepEqual(A.bid(3), { t: 'gk', a: 'bid', n: 3 });
  assert.deepEqual(A.pass(), { t: 'gk', a: 'pass' });
  assert.deepEqual(A.flip('p1'), { t: 'gk', a: 'flip', p: 'p1' });
  assert.deepEqual(A.discard({ i: 2 }), { t: 'gk', a: 'discard', i: 2 });
  assert.deepEqual(A.discard({ i: 0 }), { t: 'gk', a: 'discard', i: 0 });
  assert.deepEqual(A.discard({ k: 'S' }), { t: 'gk', a: 'discard', k: 'S' });
  assert.deepEqual(A.color(4), { t: 'gk', a: 'color', c: 4 });
  assert.deepEqual(A.start(), { t: 'start' });
  assert.deepEqual(A.requestFor({ key: 'bid-2', a: 'bid', n: 2 }), { t: 'gk', a: 'bid', n: 2 });
  assert.deepEqual(A.requestFor({ key: 'discard-F', a: 'discard', k: 'F' }), { t: 'gk', a: 'discard', k: 'F' });
});
