// 수박 게임 엔진 시험 (docs/solo/PLAN.md 7·9절): 벽·겹침·합치기·잠들기·끝 판정·결정성·속도·golden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import suika, { W, H, LINE, RADII, TRI } from '../../shared/solo/suika.js';
import { createRun } from '../../shared/solo/run.js';
import { makeRng } from '../../shared/solo/rng.js';

const GOLDEN = new URL('./golden/suika.json', import.meta.url);
const snap = (st) => JSON.stringify({ ...st, ev: 0 });
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0; return h; }
const fruit = (st, k, x, y, age = 99) => st.fruits.push({ id: st.nextId++, k, x, y, vx: 0, vy: 0, a: 0, age });

// 화면 틀이 하는 일: 잠들지 않은 동안 걸음.
function settle(run, max = 3000) { let k = 0; while (!run.state.asleep && !run.over() && k++ < max) run.step(); return k; }
function drops(seed, count) {
  const run = createRun(suika, seed);
  const r = makeRng(seed ^ 0xabc);
  for (let i = 0; i < count && !run.over(); i++) {
    while (run.state.cool > 0) run.step();
    run.input(r.int(361));
    for (let k = 0; k < 40; k++) run.step();
  }
  settle(run);
  return run;
}
// 무작위 입력으로 정해진 길이까지 돌린 판 (golden·결정성용)
function scripted(seed, n) {
  const run = createRun(suika, seed);
  const r = makeRng(seed ^ 0x77);
  for (let i = 0; i < n && !run.over(); i++) {
    run.input(r.int(361));
    for (let k = r.int(50) + 20; k > 0 && !run.over(); k--) if (!run.state.asleep) run.step();
  }
  return run;
}
function maxOverlap(f) {
  let m = 0;
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
    const d = Math.sqrt((f[i].x - f[j].x) * (f[i].x - f[j].x) + (f[i].y - f[j].y) * (f[i].y - f[j].y));
    m = Math.max(m, RADII[f[i].k] + RADII[f[j].k] - d);
  }
  return m;
}

test('엔진 표 모양', () => {
  assert.equal(suika.tick, true);
  assert.equal(suika.maxV, 360);
  assert.ok(suika.coin.every((v, i, a) => i === 0 || v > a[i - 1]));
  assert.equal(RADII.length, 11);
  assert.equal(TRI.length, 11);
});

test('처음: 잠든 빈 통, 다음 과일 둘은 단계 0~4', () => {
  const s = suika.create(7);
  assert.equal(s.asleep, true);
  assert.equal(s.fruits.length, 0);
  assert.ok(s.cur >= 0 && s.cur < 5 && s.next >= 0 && s.next < 5);
});

test('떨어뜨리면 깨어나고, 30걸음은 다음 입력 거절, 벽 안으로 자름', () => {
  const run = createRun(suika, 5);
  assert.equal(run.input(0), true);
  assert.equal(run.state.asleep, false);
  assert.equal(run.state.fruits[0].x, RADII[run.state.fruits[0].k]);
  assert.equal(run.input(100), false);
  for (let i = 0; i < 29; i++) run.step();
  assert.equal(run.input(100), false);
  run.step();
  assert.equal(run.input(360), true);
  assert.equal(run.state.fruits[1].x, W - RADII[run.state.fruits[1].k]);
});

test('무작위로 계속 떨어뜨려도 벽 밖으로 안 나가고, 잠들 때 겹침이 1 미만이다(더미가 낮을 때)', () => {
  let checked = 0;
  for (const seed of [11, 12, 13, 14]) {
    const run = createRun(suika, seed);
    const r = makeRng(seed);
    for (let n = 0; n < 200 && !run.over(); n++) {
      while (run.state.cool > 0) run.step();
      run.input(r.int(361));
      settle(run);
      if (run.over()) break;
      const f = run.state.fruits;
      for (const p of f) {
        const rad = RADII[p.k];
        assert.ok(p.x >= rad - 1e-6 && p.x <= W - rad + 1e-6 && p.y <= H - rad + 1e-6, `벽 밖 ${p.x},${p.y}`);
      }
      // 꽉 찬 통 한가운데 끼인 과일은 조금 겹칠 수 있다 — 더미 윗끝이 아직 낮을 때만 엄격하게
      if (Math.min(...f.map((p) => p.y - RADII[p.k])) > 200) { assert.ok(maxOverlap(f) < 1, `겹침 ${maxOverlap(f)} (seed ${seed}, drop ${n})`); checked++; }
    }
  }
  assert.ok(checked > 50);
});

test('쌓인 더미도 겹침 1 미만', () => {
  const run = createRun(suika, 3);
  const st = run.state;
  for (let i = 0; i < 16; i++) fruit(st, i % 2 ? 1 : 3, 40 + (i % 6) * 55, 200 + Math.floor(i / 6) * 50, 0);
  st.asleep = false;
  settle(run);
  assert.ok(maxOverlap(st.fruits) < 1);
});

test('같은 단계가 닿으면 다음 단계로 합치고 점수는 새 단계의 삼각수', () => {
  const run = createRun(suika, 9);
  const st = run.state;
  fruit(st, 2, 150, H - 23);
  fruit(st, 2, 190, H - 23);
  st.asleep = false;
  run.step();
  assert.equal(st.fruits.length, 1);
  assert.equal(st.fruits[0].k, 3);
  assert.equal(run.score(), TRI[3]);
  assert.equal(st.ev[0].k, 'merge');
});

test('수박 둘은 사라지고, 다른 단계는 합쳐지지 않는다', () => {
  const run = createRun(suika, 9);
  const st = run.state;
  fruit(st, 10, 100, H - 100);
  fruit(st, 10, 290, H - 100);
  st.asleep = false;
  for (let i = 0; i < 40 && st.fruits.length > 0; i++) run.step();
  assert.equal(st.fruits.length, 0);
  const r2 = createRun(suika, 9);
  fruit(r2.state, 1, 100, H - 17);
  fruit(r2.state, 2, 130, H - 23);
  r2.state.asleep = false;
  settle(r2);
  assert.equal(r2.state.fruits.length, 2);
  assert.equal(r2.score(), 0);
});

test('잠들면 걸음이 멈추고, 입력이 깨운다', () => {
  const run = createRun(suika, 4);
  run.input(180);
  settle(run);
  assert.equal(run.state.asleep, true);
  const steps = run.state.steps;
  run.step();
  assert.equal(run.state.steps, steps);
  assert.equal(run.input(60), true);
  assert.equal(run.state.asleep, false);
});

test('끝 판정: 선 위에 쌓이면 over, 끝난 뒤 입력은 false', () => {
  const run = createRun(suika, 21);
  let guard = 0;
  while (!run.over() && guard++ < 20000) {
    if (run.state.cool === 0) run.input(180);
    run.step();
  }
  assert.equal(run.over(), true);
  const top = Math.min(...run.state.fruits.map((p) => p.y - RADII[p.k]));
  assert.ok(top < LINE + 1);
  assert.equal(run.input(10), false);
});

test('서버식(feed)으로 다시 돌려도 같은 상태', () => {
  const a = scripted(31, 40);
  const b = createRun(suika, 31, { record: false });
  assert.equal(b.feed(a.take()).ok, true);
  assert.equal(snap(b.state), snap(a.state));
  assert.equal(b.score(), a.score());
});

test('같은 기록을 두 번 돌리면 완전히 같은 상태', () => {
  assert.equal(JSON.stringify(scripted(77, 60).state), JSON.stringify(scripted(77, 60).state));
});

test('속도: 걸음당 평균이 가볍다 (1만 걸음 환산 0.5초 안, 더미가 높을 때 포함)', () => {
  // 진짜 판처럼: 잠들면 다음 과일을 떨어뜨려 깨운다. 선 넘어 끝나면 새 판.
  const r = makeRng(5);
  let run = createRun(suika, 1, { record: false });
  let steps = 0, seed = 1;
  const t0 = process.hrtime.bigint();
  while (steps < 10000) {
    if (run.over()) run = createRun(suika, ++seed, { record: false });
    if (run.state.asleep || run.state.cool === 0) run.input(r.int(361));
    run.step(); steps++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `${ms.toFixed(0)}ms`);
});

test('golden: 기록해 둔 한 판과 같은 결과', () => {
  const seed = 20261114;
  const run = scripted(seed, 120);
  const out = { seed, ops: run.take(), score: run.score(), steps: run.state.steps, hash: hash(snap(run.state)) };
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) { writeFileSync(GOLDEN, JSON.stringify(out)); return; }
  const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const re = createRun(suika, g.seed, { record: false });
  assert.equal(re.feed(g.ops).ok, true);
  assert.equal(re.score(), g.score);
  assert.equal(re.state.steps, g.steps);
  assert.equal(hash(snap(re.state)), g.hash);
});
