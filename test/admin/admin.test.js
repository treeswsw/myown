// Admin mode core (SPEC 21-1, 21-2, 21-3): login guard, bot+/bot-/skip, human refusal, cleanup, no saving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { parseMessage } from '../../server/protocol.js';
import { client, FakeClock, seeded } from '../helpers.js';
import { setupAdmin, ADMIN_PW } from './helpers.js';

function plainHub(options = {}) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(3), now: clock.now, timers: clock, liar: 'on', yacht: 'on', draw: 'on', ...options });
  return { clock, store, hub };
}
const lastError = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1);

test('right password logs in and me.admin is set', async () => {
  const { hub } = plainHub();
  const a = client(hub);
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  assert.equal(a.sock.last('me').admin, true);
  assert.equal(lastError(a), undefined);
});

test('wrong or missing password: adm_pw, no session', async () => {
  const { hub } = plainHub();
  for (const pw of [undefined, '0000', '', 12345, 'x'.repeat(40)]) {
    const a = client(hub);
    await a.send({ t: 'login', id: '관리자', pw });
    assert.equal(lastError(a).code, 'adm_pw');
    assert.equal(a.sock.last('me'), undefined);
    if (hub.admin.lockedUntil) break;
  }
  assert.equal(hub.sessions.has('관리자'), false);
});

test('ADMIN_KEY option replaces the default', async () => {
  const { hub } = plainHub({ adminKey: 'abc' });
  const a = client(hub);
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  assert.equal(lastError(a).code, 'adm_pw');
  await a.send({ t: 'login', id: '관리자', pw: 'abc' });
  assert.equal(a.sock.last('me').admin, true);
});

test('5 wrong passwords in 10 minutes lock admin login for 10 minutes, even for the right one', async () => {
  const { hub, clock } = plainHub();
  const a = client(hub);
  for (let i = 0; i < 5; i++) {
    await a.send({ t: 'login', id: '관리자', pw: 'no' });
    assert.equal(lastError(a).code, 'adm_pw');
  }
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  assert.equal(lastError(a).code, 'adm_lock');
  assert.equal(a.sock.last('me'), undefined);
  clock.advance(9 * 60_000);
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  assert.equal(lastError(a).code, 'adm_lock');
  clock.advance(61_000);
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  assert.equal(a.sock.last('me').admin, true);
});

test('wrong passwords spread over more than 10 minutes do not lock', async () => {
  const { hub, clock } = plainHub();
  const a = client(hub);
  for (let i = 0; i < 8; i++) {
    await a.send({ t: 'login', id: '관리자', pw: 'no' });
    assert.equal(lastError(a).code, 'adm_pw');
    clock.advance(3 * 60_000);
  }
});

test('other users never get the admin field, and cannot adm', async () => {
  const { hub } = plainHub();
  const u = client(hub);
  await u.send({ t: 'login', id: '손님' });
  assert.equal('admin' in u.sock.last('me'), false);
  await u.send({ t: 'create', mode: 'holdem' });
  await u.send({ t: 'adm', a: 'bot+' });
  assert.equal(lastError(u).code, 'adm_no');
  assert.equal(hub.admin.botsIn([...hub.rooms.values()][0]), 0);
  await u.send({ t: 'login', id: '손님', pw: ADMIN_PW });
  assert.equal('admin' in u.sock.last('me'), false);
});

test('protocol: adm accepts only the three actions; pw is a short string or dropped', () => {
  assert.equal(parseMessage('{"t":"adm","a":"bot+"}').ok, true);
  assert.equal(parseMessage('{"t":"adm","a":"nope"}').ok, false);
  assert.equal(parseMessage('{"t":"adm"}').ok, false);
  assert.equal(parseMessage(JSON.stringify({ t: 'login', id: '관리자', pw: 'x'.repeat(33) })).msg.pw, undefined);
  assert.equal(parseMessage(JSON.stringify({ t: 'login', id: '관리자', pw: '9975' })).msg.pw, '9975');
});

test('adm errors: not in a room, people in the room, no bot, nothing to skip', async () => {
  const { hub } = plainHub();
  const a = client(hub);
  await a.send({ t: 'login', id: '관리자', pw: ADMIN_PW });
  await a.send({ t: 'adm', a: 'bot+' });
  assert.equal(lastError(a).code, 'adm_room');
  await a.send({ t: 'create', mode: 'holdem' });
  const code = [...hub.rooms.keys()][0];
  await a.send({ t: 'adm', a: 'bot-' });
  assert.equal(lastError(a).code, 'adm_nobot');
  await a.send({ t: 'adm', a: 'skip' });
  assert.equal(lastError(a).code, 'adm_noskip');
  const u = client(hub);
  await u.send({ t: 'login', id: '손님' });
  await u.send({ t: 'join', code });
  for (const act of ['bot+', 'bot-', 'skip']) {
    await a.send({ t: 'adm', a: act });
    assert.equal(lastError(a).code, 'adm_people');
  }
});

for (const mode of ['holdem', 'bluff', 'liar', 'yacht', 'draw']) {
  test(`${mode}: bot+ and bot- work, bots look like players`, async () => {
    const env = await setupAdmin({ mode });
    let r = await env.adm('bot+');
    assert.deepEqual([r.ok, r.bots], [true, 1]);
    r = await env.adm('bot+');
    assert.equal(r.bots, 2);
    assert.deepEqual(env.bots().map((b) => [b.id, b.user.name]), [['~bot1', '봇1'], ['~bot2', '봇2']]);
    assert.equal(env.room.members.length, 3);
    r = await env.adm('bot-');
    assert.deepEqual([r.ok, r.bots], [true, 1]);
    assert.deepEqual(env.bots().map((b) => b.id), ['~bot1']); // the latest one left
    assert.equal(env.room.members.length, 2);
    env.close();
  });
}

test('bot+ passes on the room refusal when the room is full', async () => {
  const env = await setupAdmin({ mode: 'yacht' }); // max 4
  for (let i = 0; i < 3; i++) assert.equal((await env.adm('bot+')).ok, true);
  const r = await env.adm('bot+');
  assert.equal(r.ok, false);
  assert.equal(r.error.msg, '방이 가득 찼습니다.');
  assert.equal(env.bots().length, 3); // the refused bot left no session behind
  env.close();
});

test('a human cannot join a room that has a bot (adm_test); it can once the bots are gone', async () => {
  const env = await setupAdmin({ mode: 'liar', bots: 1 });
  const u = await env.human('손님');
  await u.send({ t: 'join', code: env.room.code });
  assert.equal(lastError(u).code, 'adm_test');
  assert.equal(env.room.members.length, 2);
  await env.adm('bot-');
  await u.send({ t: 'join', code: env.room.code });
  assert.equal(u.sock.state.code, env.room.code);
  env.close();
});

test('bots leave and are deleted when the admin leaves', async () => {
  const env = await setupAdmin({ mode: 'draw', bots: 2 });
  assert.equal(env.bots().length, 2);
  await env.admin.send({ t: 'leave' });
  await env.drain();
  assert.equal(env.bots().length, 0);
  assert.equal(env.room.members.length, 0);
  assert.equal(env.hub.admin.rooms.size, 0);
  env.close();
});

test('bots leave when the admin seat is removed by grace expiry; they wait while the admin is only disconnected', async () => {
  for (const mode of ['holdem', 'liar', 'yacht', 'draw']) {
    const env = await setupAdmin({ mode, bots: 1 });
    env.admin.conn.close(); // dropped connection
    await env.tick(30_000);
    assert.equal(env.bots().length, 1, `${mode}: still waiting`);
    await env.tick(40_000);
    assert.equal(env.bots().length, 0, `${mode}: gone with the admin seat`);
    assert.equal(env.hub.sessions.has('~bot1'), false);
    env.close();
  }
});

test('bots are never saved: not in the store, not persisted', async () => {
  const env = await setupAdmin({ mode: 'holdem', bots: 2 });
  const saved = [];
  const orig = env.store.save.bind(env.store);
  env.store.save = (u) => { saved.push(u.id); return orig(u); };
  for (const b of env.bots()) env.hub.persist(b.user);
  await env.hub.close();
  assert.deepEqual(saved, []);
  const again = await env.store.getOrCreate('~bot1', 'x'); // a store would only know it if created just now
  assert.equal(again.name, 'x');
  env.close();
});

test('reset removes bot sessions', async () => {
  const env = await setupAdmin({ mode: 'bluff', bots: 2 });
  const u = client(env.hub);
  await u.conn.message(JSON.stringify({ t: 'login', id: '초기화' }));
  assert.ok(u.sock.last('resetAsk'));
  await env.hub.reset();
  assert.equal(env.hub.sessions.size, 0);
  assert.equal(env.hub.admin.rooms.size, 0);
});

test('unknown mode: bot does nothing, skip is refused', async () => {
  const env = await setupAdmin({ mode: 'holdem', bots: 1 });
  env.room.mode = 'future'; // a game nobody registered
  env.admin.sock.raw.length = 0;
  await env.tick(5000);
  assert.equal((await env.adm('skip')).error.code, 'adm_noskip');
  env.close();
});

// Swaps a game's brain in the registry for the duration of fn (the registry is a plain object).
async function withBrain(mode, createBrain, fn) {
  const { games } = await import('../../server/admin/games/index.js');
  const orig = games[mode];
  games[mode] = { ...orig, createBrain };
  try {
    await fn();
  } finally {
    games[mode] = orig;
  }
}

test('bot.later fires while the bot is in the room, and is cancelled when it leaves or the hub closes', async () => {
  const calls = [];
  const brain = (bot) => ({
    onMsg(msg) {
      if (msg.t === 'room' && msg.state) bot.later(500, () => calls.push(bot.id));
    },
  });
  await withBrain('holdem', brain, async () => {
    const env = await setupAdmin({ mode: 'holdem' });
    await env.adm('bot+');
    await env.drain();
    await env.tick(600);
    assert.deepEqual(calls, ['~bot1']);
    await env.admin.send({ t: 'chat', text: 'hi' }); // more room traffic -> more later() calls
    await env.adm('bot+');
    await env.drain();
    await env.adm('bot-'); // ~bot2 leaves before its timer
    await env.tick(2000);
    assert.equal(calls.includes('~bot2'), false);
    const n = calls.length;
    await env.adm('bot+');
    await env.drain();
    env.close(); // timers cancelled
    await env.tick(2000);
    assert.equal(calls.length, n);
  });
});

test('the brain gets exactly { id, name, rng, send, later } and its send goes through normal dispatch', async () => {
  let seen = null;
  await withBrain('bluff', (bot) => {
    seen = bot;
    return { onMsg() {} };
  }, async () => {
    const env = await setupAdmin({ mode: 'bluff', bots: 1 });
    assert.deepEqual(Object.keys(seen).sort(), ['id', 'later', 'name', 'rng', 'send']);
    assert.equal(typeof seen.rng(), 'number');
    const before = env.admin.sock.raw.length;
    await seen.send({ t: 'chat', text: '안녕' });
    await env.drain();
    assert.ok(env.admin.sock.msgs.slice(before).some((m) => m.t === 'event' && m.e.k === 'chat' && m.e.text === '안녕'));
    await seen.send({ t: 'bogus' }); // goes through parseMessage: bot gets an error, nobody crashes
    env.close();
  });
});
