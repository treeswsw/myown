import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { setupAdmin } from '../admin/helpers.js';

async function setup({ coinSeed = 0, seed = 1 } = {}) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(seed), now: clock.now, timers: clock, coinSeed });
  return { clock, store, hub };
}
async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  return c;
}
const msgs = (c, t, a) => c.sock.msgs.filter((m) => m.t === t && (a === undefined || m.a === a));
const lastErr = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1);
const sess = (hub, id) => hub.sessions.get(id.toLowerCase());

test('award: amounts, ledger, got + me', async () => {
  const { hub, store } = await setup();
  const a = await login(hub, 'aaa');
  await login(hub, 'bbb');
  await a.send({ t: 'create', mode: 'bluff' });
  const room = [...hub.rooms.values()][0];
  hub.award(room, 'yacht', [{ id: 'aaa', won: true, opp: 3 }, { id: 'bbb', won: false, opp: 3 }]);
  assert.equal(sess(hub, 'aaa').user.coins, 15);
  assert.equal(sess(hub, 'aaa').user.coinsTotal, 15);
  assert.equal(sess(hub, 'bbb').user.coins, 3);
  assert.deepEqual(msgs(a, 'coin', 'got').at(-1), { t: 'coin', a: 'got', n: 15, mode: 'yacht', win: true });
  assert.equal(msgs(a, 'me').at(-1).wallet.coins, 15);
  const l = store.ledger().filter((x) => x.kind === 'earn');
  assert.equal(l.length, 2);
  assert.deepEqual(l[0].note, { mode: 'yacht', win: true });
  assert.equal(l[0].bal, 15);
});

test('award: min gap per user per mode', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  await a.send({ t: 'create', mode: 'bluff' });
  const room = [...hub.rooms.values()][0];
  const row = [{ id: 'aaa', won: false, opp: 3 }];
  hub.award(room, 'bluff', row);
  clock.advance(29_000);
  hub.award(room, 'bluff', row);
  assert.equal(sess(hub, 'aaa').user.coins, 1);
  hub.award(room, 'draw', row); // other mode has its own gap
  assert.equal(sess(hub, 'aaa').user.coins, 3);
  clock.advance(2_000);
  hub.award(room, 'bluff', row);
  assert.equal(sess(hub, 'aaa').user.coins, 4);
  assert.equal(msgs(a, 'coin', 'got').length, 3);
});

test('award: holdem, unknown mode, not logged in give nothing', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  await a.send({ t: 'create', mode: 'bluff' });
  const room = [...hub.rooms.values()][0];
  hub.award(room, 'holdem', [{ id: 'aaa', won: true, opp: 3 }]);
  hub.award(room, 'nope', [{ id: 'aaa', won: true, opp: 3 }]);
  hub.award(room, 'bluff', [{ id: 'ghost', won: true, opp: 3 }]);
  assert.equal(sess(hub, 'aaa').user.coins, 0);
  assert.equal(msgs(a, 'coin', 'got').length, 0);
});

test('award: room with a bot gives nothing', async () => {
  const env = await setupAdmin({ mode: 'bluff', bots: 1 });
  env.hub.award(env.room, 'yacht', [{ id: '관리자', won: true, opp: 1 }]);
  assert.equal(env.hub.sessions.get('관리자').user.coins, 0);
  env.close();
});

test('swap: ok, coin_room, coin_low, coin_bad, coin_max', async () => {
  const { hub, store } = await setup({ coinSeed: 5 });
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  assert.equal(u.coins, 5);
  const bank = u.bank;
  await a.send({ t: 'coin', a: 'swap', n: 3 });
  assert.equal(u.coins, 2);
  assert.equal(u.bank, bank + 300);
  assert.deepEqual(msgs(a, 'coin', 'swap').at(-1), { t: 'coin', a: 'swap', n: 3, chips: 300 });
  const row = store.ledger().find((x) => x.kind === 'swap');
  assert.equal(row.delta, -3); assert.equal(row.chips, 300); assert.equal(row.bal, 2);
  await a.send({ t: 'coin', a: 'swap', n: 3 });
  assert.equal(lastErr(a).code, 'coin_low');
  assert.equal(lastErr(a).msg, '코인이 모자랍니다.');
  for (const n of [0, -1, 1.5, '2', null]) {
    await a.send({ t: 'coin', a: 'swap', n });
    assert.equal(lastErr(a).code, 'coin_bad');
  }
  u.coins = 10; u.bank = 1_999_999_950;
  await a.send({ t: 'coin', a: 'swap', n: 1 });
  assert.equal(lastErr(a).code, 'coin_max');
  assert.equal(u.coins, 10);
  u.bank = 0;
  await a.send({ t: 'create', mode: 'bluff' });
  await a.send({ t: 'coin', a: 'swap', n: 1 });
  assert.equal(lastErr(a).code, 'coin_room');
  assert.equal(u.coins, 10);
});

test('draw 1 and 10: chips, pity, pool, ledger, throttle; coin_low with 4', async () => {
  const { hub, store, clock } = await setup({ coinSeed: 4 });
  const a = await login(hub, 'aaa');
  const s = sess(hub, 'aaa');
  const bank = s.user.bank;
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  assert.equal(lastErr(a).code, 'coin_low');
  clock.advance(400);
  s.user.coins = 55;
  hub.rng = () => 0; // lowest roll: bronze
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  let d = msgs(a, 'coin', 'draw').at(-1);
  assert.deepEqual(d.pulls, [{ chips: 200, tier: 0 }]);
  assert.equal(d.chips, 200); assert.equal(d.pity, 1); assert.equal(d.pool, 10020);
  assert.equal(s.user.coins, 50); assert.equal(s.user.bank, bank + 200); assert.equal(s.user.gear.pity, 1);
  const errs = msgs(a, 'error').length;
  await a.send({ t: 'coin', a: 'draw', n: 1 }); // within 0.3s: silently ignored
  assert.equal(s.user.coins, 50);
  assert.equal(msgs(a, 'error').length, errs);
  clock.advance(400);
  s.user.gear.pity = 0;
  await a.send({ t: 'coin', a: 'draw', n: 10 }); // all bronze -> last one becomes gold 1000
  d = msgs(a, 'coin', 'draw').at(-1);
  assert.equal(d.pulls.length, 10);
  assert.equal(d.pulls[9].chips, 1000);
  assert.equal(d.chips, 200 * 9 + 1000);
  assert.equal(d.pool, 10220);
  assert.equal(s.user.coins, 0);
  assert.equal(s.user.gear.pity, 10);
  const log = store.ledger().filter((x) => x.kind === 'draw');
  assert.equal(log.length, 2);
  assert.equal(log[1].delta, -50); assert.equal(log[1].chips, 2800);
  clock.advance(400);
  await a.send({ t: 'coin', a: 'draw', n: 10 });
  assert.equal(lastErr(a).code, 'coin_low');
});

test('draw: pity gives 대박 on the 60th', async () => {
  const { hub } = await setup({ coinSeed: 10 });
  const a = await login(hub, 'aaa');
  const s = sess(hub, 'aaa');
  s.user.gear.pity = 59;
  hub.rng = () => 0;
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  assert.equal(msgs(a, 'coin', 'draw').at(-1).pulls[0].chips, 2500);
  assert.equal(s.user.gear.pity, 0);
});

test('free draw: costs 0, charges 1 per 2h up to 2, coin_free when empty', async () => {
  const { hub, clock, store } = await setup({ coinSeed: 0 });
  const a = await login(hub, 'aaa');
  const s = sess(hub, 'aaa');
  hub.rng = () => 0;
  assert.deepEqual(msgs(a, 'me').at(-1).wallet.free, { n: 2, next: null });
  await a.send({ t: 'coin', a: 'draw', n: 1, free: true });
  let d = msgs(a, 'coin', 'draw').at(-1);
  assert.equal(d.chips, 200); assert.equal(d.free.n, 1);
  assert.equal(s.user.coins, 0);
  assert.equal(msgs(a, 'me').at(-1).wallet.free.next, 2 * 3600_000);
  clock.advance(1000);
  await a.send({ t: 'coin', a: 'draw', n: 1, free: true });
  assert.equal(msgs(a, 'coin', 'draw').at(-1).free.n, 0);
  clock.advance(1000);
  await a.send({ t: 'coin', a: 'draw', n: 1, free: true });
  assert.equal(lastErr(a).code, 'coin_free');
  assert.equal(lastErr(a).msg, '무료 뽑기가 없습니다.');
  assert.equal(store.ledger().filter((x) => x.kind === 'draw').length, 2);
  // 1h59m after the second free draw: still none; 2h: one back
  clock.advance(2 * 3600_000 - 3000);
  hub.sendMe(s);
  assert.equal(msgs(a, 'me').at(-1).wallet.free.n, 0);
  clock.advance(2000);
  await a.send({ t: 'coin', a: 'draw', n: 1, free: true });
  assert.equal(msgs(a, 'coin', 'draw').at(-1).free.n, 0);
  // a long wait caps at 2
  clock.advance(10 * 3600_000);
  hub.sendMe(s);
  assert.deepEqual(msgs(a, 'me').at(-1).wallet.free, { n: 2, next: null });
  // free:true with n=10 is bad
  await a.send({ t: 'coin', a: 'draw', n: 10, free: true });
  assert.equal(lastErr(a).code, 'coin_bad');
});

test('pool: grows, persists across a new hub with the same store, resets on jackpot', async () => {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const mk = () => createHub({ store, rng: seeded(1), now: clock.now, timers: clock, coinSeed: 100 });
  let hub = mk();
  let a = await login(hub, 'aaa');
  hub.rng = () => 0;
  await a.send({ t: 'coin', a: 'draw', n: 10 });
  assert.equal(hub.pool, 10200);
  assert.equal(await store.getMeta('pool'), 10200);
  assert.equal(msgs(a, 'me').at(-1).wallet.pool, 10200);
  await hub.close();
  hub = mk();
  a = await login(hub, 'aaa');
  assert.equal(msgs(a, 'me').at(-1).wallet.pool, 10200);
  clock.advance(1000);
  hub.rng = () => 0.9995; // roll 99950: 갱식 잭팟
  const bank = sess(hub, 'aaa').user.bank;
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  const d = msgs(a, 'coin', 'draw').at(-1);
  assert.equal(d.pulls[0].tier, 5);
  assert.equal(d.pulls[0].chips, 10220);
  assert.equal(d.pool, 10000);
  assert.equal(sess(hub, 'aaa').user.bank, bank + 10220);
  assert.equal(await store.getMeta('pool'), 10000);
  assert.ok(sess(hub, 'aaa').user.gear.owned.includes('title.jackpot'));
  assert.deepEqual(msgs(a, 'me').at(-1).wallet.owned, ['title.jackpot']);
  // a second jackpot does not duplicate the title
  clock.advance(1000);
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  assert.deepEqual(sess(hub, 'aaa').user.gear.owned, ['title.jackpot']);
  // not sold in the shop
  await a.send({ t: 'coin', a: 'buy', id: 'title.jackpot' });
  assert.equal(lastErr(a).code, 'shop_no');
  await hub.close();
});

test('hist: last draws newest first with n, chips, best', async () => {
  const { hub, clock } = await setup({ coinSeed: 100 });
  const a = await login(hub, 'aaa');
  hub.rng = () => 0;
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  clock.advance(400);
  await a.send({ t: 'coin', a: 'draw', n: 10 });
  clock.advance(400);
  await a.send({ t: 'coin', a: 'draw', n: 1, free: true });
  await a.send({ t: 'coin', a: 'hist' });
  const h = msgs(a, 'coin', 'hist').at(-1);
  assert.equal(h.list.length, 3);
  assert.deepEqual(h.list.map((x) => [x.n, x.chips, x.best]), [[1, 200, 0], [10, 2800, 2], [1, 200, 0]]);
  assert.equal(typeof h.list[0].at, 'number');
  for (let i = 0; i < 55; i++) { clock.advance(400); sess(hub, 'aaa').user.coins += 5; await a.send({ t: 'coin', a: 'draw', n: 1 }); }
  await a.send({ t: 'coin', a: 'hist' });
  assert.equal(msgs(a, 'coin', 'hist').at(-1).list.length, 50);
});

test('draw/buy/swap are refused inside a room', async () => {
  const { hub } = await setup({ coinSeed: 50 });
  const a = await login(hub, 'aaa');
  await a.send({ t: 'create', mode: 'bluff' });
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  assert.equal(lastErr(a).code, 'coin_room');
  assert.equal(sess(hub, 'aaa').user.coins, 50);
});

test('shop: buy, shop_own, shop_no, coin_low, equip, shop_not, unequip', async () => {
  const { hub, store } = await setup({ coinSeed: 25 });
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  await a.send({ t: 'coin', a: 'buy', id: 'title.jotbyin' }); // price 20
  assert.equal(u.coins, 5);
  assert.deepEqual(u.gear.owned, ['title.jotbyin']);
  assert.deepEqual(msgs(a, 'coin', 'buy').at(-1), { t: 'coin', a: 'buy', id: 'title.jotbyin' });
  assert.equal(store.ledger().find((x) => x.kind === 'buy').note.item, 'title.jotbyin');
  await a.send({ t: 'coin', a: 'buy', id: 'title.jotbyin' });
  assert.equal(lastErr(a).code, 'shop_own');
  await a.send({ t: 'coin', a: 'buy', id: 'nothing.here' });
  assert.equal(lastErr(a).code, 'shop_no');
  await a.send({ t: 'coin', a: 'buy', id: 'suit.white' });
  assert.equal(lastErr(a).code, 'coin_low');
  await a.send({ t: 'coin', a: 'equip', slot: 'frame', id: 'frame.silver' });
  assert.equal(lastErr(a).code, 'shop_not');
  await a.send({ t: 'coin', a: 'equip', slot: 'title', id: 'frame.silver' });
  assert.equal(lastErr(a).code, 'shop_no');
  await a.send({ t: 'coin', a: 'equip', slot: 'title', id: 'title.jotbyin' });
  assert.deepEqual(u.gear.equip, { title: 'title.jotbyin' });
  assert.deepEqual(msgs(a, 'me').at(-1).wallet.equip, { title: 'title.jotbyin' });
  await a.send({ t: 'coin', a: 'equip', slot: 'title', id: null });
  assert.deepEqual(u.gear.equip, {});
  await a.send({ t: 'create', mode: 'bluff' });
  await a.send({ t: 'coin', a: 'buy', id: 'color.sky' });
  assert.equal(lastErr(a).code, 'coin_room');
});

test('rank: by total earned, kept after spending, zero excluded', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  await login(hub, 'bbb');
  const z = await login(hub, 'zzz');
  const room = { members: [] };
  hub.award(room, 'draw', [{ id: 'bbb', won: true, opp: 3 }]); // 8
  hub.award(room, 'yacht', [{ id: 'aaa', won: false, opp: 3 }]); // 3
  sess(hub, 'aaa').user.coins = 0; // spent
  await z.send({ t: 'coin', a: 'rank' });
  const r = msgs(z, 'coin', 'rank').at(-1);
  assert.deepEqual(r.top, [{ name: 'bbb', total: 8 }, { name: 'aaa', total: 3 }]);
  assert.deepEqual(r.mine, { rank: null, total: 0 });
  await a.send({ t: 'coin', a: 'rank' });
  assert.deepEqual(msgs(a, 'coin', 'rank').at(-1).mine, { rank: 2, total: 3 });
});

test('bad coin requests: coin_bad with code', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  await a.send({ t: 'coin', a: 'draw', n: 5 });
  assert.equal(lastErr(a).code, 'coin_bad');
  await a.send({ t: 'coin', a: 'draw', n: 1, free: 'yes' });
  assert.equal(lastErr(a).code, 'coin_bad');
  await a.send({ t: 'coin', a: 'zzz' });
  assert.equal(lastErr(a).code, 'coin_bad');
});

test('me.wallet shape; no pin or hash in any message', async () => {
  const { hub } = await setup({ coinSeed: 3 });
  const a = await login(hub, 'aaa');
  const s = sess(hub, 'aaa');
  s.user.pin = { s: 'SALTSECRET', h: 'HASHSECRET', t: ['TOKSECRET'] };
  hub.sendMe(s);
  const me = msgs(a, 'me').at(-1);
  assert.deepEqual(me.wallet, { coins: 3, total: 0, pity: 0, owned: [], equip: {}, hasPin: true, free: { n: 2, next: null }, pool: 10000 });
  assert.equal(me.user.pin, undefined);
  await a.send({ t: 'coin', a: 'buy', id: 'nope' });
  await a.send({ t: 'coin', a: 'rank' });
  const all = a.sock.raw.join('\n');
  for (const secret of ['SALTSECRET', 'HASHSECRET', 'TOKSECRET']) assert.ok(!all.includes(secret));
});
