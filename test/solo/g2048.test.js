// 2048 엔진 시험: 규칙 + 결정성 + golden (docs/solo/PLAN.md 9절). golden 을 일부러 다시 기록하려면 UPDATE_GOLDEN=1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import eng from '../../shared/solo/g2048.js';
import { createRun } from '../../shared/solo/run.js';
import { makeRng } from '../../shared/solo/rng.js';

const GOLDEN = new URL('./golden/g2048.json', import.meta.url);

// 칸 값을 직접 정해 둔 판 (방향 시험용)
function board(rows, seed = 1) {
  const s = eng.create(seed);
  s.cells = rows.flat();
  s.ids = s.cells.map((v, i) => (v ? i + 1 : 0));
  s.nid = 100;
  s.sc = 0;
  s.dead = false;
  return s;
}
const sumCells = (s) => s.cells.reduce((a, b) => a + b, 0);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

test('시작: 타일 2개, 각각 2 또는 4, 점수 0', () => {
  for (let seed = 0; seed < 50; seed++) {
    const s = eng.create(seed);
    const t = s.cells.filter((v) => v);
    assert.equal(t.length, 2);
    assert.ok(t.every((v) => v === 2 || v === 4));
    assert.equal(eng.score(s), 0);
    assert.equal(eng.over(s), false);
    assert.equal(s.ev.length, 0);
  }
});

test('새 타일은 약 90% 가 2', () => {
  const rng = makeRng(7);
  let two = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const s = eng.create(rng.next());
    for (const v of s.cells) if (v) { n++; if (v === 2) two++; }
  }
  assert.ok(two / n > 0.85 && two / n < 0.95, String(two / n));
});

test('한 줄 [2,2,2,2] 를 왼쪽으로 밀면 [4,4,0,0]: 한 번에 한 번만 합침', () => {
  const s = board([[2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.equal(eng.input(s, 3), true);
  assert.deepEqual(s.cells.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(s.sc, 8);
});

test('[4,2,2,0] 왼쪽 → [4,4,0,0] (새로 합친 4 가 앞의 4 와 또 합쳐지지 않음)', () => {
  const s = board([[4, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 3);
  assert.deepEqual(s.cells.slice(0, 4), [4, 4, 0, 0]);
});

test('[2,2,4,0] 오른쪽 → [0,0,4,4], [2,0,2,4] 왼쪽 → [4,4,0,0]', () => {
  let s = board([[2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 1);
  assert.deepEqual(s.cells.slice(0, 4), [0, 0, 4, 4]);
  s = board([[2, 0, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 3);
  assert.deepEqual(s.cells.slice(0, 4), [4, 4, 0, 0]);
});

test('위·아래 방향', () => {
  let s = board([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 0);
  assert.equal(s.cells[0], 4); assert.equal(s.cells[4], 4);
  s = board([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 2);
  assert.equal(s.cells[12], 4); assert.equal(s.cells[8], 4);
});

test('안 바뀌는 방향은 false, 상태·난수 그대로', () => {
  const s = board([[2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const before = JSON.stringify(s);
  assert.equal(eng.input(s, 3), false);
  assert.equal(eng.input(s, 0), false);
  assert.equal(JSON.stringify(s), before);
});

test('잘못된 입력 값은 false', () => {
  const s = eng.create(3);
  for (const v of [-1, 4, 1.5, NaN, '1', null]) assert.equal(eng.input(s, v), false);
});

test('움직이면 타일이 하나 늘고(합치기 제외) 합계가 2 또는 4 늘어난다', () => {
  const s = board([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2]]);
  const before = sumCells(s);
  assert.equal(eng.input(s, 1), true);
  const d = sumCells(s) - before;
  assert.ok(d === 2 || d === 4);
});

test('끝 판정: 가득 차고 합칠 곳이 없으면 over', () => {
  const t = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 0, 4]]);
  assert.equal(eng.over(t), false);
  assert.equal(eng.input(t, 1), true); // 새 타일이 생겨 가득 참
  assert.equal(t.cells.filter((v) => v === 0).length, 0);
  const full = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  full.dead = true;
  assert.equal(eng.over(full), true);
  assert.equal(eng.input(full, 0), false);
});

test('합칠 곳이 남은 가득 찬 판은 끝이 아니다', () => {
  const s = board([[2, 2, 4, 8], [4, 8, 16, 32], [8, 16, 32, 64], [16, 32, 64, 128]]);
  assert.equal(eng.input(s, 3), true);
  assert.equal(s.dead, false);
});

test('2048 첫 달성에 win 사건이 한 번', () => {
  const s = board([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 3);
  assert.equal(s.ev.filter((e) => e.k === 'win').length, 1);
  assert.equal(s.won, true);
  assert.equal(s.cells[0], 2048);
  assert.equal(s.sc, 2048);
  // 두 번째 2048 은 알리지 않는다
  s.cells = [2048, 1024, 1024, 0, ...new Array(12).fill(0)];
  s.ids = s.cells.map((v, i) => (v ? i + 1 : 0));
  s.ev.length = 0;
  eng.input(s, 3);
  assert.equal(s.ev.filter((e) => e.k === 'win').length, 0);
});

test('사건: 움직임·합침·새 타일·점수', () => {
  const s = board([[0, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  eng.input(s, 3);
  const k = s.ev.map((e) => e.k);
  assert.deepEqual(k, ['mv', 'mv', 'mg', 'sc', 'sp']);
  const mg = s.ev.find((e) => e.k === 'mg');
  assert.equal(mg.v, 4); assert.equal(mg.at, 0);
  assert.equal(s.ids[0], mg.id);
});

test('타일 번호는 겹치지 않는다', () => {
  const run = createRun(eng, 9);
  const r = makeRng(5);
  for (let i = 0; i < 300; i++) {
    run.input(r.int(4));
    const ids = run.state.ids.filter((x) => x);
    assert.equal(new Set(ids).size, ids.length);
  }
});

// 무작위 입력으로 한 판 (끝날 때까지 또는 n 번)
function play(seed, ops) {
  const run = createRun(eng, seed);
  for (const v of ops) { if (run.over()) break; run.input(v); }
  return run;
}
const opsFor = (seed, n) => { const r = makeRng(seed ^ 0x9e3779b9); return Array.from({ length: n }, () => r.int(4)); };

test('같은 seed·같은 입력 = 같은 상태', () => {
  for (const seed of [1, 42, 0xffffffff]) {
    const ops = opsFor(seed, 500);
    const a = play(seed, ops), b = play(seed, ops);
    assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
    assert.equal(a.score(), b.score());
  }
});

test('기록(ops)을 feed 로 다시 돌려도 같다', () => {
  const a = createRun(eng, 77);
  const r = makeRng(3);
  for (let i = 0; i < 400 && !a.over(); i++) a.input(r.int(4));
  const ops = a.take();
  const b = createRun(eng, 77, { record: false });
  const res = b.feed(ops);
  assert.equal(res.ok, true);
  assert.equal(JSON.stringify(a.state.cells), JSON.stringify(b.state.cells));
  assert.equal(a.score(), b.score());
});

test('무작위로 끝까지 두면 끝나고, 합계 = 2의 배수이며 점수는 늘기만 한다', () => {
  const run = createRun(eng, 5);
  const r = makeRng(11);
  let last = 0, guard = 0;
  while (!run.over() && guard++ < 20000) {
    run.input(r.int(4));
    assert.ok(run.score() >= last);
    last = run.score();
  }
  assert.equal(run.over(), true);
  assert.ok(run.state.cells.every((v) => v === 0 || (v & (v - 1)) === 0));
});

test('golden: 기록해 둔 무작위 입력 500개의 점수·판', () => {
  const seeds = [1, 20260101, 4000000000];
  const now = seeds.map((seed) => {
    const ops = opsFor(seed, 500);
    const run = play(seed, ops);
    return { seed, ops: ops.length, score: run.score(), cells: run.state.cells.slice(), over: run.over(), hash: hash(JSON.stringify(run.state.cells) + '|' + run.score()) };
  });
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(new URL('./golden/', import.meta.url), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
  }
  assert.deepEqual(now, JSON.parse(readFileSync(GOLDEN, 'utf8')));
});
