// 혼자 놀기 정산 시험 (docs/solo/PLAN.md 2-4, 3절): 기록·코인·하루 상한·순위·공용 결과. 가짜 엔진(fake_tick: 입력 v 가 점수 +v).
import test from 'node:test';
import assert from 'node:assert/strict';
import { soloHub, attach, settled } from './hub.js';
import { tickEngine } from './lib.js';
import { dayOf, weekOf } from '../../shared/solo/coin.js';

const DAY = 86_400_000;

// 점수 문턱 [10, 20, 30] -> 코인 최대 3 (판당 최대는 rules.solo_fake_tick.finish)
function hubWith(opt = {}) {
  const h = soloHub({ first: 'fake_tick', ...opt });
  h.hub.soloEngines.fake_tick = { ...tickEngine, coin: [10, 20, 30] };
  return h;
}

// 방(c)에서 한 판: 시작 -> 입력 -> 그만하기. 돌려주는 값 = last
async function game(h, c, score) {
  if (c.state?.phase === 'lobby' || c.state?.phase === 'end') await c.send({ t: 'start' });
  await h.tick(3000);
  const p = attach(h, c);
  p.run.input(score);
  await p.flush();
  await p.end();
  return c.state.last;
}
async function open(h, id) {
  const c = await h.login(id);
  await c.send({ t: 'create', mode: 'solo' });
  return c;
}
const earn = (h, id, n, mode = 'solo') => h.hub.grant(h.hub.rooms.values().next().value, id, n, { mode, day: dayOf(h.clock.now()), win: true });

test('코인: 넘은 점수 문턱 수, 판당 최대(관리자 설정)로 자른다', async () => {
  const h = hubWith();
  const c = await open(h, 'ann1');
  assert.equal((await game(h, c, 9)).coin.gain, 0);
  assert.equal((await game(h, c, 10)).coin.gain, 1);
  assert.equal((await game(h, c, 25)).coin.gain, 2);
  h.rules.solo_fake_tick.finish = 2;
  const last = await game(h, c, 300);
  assert.deepEqual(last.coin, { want: 2, gain: 2, capped: false });
  assert.equal(c.sock.last('me').wallet.coins, 5, '지갑에 쌓인다 (0+1+2+2)');
});

test('하루 상한: 혼자 놀기 전체 합(59 받은 뒤 3 -> 1), 다른 모드 코인은 안 센다, 다음 날 초기화', async () => {
  const h = hubWith();
  const c = await open(h, 'ann1');
  earn(h, 'ann1', 40, 'puzzle'); // 퍼즐 코인은 혼자 놀기 상한에 안 들어간다
  earn(h, 'ann1', 59);
  const last = await game(h, c, 300); // 문턱 3개 -> 3코인을 원하지만 60 - 59 = 1
  assert.deepEqual(last.coin, { want: 3, gain: 1, capped: true });
  assert.equal(last.today, 60);
  assert.equal(last.cap, 60);
  const again = await game(h, c, 300);
  assert.deepEqual(again.coin, { want: 3, gain: 0, capped: true });
  assert.equal(again.best, 300, '상한에 닿아도 기록은 오른다');
  h.clock.advance(DAY);
  const next = await game(h, c, 300);
  assert.deepEqual(next.coin, { want: 3, gain: 3, capped: false });
  assert.equal(next.today, 3);
});

test('하루 상한은 관리자 설정(solo_cap)을 따른다', async () => {
  const h = hubWith({ cap: 2 });
  const c = await open(h, 'ann1');
  assert.equal((await game(h, c, 300)).coin.gain, 2);
  assert.equal((await game(h, c, 300)).coin.gain, 0);
  h.rules.solo_cap.finish = 0;
  h.clock.advance(DAY);
  assert.equal((await game(h, c, 300)).coin.gain, 0);
});

test('종목 코인 줄이 없으면(관리자 표에 없는 종목) 0코인이고 기록은 남는다', async () => {
  const h = hubWith();
  delete h.rules.solo_fake_tick;
  const c = await open(h, 'ann1');
  const last = await game(h, c, 300);
  assert.equal(last.coin.gain, 0);
  assert.equal(last.best, 300);
});

test('기록: 최고·판 수·새 기록, 같은 점수는 새 기록이 아니다, 주가 바뀌면 이번 주 최고가 다시 시작', async () => {
  const h = hubWith();
  const c = await open(h, 'ann1');
  const t0 = h.clock.now();
  const u = () => h.hub.sessions.get('ann1').user.solo.fake_tick;
  let last = await game(h, c, 150);
  assert.equal(last.fresh, true);
  assert.deepEqual(u(), { best: 150, at: t0 + 3000, n: 1, wk: weekOf(t0), wbest: 150, wat: t0 + 3000 });
  last = await game(h, c, 100);
  assert.equal(last.fresh, false);
  assert.equal(last.best, 150);
  assert.equal(u().n, 2);
  last = await game(h, c, 150);
  assert.equal(last.fresh, false, '같은 점수');
  assert.equal(u().at, t0 + 3000, '먼저 세운 시각이 남는다');
  h.clock.advance(7 * DAY);
  last = await game(h, c, 50);
  assert.equal(last.fresh, false);
  assert.equal(u().best, 150);
  assert.equal(u().wk, weekOf(h.clock.now()));
  assert.equal(u().wbest, 50, '이번 주 최고는 새 주에 다시 시작');
  assert.equal(last.rank.all, 1);
  assert.equal(last.rank.wk, 1);
  // 저장소에도 남았다
  await settled();
  assert.equal((await h.store.getOrCreate('ann1')).solo.fake_tick.n, 4);
});

test('0점은 기록·순위에 안 오르지만 판 수는 센다', async () => {
  const h = hubWith();
  const c = await open(h, 'ann1');
  if (c.state.phase === 'ready') await h.tick(3000);
  await c.send({ t: 'so', a: 'end', score: 0 });
  await settled();
  assert.equal(c.state.last.score, 0);
  assert.equal(c.state.last.fresh, false);
  assert.equal(c.state.last.rank.all, null);
  assert.equal(h.hub.sessions.get('ann1').user.solo.fake_tick.n, 1);
});

test('순위: 점수 내림차순, 같으면 먼저 세운 사람이 위 (last.rank 는 정산 때의 순위)', async () => {
  const h = hubWith();
  const a = await open(h, 'ann1');
  const b = await open(h, 'bob1');
  const c = await open(h, 'cat1');
  assert.equal((await game(h, a, 200)).rank.all, 1);
  assert.equal((await game(h, b, 300)).rank.all, 1);
  assert.equal((await game(h, c, 200)).rank.all, 3, '같은 점수는 먼저 세운 ann1 이 위');
  assert.equal((await game(h, a, 100)).rank.all, 2, '점수는 개인 최고만');
  assert.equal(a.state.last.rank.wk, 2);
});

test('공용 결과: 줄 하나(점수), 받은 코인이 gain 으로 간다, 구경꾼도 같은 결과를 본다', async () => {
  const h = hubWith();
  const a = await open(h, 'ann1');
  const b = await h.login('bob1');
  await b.send({ t: 'join', code: a.state.code });
  await game(h, a, 25);
  const r = a.state.wait.result;
  assert.deepEqual(r.rows, [{ id: 'ann1', name: 'ann1', rank: 1, score: 25 }]);
  assert.deepEqual(r.gain, { ann1: 2 });
  assert.equal(r.unit, 'coin');
  assert.deepEqual(b.state.wait.result, r);
  assert.equal(b.state.last.score, 25);
});

test('방 단계: 만들 때 대기실 -> ready -> play -> settle -> end (자동 시작)', async () => {
  const h = hubWith();
  const c = await open(h, 'ann1');
  await h.tick(3000);
  await c.send({ t: 'so', a: 'end', score: 0 });
  await settled();
  const phases = c.sock.msgs.filter((m) => m.t === 'room').map((m) => m.state?.phase);
  assert.deepEqual(phases.filter((x, i) => x !== phases[i - 1]), ['lobby', 'ready', 'play', 'settle', 'end']);
}
);
