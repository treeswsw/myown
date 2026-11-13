import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatOrder, seatSlots, cameraFor, arrowPlan, TA, TB } from '../../client/src/liar/scene/layout.js';

const mk = (n, seated = true) => Array.from({ length: n }, (_, i) => ({ id: 'u' + i, seat: seated ? i : null }));

test('seatOrder: 내가 [0], 3명·8명', () => {
  const p3 = mk(3);
  assert.deepEqual(seatOrder(p3, 'u1'), ['u1', 'u2', 'u0']);
  const p8 = mk(8);
  const o = seatOrder(p8, 'u5');
  assert.equal(o[0], 'u5');
  assert.equal(o.length, 8);
  assert.deepEqual(o, ['u5', 'u6', 'u7', 'u0', 'u1', 'u2', 'u3', 'u4']);
});
test('seatOrder: seat 번호가 섞여 있어도 seat 순', () => {
  const p = [{ id: 'a', seat: 2 }, { id: 'b', seat: 0 }, { id: 'c', seat: 1 }];
  assert.deepEqual(seatOrder(p, 'a'), ['a', 'b', 'c']);
  assert.deepEqual(seatOrder(p, 'b'), ['b', 'c', 'a']);
});
test('seatOrder: 전원 seat null 이면 배열 순서', () => {
  assert.deepEqual(seatOrder(mk(4, false), 'u0'), ['u0', 'u1', 'u2', 'u3']);
  assert.deepEqual(seatOrder(mk(4, false), 'u2'), ['u2', 'u3', 'u0', 'u1']);
});
test('seatOrder: 관전자(seat null)는 빼고, 내가 관전자면 seat 0 이 [0]', () => {
  const p = [...mk(3), { id: 'sp', seat: null }];
  assert.deepEqual(seatOrder(p, 'u1'), ['u1', 'u2', 'u0']);
  assert.deepEqual(seatOrder(p, 'sp'), ['u0', 'u1', 'u2']);
  assert.deepEqual(seatOrder([], 'x'), []);
});
test('seatSlots: n개·서로 다름·[0]이 화면 앞', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const s = seatSlots(n);
    assert.equal(s.length, n);
    const keys = new Set(s.map((q) => q.x.toFixed(3) + ',' + q.z.toFixed(3)));
    assert.equal(keys.size, n);
    assert.ok(Math.abs(s[0].x) < 1e-9);
    assert.ok(s[0].z > TB, '[0]은 +z(화면 앞)이고 테이블 밖');
    assert.ok(s.slice(1).every((q) => q.z < s[0].z + 1e-9));
    // 모두 테이블 타원 바깥
    for (const q of s) assert.ok((q.x / TA) ** 2 + (q.z / TB) ** 2 > 1);
  }
});
test('cameraFor: 단계별', () => {
  assert.deepEqual(cameraFor({ phase: 'speak', speaker: 'u3', accused: null }), { mode: 'focus', id: 'u3' });
  assert.deepEqual(cameraFor({ phase: 'speak', speaker: null }), { mode: 'table' });
  for (const phase of ['defense', 'judge', 'judged']) {
    assert.deepEqual(cameraFor({ phase, speaker: 'u1', accused: 'u2' }), { mode: 'focus', id: 'u2' });
  }
  for (const phase of ['lobby', 'reveal', 'discuss', 'revote', 'unmask', 'guess', 'result']) {
    assert.deepEqual(cameraFor({ phase, speaker: 'u1', accused: 'u2' }), { mode: 'table' });
  }
  assert.deepEqual(cameraFor(null), { mode: 'table' });
});

// arrowPlan: seatOf 는 seatSlots 로 만든다
const seatsOf = (n) => {
  const slots = seatSlots(n);
  return (id) => { const k = Number(String(id).slice(1)); return Number.isInteger(k) && k >= 0 && k < n ? { edge: slots[k].edge, n: slots[k].n, k } : null; };
};
const finite = (a) => a.every((v) => Number.isFinite(v));

test('arrowPlan: 0표·null·잘못된 값', () => {
  const so = seatsOf(5);
  assert.deepEqual(arrowPlan({}, so), []);
  assert.deepEqual(arrowPlan(null, so), []);
  assert.deepEqual(arrowPlan(undefined, so), []);
});
test('arrowPlan: 1표', () => {
  const p = arrowPlan({ u0: 'u2' }, seatsOf(5));
  assert.equal(p.length, 1);
  assert.equal(p[0].from, 'u0'); assert.equal(p[0].to, 'u2');
  assert.ok(finite([...p[0].a, ...p[0].b, ...p[0].c]));
  assert.notDeepEqual(p[0].a, p[0].b);
});
test('arrowPlan: 서로 찍기는 화살표 둘, 서로 다른 곡선', () => {
  const p = arrowPlan({ u0: 'u3', u3: 'u0' }, seatsOf(6));
  assert.equal(p.length, 2);
  assert.notDeepEqual(p[0].c, p[1].c);
});
test('arrowPlan: 한 사람에게 7표 — 끝점이 모두 다르고 겹치지 않는다', () => {
  const votes = {};
  for (let i = 1; i < 8; i++) votes['u' + i] = 'u0';
  const p = arrowPlan(votes, seatsOf(8));
  assert.equal(p.length, 7);
  const ends = p.map((a) => a.b);
  for (let i = 0; i < ends.length; i++) {
    assert.ok(finite(ends[i]));
    for (let j = i + 1; j < ends.length; j++) {
      assert.ok(Math.hypot(ends[i][0] - ends[j][0], ends[i][1] - ends[j][1]) > 0.05, `끝점 ${i},${j} 가 겹침`);
    }
  }
  assert.equal(new Set(p.map((a) => a.layer)).size, 7);
});
test('arrowPlan: 없는 id·자기 자신·글자가 아닌 값은 무시', () => {
  const p = arrowPlan({ u0: 'zzz', zzz: 'u1', u1: 'u1', u2: 5, u3: 'u0' }, seatsOf(4));
  assert.deepEqual(p.map((a) => [a.from, a.to]), [['u3', 'u0']]);
});
test('arrowPlan: 같은 입력이면 같은 결과(순서 무관)', () => {
  const a = arrowPlan({ u1: 'u0', u2: 'u0', u3: 'u0' }, seatsOf(4));
  const b = arrowPlan({ u3: 'u0', u2: 'u0', u1: 'u0' }, seatsOf(4));
  assert.deepEqual(a, b);
});

// pick / tagPos (실제 장면, GPU 없이 node 에서)
import { createLiarScene } from '../../client/src/liar/scene/index.js';

function sceneWith(n, view) {
  const sc = createLiarScene();
  sc.resize(1000, 750);
  sc.setPlayers(Array.from({ length: n }, (_, i) => ({ id: 'u' + i, seat: i, name: 'P' + i, color: '#c33', body: 0 })), 'u0');
  if (view) sc.setView(view, true);
  sc.frame(1);
  return sc;
}
for (const n of [3, 8]) {
  test(`pick: ${n}명 모두 화면을 훑으면 잡히고 / 빈 곳은 null`, () => {
    const sc = sceneWith(n);
    const found = new Map();
    for (let y = 0; y < 750; y += 8) for (let x = 0; x < 1000; x += 8) {
      const id = sc.pick(x, y);
      if (id) found.set(id, [...(found.get(id) || []), [x, y]]);
    }
    for (let i = 0; i < n; i++) assert.ok(found.has('u' + i), `u${i} 가 한 번도 안 잡힘`);
    assert.equal(sc.pick(2, 2), null);
    assert.equal(sc.pick(998, 748), null);
    // 잡힌 점을 다시 누르면 같은 사람
    for (const [id, pts] of found) assert.equal(sc.pick(...pts[Math.floor(pts.length / 2)]), id);
    sc.dispose();
  });
}
test('tagPos: 클로즈업이면 below:true 이고 screenPos 보다 아래, 전체 보기에서는 screenPos 와 같음', () => {
  const sc = sceneWith(5, { mode: 'focus', id: 'u2' });
  const t = sc.tagPos('u2');
  const s = sc.screenPos('u2');
  assert.equal(t.below, true);
  assert.ok(t.y > s.y, 'tagPos 는 screenPos 보다 아래');
  // 클로즈업 아닌 사람은 screenPos 와 같다
  assert.deepEqual(sc.tagPos('u3'), sc.screenPos('u3'));
  sc.setView({ mode: 'table' }, true);
  assert.deepEqual(sc.tagPos('u2'), sc.screenPos('u2'));
  sc.setView({ mode: 'liar', id: 'u2' }, true);
  assert.deepEqual(sc.tagPos('u2'), sc.screenPos('u2'));
  assert.equal(sc.tagPos('nobody'), null);
  sc.dispose();
});
