import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { parseMessage } from '../server/protocol.js';
import { FakeClock, client, seeded } from './helpers.js';

function setup() {
  const clock = new FakeClock();
  const store = createStore();
  const hub = createHub({ store, rng: seeded(61), now: clock.now, timers: clock });
  return { clock, store, hub };
}
const kinds = (c, t) => c.sock.msgs.filter((m) => m.t === t);

test('login "초기화" only asks; it never creates or logs in an account', async () => {
  const { hub, store } = setup();
  const c = client(hub);
  await c.send({ t: 'login', id: ' 초기화 ' });
  assert.deepEqual(c.sock.msgs, [{ t: 'resetAsk' }]);
  assert.equal(hub.sessions.size, 0);
  assert.equal(c.conn.session, null);
  await c.send({ t: 'create', mode: 'bluff' });
  assert.equal(c.sock.last('error').msg, '먼저 로그인하세요.');
  assert.equal(parseMessage('{"t":"reset"}').ok, false);
  assert.equal(parseMessage('{"t":"reset","confirm":"yes"}').ok, false);
  assert.equal(parseMessage('{"t":"reset","confirm":true}').ok, true);
  // never stored under that name
  assert.equal((await store.getOrCreate('x1', 'x1')).id, 'x1');
});

test('reset needs a recent ask on the same connection, confirm:true, and no login', async () => {
  const { hub, clock } = setup();
  const c = client(hub);
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(c.sock.last('error').msg, '초기화 확인이 필요합니다.');
  await c.send({ t: 'reset' });
  assert.equal(c.sock.last('error').msg, '초기화 확인이 필요합니다.');
  await c.send({ t: 'login', id: '초기화' });
  clock.advance(60_001);
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(c.sock.last('error').msg, '초기화 확인이 필요합니다.', 'ask expired');
  const other = client(hub);
  await other.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(kinds(other, 'resetDone').length, 0, 'ask belongs to a connection');
  const user = client(hub);
  await user.send({ t: 'login', id: 'ann1' });
  await user.send({ t: 'login', id: '초기화' });
  assert.equal(user.sock.last('error').msg, '로그인 상태에서는 초기화할 수 없습니다.');
  await user.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(kinds(user, 'resetDone').length, 0);
  assert.equal(hub.sessions.size, 1);
});

test('full wipe: mid-hand room, spectator, everyone gets resetDone, relogin is fresh, no stale write-back', async () => {
  const { hub, store, clock } = setup();
  const a = client(hub);
  const b = client(hub);
  const s = client(hub);
  for (const [c, id] of [[a, 'ann1'], [b, 'bob1'], [s, 'cat1']]) await c.send({ t: 'login', id });
  await a.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/AAAA' });
  await a.send({ t: 'create', mode: 'holdem' });
  await b.send({ t: 'join', code: a.state.code });
  await a.send({ t: 'start' });
  await s.send({ t: 'join', code: a.state.code }); // spectator
  await a.send({ t: 'chat', text: 'hi' });
  await b.send({ t: 'sndAdd', sid: 'abc123', name: 'x', data: 'data:audio/webm;base64,AAAA' });
  const staleUser = hub.sessions.get('ann1').user;
  const idle = client(hub); // connected, not logged in
  await idle.send({ t: 'login', id: '초기화' });
  assert.equal(hub.rooms.size, 1);
  assert.ok(clock.pending > 0);

  await idle.send({ t: 'reset', confirm: true, pw: '9975' });
  for (const c of [a, b, s, idle]) assert.deepEqual(kinds(c, 'resetDone'), [{ t: 'resetDone' }]);
  assert.equal(hub.rooms.size, 0);
  assert.equal(hub.sessions.size, 0);
  assert.equal(clock.pending, 0, 'no timer survives for a deleted room');
  assert.equal(a.conn.session, null);
  assert.ok(![a, b, s, idle].some((c) => c.sock.closed), 'sockets stay open');

  // a stale object cannot write back after the wipe
  hub.persist(staleUser);
  assert.equal((await store.getOrCreate('ann1', 'ann1')).avatar, null);
  await a.send({ t: 'act', a: 'fold' });
  assert.equal(a.sock.last('error').msg, '먼저 로그인하세요.');

  // relogin with an old id: brand new 10,000 account, no avatar, no stats
  await a.send({ t: 'login', id: 'ann1' });
  const me = a.sock.last('me').user;
  assert.deepEqual([me.bank, me.avatar, me.stats.hands], [10000, null, 0]);
  assert.equal(a.state, null);
  await b.send({ t: 'join', code: 'ZZZZ' });
  assert.equal(b.sock.last('error').msg, '먼저 로그인하세요.');
  clock.advance(120_000);
  assert.equal((await store.getOrCreate('ann1', 'ann1')).bank, 10000);
});

test('cooldown: one reset per minute, the ask itself is refused meanwhile', async () => {
  const { hub, clock } = setup();
  const c = client(hub);
  await c.send({ t: 'login', id: '초기화' });
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(kinds(c, 'resetDone').length, 1);
  await c.send({ t: 'login', id: '초기화' });
  assert.equal(c.sock.last('error').msg, '방금 초기화했습니다. 잠시 후 다시 시도하세요');
  assert.equal(kinds(c, 'resetAsk').length, 1);
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(c.sock.last('error').msg, '초기화 확인이 필요합니다.');
  clock.advance(60_000);
  await c.send({ t: 'login', id: '초기화' });
  assert.equal(kinds(c, 'resetAsk').length, 2);
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(kinds(c, 'resetDone').length, 2);
});

test('a login that was loading during the wipe does not resurrect an old account', async () => {
  const { hub, store } = setup();
  const slow = client(hub);
  const admin = client(hub);
  const orig = store.getOrCreate;
  let release;
  store.getOrCreate = (id, name) => new Promise((resolve) => { release = () => resolve(orig(id, name)); });
  const pending = slow.send({ t: 'login', id: 'late1' });
  await admin.send({ t: 'login', id: '초기화' });
  store.getOrCreate = orig;
  await admin.send({ t: 'reset', confirm: true, pw: '9975' });
  release();
  await pending;
  assert.equal(hub.sessions.size, 0);
  assert.equal(slow.sock.last('error').msg, '초기화 중입니다. 잠시 후 다시 시도하세요');
});

test('reset needs the admin password; wrong ones never wipe, 5 wrong lock it (shared with admin login)', async () => {
  const { hub, clock } = setup();
  const u = client(hub);
  await u.send({ t: 'login', id: 'ann1' });
  const c = client(hub);
  await c.send({ t: 'login', id: '초기화' });
  await c.send({ t: 'reset', confirm: true });
  assert.equal(c.sock.last('error').code, 'adm_pw');
  await c.send({ t: 'reset', confirm: true, pw: '0000' });
  assert.equal(c.sock.last('error').code, 'adm_pw');
  assert.equal(kinds(c, 'resetDone').length, 0);
  assert.equal(hub.sessions.size, 1);
  for (let i = 0; i < 3; i++) await c.send({ t: 'reset', confirm: true, pw: 'nope' });
  assert.equal(c.sock.last('error').code, 'adm_pw');
  await c.send({ t: 'reset', confirm: true, pw: '9975' }); // locked: even the right one
  assert.equal(c.sock.last('error').code, 'adm_lock');
  assert.equal(kinds(c, 'resetDone').length, 0);
  const adm = client(hub);
  await adm.send({ t: 'login', id: '관리자', pw: '9975' });
  assert.equal(adm.sock.last('error').code, 'adm_lock', 'same counter as the admin login');
  clock.advance(10 * 60_000 + 1);
  await c.send({ t: 'login', id: '초기화' });
  await c.send({ t: 'reset', confirm: true, pw: '9975' });
  assert.equal(kinds(c, 'resetDone').length, 1);
  assert.equal(hub.sessions.size, 0);
});
