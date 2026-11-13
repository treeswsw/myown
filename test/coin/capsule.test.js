import test from 'node:test';
import assert from 'node:assert/strict';
import { capsule, trashKingDue, COST, TEN, PITY, WEIGHTS, SHARD, CRAFT } from '../../shared/coin/capsule.js';
import { ITEMS, item } from '../../shared/coin/shop.js';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('상수', () => {
  assert.equal(COST, 10); assert.equal(TEN, 10); assert.equal(PITY, 80); assert.equal(CRAFT, 100);
  assert.deepEqual(SHARD, [1, 3, 10, 30, 100]);
  assert.equal(WEIGHTS.reduce((a, b) => a + b, 0), 10000);
  assert.deepEqual(WEIGHTS, [6000, 2800, 900, 270, 30]);
});

test('n 은 1 또는 10', () => {
  assert.throws(() => capsule(lcg(1), 5), RangeError);
  assert.equal(capsule(lcg(1), 1).pulls.length, 1);
  assert.equal(capsule(lcg(1), 10).pulls.length, 10);
});

test('등급 구간 경계', () => {
  // rng 첫 값이 등급, 둘째 값이 품목
  const g = (x) => capsule(seq(x, 0), 1).pulls[0].g;
  assert.deepEqual([0, 0.5999, 0.6, 0.8799, 0.88, 0.9699, 0.97, 0.9969, 0.997, 0.99999].map(g), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('시드 분포가 가중치와 비슷하다', () => {
  const rng = lcg(12345);
  const N = 100000;
  const cnt = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) cnt[capsule(rng, 1, 0).pulls[0].g]++;
  WEIGHTS.forEach((w, g) => {
    const exp = (w / 10000) * N;
    assert.ok(Math.abs(cnt[g] - exp) < Math.max(5 * Math.sqrt(exp), exp * 0.05), `g${g} ${cnt[g]} vs ${exp}`);
  });
});

test('천장: 79개 못 뽑으면 80개째는 레전드 이상', () => {
  const r = capsule(seq(0.1, 0.5), 1, 79);
  assert.ok(r.pulls[0].g >= 3);
  assert.equal(r.cpity, 0);
  const r2 = capsule(seq(0.1, 0.5), 1, 78);
  assert.equal(r2.pulls[0].g, 0);
  assert.equal(r2.cpity, 79);
  assert.equal(capsule(seq(0.98, 0.1), 1, 50).cpity, 0);
  const r3 = capsule(seq(0.1, 0.5), 10, 75);
  assert.ok(r3.pulls[4].g >= 3);
  assert.ok(r3.pulls.slice(0, 4).every((p) => p.g === 0));
});

test('10개 보장: 컨셉 이상이 없으면 마지막이 컨셉', () => {
  const r = capsule(seq(0.1, 0.5), 10, 0, []);
  assert.ok(r.pulls.slice(0, 9).every((p) => p.g === 0));
  assert.equal(r.pulls[9].g, 2);
  assert.equal(r.cpity, 10);
  for (let s = 1; s <= 300; s++) assert.ok(capsule(lcg(s), 10).pulls.some((p) => p.g >= 2));
});

test('중복은 조각으로, 같은 10개 안에서도', () => {
  const first = capsule(seq(0.1, 0), 1, 0, []).pulls[0];
  assert.equal(first.dup, false); assert.equal(first.shard, 0);
  const again = capsule(seq(0.1, 0), 1, 0, new Set([first.id]));
  assert.deepEqual(again.pulls[0], { id: first.id, g: 0, dup: true, shard: 1 });
  assert.equal(again.shard, 1);
  const r = capsule(seq(0.1, 0), 10, 0, []);
  assert.equal(r.pulls[0].dup, false);
  assert.ok(r.pulls.slice(1, 9).every((p) => p.dup && p.shard === 1));
  assert.equal(r.shard, 8 + r.pulls[9].shard);
  for (let g = 0; g < 5; g++) {
    const x = [0.1, 0.7, 0.9, 0.98, 0.999][g];
    const own = ITEMS.filter((i) => i.g === g && i.cap)[0].id;
    const p = capsule(seq(x, 0), 1, 0, [own]).pulls[0];
    assert.deepEqual([p.id, p.g, p.dup, p.shard], [own, g, true, SHARD[g]]);
  }
});

test('cap:false 품목은 나오지 않는다', () => {
  const rng = lcg(777);
  for (let i = 0; i < 20000; i++) {
    for (const p of capsule(rng, 10, (rng() * 80) | 0).pulls) {
      const it = item(p.id);
      assert.ok(it && it.cap === true && it.g === p.g, p.id);
    }
  }
  for (let k = 0; k < 7; k++) {
    const p = capsule(seq(0.9999, k / 7 + 0.01), 1).pulls[0];
    assert.equal(item(p.id).cap, true);
  }
});

test('입력을 바꾸지 않고, cpity 이상값은 0 취급', () => {
  const owned = new Set(['title.jotbyin']);
  capsule(lcg(3), 10, 0, owned);
  assert.equal(owned.size, 1);
  assert.equal(capsule(seq(0.1, 0), 1, -5).cpity, 1);
  assert.equal(capsule(seq(0.1, 0), 1, 'x').cpity, 1);
});

test('trashKingDue', () => {
  const trash = ITEMS.filter((i) => i.slot === 'title' && i.g === 0).map((i) => i.id);
  assert.equal(trash.length, 26);
  assert.equal(trashKingDue(trash.slice(0, 19)), false);
  assert.equal(trashKingDue(trash.slice(0, 20)), true);
  assert.equal(trashKingDue(new Set(trash)), true);
  assert.equal(trashKingDue([...trash, 'title.trashking']), false);
  const g1 = ITEMS.filter((i) => i.slot === 'title' && i.g === 1).map((i) => i.id);
  assert.equal(trashKingDue([...trash.slice(0, 19), ...g1]), false);
});
