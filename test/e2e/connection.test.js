import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, sleep } from './bot.js';
import { startServer, seatAll, uid } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const GRACE = Number(process.env.E2E_GRACE_MS || 1500);

test('connection: reconnect mid-hand resumes the same seat', { timeout: 60000 }, async () => {
  const { bots, code } = await seatAll(server, 'holdem', 3, { autoplay: false });
  const [h, b, c] = bots;
  h.start();
  await h.waitFor(() => h.state.phase === 'playing', 3000, 'start');
  await b.waitFor(() => b.state.phase === 'playing' && b.state.myCards, 3000, 'b sees its hand');
  const seat = b.state.players.find((p) => p.id === b.id).seat;
  const holes = b.state.myCards;
  assert.equal(holes.length, 2);
  b.terminate(); // abrupt disconnect
  await h.waitFor(() => h.state.players.find((p) => p.id === b.id).connected === false, 3000, 'disconnect seen');
  const b2 = new Bot(server.url, b.id, { autoplay: false });
  await b2.connect();
  await b2.login();
  await b2.waitFor(() => b2.state && b2.state.code === code, 3000, 'room restored on login');
  assert.equal(b2.state.players.find((p) => p.id === b.id).seat, seat);
  assert.deepEqual(b2.state.myCards, holes, 'same hole cards after resume');
  await h.waitFor(() => h.state.players.find((p) => p.id === b.id).connected === true, 3000, 'reconnected seen');
  assert.equal(h.state.players.length, 3);
  [h, b2, c].forEach((x) => x.close());
});

test('connection: second login with same id takes over', { timeout: 30000 }, async () => {
  const { bots, code } = await seatAll(server, 'bluff', 2, { autoplay: false });
  const [h, b] = bots;
  const b2 = new Bot(server.url, b.id.toUpperCase(), { autoplay: false }); // case-insensitive id
  await b2.connect();
  await b2.login();
  await b.waitFor(() => b.closed, 3000, 'old connection closed');
  await b2.waitFor(() => b2.state && b2.state.code === code, 3000, 'new connection owns the seat');
  assert.equal(h.state.players.length, 2, 'no duplicate seat');
  // new connection can act
  h.start();
  await b2.waitFor(() => b2.state.phase === 'playing', 3000, 'start seen by taker');
  assert.ok(Array.isArray(b2.state.myHand));
  [h, b2].forEach((x) => x.close());
});

test('connection: host leaving passes host to earliest joiner', { timeout: 30000 }, async () => {
  const { bots } = await seatAll(server, 'holdem', 3, { autoplay: false });
  const [h, b, c] = bots;
  assert.equal(h.state.hostId, h.id);
  h.leave();
  await b.waitFor(() => b.state.hostId === b.id && b.state.players.length === 2, 3000, 'host passed');
  await c.waitFor(() => c.state.hostId === b.id, 3000, 'same host for all');
  await h.waitFor(() => h.state === null, 3000, 'leaver gets room:null');
  // new host can start; old host cannot
  h.errors.length = 0;
  h.start();
  b.start();
  await b.waitFor(() => b.state.phase === 'playing', 3000, 'new host starts');
  await h.waitFor(() => h.errors.length >= 1, 3000, 'old host start rejected');
  [h, b, c].forEach((x) => x.close());
});

test('connection: leaving returns table stack to bank', { timeout: 30000 }, async () => {
  const { bots } = await seatAll(server, 'holdem', 2, { autoplay: false });
  const [h, b] = bots;
  h.start();
  await h.waitFor(() => h.state.phase === 'playing', 3000, 'start');
  b.leave();
  await sleep(300);
  const chk = new Bot(server.url, b.id, { autoplay: false });
  await chk.connect();
  const me = await chk.login();
  assert.ok(!chk.state, 'left player is not back in the room');
  assert.ok(me.bank > 0 && me.bank <= 10000 + 5000, `bank ${me.bank}`);
  [h, b, chk].forEach((x) => x.close());
});

test('connection: empty room is cleaned up', { timeout: 60000 }, async () => {
  const { bots, code } = await seatAll(server, 'bluff', 2, { autoplay: false });
  bots.forEach((x) => x.leave());
  await sleep(200);
  const j = new Bot(server.url, uid('late'), { autoplay: false });
  await j.connect();
  await j.login();
  await sleep(GRACE + 1500);
  j.send({ t: 'join', code });
  await sleep(300);
  assert.ok(j.errors.length >= 1 && !j.state, 'room should be gone after the empty timeout');
  [...bots, j].forEach((x) => x.close());
});

test('connection: lobby disconnect + reconnect keeps room before grace', { timeout: 30000 }, async () => {
  const { bots, code } = await seatAll(server, 'bluff', 2, { autoplay: false });
  const [h, b] = bots;
  b.terminate();
  await sleep(100);
  const b2 = new Bot(server.url, b.id, { autoplay: false });
  await b2.connect();
  await b2.login();
  await b2.waitFor(() => b2.state && b2.state.code === code, 3000, 'back in lobby room');
  [h, b2].forEach((x) => x.close());
});
