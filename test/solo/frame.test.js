// 혼자 놀기 화면 틀의 판 진행·순위 칸 순수 부분 (docs/solo/PLAN.md 8절 N). DOM 없이 가짜 엔진으로.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlow, countOf, mmss, resultTitleOf, coinLineOf, CHUNK, STEP_S, SEND_MS, MAX_STEPS_PER_FRAME } from '../../client/src/solo/flow.js';
import { rankModel, fmtDate } from '../../client/src/solo/rank.js';
import { createRun } from '../../shared/solo/run.js';
import { turnEngine, tickEngine } from './lib.js';

const mk = (engine, seed = 7) => {
  const sent = [];
  let t = 0;
  const flow = createFlow(engine, seed, { send: (m) => sent.push(m), now: () => t });
  return { flow, sent, at: (ms) => { t = ms; } };
};

test('입력 조각: 1초가 지나야 보내고, n 은 보낸 칸 수', () => {
  const { flow, sent, at } = mk(turnEngine);
  assert.equal(flow.input(1), true);
  assert.equal(flow.input(2), true);
  at(SEND_MS - 1);
  assert.equal(flow.flush(), false);
  assert.equal(sent.length, 0);
  at(SEND_MS);
  assert.equal(flow.flush(), true);
  assert.deepEqual(sent, [{ t: 'so', a: 'in', n: 0, ops: [1, 2] }]);
  flow.input(3);
  at(SEND_MS * 2);
  flow.flush();
  assert.deepEqual(sent[1], { t: 'so', a: 'in', n: 2, ops: [3] });
  assert.equal(flow.flush(true), false, '보낼 것이 없으면 안 보낸다');
});

test('안 되는 입력은 false 이고 기록에 안 남는다', () => {
  const { flow, sent } = mk(turnEngine);
  assert.equal(flow.input(9), false);
  assert.equal(flow.flush(true), false);
  assert.equal(sent.length, 0);
});

test('서버가 같은 기록으로 같은 점수를 센다 (화면 진행 == run.feed)', () => {
  const { flow, sent } = mk(tickEngine, 99);
  for (let i = 0; i < 200; i++) {
    flow.advance(STEP_S + 1e-9);
    if (i % 17 === 0) flow.input(1 + (i % 5));
  }
  flow.flush(true);
  const server = createRun(tickEngine, 99, { record: false });
  for (const m of sent) assert.equal(server.feed(m.ops).ok, true);
  assert.equal(server.score(), flow.score());
  assert.equal(JSON.stringify(server.state.steps), JSON.stringify(flow.state.steps));
});

test('512칸이 넘으면 나눠 보내고 n 이 이어진다', () => {
  const t2 = mk(tickEngine, 3);
  for (let i = 0; i < 600; i++) { t2.flow.input(1); t2.flow.advance(STEP_S + 1e-9); }
  t2.flow.flush(true);
  assert.ok(t2.sent.length >= 2);
  let n = 0;
  for (const m of t2.sent) { assert.equal(m.n, n); assert.ok(m.ops.length <= CHUNK); n += m.ops.length; }
  assert.equal(n, t2.flow.sentN);
});

test('걸음 누적기: 한 화면에 최대 5걸음, 막히면 안 돈다, 걸음 없는 종목은 안 돈다', () => {
  const a = mk(tickEngine);
  a.flow.advance(0.2);
  assert.equal(a.flow.run.ticks, MAX_STEPS_PER_FRAME);
  a.flow.advance(STEP_S * 0.5);
  assert.equal(a.flow.run.ticks, MAX_STEPS_PER_FRAME, '1걸음이 안 차면 안 돈다');
  a.flow.advance(STEP_S * 0.6);
  assert.equal(a.flow.run.ticks, MAX_STEPS_PER_FRAME + 1);
  a.flow.lock(true);
  a.flow.advance(1);
  assert.equal(a.flow.run.ticks, MAX_STEPS_PER_FRAME + 1);
  assert.equal(a.flow.input(1), false, '막히면 입력도 안 된다');
  const b = mk(turnEngine);
  b.flow.advance(1);
  assert.equal(b.flow.run.ticks, 0);
});

test('잠든 세계(state.asleep)는 걸음을 멈춘다', () => {
  const eng = { ...tickEngine, step(s) { s.steps++; if (s.steps >= 3) s.asleep = true; } };
  const { flow } = mk(eng);
  flow.advance(0.2);
  assert.equal(flow.run.ticks, 3);
  flow.advance(0.2);
  assert.equal(flow.run.ticks, 3);
});

test('so_sync: 서버가 받은 칸 수부터 다시 보낸다', () => {
  const { flow, sent, at } = mk(turnEngine, 5);
  flow.input(1); flow.input(2); flow.input(3);
  at(SEND_MS);
  flow.flush();
  assert.equal(flow.sentN, 3);
  sent.length = 0;
  assert.equal(flow.resync(1), true);
  assert.deepEqual(sent, [{ t: 'so', a: 'in', n: 1, ops: [2, 3] }]);
  assert.equal(flow.sentN, 3);
  assert.equal(flow.resync(9), false, '보낸 것보다 많이 받았다는 답은 무시');
});

test('방 상태의 n 이 모자라고 한참 지났으면 다시 보낸다', () => {
  const { flow, sent, at } = mk(turnEngine, 5);
  flow.input(1); flow.input(2);
  at(SEND_MS);
  flow.flush();
  sent.length = 0;
  at(SEND_MS + 100);
  assert.equal(flow.check(0), false, '방금 보냈으면 기다린다');
  at(SEND_MS + 3500);
  assert.equal(flow.check(0), true);
  assert.deepEqual(sent[0], { t: 'so', a: 'in', n: 0, ops: [1, 2] });
  assert.equal(flow.check(2), false, '다 받았으면 아무것도 안 한다');
});

test('끝 판정: over 면 입력이 막힌다', () => {
  const { flow } = mk(turnEngine, 2);
  let guard = 0;
  while (!flow.over() && guard++ < 100) flow.input(3);
  assert.equal(flow.over(), true);
  assert.equal(flow.input(1), false);
});

test('카운트다운 숫자와 시간 글자', () => {
  assert.equal(countOf(3000), 3);
  assert.equal(countOf(2999), 3);
  assert.equal(countOf(2000), 2);
  assert.equal(countOf(1), 1);
  assert.equal(countOf(0), 0);
  assert.equal(countOf(-50), 0);
  assert.equal(countOf(9000), 3);
  assert.equal(mmss(120000), '2:00');
  assert.equal(mmss(59001), '1:00');
  assert.equal(mmss(-5), '0:00');
});

test('결과 제목·부제·코인 줄', () => {
  const last = { game: 'apple', score: 87, reason: 'time', best: 87, fresh: true, rank: { all: 3, wk: 1 }, coin: { want: 2, gain: 2, capped: false }, today: 34, cap: 60 };
  assert.deepEqual(resultTitleOf('사과 게임', last), { title: '사과 게임 · 87점', sub: '새 기록! · 전체 3위 · 이번 주 1위' });
  assert.deepEqual(resultTitleOf('사과 게임', { ...last, fresh: false, best: 112, rank: { all: 5, wk: null } }), { title: '사과 게임 · 87점', sub: '최고 112점 · 전체 5위' });
  assert.equal(resultTitleOf('x', null), null);
  assert.equal(coinLineOf(last), '오늘 코인 34/60');
  assert.equal(coinLineOf({ ...last, today: 60, coin: { want: 3, gain: 0, capped: true } }), '오늘 코인 다 받음 (60/60)');
  assert.equal(coinLineOf({}), '');
});

test('순위 칸 모델: 상위 5 + 내 순위, 더 보기, 탭', () => {
  const top = Array.from({ length: 20 }, (_, i) => ({ name: `p${i + 1}`, score: 1000 - i, at: Date.UTC(2026, 10, 14, 5) }));
  const data = { all: { top, mine: { rank: 12, score: 989, at: Date.UTC(2026, 10, 14), n: 4 } }, wk: { top: [], mine: { rank: null, score: 0, at: 0, n: 0 } } };
  const m = rankModel(data, 'all', 5);
  assert.equal(m.rows.length, 5);
  assert.equal(m.rows[0].rank, 1);
  assert.equal(m.rows[0].date, '11.14');
  assert.equal(m.more, true);
  assert.equal(m.mineOut, true, '내 순위가 보이는 줄 밖이면 따로');
  assert.equal(m.mine.rank, 12);
  const open = rankModel(data, 'all', 5, true);
  assert.equal(open.rows.length, 20);
  assert.equal(open.more, false);
  assert.equal(open.rows[11].me, true);
  assert.equal(open.mineOut, false);
  const wk = rankModel(data, 'wk', 5);
  assert.equal(wk.empty, true);
  assert.equal(wk.mine, null);
  assert.equal(rankModel(null, 'all').loading, true);
  assert.equal(fmtDate(0), '');
  assert.equal(fmtDate(Date.UTC(2026, 10, 13, 16)), '11.14', '한국 시간 기준 날짜');
});
