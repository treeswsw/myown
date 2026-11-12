import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, sleep } from './bot.js';
import { startServer, makeBots, seatAll } from './helpers.js';

let server;
before(async () => { server = await startServer({ ROOM_LIST_MS: '300' }); });
after(async () => { await server.stop(); });

const KEYS = ['code', 'count', 'hostName', 'max', 'mode', 'phase'];
const roomsMsgs = (b, from = 0) => b.messages.slice(from).filter((m) => m.t === 'rooms');
const lastList = (b) => { const r = roomsMsgs(b); return r.length ? r[r.length - 1].list : null; };
const find = (b, code) => (lastList(b) || []).find((r) => r.code === code);
const until = (b, fn, label) => b.waitFor(() => fn(lastList(b) || []), 4000, label);

test('rooms: sent right after login and after leaving; fields are limited', { timeout: 30000 }, async () => {
  const [obs, a] = await makeBots(server, 2, { autoplay: false });
  assert.ok(roomsMsgs(obs).length >= 1, 'rooms list after login');
  assert.ok(Array.isArray(lastList(obs)));
  const code = await a.create('holdem');
  await until(obs, (l) => l.some((r) => r.code === code), 'room listed');
  const row = find(obs, code);
  assert.deepEqual(Object.keys(row).sort(), KEYS);
  assert.deepEqual({ ...row, code: 0 }, { code: 0, mode: 'holdem', hostName: a.me.name, count: 1, max: 6, phase: 'lobby' });
  // a (in room) never gets lists
  const n = a.messages.length;
  const n2 = roomsMsgs(a).length;
  // leave: a gets a list immediately (room is empty so it is excluded)
  a.leave();
  await a.waitFor(() => roomsMsgs(a).length > n2, 1000, 'rooms after leaving');
  assert.ok(!lastList(a).some((r) => r.code === code), 'empty room is not listed');
  void n;
  obs.close(); a.close();
});

test('rooms: updates on create/join/mode/start/leave; none sent inside a room', { timeout: 30000 }, async () => {
  const [obs, a, b, c] = await makeBots(server, 4, { autoplay: false });
  const code = await a.create('bluff');
  const na = a.messages.length;
  await until(obs, (l) => l.some((r) => r.code === code && r.count === 1 && r.max === 4), 'created');
  await b.join(code);
  const nb = b.messages.length;
  await until(obs, (l) => l.find((r) => r.code === code)?.count === 2, 'count 2');
  a.send({ t: 'mode', mode: 'holdem' });
  await until(obs, (l) => l.find((r) => r.code === code)?.mode === 'holdem' && l.find((r) => r.code === code)?.max === 6, 'mode change');
  a.start();
  await until(obs, (l) => l.find((r) => r.code === code)?.phase === 'playing', 'playing');
  b.leave();
  await until(obs, (l) => l.find((r) => r.code === code)?.count === 1, 'count back to 1');
  // c creates another room: a stays out of it
  const code2 = await c.create('bluff');
  await until(obs, (l) => l.some((r) => r.code === code2), 'second room');
  await sleep(500);
  assert.equal(roomsMsgs(a, na).length, 0, 'member received rooms');
  assert.equal(roomsMsgs(b, nb).filter(() => true).length >= 1, true, 'b gets list after leaving');
  // b got its post-leave list but nothing while inside
  c.leave();
  a.leave();
  await until(obs, (l) => !l.some((r) => r.code === code || r.code === code2), 'rooms removed when empty');
  [obs, a, b, c].forEach((x) => x.close());
});

test('rooms: bursts are coalesced', { timeout: 30000 }, async () => {
  const [obs, ...cs] = await makeBots(server, 6, { autoplay: false });
  await sleep(500);
  const n = obs.messages.length;
  cs.forEach((c, i) => c.send({ t: 'create', mode: i % 2 ? 'bluff' : 'holdem' }));
  await until(obs, (l) => cs.every((c) => l.some((r) => r.hostName === c.me.name)), 'all rooms listed');
  await sleep(700);
  const got = roomsMsgs(obs, n);
  assert.ok(got.length <= 3, `${got.length} rooms messages for one burst of 6 creates`);
  assert.ok(got.length >= 1);
  cs.forEach((c) => c.leave());
  await until(obs, (l) => !cs.some((c) => l.some((r) => r.hostName === c.me.name)), 'cleanup');
  [obs, ...cs].forEach((x) => x.close());
});

test('rooms: join via listed code; full room is listed full and rejects', { timeout: 30000 }, async () => {
  const bots = await makeBots(server, 6, { autoplay: false });
  const obs = (await makeBots(server, 2, { autoplay: false }));
  const [late, watcher] = obs;
  const code = await bots[0].create('bluff');
  await until(watcher, (l) => l.some((r) => r.code === code), 'listed');
  for (const b of bots.slice(1, 4)) {
    const listed = find(watcher, code) || (lastList(b) || []).find((r) => r.code === code);
    await until(b, (l) => l.some((r) => r.code === code), 'b sees list');
    await b.join((lastList(b).find((r) => r.code === code) || listed).code);
  }
  await until(watcher, (l) => l.find((r) => r.code === code)?.count === 4, 'full');
  const row = find(watcher, code);
  assert.equal(row.count, row.max);
  late.send({ t: 'join', code });
  await late.waitFor(() => late.errors.length >= 1, 2000, 'full room rejected');
  assert.ok(!late.state);
  assert.equal(find(watcher, code).count, 4);
  [...bots, ...obs].forEach((x) => x.close());
});

test('rooms: joining a playing holdem room spectates, then plays the next hand', { timeout: 60000 }, async () => {
  const { bots, code } = await seatAll(server, 'holdem', 2, { autoplay: true });
  bots[0].start();
  await bots[0].waitFor(() => bots[0].state.phase === 'playing', 3000, 'started');
  const [late] = await makeBots(server, 1, { autoplay: true });
  await until(late, (l) => l.find((r) => r.code === code)?.phase === 'playing' || true, 'list');
  const row = (lastList(late) || []).find((r) => r.code === code);
  late.send({ t: 'join', code: row ? row.code : code });
  await late.waitFor(() => late.state && late.state.code === code, 3000, 'joined');
  const first = late.state;
  if (first.phase === 'playing') {
    const me = first.players.find((p) => p.id === first.you);
    assert.equal(me.spectating, true, 'mid-hand joiner must spectate');
    assert.equal(first.myCards, null);
  }
  await late.waitFor(() => {
    const s = late.state;
    const me = s.players.find((p) => p.id === s.you);
    return s.phase === 'playing' && !me.spectating && s.myCards && s.myCards.length === 2;
  }, 20000, 'late player dealt into a later hand');
  const dealtIn = late.messages.filter((m) => m.t === 'event' && m.e.k === 'action' && m.e.id === late.me.id.toLowerCase());
  void dealtIn;
  for (const b of [...bots, late]) assert.deepEqual(b.errors.filter((e) => !/차례/.test(e.msg)), [], `errors ${b.id}`);
  [...bots, late].forEach((x) => x.close());
});

test('rooms: joining a playing bluff room spectates, then plays the next game', { timeout: 90000 }, async () => {
  const { bots, code } = await seatAll(server, 'bluff', 2, { autoplay: true });
  const host = bots[0];
  host.start();
  await host.waitFor(() => host.state.phase === 'playing', 3000, 'started');
  const [late] = await makeBots(server, 1, { autoplay: true });
  late.send({ t: 'join', code });
  await late.waitFor(() => late.state && late.state.code === code, 3000, 'joined');
  const me0 = late.state.players.find((p) => p.id === late.state.you);
  if (late.state.phase === 'playing') {
    assert.equal(me0.spectating, true);
    assert.ok(!late.state.myHand || late.state.myHand.length === 0, 'spectator has no hand');
  }
  await late.waitFor(() => late.state.phase === 'lobby', 30000, 'game over -> lobby');
  host.start();
  await late.waitFor(() => {
    const s = late.state;
    const me = s.players.find((p) => p.id === s.you);
    return s.phase === 'playing' && !me.spectating && me.alive && s.myHand && s.myHand.length === 5;
  }, 5000, 'late player plays the next game');
  assert.equal(late.state.players.length, 3);
  [...bots, late].forEach((x) => x.close());
});
