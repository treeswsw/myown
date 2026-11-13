// 갱스껄 이음매 시험: 포커 서버(hub) 안에 갱스껄 방이 끼어드는 자리만 본다 (GDD 9·10·11절).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

function setup(gsk = 'on') {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(11), now: clock.now, timers: clock, ...(gsk ? { gsk } : {}) });
  return { clock, hub };
}
async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  return c;
}

test('me carries the gsk switch (off by default)', async () => {
  for (const [opt, want] of [[null, 'off'], ['off', 'off'], ['test', 'test'], ['on', 'on']]) {
    const { hub } = setup(opt);
    const a = await login(hub, 'ann1');
    assert.equal(a.sock.last('me').gsk, want);
  }
});

test('GSK=off: no room, no trace; poker still works', async () => {
  const { hub } = setup('off');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'gsk' });
  const err = a.sock.last('error');
  assert.equal(err.code, 'gk_off');
  assert.equal(err.msg, '갱스껄은 지금 열려 있지 않습니다.');
  assert.equal(a.state, null);
  assert.equal(hub.rooms.size, 0);
  await a.send({ t: 'create', mode: 'holdem' });
  assert.equal(a.state.mode, 'holdem');
});

test('GSK=on: create, join, start, gk request; other games are refused inside', async () => {
  const { hub } = setup('on');
  const [a, b, c] = [await login(hub, 'ann1'), await login(hub, 'bob1'), await login(hub, 'cat1')];
  await a.send({ t: 'create', mode: 'gsk' });
  assert.equal(a.state.mode, 'gsk');
  const code = a.state.code;
  await b.send({ t: 'join', code });
  await c.send({ t: 'join', code });
  assert.equal(hub.roomList().find((r) => r.code === code).max, 6);
  await a.send({ t: 'start' });
  assert.notEqual(a.state.phase, 'lobby');
  await a.send({ t: 'gk', a: 'bid', n: 1 }); // reaches the room (a wrong-turn answer is fine); never "unknown request"
  const e = a.sock.last('error');
  if (e) assert.match(e.code ?? '', /^gk_/);
  for (const m of [{ t: 'act', a: 'fold' }, { t: 'play', cards: [0] }, { t: 'liar' }, { t: 'mode', mode: 'bluff' }, { t: 'lg', a: 'rank' }, { t: 'yt', a: 'x' }, { t: 'dr', a: 'x' }]) {
    await a.send(m);
    assert.equal(a.sock.last('error').code, 'gk_now', m.t);
  }
});

test('gk outside a gsk room, and mode switch to gsk from poker, are refused', async () => {
  const { hub } = setup('on');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'holdem' });
  await a.send({ t: 'gk', a: 'pass' });
  assert.equal(a.sock.last('error').msg, '알 수 없는 요청입니다.');
  await a.send({ t: 'mode', mode: 'gsk' });
  assert.equal(a.sock.last('error').msg, '갱스껄은 방을 새로 만들어 주세요.');
});

test('protocol: gk envelope is checked, gsk is a known mode', () => {
  assert.equal(parseMessage('{"t":"create","mode":"gsk"}').ok, true);
  assert.equal(parseMessage('{"t":"gk","a":"pass"}').ok, true);
  assert.equal(parseMessage('{"t":"gk"}').ok, false);
  assert.equal(parseMessage('{"t":"gk","a":""}').ok, false);
  assert.equal(parseMessage(`{"t":"gk","a":"${'x'.repeat(21)}"}`).ok, false);
});
