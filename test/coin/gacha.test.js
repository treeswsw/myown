import test from 'node:test';
import assert from 'node:assert/strict';
import { COST, TEN, PITY, ROLL, TIERS, POOL_START, draw } from '../../shared/coin/gacha.js';

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
  assert.equal(COST, 5);
  assert.equal(TEN, 10);
  assert.equal(PITY, 60);
  assert.equal(ROLL, 100000);
  assert.equal(TIERS.length, 6);
  assert.equal(TIERS.reduce((s, t) => s + t.w, 0), ROLL);
  assert.deepEqual(TIERS.map((t) => t.chips), [200, 500, 1000, 2500, 10000, 0]);
});

test('경계: roll 값 → 등급', () => {
  const edges = [[0, 0], [57999, 0], [58000, 1], [87999, 1], [88000, 2], [96999, 2], [97000, 3], [99399, 3], [99400, 4], [99899, 4], [99900, 5]];
  for (const [r, tier] of edges) {
    const out = draw(fixed(r), 1, 0);
    assert.equal(out.pulls[0].tier, tier, `roll ${r}`);
    if (tier < 5) assert.equal(out.pulls[0].chips, TIERS[tier].chips);
  }
});

test('금고: 장마다 +20(평가 전), 잭팟이면 금고 전부를 받고 10000 으로', () => {
  const a = draw(fixed(0), 1, 0, 10000);
  assert.equal(a.pool, 10020);
  assert.equal(a.jackpot, false);
  const b = draw(fixed(99900), 1, 0, 12000);
  assert.equal(b.pulls[0].tier, 5);
  assert.equal(b.pulls[0].chips, 12020);
  assert.equal(b.chips, 12020);
  assert.equal(b.pool, POOL_START);
  assert.equal(b.jackpot, true);
  assert.equal(b.pity, 0);
  const c = draw(fixed(0), 10, 0, 10000);
  assert.equal(c.pool, 10200);
  assert.equal(draw(fixed(0), 1, 0).pool, 10020); // 기본 금고
});

test('시뮬레이션 100만 장: 등급 비율 ±0.3%p', () => {
  const rng = mulberry32(12345);
  const N = 1000000;
  const cnt = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) cnt[draw(rng, 1, 0).pulls[0].tier]++;
  TIERS.forEach((t, i) => {
    const got = (cnt[i] / N) * 100;
    assert.ok(Math.abs(got - t.w / 1000) <= 0.3, `tier ${i}: ${got}`);
  });
});

function avg(n, seed) {
  const rng = mulberry32(seed);
  let pity = 0;
  let pool = POOL_START;
  let total = 0;
  const N = 3000000 / n;
  for (let i = 0; i < N; i++) {
    const o = draw(rng, n, pity, pool);
    pity = o.pity;
    pool = o.pool;
    total += o.chips;
  }
  return total / N / n;
}

test('평균: 1장 약 509칩, 10장 약 526칩/장', () => {
  const one = avg(1, 5);
  const ten = avg(TEN, 5);
  assert.ok(Math.abs(one - 509) <= 10, String(one));
  assert.ok(Math.abs(ten - 526) <= 10, String(ten));
});

test('천장: pity 59 에서 꽝 롤이어도 대박, 그 전엔 그대로', () => {
  const a = draw(fixed(0), 1, 58);
  assert.equal(a.pulls[0].tier, 0);
  assert.equal(a.pity, 59);
  const b = draw(fixed(0), 1, 59);
  assert.equal(b.pulls[0].tier, 3);
  assert.equal(b.pulls[0].chips, 2500);
  assert.equal(b.pity, 0);
});

test('천장: 처음부터 59장 꽝 뒤 60장째가 대박', () => {
  let pity = 0;
  for (let i = 0; i < 59; i++) {
    const o = draw(fixed(0), 1, pity);
    assert.equal(o.pulls[0].tier, 0);
    pity = o.pity;
  }
  assert.equal(pity, 59);
  assert.equal(draw(fixed(0), 1, pity).pulls[0].tier, 3);
});

test('천장 자리에서 더 높은 자연 등급은 그대로, 금은 대박으로 올라간다', () => {
  assert.equal(draw(fixed(99500), 1, 59).pulls[0].tier, 4);
  assert.equal(draw(fixed(88000), 1, 59).pulls[0].tier, 3);
});

test('pity: 대박 이상만 0 으로', () => {
  assert.equal(draw(fixed(97000), 1, 50).pity, 0);
  assert.equal(draw(fixed(88000), 1, 50).pity, 51);
});

test('10장 보장: 금 이상이 없으면 마지막이 금(1000)', () => {
  const o = draw(fixed(0), 10, 0);
  assert.equal(o.pulls.length, 10);
  assert.deepEqual(o.pulls.map((p) => p.tier), [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.equal(o.pulls[9].chips, 1000);
  assert.equal(o.chips, 9 * 200 + 1000);
  assert.equal(o.pity, 10); // 보장은 천장 계산 뒤
});

test('10장: 금 이상이 하나라도 있으면 보장 없음, 합계 맞음', () => {
  let i = 0;
  const seq = [0, 0, 88000, 0, 0, 0, 0, 0, 0, 0];
  const o = draw(() => (seq[i++] + 0.5) / ROLL, 10, 0);
  assert.equal(o.pulls.filter((p) => p.tier === 0).length, 9);
  assert.equal(o.chips, 9 * 200 + 1000);
  assert.equal(o.chips, o.pulls.reduce((s, p) => s + p.chips, 0));
});

test('10장 중간에 천장이 걸리면 0 으로 돌아가 다시 센다', () => {
  const o = draw(fixed(0), 10, 55); // 5번째 장이 천장
  assert.equal(o.pulls[4].tier, 3);
  assert.equal(o.pity, 5);
  assert.equal(o.pulls[9].tier, 0); // 대박이 있으니 보장 없음
});

test('n 검증', () => {
  for (const n of [0, 2, 5, 9, 11, -1, 1.5, NaN, '1', null, undefined]) {
    assert.throws(() => draw(mulberry32(1), n, 0), RangeError, String(n));
  }
});

test('같은 씨앗이면 같은 결과', () => {
  assert.deepEqual(draw(mulberry32(7), 10, 3, 12000), draw(mulberry32(7), 10, 3, 12000));
});
