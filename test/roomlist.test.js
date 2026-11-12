import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { FakeClock, client, seeded } from './helpers.js';

function setup() {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(41), now: clock.now, timers: clock });
  return { clock, hub };
}
async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  return c;
}
const lists = (c) => c.sock.msgs.filter((m) => m.t === 'rooms');

test('list is sent right after login, with exactly the public fields', async () => {
  const { hub, clock } = setup();
  const a = await login(hub, 'Host1');
  assert.deepEqual(lists(a), [{ t: 'rooms', list: [] }]);
  await a.send({ t: 'create', mode: 'holdem' });
  clock.advance(500);
  const b = await login(hub, 'bob1');
  const [{ list }] = lists(b);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['code', 'count', 'hostName', 'max', 'mode', 'phase']);
  assert.deepEqual(list[0], { code: a.state.code, mode: 'holdem', hostName: 'Host1', count: 1, max: 6, phase: 'lobby' });
});

test('players inside a room never receive the list; it returns when they leave', async () => {
  const { hub, clock } = setup();
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'bluff' });
  const before = lists(a).length;
  clock.advance(500);
  const b = await login(hub, 'bob1');
  await b.send({ t: 'join', code: a.state.code });
  clock.advance(5000);
  assert.equal(lists(a).length, before);
  assert.equal(lists(b).length, 1, 'only the login one');
  await b.send({ t: 'leave' });
  const last = lists(b).at(-1).list;
  assert.equal(last[0].count, 1);
  assert.equal(lists(b).length, 2);
});

test('changes are coalesced to one broadcast per 500 ms and only sent when the list changed', async () => {
  const { hub, clock } = setup();
  const watcher = await login(hub, 'watch1');
  const n = () => lists(watcher).length;
  const a = await login(hub, 'ann1');
  const b = await login(hub, 'bob1');
  await a.send({ t: 'create', mode: 'holdem' });
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'mode', mode: 'bluff' });
  assert.equal(n(), 1, 'nothing yet: coalescing');
  clock.advance(499);
  assert.equal(n(), 1);
  clock.advance(1);
  assert.equal(n(), 2);
  assert.deepEqual(lists(watcher).at(-1).list, [{ code: a.state.code, mode: 'bluff', hostName: 'ann1', count: 2, max: 4, phase: 'lobby' }]);
  await a.send({ t: 'start' });
  clock.advance(500);
  assert.equal(n(), 3);
  assert.equal(lists(watcher).at(-1).list[0].phase, 'playing');
  // identical list: no repeat broadcast
  await a.send({ t: 'chat', text: 'hi' });
  clock.advance(5000);
  assert.equal(n(), 3);
  // ann and bob are in a room, so they got no lists beyond their login one
  assert.equal(lists(a).length, 1);
  assert.equal(lists(b).length, 1);
});

test('empty rooms awaiting GC are not listed; deleted rooms disappear', async () => {
  const { hub, clock } = setup();
  const watcher = await login(hub, 'watch1');
  const a = await login(hub, 'ann1');
  await a.send({ t: 'create', mode: 'holdem' });
  clock.advance(500);
  assert.equal(lists(watcher).at(-1).list.length, 1);
  await a.send({ t: 'leave' });
  clock.advance(500);
  assert.equal(lists(watcher).at(-1).list.length, 0);
  assert.equal(hub.rooms.size, 1, 'room itself still exists until GC');
  clock.advance(60_000);
  assert.equal(hub.rooms.size, 0);
});

test('full rooms are listed with count === max and refuse joins', async () => {
  const { hub, clock } = setup();
  const host = await login(hub, 'ann1');
  await host.send({ t: 'create', mode: 'bluff' });
  for (const n of ['bb11', 'cc11', 'dd11']) {
    const c = await login(hub, n);
    await c.send({ t: 'join', code: host.state.code });
  }
  clock.advance(500);
  const late = await login(hub, 'ee11');
  const [room] = lists(late).at(-1).list;
  assert.equal(room.count, room.max);
  await late.send({ t: 'join', code: room.code });
  assert.equal(late.sock.last('error').msg, '방이 가득 찼습니다.');
});

test('joining a running room makes a spectator for the next hand/game (both modes)', async () => {
  const { hub, clock } = setup();
  for (const mode of ['holdem', 'bluff']) {
    const a = await login(hub, mode + '_a');
    const b = await login(hub, mode + '_b');
    await a.send({ t: 'create', mode });
    await b.send({ t: 'join', code: a.state.code });
    await a.send({ t: 'start' });
    clock.advance(500);
    const late = await login(hub, mode + '_c');
    const entry = lists(late).at(-1).list.find((r) => r.code === a.state.code);
    assert.equal(entry.phase, 'playing');
    await late.send({ t: 'join', code: entry.code });
    const me = late.state.players.find((p) => p.id === mode + '_c');
    assert.equal(me.spectating, true);
    assert.equal(late.state.phase, 'playing');
    if (mode === 'holdem') assert.equal(late.state.myCards, null);
    else assert.deepEqual(late.state.myHand, []);
  }
});
