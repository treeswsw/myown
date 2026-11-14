// 사과 게임 엔진 시험 (docs/solo/PLAN.md 8절 G)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import apple, { COLS, ROWS, pack, unpack, measure } from '../../shared/solo/apple.js';
import { createRun } from '../../shared/solo/run.js';
import { makeRng } from '../../shared/solo/rng.js';

const GOLDEN = new URL('./golden/apple.json', import.meta.url);

test('create: 17×10, 숫자 1~9, 같은 seed 는 같은 판', () => {
  const a = apple.create(42), b = apple.create(42), c = apple.create(43);
  assert.equal(a.cells.length, COLS * ROWS);
  assert.ok(a.cells.every((n) => Number.isInteger(n) && n >= 1 && n <= 9));
  assert.deepEqual(a.cells, b.cells);
  assert.notDeepEqual(a.cells, c.cells);
  assert.equal(apple.maxV, pack(COLS - 1, ROWS - 1, COLS - 1, ROWS - 1));
});

test('입력 값 묶기/풀기 왕복', () => {
  const r = makeRng(5);
  for (let i = 0; i < 500; i++) {
    const x0 = r.int(COLS), x1 = r.int(COLS), y0 = r.int(ROWS), y1 = r.int(ROWS);
    assert.deepEqual(unpack(pack(x0, y0, x1, y1)), { x0, y0, x1, y1 });
  }
  assert.equal(pack(16, 9, 16, 9), apple.maxV);
});

test('합이 정확히 10 일 때만 지우고 개수만큼 점수', () => {
  const s = apple.create(1);
  s.cells.fill(9);
  s.cells[0] = 4; s.cells[1] = 6; // 합 10, 2개
  s.cells[COLS] = 3; s.cells[COLS + 1] = 3; s.cells[COLS + 2] = 4; // 합 10, 3개
  assert.equal(apple.input(s, pack(0, 0, 1, 0)), true);
  assert.equal(s.score, 2);
  assert.equal(s.cells[0], 0); assert.equal(s.cells[1], 0);
  assert.equal(s.ev.at(-1).k, 'clear');
  assert.equal(apple.input(s, pack(0, 1, 2, 1)), true);
  assert.equal(apple.score(s), 5);
  const before = JSON.stringify(s.cells);
  assert.equal(apple.input(s, pack(3, 0, 5, 0)), false);
  assert.equal(JSON.stringify(s.cells), before);
  assert.equal(s.score, 5);
});

test('빈 칸은 합에 안 들어가고 개수에도 안 센다', () => {
  const s = apple.create(1);
  s.cells.fill(9);
  s.cells[0] = 2; s.cells[1] = 0; s.cells[2] = 8;
  assert.deepEqual(measure(s.cells, 0, 0, 2, 0), { sum: 10, n: 2 });
  assert.equal(apple.input(s, pack(0, 0, 2, 0)), true);
  assert.equal(s.score, 2);
  assert.equal(apple.input(s, pack(0, 0, 2, 0)), false); // 다 비운 곳은 합 0
});

test('범위 밖·거꾸로 된 상자·정수 아님은 false', () => {
  const s = apple.create(1);
  const before = JSON.stringify(s);
  for (const v of [-1, apple.maxV + 1, 1.5, NaN, pack(5, 0, 3, 0), pack(0, 5, 0, 3)]) assert.equal(apple.input(s, v), false, String(v));
  assert.equal(JSON.stringify(s), before);
  assert.equal(apple.over(s), false);
});

// 무작위 상자를 눌러 보는 봇 (골든 기록용)
function randomPlay(seed) {
  const run = createRun(apple, seed);
  const r = makeRng(seed ^ 0xa11ce);
  for (let t = 0; t < 3000; t++) {
    const x0 = r.int(COLS), y0 = r.int(ROWS);
    const x1 = Math.min(COLS - 1, x0 + r.int(4)), y1 = Math.min(ROWS - 1, y0 + r.int(3));
    run.input(pack(x0, y0, x1, y1));
  }
  return run;
}

test('golden: 같은 seed·같은 입력 = 같은 점수와 판, feed 로 다시 돌려도 같다', () => {
  const run = randomPlay(20261114);
  const ops = run.take();
  const got = { seed: 20261114, ops, score: run.score(), cells: run.state.cells.join('') };
  assert.ok(got.score > 0 && ops.length > 5);
  if (!existsSync(GOLDEN)) { mkdirSync(new URL('./golden/', import.meta.url), { recursive: true }); writeFileSync(GOLDEN, JSON.stringify(got)); }
  const gold = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(got, gold);
  const srv = createRun(apple, gold.seed, { record: false });
  assert.equal(srv.feed(gold.ops).ok, true);
  assert.equal(srv.score(), gold.score);
  assert.equal(srv.state.cells.join(''), gold.cells);
});
