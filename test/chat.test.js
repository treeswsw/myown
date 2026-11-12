import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

async function setup(mode = 'holdem', names = ['ann1', 'bob1']) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(21), now: clock.now, timers: clock });
  const cs = [];
  for (const n of names) {
    const c = client(hub);
    await c.send({ t: 'login', id: n });
    cs.push(c);
  }
  await cs[0].send({ t: 'create', mode });
  for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
  return { clock, hub, cs };
}
const events = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);

test('validation: trims, strips control characters, 1-120 chars', () => {
  assert.deepEqual(parseMessage('{"t":"chat","text":"  안녕\\n\\t하세요\\u0000 "}').msg, { t: 'chat', text: '안녕하세요' });
  for (const text of ['', '   ', '\n\t', 'x'.repeat(121), 5, null, ['a']]) {
    assert.equal(parseMessage(JSON.stringify({ t: 'chat', text })).ok, false, JSON.stringify(text));
  }
  assert.equal(parseMessage(JSON.stringify({ t: 'chat', text: 'x'.repeat(120) })).ok, true);
  assert.equal(parseMessage(JSON.stringify({ t: 'chat', text: '가'.repeat(120) })).ok, true);
  assert.equal(parseMessage(JSON.stringify({ t: 'chat', text: '<b>hi</b>' })).msg.text, '<b>hi</b>');
});

test('chat needs a room and a login', async () => {
  const { hub, cs } = await setup();
  await cs[0].send({ t: 'leave' });
  await cs[0].send({ t: 'chat', text: 'hi' });
  assert.equal(cs[0].sock.last('error').msg, '방에 들어가 있지 않습니다.');
  const anon = client(hub);
  await anon.send({ t: 'chat', text: 'hi' });
  assert.equal(anon.sock.last('error').msg, '먼저 로그인하세요.');
});

test('broadcast reaches sender, players and spectators; no room state push', async () => {
  const { clock, hub, cs } = await setup();
  await cs[0].send({ t: 'start' });
  const spec = client(hub);
  await spec.send({ t: 'login', id: 'cat1' });
  await spec.send({ t: 'join', code: cs[0].state.code });
  assert.equal(spec.state.players.find((p) => p.id === 'cat1').spectating, true);
  const rooms = cs.map((c) => c.sock.msgs.filter((m) => m.t === 'room').length);
  await spec.send({ t: 'chat', text: ' 안녕 ' });
  for (const c of [...cs, spec]) {
    assert.deepEqual(events(c, 'chat'), [{ k: 'chat', id: 'cat1', name: 'cat1', text: '안녕', ts: clock.now() }]);
  }
  assert.deepEqual(cs.map((c) => c.sock.msgs.filter((m) => m.t === 'room').length), rooms);
});

test('chat does not reset the turn timer or change the game', async () => {
  const { clock, cs } = await setup();
  await cs[0].send({ t: 'start' });
  const before = cs[0].state;
  clock.advance(10000);
  await cs[1].send({ t: 'chat', text: 'gl' });
  clock.advance(19999);
  assert.equal(cs[0].state.turn, before.turn);
  clock.advance(1);
  assert.notEqual(cs[0].state.phase === 'playing' && cs[0].state.turnEndsAt, before.turnEndsAt);
  assert.equal(cs[0].state.phase, 'result', 'timeout fired at the original deadline');
});

test('rate limit: 1 per second and 5 per 10 seconds, per connection', async () => {
  const { clock, cs } = await setup();
  const sent = () => events(cs[1], 'chat').length;
  await cs[0].send({ t: 'chat', text: 'a' });
  await cs[0].send({ t: 'chat', text: 'b' });
  assert.equal(cs[0].sock.last('error').msg, '채팅을 너무 빨리 보내고 있습니다');
  assert.equal(sent(), 1);
  for (const x of ['c', 'd', 'e']) {
    clock.advance(1000);
    await cs[0].send({ t: 'chat', text: x });
  }
  assert.equal(sent(), 4);
  clock.advance(1000);
  await cs[0].send({ t: 'chat', text: 'f' }); // 5th within 5s
  assert.equal(sent(), 5);
  clock.advance(1000);
  await cs[0].send({ t: 'chat', text: 'g' }); // 6th within 6s: refused
  assert.equal(sent(), 5);
  assert.equal(cs[0].sock.last('error').msg, '채팅을 너무 빨리 보내고 있습니다');
  clock.advance(5000); // oldest ones leave the 10s window
  await cs[0].send({ t: 'chat', text: 'h' });
  assert.equal(sent(), 6);
  // another connection has its own budget
  await cs[1].send({ t: 'chat', text: 'mine' });
  assert.equal(sent(), 7);
});

test('chatLog is sent once on join and on reconnect; log keeps the last 30', async () => {
  const { clock, hub, cs } = await setup();
  assert.deepEqual(events(cs[0], 'chatLog'), [{ k: 'chatLog', items: [] }]);
  for (let i = 0; i < 35; i++) {
    clock.advance(2000);
    if (i % 5 === 0) clock.advance(10000);
    await cs[i % 2].send({ t: 'chat', text: 'm' + i });
  }
  const late = client(hub);
  await late.send({ t: 'login', id: 'cat1' });
  assert.equal(events(late, 'chatLog').length, 0);
  await late.send({ t: 'join', code: cs[0].state.code });
  const logs = events(late, 'chatLog');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].items.length, 30);
  assert.deepEqual(logs[0].items.map((x) => x.text), Array.from({ length: 30 }, (_, i) => 'm' + (i + 5)));
  assert.deepEqual(Object.keys(logs[0].items[0]).sort(), ['id', 'name', 'text', 'ts']);

  const again = client(hub);
  await again.send({ t: 'login', id: 'cat1' });
  const re = events(again, 'chatLog');
  assert.equal(re.length, 1);
  assert.equal(re[0].items.length, 30);
  assert.equal(events(cs[0], 'chatLog').length, 1, 'others do not get the log again');
});

test('chat is allowed in every phase', async () => {
  const { clock, cs } = await setup('bluff');
  await cs[0].send({ t: 'chat', text: 'lobby' });
  await cs[0].send({ t: 'start' });
  clock.advance(1000);
  await cs[1].send({ t: 'chat', text: 'playing' });
  assert.deepEqual(events(cs[0], 'chat').map((e) => e.text), ['lobby', 'playing']);
});
