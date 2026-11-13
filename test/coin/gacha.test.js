import test from 'node:test';
import assert from 'node:assert/strict';
import { COST, TEN, PITY, ROLL, TIERS, draw } from '../../shared/coin/gacha.js';

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 항상 roll 값 r 을 내는 rng
const fixed = (r) => () => (r + 0.5) / ROLL;

test('상수와 가중치', () => {
  assert.equal(COST, 10);
  assert.equal(TEN, 10);
  assert.equal(PITY, 80);
  assert.equal(ROLL, 10000);
  assert.equal(TIERS.reduce((s, t) => s + t.w, 0), 10000);
});

test('가중치로 계산한 평균은 정확히 1000칩', () => {
  const sum = TIERS.reduce((s, t) => s + t.chips * t.w, 0);
  assert.equal(sum / ROLL, 1000);
});

test('경계: roll 값 → 등급', () => {
  const edges = [[0, 0], [7309, 0], [7310, 1], [9809, 1], [9810, 2], [9978, 2], [9979, 3], [9998, 3], [9999, 4]];
  for (const [r, tier] of edges) {
    const out = draw(fixed(r), 1, 0);
    assert.equal(out.pulls[0].tier, tier, `roll ${r}`);
    assert.equal(out.pulls[0].chips, TIERS[tier].chips);
  }
});

test('시뮬레이션 100만 번: 등급 비율 ±0.3%p', () => {
  const rng = mulberry32(12345);
  const N = 1000000;
  const cnt = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) cnt[draw(rng, 1, 0).pulls[0].tier]++;
  TIERS.forEach((t, i) => {
    const got = (cnt[i] / N) * 100;
    assert.ok(Math.abs(got - t.w / 100) <= 0.3, `tier ${i}: ${got}`);
  });
});

test('천장: pity 79 에서 꽝 롤이어도 금, 그 전엔 그대로', () => {
  const a = draw(fixed(0), 1, 78);
  assert.equal(a.pulls[0].tier, 0);
  assert.equal(a.pity, 79);
  const b = draw(fixed(0), 1, 79);
  assert.equal(b.pulls[0].tier, 2);
  assert.equal(b.pulls[0].chips, 5000);
  assert.equal(b.pity, 0);
});

test('천장: 처음부터 79번 꽝 뒤 80번째가 금', () => {
  let pity = 0;
  for (let i = 0; i < 79; i++) {
    const o = draw(fixed(0), 1, pity);
    assert.equal(o.pulls[0].tier, 0);
    pity = o.pity;
  }
  assert.equal(pity, 79);
  assert.equal(draw(fixed(0), 1, pity).pulls[0].tier, 2);
});

test('천장 자리에서 더 높은 자연 등급은 그대로, pity 는 0', () => {
  const o = draw(fixed(9999), 1, 79);
  assert.equal(o.pulls[0].tier, 4);
  assert.equal(o.pity, 0);
});

test('금 이상이 나오면 pity 0 으로', () => {
  assert.equal(draw(fixed(9810), 1, 50).pity, 0);
  assert.equal(draw(fixed(7310), 1, 50).pity, 51);
});

test('10연: 전부 동이면 마지막이 은', () => {
  const o = draw(fixed(0), 10, 0);
  assert.equal(o.pulls.length, 10);
  assert.deepEqual(o.pulls.map((p) => p.tier), [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(o.chips, 9 * 500 + 2000);
  assert.equal(o.pity, 10); // 보장은 천장 계산 뒤
});

test('10연: 은이 하나라도 있으면 보장 없음, 합계 맞음', () => {
  let i = 0;
  const seq = [0, 0, 7310, 0, 0, 0, 0, 0, 0, 0];
  const o = draw(() => (seq[i++] + 0.5) / ROLL, 10, 0);
  assert.equal(o.pulls.filter((p) => p.tier === 0).length, 9);
  assert.equal(o.chips, o.pulls.reduce((s, p) => s + p.chips, 0));
  assert.equal(o.chips, 9 * 500 + 2000);
});

test('10연 중간에 천장이 걸리면 0 으로 돌아가 다시 센다', () => {
  const o = draw(fixed(0), 10, 75); // 5번째 뽑기가 천장
  assert.equal(o.pulls[4].tier, 2);
  assert.equal(o.pity, 5);
  assert.equal(o.pulls.filter((p) => p.tier === 1).length, 0);
});

test('n 검증', () => {
  for (const n of [0, 2, 5, 9, 11, -1, 1.5, NaN, '1', null, undefined]) {
    assert.throws(() => draw(mulberry32(1), n, 0), RangeError, String(n));
  }
});

test('같은 씨앗이면 같은 결과, 장기 평균은 1000 근처', () => {
  assert.deepEqual(draw(mulberry32(7), 10, 3), draw(mulberry32(7), 10, 3));
  const rng = mulberry32(99);
  let pity = 0;
  let total = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const o = draw(rng, 1, pity);
    pity = o.pity;
    total += o.chips;
  }
  const avg = total / N;
  assert.ok(avg > 900 && avg < 1200, String(avg));
});
