// 요트다이스 굴림 계산기 시험 (YACHT-PLAN 5절 Y1S "끝났다는 증거", GDD 4절)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRAY, DIE, STEP_MS, MAX_MS, CUP, prng, simulateRoll, restQuat, faceFix, freeSpot, _test,
} from '../../shared/yacht/sim.js';

const SRC = readFileSync(new URL('../../shared/yacht/sim.js', import.meta.url), 'utf8');
const HALF = DIE / 2, WALL = TRAY / 2, LIMIT = 4.0, GAP = 2.1;
const ALL = [0, 1, 2, 3, 4];
// 기본 번호 배치(면 → 눈): +y 1, −y 6, +x 3, −x 4, +z 2, −z 5
const FACE = { 1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
const CORNERS = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) CORNERS.push([a * HALF, b * HALF, c * HALF]);

function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function rot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
// 자세 q 에서 위(+y)를 보는 면의 눈
function topOf(q) {
  let best = 0, by = -2;
  for (const v of [1, 2, 3, 4, 5, 6]) { const n = rot(q, FACE[v]); if (n[1] > by) { by = n[1]; best = v; } }
  return { v: best, cos: by };
}
// 세계 방향 dir 을 보는 면
function faceToward(q, dir) {
  let best = 0, bd = -2;
  for (const v of [1, 2, 3, 4, 5, 6]) {
    const n = rot(q, FACE[v]); const d = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
    if (d > bd) { bd = d; best = v; }
  }
  return best;
}
const sameRot = (a, b, eps = 1e-6) => Math.abs(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) - 1) < eps;
const frameQ = (r, k, j, n) => { const o = (k * n + j) * 7; return [r.frames[o + 3], r.frames[o + 4], r.frames[o + 5], r.frames[o + 6]]; };

test('상수는 약속(YACHT-PLAN 3-1) 그대로', () => {
  assert.equal(TRAY, 10); assert.equal(DIE, 1.4); assert.equal(STEP_MS, 1000 / 120); assert.equal(MAX_MS, 2500);
  assert.deepEqual(CUP, { x: 3.4, z: 2.4 });
});

test('prng: 같은 seed 같은 수열, [0,1) 범위, seed 마다 다름', () => {
  const a = prng(12345), b = prng(12345), c = prng(12346);
  const xs = [], ys = [], zs = [];
  for (let k = 0; k < 1000; k++) { xs.push(a()); ys.push(b()); zs.push(c()); }
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  const r = prng(0xffffffff); let sum = 0;
  for (let k = 0; k < 20000; k++) sum += r();
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.02);
});

test('같은 입력 두 번 = 완전히 같은 결과(frames 바이트까지)', () => {
  for (const seed of [0, 1, 7, 123456789, 2 ** 32 - 1, 3141592653]) {
    for (let n = 1; n <= 5; n++) {
      const th = ALL.slice(0, n);
      const a = simulateRoll(seed, th), b = simulateRoll(seed, th.slice());
      assert.equal(a.steps, b.steps); assert.equal(a.ms, b.ms);
      assert.deepEqual(a.rest, b.rest);
      assert.ok(Buffer.from(a.frames.buffer).equals(Buffer.from(b.frames.buffer)), `frames 다름 seed=${seed} n=${n}`);
      const c = simulateRoll(seed, th, { frames: false });
      assert.equal(c.frames, null);
      assert.deepEqual(c.rest, a.rest, 'frames:false 도 멈춘 자리가 같다');
      assert.equal(c.steps, a.steps);
    }
  }
});

test('굴린 번호 목록: rest 의 i 는 thrown 순서 그대로, 0개면 빈 결과', () => {
  const r = simulateRoll(99, [1, 3, 4]);
  assert.deepEqual(r.rest.map((d) => d.i), [1, 3, 4]);
  assert.equal(r.frames.length, r.steps * 3 * 7);
  const e = simulateRoll(99, []);
  assert.equal(e.steps, 0); assert.deepEqual(e.rest, []);
});

// 경로 하나를 전부 검사한다: 바닥 아래·벽 밖 0, 끊김 없음, 끝은 평평·서버 자리와 같음, 멈춘 자리 조건
function checkRoll(r, th, label) {
  const n = th.length;
  assert.ok(r.ms <= MAX_MS + 1e-9, `${label}: ${r.ms}ms > 2.5초`);
  assert.ok(r.ms >= 900 - 1e-9, `${label}: ${r.ms}ms < 0.9초`);
  assert.equal(r.ms, (r.steps - 1) * STEP_MS);
  assert.equal(r.frames.length, r.steps * n * 7);
  assert.equal(r.rest.length, n);
  const f = r.frames;
  for (let k = 0; k < r.steps; k++) {
    for (let j = 0; j < n; j++) {
      const o = (k * n + j) * 7;
      const p = [f[o], f[o + 1], f[o + 2]], q = [f[o + 3], f[o + 4], f[o + 5], f[o + 6]];
      const ql = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
      if (Math.abs(ql - 1) > 1e-5) assert.fail(`${label}: 프레임 ${k} 주사위 ${j} 쿼터니언 길이 ${ql}`);
      for (const c of CORNERS) {
        const v = rot(q, c);
        const y = p[1] + v[1], x = p[0] + v[0], z = p[2] + v[2];
        if (y < -1e-3) assert.fail(`${label}: 프레임 ${k} 주사위 ${j} 바닥 아래 ${y}`);
        if (Math.abs(x) > WALL + 1e-3 || Math.abs(z) > WALL + 1e-3) assert.fail(`${label}: 프레임 ${k} 주사위 ${j} 벽 밖 ${x},${z}`);
      }
      if (k > 0) {
        const o2 = o - n * 7;
        const dx = f[o] - f[o2], dy = f[o + 1] - f[o2 + 1], dz = f[o + 2] - f[o2 + 2];
        if (dx * dx + dy * dy + dz * dz > 0.35 * 0.35) assert.fail(`${label}: 프레임 ${k} 주사위 ${j} 순간이동`);
        const dot = Math.abs(f[o + 3] * f[o2 + 3] + f[o + 4] * f[o2 + 4] + f[o + 5] * f[o2 + 5] + f[o + 6] * f[o2 + 6]);
        if (dot < 0.98) assert.fail(`${label}: 프레임 ${k} 주사위 ${j} 회전 끊김 ${dot}`);
      }
    }
  }
  const last = r.steps - 1;
  r.rest.forEach((d, j) => {
    assert.equal(d.i, th[j]);
    assert.ok(Number.isInteger(d.up) && d.up >= 1 && d.up <= 6);
    assert.ok(Math.abs(d.x) <= LIMIT && Math.abs(d.z) <= LIMIT, `${label}: 자리 ${d.x},${d.z}`);
    assert.ok(Number.isFinite(d.yaw) && Math.abs(d.yaw) <= Math.PI + 1e-12);
    for (let b = j + 1; b < n; b++) {
      const e = r.rest[b];
      assert.ok(Math.hypot(e.x - d.x, e.z - d.z) >= GAP, `${label}: 사이 ${Math.hypot(e.x - d.x, e.z - d.z)}`);
    }
    const o = (last * n + j) * 7;
    assert.equal(f[o], Math.fround(d.x)); assert.equal(f[o + 2], Math.fround(d.z));
    assert.equal(f[o + 1], Math.fround(HALF));
    const q = frameQ(r, last, j, n);
    const top = topOf(q);
    assert.equal(top.v, d.up);
    assert.ok(top.cos > 1 - 1e-6, `${label}: 끝이 평평하지 않음 ${top.cos}`);
    assert.ok(sameRot(q, restQuat(d.up, d.yaw), 1e-5), `${label}: 끝 자세 ≠ restQuat(up, yaw)`);
  });
}

test('seed 2,000개 × 굴린 개수 1~5: 모두 유효(2.5초 안, 평평, |x|,|z|≤4, 사이 2.1 이상, 바닥 아래·벽 밖 0)', () => {
  for (let n = 1; n <= 5; n++) {
    const th = ALL.slice(5 - n);   // 뒤쪽 번호(재굴림처럼)
    for (let s = 0; s < 2000; s++) {
      const seed = (s * 2654435761) >>> 0;
      checkRoll(simulateRoll(seed, th), th, `seed=${seed} n=${n}`);
    }
  }
});

test('보기 좋게: 평균 1초 이상 구르고, 대부분 첫 시도에 성공(격자 경로는 드묾)', () => {
  let sum = 0, cnt = 0, first = 0, all = 0;
  for (let s = 0; s < 300; s++) {
    const r = simulateRoll(s * 7 + 1, ALL, { frames: false });
    sum += r.ms; cnt++;
    if (!_test.attempt(s * 7 + 1, ALL, null).fail) first++;
    all++;
  }
  assert.ok(sum / cnt >= 1000, `평균 ${sum / cnt}ms`);
  assert.ok(first / all >= 0.7, `첫 시도 성공 ${first}/${all}`);
});

test('격자 자리로 미끄러지는 경로(마지막 수단)도 유효', () => {
  for (let n = 1; n <= 5; n++) {
    const th = ALL.slice(0, n);
    for (const seed of [0, 5, 77, 4000000000]) {
      const buf = new Float32Array(301 * n * 7);
      const r = _test.fallback(seed, th, buf);
      checkRoll({ ms: (r.steps - 1) * STEP_MS, steps: r.steps, frames: buf.slice(0, r.steps * n * 7), rest: r.rest }, th, `fallback seed=${seed} n=${n}`);
    }
  }
});

test('faceFix: 36쌍 모두 "마지막 자세 × faceFix" 의 윗면 = v, 마주 보는 면 합 7, = restQuat(v, yaw)', () => {
  // 실제 경로의 마지막 자세에서 up 1~6 을 하나씩 찾는다
  const lastBy = {};
  for (let s = 0; Object.keys(lastBy).length < 6 && s < 500; s++) {
    const r = simulateRoll(s, ALL);
    r.rest.forEach((d, j) => { if (!lastBy[d.up]) lastBy[d.up] = { q: frameQ(r, r.steps - 1, j, 5), yaw: d.yaw }; });
  }
  assert.equal(Object.keys(lastBy).length, 6);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let up = 1; up <= 6; up++) {
    for (let v = 1; v <= 6; v++) {
      const { q, yaw } = lastBy[up];
      const shown = qmul(q, faceFix(up, v));
      const top = topOf(shown);
      assert.equal(top.v, v, `up=${up} v=${v}`);
      assert.ok(top.cos > 1 - 1e-5);
      for (const d of dirs) {
        const a = faceToward(shown, d), b = faceToward(shown, [-d[0], -d[1], -d[2]]);
        assert.equal(a + b, 7, `up=${up} v=${v}: 마주 보는 면 ${a}+${b}`);
      }
      assert.ok(sameRot(shown, restQuat(v, yaw), 1e-5), `up=${up} v=${v}: restQuat 와 다름`);
    }
  }
});

test('restQuat: 눈 v 가 위, yaw 는 세로축 회전', () => {
  for (let v = 1; v <= 6; v++) {
    for (const yaw of [0, 0.3, -1.2, Math.PI, -Math.PI / 2, 2.5]) {
      const q = restQuat(v, yaw);
      const top = topOf(q);
      assert.equal(top.v, v); assert.ok(top.cos > 1 - 1e-12);
      const ry = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
      assert.ok(sameRot(q, qmul(ry, restQuat(v, 0)), 1e-12));
    }
    assert.ok(sameRot(restQuat(v, 0), restQuat(v, 2 * Math.PI), 1e-12));
  }
  assert.ok(sameRot(restQuat(1, 0), [0, 0, 0, 1]));
});

test('freeSpot: 비어 있으면 그대로, 아니면 가까운 첫 빈자리(항상 유효)', () => {
  const prefer = { x: 1.234, z: -2.5, yaw: 0.7 };
  assert.deepEqual(freeSpot([], prefer), prefer);
  assert.deepEqual(freeSpot([{ x: -3, z: 3 }], prefer), prefer);
  // 막혀 있으면 다른 자리. 조건을 지키고, yaw 는 그대로
  const others = [{ x: 1.5, z: -2.0 }];
  const s = freeSpot(others, prefer);
  assert.notDeepEqual(s, prefer);
  assert.equal(s.yaw, 0.7);
  assert.ok(Math.abs(s.x) <= LIMIT && Math.abs(s.z) <= LIMIT);
  assert.ok(Math.hypot(s.x - 1.5, s.z + 2) >= GAP);
  assert.ok(Math.hypot(s.x - prefer.x, s.z - prefer.z) < 2.0, '가까운 곳');
  assert.deepEqual(freeSpot(others, prefer), s, '결정적');
  // 무작위 4개가 있어도 늘 빈자리
  const rnd = prng(42);
  for (let t = 0; t < 3000; t++) {
    const os = [];
    while (os.length < 4) {
      const o = { x: (rnd() * 2 - 1) * 4, z: (rnd() * 2 - 1) * 4 };
      if (os.every((p) => Math.hypot(p.x - o.x, p.z - o.z) >= GAP)) os.push(o);
    }
    const pf = { x: os[0].x + 0.3, z: os[0].z, yaw: 0 };
    const r = freeSpot(os, pf);
    assert.ok(Math.abs(r.x) <= LIMIT && Math.abs(r.z) <= LIMIT);
    for (const o of os) assert.ok(Math.hypot(o.x - r.x, o.z - r.z) >= GAP, `try ${t}`);
  }
});

test('소스: Math.random·Date 없음, 삼각함수는 restQuat(그리기)·yaw 숫자에만, import 없음', () => {
  const code = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/Math\.random/.test(code)); assert.ok(!/\bDate\b/.test(code)); assert.ok(!/performance/.test(code));
  assert.ok(!/^\s*import\s/m.test(code));
  const trig = code.match(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|log|pow|hypot|cbrt)\b/g) || [];
  assert.deepEqual(trig.sort(), ['Math.atan2', 'Math.cos', 'Math.sin']);
  const yawFn = code.slice(code.indexOf('function yawOf'), code.indexOf('export function restQuat'));
  assert.ok(yawFn.includes('Math.atan2'));
  const rq = code.slice(code.indexOf('export function restQuat'), code.indexOf('export function faceFix'));
  assert.ok(rq.includes('Math.sin') && rq.includes('Math.cos'));
  assert.ok(!/\*\*/.test(code), '거듭제곱 연산자 없음');
});

test('속도: 한 번 계산 평균 30ms 이하, frames:false 는 5ms 이하(node)', () => {
  const cases = [];
  for (let s = 0; s < 200; s++) cases.push([(s * 40503 + 9) >>> 0, ALL.slice(0, 1 + (s % 5))]);
  for (const [s, th] of cases.slice(0, 20)) simulateRoll(s, th);   // 데우기
  let t0 = process.hrtime.bigint();
  for (const [s, th] of cases) simulateRoll(s, th);
  const full = Number(process.hrtime.bigint() - t0) / 1e6 / cases.length;
  t0 = process.hrtime.bigint();
  for (const [s, th] of cases) simulateRoll(s, th, { frames: false });
  const lite = Number(process.hrtime.bigint() - t0) / 1e6 / cases.length;
  let t5 = process.hrtime.bigint();
  for (let s = 0; s < 100; s++) simulateRoll(s, ALL, { frames: false });
  const five = Number(process.hrtime.bigint() - t5) / 1e6 / 100;
  assert.ok(full <= 30, `frames 평균 ${full.toFixed(2)}ms`);
  assert.ok(lite <= 5, `frames:false 평균 ${lite.toFixed(2)}ms`);
  assert.ok(five <= 5, `5개 frames:false 평균 ${five.toFixed(2)}ms`);
  console.log(`# 속도: frames ${full.toFixed(2)}ms, frames:false ${lite.toFixed(2)}ms, 5개 frames:false ${five.toFixed(2)}ms`);
});
