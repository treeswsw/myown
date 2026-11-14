// 진행기 시험 (docs/solo/PLAN.md 1-4): 화면식(input/step/take)으로 만든 기록을 서버식(feed)으로 다시 돌리면 같다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, STEP_MAX } from '../../shared/solo/run.js';
import { makeRng } from '../../shared/solo/rng.js';
import { turnEngine, tickEngine } from './lib.js';

const SEED = 123456789;
const snap = (run) => JSON.stringify({ ...run.state, ev: 0 });

// 화면이 하는 일을 흉내: 무작위로 입력과 걸음을 섞고, 가끔 take 한다.
function play(engine, seed, rounds, maxStepRun = 200) {
  const run = createRun(engine, seed);
  const r = makeRng(seed ^ 0x5555);
  const sent = [];
  for (let i = 0; i < rounds && !run.over(); i++) {
    if (engine.tick && r.int(3) > 0) for (let k = r.int(maxStepRun); k >= 0; k--) run.step();
    else run.input(r.int(engine.maxV + 1));
    if (r.int(5) === 0) sent.push(...run.take());
  }
  sent.push(...run.take());
  return { run, sent };
}

test('rng: 같은 seed 같은 수, 범위, 정수만', () => {
  const a = makeRng(7), b = makeRng(7);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) { const v = r.int(9); assert.ok(Number.isInteger(v) && v >= 0 && v < 9); }
  assert.notEqual(makeRng(1).next(), makeRng(2).next());
  assert.equal(makeRng(2 ** 32 + 5).s, 5); // uint32 로 자른다
});

for (const engine of [turnEngine, tickEngine]) {
  test(`${engine.id}: 화면식 기록을 feed 로 다시 돌리면 상태·점수가 같다`, () => {
    const { run, sent } = play(engine, SEED, 400);
    const srv = createRun(engine, SEED, { record: false });
    const res = srv.feed(sent);
    assert.equal(res.ok, true);
    assert.deepEqual(res.left, []);
    assert.equal(srv.score(), run.score());
    assert.equal(snap(srv), snap(run));
    assert.equal(srv.ticks, run.ticks);
  });
}

test('안 되는 입력은 false 이고 기록에도 상태에도 남지 않는다', () => {
  const run = createRun(turnEngine, SEED);
  assert.equal(run.input(4), false);
  assert.equal(run.input(-1), false);
  assert.equal(run.input(1.5), false);
  assert.equal(run.input(999), false); // maxV 밖
  assert.equal(run.n, 0);
  assert.deepEqual(run.take(), []);
  assert.equal(run.score(), 0);
  assert.equal(run.input(2), true);
  assert.equal(run.n, 1);
});

test('걸음 없는 종목에서 step 은 아무것도 안 하고, feed 에 음수가 오면 ok:false', () => {
  const run = createRun(turnEngine, SEED);
  assert.equal(run.step(), false);
  assert.equal(run.n, 0);
  assert.equal(createRun(turnEngine, SEED).feed([1, -3]).ok, false);
});

test('연속 걸음은 음수 하나로 합치고, 입력이 끼면 나뉜다', () => {
  const run = createRun(tickEngine, SEED);
  for (let i = 0; i < 5; i++) run.step();
  run.input(7);
  for (let i = 0; i < 3; i++) run.step();
  assert.deepEqual(run.take(), [-5, 7, -3]);
  assert.equal(run.n, 3);
});

test('걸음 칸은 600 에서 나뉜다', () => {
  const run = createRun(tickEngine, SEED);
  for (let i = 0; i < STEP_MAX * 2 + 7; i++) run.step();
  assert.deepEqual(run.take(), [-STEP_MAX, -STEP_MAX, -7]);
});

test('이미 꺼낸 칸에는 걸음을 더 합치지 않는다(서버가 받은 칸과 같게)', () => {
  const run = createRun(tickEngine, SEED);
  for (let i = 0; i < 4; i++) run.step();
  assert.deepEqual(run.take(), [-4]);
  run.step();
  run.step();
  assert.deepEqual(run.take(), [-2]);
  assert.equal(run.n, 2);
});

test('resend: 서버가 받은 칸 수 뒤부터 전부 다시', () => {
  const run = createRun(tickEngine, SEED);
  run.step(); run.input(3); run.step();
  assert.deepEqual(run.take(), [-1, 3, -1]);
  assert.deepEqual(run.take(), []);
  assert.deepEqual(run.resend(1), [3, -1]);
  assert.deepEqual(run.resend(3), []);
  assert.deepEqual(run.resend(99), []);
  assert.deepEqual(run.resend(0), [-1, 3, -1]);
});

test('budget: 나눠서 돌려도 한 번에 돌린 것과 같고, 못 돌린 나머지를 돌려준다', () => {
  const { sent } = play(tickEngine, SEED, 300, 500);
  const whole = createRun(tickEngine, SEED, { record: false });
  assert.equal(whole.feed(sent).ok, true);
  const part = createRun(tickEngine, SEED, { record: false });
  let ops = sent, loops = 0, total = 0;
  while (ops.length) {
    const res = part.feed(ops, 240);
    assert.equal(res.ok, true);
    assert.ok(res.used <= 240);
    total += res.used;
    ops = res.left;
    assert.ok(++loops < 10000);
  }
  assert.equal(total, whole.ticks);
  assert.equal(part.ticks, whole.ticks);
  assert.equal(snap(part), snap(whole));
});

test('budget 0: 걸음은 못 돌리고 전부 left, 입력만 있으면 그대로 적용', () => {
  const run = createRun(tickEngine, SEED, { record: false });
  assert.deepEqual(run.feed([-3, 5], 0), { ok: true, used: 0, left: [-3, 5] });
  const r2 = run.feed([5, 6], 0);
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.left, []);
});

test('잘못된 기록은 ok:false (정수 아님·입력 거절·걸음 칸 너무 큼)', () => {
  assert.equal(createRun(turnEngine, SEED).feed([1, 4]).ok, false);
  assert.equal(createRun(turnEngine, SEED).feed([1.5]).ok, false);
  assert.equal(createRun(tickEngine, SEED).feed([-(STEP_MAX + 1)]).ok, false);
  assert.equal(createRun(tickEngine, SEED).feed([0]).ok, false); // 엔진이 거절
  assert.equal(createRun(tickEngine, SEED).feed(['3']).ok, false);
});

test('record:false 는 기록을 쌓지 않는다', () => {
  const run = createRun(turnEngine, SEED, { record: false });
  run.input(1); run.input(2);
  assert.deepEqual(run.take(), []);
});

test('연출 사건 ev 는 입력마다 비워진다', () => {
  const run = createRun(turnEngine, SEED);
  run.input(1);
  assert.equal(run.state.ev.length, 1);
  run.input(2);
  assert.equal(run.state.ev.length, 1);
  run.input(4); // 거절돼도 비워진다
  assert.equal(run.state.ev.length, 0);
});
