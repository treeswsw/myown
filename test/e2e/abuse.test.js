import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Bot, sleep } from './bot.js';
import { startServer, uid, makeBots, seatAll } from './helpers.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const healthy = async () => {
  assert.ok(server.alive(), `server died:\n${server.log()}`);
  const b = new Bot(server.url, uid('hc'), { autoplay: false });
  await b.connect();
  await b.login();
  const code = await b.create('holdem');
  assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  b.close();
};

async function rawClient() {
  const ws = new WebSocket(server.url);
  const got = [];
  ws.on('message', (d) => { try { got.push(JSON.parse(d.toString())); } catch { got.push({ bad: true }); } });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return { ws, got };
}

test('abuse: pre-login junk', async () => {
  const { ws, got } = await rawClient();
  const junk = [
    '{not json', '', 'null', '123', '"str"', '[]', '[1,2]', '{}', '{"t":5}', '{"t":null}', '{"t":"nope"}',
    '{"t":"login"}', '{"t":"login","id":5}', '{"t":"login","id":null}', '{"t":"login","id":{"a":1}}', '{"t":"login","id":"a"}',
    '{"t":"login","id":"has space!"}', `{"t":"login","id":"${'x'.repeat(5000)}"}`, '{"t":"login","id":"<script>"}',
    '{"t":"create","mode":"holdem"}', '{"t":"join","code":"ABCD"}', '{"t":"start"}', '{"t":"act","a":"fold"}',
    '{"t":"play","cards":[0]}', '{"t":"liar"}', '{"t":"avatar","data":"x"}', '{"t":"emote","e":1}', '{"t":"__proto__"}',
    '{"__proto__":{"t":"login"}}', '{"t":"constructor"}',
  ];
  for (const j of junk) { ws.send(j); await sleep(8); }
  ws.send(Buffer.from([0, 1, 2, 255])); // binary frame
  await sleep(300);
  assert.ok(server.alive());
  assert.ok(!got.some((m) => m.t === 'me'), 'junk must not log in');
  assert.ok(got.every((m) => m.t === 'error' || m.bad === undefined), 'only error replies');
  ws.close();
  await healthy();
});

test('abuse: login id rules and avatar limits', async () => {
  const b = new Bot(server.url, 'x', { autoplay: false });
  await b.connect();
  for (const id of ['a', 'abcdefghijklmn', 'bad id', 'bad-id', ' ', '😀😀']) {
    b.errors.length = 0;
    b.send({ t: 'login', id });
    await sleep(60);
    assert.ok(b.errors.length >= 1, `id ${JSON.stringify(id)} should be rejected`);
    assert.equal(b.me, null);
  }
  b.send({ t: 'login', id: '  Tester_1 ' });
  await b.waitFor(() => b.me, 3000, 'me');
  assert.equal(b.me.id, 'tester_1');
  assert.equal(b.me.bank, 10000);
  // avatar abuse
  const before = JSON.stringify(b.me);
  for (const data of ['x', 5, null, 'data:image/png;base64,AAAA', 'data:image/jpeg;base64,' + 'A'.repeat(70 * 1024), 'data:image/jpeg;base64,' + 'A'.repeat(1.2e6), { a: 1 }]) {
    b.errors.length = 0;
    b.send({ t: 'avatar', data });
    await sleep(60);
    assert.ok(b.errors.length >= 1, `avatar ${String(data).slice(0, 30)} should be rejected`);
  }
  assert.equal(JSON.stringify(b.me), before);
  b.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' });
  await b.waitFor(() => b.me.avatar, 3000, 'avatar stored');
  b.close();
  await healthy();
});

test('abuse: room commands with bad args', async () => {
  const b = new Bot(server.url, uid('r'), { autoplay: false });
  await b.connect();
  await b.login();
  for (const msg of [
    { t: 'create' }, { t: 'create', mode: 'chess' }, { t: 'create', mode: 5 }, { t: 'create', mode: ['holdem'] },
    { t: 'join' }, { t: 'join', code: 5 }, { t: 'join', code: 'ZZZZ' }, { t: 'join', code: 'ab' }, { t: 'join', code: { x: 1 } },
    { t: 'start' }, { t: 'mode', mode: 'bluff' }, { t: 'leave' },
  ]) {
    b.errors.length = 0;
    const n = b.messages.length;
    b.send(msg);
    await sleep(40);
    const resp = b.messages.slice(n);
    assert.ok(resp.every((m) => m.t === 'error' || (m.t === 'room' && m.state === null)), `unexpected response to ${JSON.stringify(msg)}: ${JSON.stringify(resp)}`);
    assert.ok(!b.state, `no room should exist after ${JSON.stringify(msg)}`);
  }
  b.close();
  await healthy();
});

test('abuse: holdem actions - out of turn, bad amounts', { timeout: 60000 }, async () => {
  const { bots } = await seatAll(server, 'holdem', 3, { autoplay: false });
  const [h, b, c] = bots;
  // non-host start
  b.send({ t: 'start' });
  await sleep(100);
  assert.ok(b.errors.length >= 1, 'non-host start rejected');
  assert.equal(h.state.phase, 'lobby');
  // act before start
  c.send({ t: 'act', a: 'fold' });
  await sleep(60);
  assert.equal(h.state.phase, 'lobby');
  h.start();
  await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
  const byId = Object.fromEntries(bots.map((x) => [x.id, x]));
  const cur = () => byId[h.state.turn];
  const other = () => bots.find((x) => x !== cur());
  const turnBefore = h.state.turn;
  const potBefore = () => JSON.stringify([h.state.pot, h.state.players.map((p) => [p.stack, p.bet])]);
  const snap = potBefore();

  // out-of-turn
  for (const a of ['fold', 'check', 'call', 'allin']) { other().errors.length = 0; other().send({ t: 'act', a }); }
  other().send({ t: 'act', a: 'raise', amount: 400 });
  await sleep(150);
  assert.equal(h.state.turn, turnBefore);
  assert.equal(potBefore(), snap, 'out-of-turn actions must not change state');

  // bad act on own turn
  const me = cur();
  const bad = [
    { t: 'act' }, { t: 'act', a: 5 }, { t: 'act', a: 'bet' }, { t: 'act', a: ['fold'] }, { t: 'act', a: null },
    { t: 'act', a: 'raise' }, { t: 'act', a: 'raise', amount: -100 }, { t: 'act', a: 'raise', amount: 0 }, { t: 'act', a: 'raise', amount: NaN },
    { t: 'act', a: 'raise', amount: 'NaN' }, { t: 'act', a: 'raise', amount: '500' }, { t: 'act', a: 'raise', amount: 1e12 },
    { t: 'act', a: 'raise', amount: Infinity }, { t: 'act', a: 'raise', amount: 250.5 }, { t: 'act', a: 'raise', amount: 0.1 },
    { t: 'act', a: 'raise', amount: 1 }, { t: 'act', a: 'raise', amount: null }, { t: 'act', a: 'raise', amount: [300] }, { t: 'act', a: 'raise', amount: {} },
    { t: 'act', a: 'raise', amount: Number.MAX_SAFE_INTEGER }, { t: 'act', a: 'raise', amount: 1e308 }, { t: 'act', a: 'raise', amount: -0 },
    { t: 'play', cards: [0] }, { t: 'liar' },
  ];
  for (const m of bad) {
    me.errors.length = 0;
    const raw = JSON.stringify(m); // NaN/Infinity become null in JSON; also send raw literals below
    me.send(raw);
    await sleep(25);
    assert.equal(h.state.turn, turnBefore, `state advanced after ${raw}`);
  }
  // literal NaN / Infinity tokens (invalid JSON) and exponent forms
  for (const raw of ['{"t":"act","a":"raise","amount":NaN}', '{"t":"act","a":"raise","amount":Infinity}', '{"t":"act","a":"raise","amount":1e999}', '{"t":"act","a":"raise","amount":-1e999}', '{"t":"act","a":"raise","amount":4e2}0']) {
    me.send(raw);
    await sleep(25);
  }
  await sleep(100);
  assert.equal(potBefore(), snap, 'illegal raises must not change the pot/stacks');
  assert.ok(server.alive());

  // a legal raise at minRaiseTo still works afterwards
  const legal = h.state.minRaiseTo;
  assert.ok(legal > 0 && (cur() === me));
  me.send({ t: 'act', a: 'raise', amount: legal });
  await h.waitFor(() => h.state.turn !== turnBefore || h.state.pot !== undefined && potBefore() !== snap, 3000, 'legal raise accepted');
  assert.equal(h.state.players.find((p) => p.id === me.id).bet, legal);
  bots.forEach((x) => x.close());
  await healthy();
});

test('abuse: bluff plays - bad indexes, duplicates, liar rules', { timeout: 60000 }, async () => {
  const { bots } = await seatAll(server, 'bluff', 2, { autoplay: false });
  const [h] = bots;
  h.start();
  await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
  const byId = Object.fromEntries(bots.map((x) => [x.id, x]));
  const cur = () => byId[h.state.turn];
  const me = cur();
  const sig = () => JSON.stringify([h.state.turn, h.state.lastPlay, h.state.players.map((p) => p.handCount)]);
  const s0 = sig();
  const handLen = me.state.myHand.length;
  const bad = [
    { t: 'play' }, { t: 'play', cards: [] }, { t: 'play', cards: 'abc' }, { t: 'play', cards: 0 }, { t: 'play', cards: null },
    { t: 'play', cards: [-1] }, { t: 'play', cards: [handLen] }, { t: 'play', cards: [99] }, { t: 'play', cards: [0, 0] },
    { t: 'play', cards: [1.5] }, { t: 'play', cards: ['0'] }, { t: 'play', cards: [null] }, { t: 'play', cards: [0, 1, 2, 3] },
    { t: 'play', cards: [0, 1, 2, 3, 4] }, { t: 'play', cards: [[0]] }, { t: 'play', cards: [{}] }, { t: 'play', cards: [1e9] },
    { t: 'play', cards: Array(10000).fill(0) }, { t: 'play', cards: [0, 1, 1] },
    { t: 'liar' }, // first play of a round: nothing to call
    { t: 'act', a: 'fold' },
  ];
  for (const m of bad) {
    me.send(m);
    await sleep(25);
    assert.equal(sig(), s0, `state changed after ${JSON.stringify(m).slice(0, 80)}`);
  }
  const other = bots.find((x) => x !== me);
  other.send({ t: 'play', cards: [0] });
  other.send({ t: 'liar' });
  await sleep(100);
  assert.equal(sig(), s0, 'out-of-turn must be ignored');
  me.send({ t: 'play', cards: [0, 1] });
  await h.waitFor(() => h.state.lastPlay && h.state.lastPlay.count === 2, 3000, 'legal play accepted');
  bots.forEach((x) => x.close());
  await healthy();
});

test('abuse: full rooms', { timeout: 30000 }, async () => {
  for (const [mode, cap] of [['holdem', 6], ['bluff', 4]]) {
    const { bots, code } = await seatAll(server, mode, cap, { autoplay: false });
    const extra = await makeBots(server, 1, { autoplay: false });
    extra[0].send({ t: 'join', code });
    await sleep(150);
    assert.ok(extra[0].errors.length >= 1, `${mode}: ${cap + 1}th player must be rejected`);
    assert.ok(!extra[0].state, 'rejected player must not be in the room');
    assert.equal(bots[0].state.players.length, cap);
    // already in a room: second join of another room code
    bots[1].errors.length = 0;
    bots[1].send({ t: 'join', code });
    bots[1].send({ t: 'create', mode });
    await sleep(100);
    assert.equal(bots[0].state.players.length, cap, 'duplicate seat must not appear');
    [...bots, ...extra].forEach((x) => x.close());
  }
  await healthy();
});

test('abuse: mode change/start only by host and only in lobby', { timeout: 30000 }, async () => {
  const { bots } = await seatAll(server, 'holdem', 3, { autoplay: false });
  const [h, b] = bots;
  b.errors.length = 0;
  b.send({ t: 'mode', mode: 'bluff' });
  await sleep(80);
  assert.equal(h.state.mode, 'holdem');
  assert.ok(b.errors.length >= 1);
  h.send({ t: 'mode', mode: 'bluff' });
  await h.waitFor(() => h.state.mode === 'bluff', 2000, 'host mode change');
  h.send({ t: 'mode', mode: 'holdem' });
  await h.waitFor(() => h.state.mode === 'holdem', 2000, 'back');
  h.start();
  await h.waitFor(() => h.state.phase === 'playing', 3000, 'start');
  h.errors.length = 0;
  h.send({ t: 'mode', mode: 'bluff' });
  h.send({ t: 'start' });
  await sleep(120);
  assert.equal(h.state.mode, 'holdem', 'mode must not change mid-game');
  bots.forEach((x) => x.close());
  await healthy();
});

test('abuse: flood beyond rate limit', { timeout: 30000 }, async () => {
  const b = new Bot(server.url, uid('fl'), { autoplay: false });
  await b.connect();
  await b.login();
  const n0 = b.messages.length;
  for (let i = 0; i < 500; i++) b.send({ t: 'emote', e: 1 });
  for (let i = 0; i < 500; i++) b.send(`{"junk":${i}`);
  await sleep(500);
  assert.ok(server.alive());
  // after the window the connection still works (either alive or cleanly closed)
  await sleep(1200);
  if (!b.closed) {
    b.send({ t: 'create', mode: 'bluff' });
    await b.waitFor(() => b.state, 3000, 'works after flood');
  }
  // responses must be bounded: server dropped most of the 1000 messages
  assert.ok(b.messages.length - n0 < 600, `server answered ${b.messages.length - n0} of 1000 flooded messages`);
  b.close();
  await healthy();
});

test('abuse: oversized frame', { timeout: 30000 }, async () => {
  const { ws } = await rawClient();
  ws.on('error', () => {});
  ws.send('{"t":"login","id":"' + 'a'.repeat(5 * 1024 * 1024) + '"}');
  await sleep(500);
  assert.ok(server.alive());
  ws.terminate();
  await healthy();
});

test('abuse: unauthenticated HTTP/WS paths', async () => {
  const r = await fetch(server.http + '/healthz');
  assert.equal(r.status, 200);
  const r2 = await fetch(server.http + '/..%2f..%2fpackage.json');
  assert.notEqual(r2.status, 200 && (await r2.clone().text()).includes('gangsik-club') ? 200 : 0, 200, 'path traversal must not serve package.json');
  const r3 = await fetch(server.http + '/../../etc/passwd').catch(() => null);
  if (r3) assert.ok(!(await r3.text()).includes('root:'));
  await healthy();
});
