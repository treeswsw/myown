import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUTS, seatGeom, pileSpots, pileModel, visibleShown, rowLayout, reconcileRow, midModel, chipFor, ringFor, orderSeats, layoutFor, badgePos,
} from '../../client/src/gsk/ui/table.pure.js';

const near = (a, b, e = 0.11) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test('자리: 시안 Seats2/3/4/6 과 같은 좌표(나는 아래 가운데)', () => {
  const g2 = seatGeom(2, 'pc');
  assert.deepEqual([g2[0].x, g2[0].y, g2[0].rot], [640, 480, 0]);
  assert.deepEqual([g2[1].x, g2[1].y, g2[1].rot], [640, 120, 180]);
  assert.deepEqual([g2[0].lx, g2[0].ly, g2[1].lx, g2[1].ly], [640, 566, 640, 34]);
  const g3 = seatGeom(3, 'pc');
  near(g3[1].x, 436.5); near(g3[1].y, 210); assert.equal(g3[1].rot, 120);
  near(g3[2].x, 843.5); assert.equal(g3[2].rot, 240);
  near(g3[1].lx, 309.2); near(g3[1].ly, 136.5);
  const g4 = seatGeom(4, 'pc');
  assert.deepEqual([g4[1].x, g4[1].y, g4[2].x, g4[2].y, g4[3].x, g4[3].y], [405, 300, 640, 120, 875, 300]);
  near(g4[1].lx, 257); near(g4[3].lx, 1023);
  const g6 = seatGeom(6, 'pc');
  near(g6[1].y, 390); near(g6[1].lx, 309.2); near(g6[1].ly, 463.5); assert.equal(g6[5].rot, 300);
});

test('자리: 휴대폰 시안(5명)과 같은 좌표, 내 이름표는 개인판 왼쪽', () => {
  const g = seatGeom(5, 'phone');
  near(g[0].x, 422); near(g[0].y, 252);
  near(g[1].x, 262.2); near(g[1].y, 182.9); assert.equal(g[1].rot, 72);
  near(g[2].x, 323.3); near(g[2].y, 71.1);
  near(g[0].lx, 318); near(g[0].ly, 258);
  near(g[1].lx, 173, 0.6); near(g[1].ly, 211.9, 0.6);
  near(g[2].lx, 275.1, 0.6);
});

test('자리: 이름표는 화면 밖으로 나가지 않는다', () => {
  for (const lay of ['pc', 'phone']) {
    const L = LAYOUTS[lay];
    for (let n = 2; n <= 6; n++) {
      for (const q of seatGeom(n, lay)) {
        assert.ok(q.lx >= 0 && q.lx <= L.W && q.ly >= 0 && q.ly <= L.H, `${lay} ${n}: ${q.lx},${q.ly}`);
      }
    }
  }
});

test('높이 500 미만이면 휴대폰', () => {
  assert.equal(layoutFor(390), 'phone');
  assert.equal(layoutFor(499), 'phone');
  assert.equal(layoutFor(500), 'pc');
  assert.equal(layoutFor(720), 'pc');
});

test('더미: 장수만큼 옆면 띠(한 장마다 step 위로), 어긋남은 시안과 같다', () => {
  assert.deepEqual(pileSpots(0, 6), []);
  assert.deepEqual(pileSpots(3, 6).map((p) => [p.x, p.y]), [[0, 0], [2.5, -6], [-2, -12]]);
  assert.equal(pileSpots(3, 4)[2].y, -8);
  assert.equal(pileSpots(2, 6)[0].rot, 11);
  assert.equal(pileSpots(2, 6)[1].rot, 48);
  // 장수 표시는 더미 오른쪽(왼쪽 자리) / 왼쪽(오른쪽 자리)
  assert.deepEqual(badgePos(1, 'pc'), { x: 45, y: -12 });
  assert.deepEqual(badgePos(-1, 'pc'), { x: -73, y: -12 });
  assert.deepEqual(badgePos(1, 'phone'), { x: 28, y: -9 });
});

test('더미 모양: 공개된 꽃은 더미에서 빠지고 해골은 제자리에 남는다', () => {
  const m = pileModel({ stack: 3, shown: [] }, 0, 'pc');
  assert.equal(m.count, 3); assert.equal(m.label, '×3'); assert.equal(m.backs, 3);
  const f = pileModel({ stack: 3, shown: ['F'] }, 0, 'pc');
  assert.equal(f.count, 2);
  const s = pileModel({ stack: 3, shown: ['F', 'S'] }, 0, 'pc');
  assert.deepEqual(s.discs.map((d) => d.kind), ['B', 'S']);
  assert.equal(s.discs[1].rot, 0);
  const all = pileModel({ stack: 2, shown: ['F', 'F'] }, 0, 'pc');
  assert.equal(all.count, 0); assert.equal(all.label, '×0');
});

test('보여 주기 지연(hold): 맨 끝 공개를 아직 안 뒤집힌 것처럼', () => {
  assert.deepEqual(visibleShown(['F', 'F', 'S'], 0), ['F', 'F', 'S']);
  assert.deepEqual(visibleShown(['F', 'F', 'S'], 1), ['F', 'F']);
  assert.deepEqual(visibleShown(['F'], 5), []);
  assert.deepEqual(visibleShown(undefined, 1), []);
  assert.equal(pileModel({ stack: 3, shown: ['F'] }, 1, 'pc').count, 3);
  const hs = pileModel({ stack: 2, shown: ['S'] }, 1, 'pc');
  assert.deepEqual(hs.discs.map((d) => d.kind), ['B', 'B']);
});

test('펼친 줄: 9장까지 한 줄, 10장부터 두 줄', () => {
  const r5 = rowLayout(5, 'pc');
  assert.equal(r5.rows, 1); assert.equal(r5.n, 5);
  assert.equal(r5.gap, 58); assert.equal(r5.ss, 64);
  assert.ok(r5.slots.every((p) => p.y === 306));
  near(r5.slots[0].x, 640 - 4 * 58 / 2 * 1 - 0, 120); // 가운데 정렬
  assert.equal(r5.slots[2].x, 640);
  assert.equal(r5.sayTop, 306 + 32 + 12);
  const r9 = rowLayout(9, 'pc');
  assert.equal(r9.rows, 1); assert.equal(r9.gap, 34); // round(272/8)
  assert.equal(r9.ss, 42);
  const r10 = rowLayout(10, 'pc');
  assert.equal(r10.rows, 2); assert.equal(r10.perRow, 5);
  assert.equal(r10.slots.filter((p) => p.row === 0).length, 5);
  assert.equal(r10.slots.filter((p) => p.row === 1).length, 5);
  assert.ok(r10.slots[5].y > r10.slots[0].y);
  const r13 = rowLayout(13, 'pc');
  assert.equal(r13.perRow, 7);
  assert.equal(r13.slots.filter((p) => p.row === 1).length, 6);
  const r24 = rowLayout(24, 'pc');
  assert.equal(r24.rows, 2); assert.equal(r24.perRow, 12);
  assert.ok(r24.slots.every((p) => p.x > 100 && p.x < 1180));
  assert.equal(rowLayout(0, 'pc').slots.length, 0);
  // 휴대폰은 더 작다
  assert.ok(rowLayout(5, 'phone').ss <= 24);
});

const S = (id, shown = [], extra = {}) => ({ id, shown, stack: 3, ...extra });

test('줄 순서: 이전 줄을 이어 쓰고, 새로 늘어난 것은 도전자부터 자리 순', () => {
  const seats = [S('a', ['F', 'F']), S('b', ['F']), S('c', [])];
  assert.deepEqual(reconcileRow([], seats, 'a'), ['a', 'a', 'b']);
  // 다시 접속한 사람: 도전자 먼저
  assert.deepEqual(reconcileRow([], seats, 'b'), ['b', 'a', 'a']);
  // 이전 줄 유지 + 새 꽃은 뒤에
  const next = [S('a', ['F', 'F']), S('b', ['F', 'F']), S('c', [])];
  assert.deepEqual(reconcileRow(['a', 'a', 'b'], next, 'a'), ['a', 'a', 'b', 'b']);
  // 줄어들면(다음 라운드) 사라진다
  assert.deepEqual(reconcileRow(['a', 'a', 'b'], [S('a', []), S('b', [])], 'a'), []);
  // 해골은 줄에 들어가지 않는다
  assert.deepEqual(reconcileRow([], [S('a', ['F', 'S'])], 'a'), ['a']);
});

const V = (o = {}) => ({
  phase: 'playing', step: 'turn', total: 7, center: '가 님 차례', bid: null, progress: null, ranges: { flipPiles: [] }, outcome: null, penalty: null,
  seats: [
    { id: 'a', name: '가', isMe: true, isTurn: true, isChallenger: false, stack: 2, shown: [], out: null, passed: false, placed: true, connected: true },
    { id: 'b', name: '나', isMe: false, isTurn: false, isChallenger: false, stack: 3, shown: [], out: null, passed: false, placed: true, connected: true },
  ],
  me: { seated: true }, ...o,
});

test('가운데: 단계마다 큰 숫자와 문구', () => {
  let m = midModel(V());
  assert.equal(m.mode, 'plain'); assert.equal(m.cap, '판 위 원판'); assert.equal(m.num, 7);
  assert.equal(m.say, '가 님 차례'); assert.equal(m.sub, '원판을 내거나 도전하세요');
  m = midModel(V({ step: 'bid', bid: { n: 4, by: 'b' } }));
  assert.equal(m.cap, '도전'); assert.equal(m.num, 4);
  assert.ok(m.sub.includes('올리거나'));
  m = midModel(V({ phase: 'lobby', step: null, center: '기다리는 중' }));
  assert.equal(m.num, null); assert.equal(m.say, '기다리는 중');
});

test('가운데: 뒤집기 단계는 줄 모드, 숫자는 연출이 끝난 장수만', () => {
  const v = V({ step: 'flip', progress: { flipped: 2, need: 5 } });
  v.seats[0].isChallenger = true;
  v.ranges = { flipPiles: ['b'] };
  let m = midModel(v);
  assert.equal(m.mode, 'flip'); assert.equal(m.num, 2); assert.equal(m.small, '/ 5');
  assert.equal(m.say, '상대 더미를 눌러 뒤집으세요'); assert.equal(m.sub, '앞으로 3장');
  m = midModel(v, { holdRow: 1 });
  assert.equal(m.num, 1);
  const last = V({ step: 'flip', progress: { flipped: 4, need: 5 } });
  assert.equal(midModel(last).sub, '마지막 한 장');
  const other = V({ step: 'flip', progress: { flipped: 0, need: 3 } });
  other.seats[1].isChallenger = true;
  assert.equal(midModel(other).say, '나 님이 뒤집는 중');
});

test('알약·테: 도전·해골·차례', () => {
  const v = V({ step: 'reveal', outcome: { ok: false, skullOf: 'b' }, progress: { flipped: 2, need: 4 } });
  v.seats[0].isChallenger = true; v.seats[0].isTurn = true;
  assert.deepEqual(chipFor(v.seats[1], v), { text: '해골', kind: 'red' });
  assert.deepEqual(chipFor(v.seats[0], v), { text: '도전 실패', kind: 'mute' });
  assert.equal(ringFor(v.seats[1], v), 'red');
  assert.equal(ringFor(v.seats[0], v), '');
  const ok = V({ step: 'reveal', outcome: { ok: true, skullOf: null } });
  ok.seats[0].isChallenger = true;
  assert.deepEqual(chipFor(ok.seats[0], ok), { text: '성공', kind: '' });
  const t = V();
  assert.equal(ringFor(t.seats[0], t), 'gold');
  assert.equal(ringFor(t.seats[1], t), '');
  assert.equal(chipFor(t.seats[1], t), null);
  const p = V({ step: 'penalty', penalty: { by: 'b', target: 'a', n: 3, faceUp: false }, outcome: { ok: false, skullOf: 'b' } });
  assert.equal(ringFor(p.seats[1], p), 'red');
  const q = V({ step: 'penalty', penalty: { by: 'a', target: 'a', n: 3, faceUp: true }, outcome: { ok: false, skullOf: 'a' } });
  assert.equal(ringFor(q.seats[0], q), 'red');
  const out = { ...t.seats[1], out: 'lost' };
  assert.equal(chipFor(out, t).text, '탈락');
});

test('자리 순서: 내가 맨 앞', () => {
  const l = [{ id: 'x' }, { id: 'y', isMe: true }, { id: 'z' }];
  assert.deepEqual(orderSeats(l).map((s) => s.id), ['y', 'z', 'x']);
  assert.deepEqual(orderSeats([{ id: 'x' }, { id: 'z' }]).map((s) => s.id), ['x', 'z']);
});
