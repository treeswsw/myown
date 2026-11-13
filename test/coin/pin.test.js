// SPEC 22-12 #10: account passwords (PIN), device tokens, lockout, admin clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { parseMessage } from '../../server/protocol.js';
import { FakeClock, client, seeded } from '../helpers.js';

function setup() {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(5), now: clock.now, timers: clock });
  return { clock, store, hub };
}
const errs = (c) => c.sock.msgs.filter((m) => m.t === 'error');
const lastCode = (c) => errs(c).at(-1)?.code;
const oks = (c) => c.sock.msgs.filter((m) => m.t === 'pin' && m.a === 'ok');
const settle = () => new Promise((r) => setTimeout(r, 20)); // lets hub.persist finish (memory store, real promises)

async function mk(hub, id, extra = {}) {
  const c = client(hub);
  await c.send({ t: 'login', id, ...extra });
  return c;
}
// Creates 'id' with a PIN, disconnects it and returns the device token.
async function withPin(hub, id = 'ann1', pin = '1234') {
  const c = await mk(hub, id, { newPin: pin });
  const tok = oks(c).at(-1).tok;
  assert.match(tok, /^[0-9a-f]{64}$/);
  c.conn.close();
  return { tok };
}
// No raw message sent to any of these clients contains the salt, the hash or a stored token hash.
function assertNoSecrets(clients, rec) {
  const secrets = [rec.s, rec.h, ...rec.t];
  for (const c of clients) for (const raw of c.sock.raw) for (const s of secrets) assert.ok(!raw.includes(s), 'secret leaked');
}

test('new id + newPin: next login needs the PIN (pin_need, not counted), wrong = pin_bad, right passes with a new token', async () => {
  const { hub } = setup();
  const a = await mk(hub, 'ann1', { newPin: '1234' });
  assert.equal(a.sock.last('me').wallet.hasPin, true);
  assert.deepEqual(Object.keys(oks(a)[0]).sort(), ['a', 'has', 't', 'tok']);
  a.conn.close();
  const b = await mk(hub, 'ann1');
  assert.equal(lastCode(b), 'pin_need');
  assert.equal(b.sock.last('me'), undefined, 'no account info before the PIN');
  for (let i = 0; i < 10; i++) await mk(hub, 'ann1'); // pin_need never counts
  const bad = await mk(hub, 'ann1', { pin: '0000' });
  assert.equal(lastCode(bad), 'pin_bad');
  const ok = await mk(hub, 'ann1', { pin: '1234' });
  assert.ok(ok.sock.last('me'));
  const o = oks(ok).at(-1);
  assert.equal(o.has, true);
  assert.match(o.tok, /^[0-9a-f]{64}$/);
  assertNoSecrets([a, b, bad, ok], hub.sessions.get('ann1').user.pin);
});

test('5 wrong in 10 min -> pin_lock (even the right PIN), token still passes, unlocks after 10 min', async () => {
  const { hub, clock } = setup();
  const { tok } = await withPin(hub);
  for (let i = 0; i < 5; i++) assert.equal(lastCode(await mk(hub, 'ann1', { pin: '1111' })), 'pin_bad');
  assert.equal(lastCode(await mk(hub, 'ann1', { pin: '1234' })), 'pin_lock');
  const byTok = await mk(hub, 'ann1', { tok });
  assert.ok(byTok.sock.last('me'), 'token works while locked');
  byTok.conn.close();
  clock.advance(10 * 60_000 + 1);
  assert.ok((await mk(hub, 'ann1', { pin: '1234' })).sock.last('me'));
});

test('wrong ones older than 10 minutes do not add up', async () => {
  const { hub, clock } = setup();
  await withPin(hub);
  for (let i = 0; i < 4; i++) await mk(hub, 'ann1', { pin: '1111' });
  clock.advance(10 * 60_000 + 1);
  for (let i = 0; i < 4; i++) assert.equal(lastCode(await mk(hub, 'ann1', { pin: '1111' })), 'pin_bad');
  assert.ok((await mk(hub, 'ann1', { pin: '1234' })).sock.last('me'));
});

test('existing id + newPin -> pin_exists and no login', async () => {
  const { hub } = setup();
  const a = await mk(hub, 'bob1');
  a.conn.close();
  const b = await mk(hub, 'bob1', { newPin: '1234' });
  assert.equal(lastCode(b), 'pin_exists');
  assert.equal(b.sock.last('me'), undefined);
  assert.equal(hub.sessions.get('bob1'), undefined);
  // an id that already has a PIN also refuses a newPin
  await withPin(hub, 'cat1');
  assert.equal(lastCode(await mk(hub, 'cat1', { newPin: '5555' })), 'pin_exists');
});

test('login without the PIN does not take over the existing connection', async () => {
  const { hub } = setup();
  const a = await mk(hub, 'ann1', { newPin: '1234' });
  const tok = oks(a).at(-1).tok;
  const before = a.sock.raw.length;
  const thief = await mk(hub, 'ann1');
  assert.equal(lastCode(thief), 'pin_need');
  const thief2 = await mk(hub, 'ann1', { pin: '9999', tok: 'f'.repeat(64) });
  assert.equal(lastCode(thief2), 'pin_bad');
  assert.equal(a.sock.closed, false);
  assert.equal(a.sock.raw.length, before, 'the old connection got nothing, not even "taken over"');
  assert.equal(hub.sessions.get('ann1').conn, a.conn);
  assert.equal(thief.sock.last('me'), undefined);
  // the right token does take over
  const b = await mk(hub, 'ann1', { tok });
  assert.ok(b.sock.last('me'));
  assert.equal(a.sock.closed, true);
});

test('pin set / change / clear; change voids other tokens; wrong cur counts; no secrets in messages', async () => {
  const { hub, store } = setup();
  const a = await mk(hub, 'ann1');
  await a.send({ t: 'pin', a: 'set', pin: '1234' });
  const tok1 = oks(a).at(-1).tok;
  assert.equal(a.sock.last('me').wallet.hasPin, true);
  await a.send({ t: 'pin', a: 'set', pin: '4321' }); // no cur
  assert.equal(lastCode(a), 'pin_bad');
  await a.send({ t: 'pin', a: 'set', pin: '4321', cur: '0000' });
  assert.equal(lastCode(a), 'pin_bad');
  await a.send({ t: 'pin', a: 'set', pin: '4321', cur: '1234' });
  const tok2 = oks(a).at(-1).tok;
  assert.notEqual(tok1, tok2);
  assertNoSecrets([a], hub.sessions.get('ann1').user.pin);
  a.conn.close();
  assert.equal(lastCode(await mk(hub, 'ann1', { tok: tok1 })), 'pin_need', 'old token void');
  const b = await mk(hub, 'ann1', { tok: tok2 });
  assert.ok(b.sock.last('me'));
  await b.send({ t: 'pin', a: 'clear', cur: '9999' });
  assert.equal(lastCode(b), 'pin_bad');
  await b.send({ t: 'pin', a: 'clear', cur: '4321' });
  assert.deepEqual(oks(b).at(-1), { t: 'pin', a: 'ok', has: false });
  assert.equal(b.sock.last('me').wallet.hasPin, false);
  await settle();
  assert.equal((await store.getOrCreate('ann1', 'ann1')).pin, null);
});

test('forget removes only this device token; at most 5 tokens kept; bad formats', async () => {
  const { hub } = setup();
  const a = await mk(hub, 'ann1', { newPin: '1234' });
  const tokA = oks(a).at(-1).tok;
  const b = await mk(hub, 'ann1', { pin: '1234' });
  const tokB = oks(b).at(-1).tok;
  await b.send({ t: 'pin', a: 'forget' });
  b.conn.close();
  assert.equal(lastCode(await mk(hub, 'ann1', { tok: tokB })), 'pin_need');
  assert.ok((await mk(hub, 'ann1', { tok: tokA })).sock.last('me'));
  for (let i = 0; i < 7; i++) await mk(hub, 'ann1', { pin: '1234' });
  assert.ok(hub.sessions.get('ann1').user.pin.t.length <= 5);
  const c = await mk(hub, 'ann1', { pin: '1234' });
  await c.send({ t: 'pin', a: 'set', pin: 'abcd' });
  assert.equal(lastCode(c), 'pin_fmt');
  assert.equal(parseMessage('{"t":"login","id":"ann1","pin":"12"}').code, 'pin_fmt');
  assert.equal(parseMessage('{"t":"login","id":"ann1","newPin":"12a4"}').code, 'pin_fmt');
  assert.equal(parseMessage('{"t":"login","id":"ann1","tok":"zz"}').msg.tok, undefined);
});

test('the admin account cannot have a PIN; its login path is unchanged', async () => {
  const { hub } = setup();
  assert.equal(lastCode(await mk(hub, '관리자', { pw: '9975', newPin: '1234' })), 'pin_adm');
  const adm = await mk(hub, '관리자', { pw: '9975' });
  assert.ok(adm.sock.last('me').admin);
  await adm.send({ t: 'pin', a: 'set', pin: '1234' });
  assert.equal(lastCode(adm), 'pin_adm');
  assert.equal(lastCode(await mk(hub, '관리자', { pw: 'zzz' })), 'adm_pw');
});

test('admin pinclr: offline and online accounts, lock cleared, unknown id adm_noid, normal user adm_no', async () => {
  const { hub, store } = setup();
  const { tok } = await withPin(hub, 'ann1');
  hub.sessions.delete('ann1');
  for (let i = 0; i < 5; i++) await mk(hub, 'ann1', { pin: '1111' });
  assert.equal(lastCode(await mk(hub, 'ann1', { pin: '1234' })), 'pin_lock');
  const adm = await mk(hub, '관리자', { pw: '9975' });
  await adm.send({ t: 'adm', a: 'pinclr', id: 'nobody1' });
  assert.deepEqual(errs(adm).at(-1), { t: 'error', msg: '없는 아이디입니다.', code: 'adm_noid' });
  await adm.send({ t: 'adm', a: 'pinclr', id: 'ann1' });
  assert.deepEqual(adm.sock.last('admOk'), { t: 'admOk', a: 'pinclr' });
  const free = await mk(hub, 'ann1');
  assert.equal(free.sock.last('me').wallet.hasPin, false);
  assert.equal(errs(free).length, 0);
  assert.notEqual(tok, undefined);
  // online account (in a room): cleared in memory too, so the next save does not bring it back
  await free.send({ t: 'pin', a: 'set', pin: '2222' });
  await free.send({ t: 'create', mode: 'bluff' });
  await adm.send({ t: 'adm', a: 'pinclr', id: 'ann1' });
  assert.equal(hub.sessions.get('ann1').user.pin, null);
  assert.equal(free.sock.last('me').wallet.hasPin, false);
  hub.persist(hub.sessions.get('ann1').user);
  await settle();
  assert.equal((await store.getOrCreate('ann1', 'ann1')).pin, null);
  // a normal user is refused
  await free.send({ t: 'adm', a: 'pinclr', id: 'ann1' });
  assert.equal(lastCode(free), 'adm_no');
});

test('record shape: 16-byte salt, 32-byte key, tokens stored as sha256 only, PIN never stored', async () => {
  const { hub } = setup();
  const a = await mk(hub, 'ann1', { newPin: '1234' });
  const tok = oks(a).at(-1).tok;
  const rec = hub.sessions.get('ann1').user.pin;
  assert.equal(rec.s.length, 32);
  assert.equal(rec.h.length, 64);
  assert.equal(rec.t.length, 1);
  assert.notEqual(rec.t[0], tok);
  assert.equal(JSON.stringify(rec).includes('1234'), false);
  assertNoSecrets([a], rec);
});
