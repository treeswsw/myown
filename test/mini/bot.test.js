// 미니게임 봇전 (docs/mini/PLAN.md 5절): 사람 1명 + 봇 자리, 바로 시작, {a:'bot'} 검사, 난이도별 코인.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { mnMsg, lastErr } from './lib.js';
import { COIN_RULES } from '../../shared/coin/rules.js';

function newHub() {
  const clock = new FakeClock();
  return { clock, hub: createHub({ store: createStore(), rng: seeded(3), now: clock.now, timers: clock, mini: 'on' }) };
}
async function botRoom({ level = 'mid', side = 0, game = 'connect4' } = {}) {
  const { clock, hub } = newHub();
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  hub.sessions.get('ann1').user.coins = 0;
  await a.send({ t: 'create', mode: 'mini', game, vs: 'bot', level, side });
  return { clock, hub, a, b, coins: () => hub.sessions.get('ann1').user.coins };
}
const human = (r) => r.a.state.seats.indexOf('ann1');

// 사람이 세로 한 줄로 이긴다 (봇은 다른 칸에 둔다)
async function humanWins(r) {
  for (let i = 0; i < 4 && r.a.state.phase === 'play'; i++) {
    if (r.a.state.turn === '~bot') await mnMsg(r.a, { a: 'bot', move: { x: 1 } });
    await mnMsg(r.a, { a: 'move', move: { x: 0 } });
  }
}

test('봇전: 만들면 바로 시작, 사람 1명 + 봇 자리, 이름은 난이도', async () => {
  const r = await botRoom({ level: 'hard' });
  assert.equal(r.a.state.phase, 'play');
  assert.deepEqual(r.a.state.seats, ['ann1', '~bot']);
  assert.equal(r.a.state.names[1], '봇 (고급)');
  assert.equal(r.a.state.bot.level, 'hard');
  const r2 = await botRoom({ side: 1 });
  assert.deepEqual(r2.a.state.seats, ['~bot', 'ann1']);
  assert.equal(r2.a.state.turn, '~bot');
});

test('봇전: 이기면 난이도별 코인 (초급 2 / 중급 3 / 고급 10), 지면 완주 코인 (0 / 1 / 1)', async () => {
  for (const [level, n] of [['easy', 2], ['mid', 3], ['hard', 10]]) {
    assert.equal(COIN_RULES[`minibot_${level}`].finish + COIN_RULES[`minibot_${level}`].win, n);
    const r = await botRoom({ level });
    await humanWins(r);
    assert.equal(r.a.state.phase, 'end');
    assert.equal(r.a.state.result.winner, human(r));
    assert.equal(r.coins(), n, level);
    assert.equal(r.a.state.wait.result.rows.length, 1);
    assert.equal(r.a.state.wait.result.gain.ann1, n);
  }
  const r = await botRoom({ level: 'hard' });
  await mnMsg(r.a, { a: 'move', move: { x: 0 } });
  for (let i = 0; i < 3; i++) {
    await mnMsg(r.a, { a: 'bot', move: { x: 1 } });
    await mnMsg(r.a, { a: 'move', move: { x: 2 } });
  }
  await mnMsg(r.a, { a: 'bot', move: { x: 1 } });
  assert.equal(r.a.state.phase, 'end');
  assert.notEqual(r.a.state.result.winner, human(r));
  assert.equal(r.coins(), 1); // 고급 짐 = 완주 1
});

test('봇전: 기권은 코인 없음', async () => {
  const r = await botRoom();
  await mnMsg(r.a, { a: 'resign' });
  assert.equal(r.a.state.phase, 'end');
  assert.equal(r.coins(), 0);
});

test('봇전: 남의 bot 요청·사람 차례의 bot 요청·불법 수는 거절', async () => {
  const r = await botRoom();
  await r.b.send({ t: 'join', code: r.a.state.code });
  assert.equal(r.a.state.turn, 'ann1');
  await mnMsg(r.a, { a: 'bot', move: { x: 1 } }); // 사람 차례
  assert.equal(lastErr(r.a).code, 'mn_turn');
  await mnMsg(r.a, { a: 'move', move: { x: 0 } });
  await mnMsg(r.b, { a: 'bot', move: { x: 1 } }); // 다른 사람
  assert.equal(lastErr(r.b).code, 'mn_bot');
  await mnMsg(r.a, { a: 'bot', move: { x: 99 } }); // 불법 수
  assert.equal(lastErr(r.a).code, 'mn_move');
  assert.equal(r.a.state.turn, '~bot');
  await mnMsg(r.a, { a: 'move', move: { x: 3 } }); // 봇 차례에 사람 move
  assert.equal(lastErr(r.a).code, 'mn_turn');
  await mnMsg(r.a, { a: 'bot', move: { x: 1 } });
  assert.equal(r.a.state.turn, 'ann1');
});

test('친구 방에서는 bot 요청 거절, 봇전은 베팅 불가', async () => {
  const { hub } = newHub();
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'ann1' });
  await b.send({ t: 'login', id: 'bob1' });
  await a.send({ t: 'create', mode: 'mini', game: 'connect4' });
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'start' });
  await mnMsg(a, { a: 'bot', move: { x: 1 } });
  assert.equal(lastErr(a).code, 'mn_bot');
  const r = await botRoom();
  await mnMsg(r.a, { a: 'resign' }); // 결과(대기) 상태에서만 pick 가능
  await r.a.send({ t: 'pick', patch: { bet: 1 } });
  assert.equal(lastErr(r.a).code, 'mn_bot');
});
