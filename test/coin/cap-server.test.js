import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { ITEMS } from '../../shared/coin/shop.js';

async function setup(seed = 1) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(seed), now: clock.now, timers: clock, coinSeed: 0 });
  return { clock, store, hub };
}
async function login(hub, id, coins = 1000) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  hub.sessions.get(id.toLowerCase()).user.coins = coins;
  return c;
}
const msgs = (c, t, a) => c.sock.msgs.filter((m) => m.t === t && (a === undefined || m.a === a));
const lastErr = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1);
const U = (hub, id) => hub.sessions.get(id.toLowerCase()).user;
const cap = (c, n) => c.send({ t: 'coin', a: 'cap', n });
const trashTitles = ITEMS.filter((i) => i.slot === 'title' && i.g === 0).map((i) => i.id);
const stickers = ITEMS.filter((i) => i.art?.type === 'sticker').map((i) => i.id);
const legends = ITEMS.filter((i) => i.g === 3 && i.cap);

test('cap: 1 costs 10, 10 costs 100, ledger, reply shape', async () => {
  const { hub, store, clock } = await setup();
  const a = await login(hub, 'aaa');
  await cap(a, 1);
  assert.equal(U(hub, 'aaa').coins, 990);
  const r1 = msgs(a, 'coin', 'cap').at(-1);
  assert.equal(r1.pulls.length, 1);
  assert.deepEqual(Object.keys(r1.pulls[0]).sort(), ['dup', 'g', 'id', 'shard']);
  clock.advance(400);
  await cap(a, 10);
  assert.equal(U(hub, 'aaa').coins, 890);
  const r10 = msgs(a, 'coin', 'cap').at(-1);
  assert.equal(r10.pulls.length, 10);
  assert.ok(r10.pulls.some((p) => p.g >= 2), '10-pull concept guarantee');
  assert.equal(msgs(a, 'me').at(-1).wallet.coins, 890);
  const l = store.ledger().filter((x) => x.kind === 'cap');
  assert.equal(l.length, 2);
  assert.equal(l[0].delta, -10);
  assert.equal(l[1].delta, -100);
  assert.deepEqual(l[1].note.ids, r10.pulls.map((p) => p.id));
  for (const p of r10.pulls) assert.ok(U(hub, 'aaa').gear.owned.includes(p.id));
});

test('cap: coin_low, coin_room, rate limit', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa', 9);
  await cap(a, 1);
  assert.equal(lastErr(a).code, 'coin_low');
  U(hub, 'aaa').coins = 100;
  clock.advance(400);
  await cap(a, 1);
  await cap(a, 1); // same instant: dropped
  assert.equal(U(hub, 'aaa').coins, 90);
  clock.advance(400);
  await a.send({ t: 'create', mode: 'bluff' });
  await cap(a, 1);
  assert.equal(lastErr(a).code, 'coin_room');
  assert.equal(U(hub, 'aaa').coins, 90);
});

test('cap: pity at 80, dup shards, trashking', async () => {
  const { hub, clock } = await setup(7);
  const a = await login(hub, 'aaa', 100000);
  const u = U(hub, 'aaa');
  u.gear.cpity = 79;
  await cap(a, 1);
  assert.ok(msgs(a, 'coin', 'cap').at(-1).pulls[0].g >= 3);
  assert.equal(u.gear.cpity, 0);
  // own everything: every pull is a dup with the grade's shard amount
  u.gear.owned = ITEMS.map((i) => i.id);
  u.gear.shard = 0;
  clock.advance(400);
  await cap(a, 10);
  const r = msgs(a, 'coin', 'cap').at(-1);
  const S = [1, 3, 10, 30, 100];
  let sum = 0;
  for (const p of r.pulls) { assert.ok(p.dup); assert.equal(p.shard, S[p.g]); sum += p.shard; }
  assert.equal(r.shard, sum);
  assert.equal(u.gear.shard, sum);
  assert.equal(r.got, undefined);

  // trashking: 19 trash titles owned, pull until a new one completes the set
  const { hub: h2, clock: c2 } = await setup(3);
  const b = await login(h2, 'bbb', 1000000);
  const ub = U(h2, 'bbb');
  ub.gear.owned = trashTitles.slice(0, 19);
  let got = null;
  for (let i = 0; i < 600 && !got; i++) {
    c2.advance(400);
    await cap(b, 1);
    got = msgs(b, 'coin', 'cap').at(-1).got;
  }
  assert.deepEqual(got, ['title.trashking']);
  assert.ok(ub.gear.owned.includes('title.trashking'));
});

test('craft: success and errors', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const u = U(hub, 'aaa');
  const L = legends[0].id;
  await a.send({ t: 'coin', a: 'craft', id: 'nope' });
  assert.equal(lastErr(a).code, 'shop_no');
  await a.send({ t: 'coin', a: 'craft', id: trashTitles[0] });
  assert.equal(lastErr(a).code, 'shop_no');
  u.gear.shard = 99;
  await a.send({ t: 'coin', a: 'craft', id: L });
  assert.equal(lastErr(a).code, 'coin_low');
  u.gear.shard = 130;
  await a.send({ t: 'coin', a: 'craft', id: L });
  assert.equal(u.gear.shard, 30);
  assert.ok(u.gear.owned.includes(L));
  assert.equal(msgs(a, 'coin', 'craft').at(-1).id, L);
  await a.send({ t: 'coin', a: 'craft', id: L });
  assert.equal(lastErr(a).code, 'shop_own');
  u.gear.shard = 100;
  await a.send({ t: 'create', mode: 'bluff' });
  await a.send({ t: 'coin', a: 'craft', id: legends[1].id });
  assert.equal(lastErr(a).code, 'coin_room');
});

test('craft writes a ledger line', async () => {
  const { hub, store } = await setup();
  const a = await login(hub, 'aaa');
  U(hub, 'aaa').gear.shard = 100;
  await a.send({ t: 'coin', a: 'craft', id: legends[0].id });
  const l = store.ledger().filter((x) => x.kind === 'craft');
  assert.equal(l.length, 1);
  assert.equal(l[0].note.item, legends[0].id);
});

test('pos: ownership, clamp, validation, rate limit, me fields', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const u = U(hub, 'aaa');
  const S = stickers[0];
  const P = (o) => a.send({ t: 'coin', a: 'pos', id: S, x: 0.1, y: -0.2, s: 1.5, r: 30, ...o });
  await P({});
  assert.equal(lastErr(a).code, 'shop_not');
  await a.send({ t: 'coin', a: 'pos', id: trashTitles[0], x: 0, y: 0, s: 1, r: 0 });
  assert.equal(lastErr(a).code, 'shop_no');
  u.gear.owned.push(S);
  await P({});
  assert.deepEqual(u.gear.pos[S], { x: 0.1, y: -0.2, s: 1.5, r: 30 });
  assert.deepEqual(msgs(a, 'me').at(-1).wallet.pos[S], { x: 0.1, y: -0.2, s: 1.5, r: 30 });
  clock.advance(1100);
  await P({ x: 0.9 });
  assert.equal(lastErr(a).code, 'coin_bad');
  await P({ s: 5 });
  assert.equal(lastErr(a).code, 'coin_bad');
  clock.advance(1100);
  for (let i = 1; i <= 7; i++) await P({ x: i / 20 });
  assert.equal(u.gear.pos[S].x, 5 / 20);
  clock.advance(1100);
  await P({ x: -0.4 });
  assert.equal(u.gear.pos[S].x, -0.4);
  const w = msgs(a, 'me').at(-1).wallet;
  assert.equal(w.shard, 0);
  assert.equal(w.cpity, 0);
});

test('equip works for every slot', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const u = U(hub, 'aaa');
  for (const slot of ['hat', 'acc', 'face', 'frame', 'color', 'suit', 'title']) {
    const it = ITEMS.find((i) => i.slot === slot);
    u.gear.owned.push(it.id);
    await a.send({ t: 'coin', a: 'equip', slot, id: it.id });
    assert.equal(u.gear.equip[slot], it.id, slot);
  }
});

test('cap news: legend -> lobby only, gang -> everyone, admin skipped', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const lob = await login(hub, 'lob');
  const inroom = await login(hub, 'rrr');
  await inroom.send({ t: 'create', mode: 'bluff' });
  const adm = await login(hub, 'zzz');
  hub.sessions.get('zzz').id = '관리자'; // capNews skips the admin session by id
  const news = (c) => msgs(c, 'coin', 'news');
  const rig = (g) => { // first roll picks grade g, second picks item 0
    const w = [0.3, 0.8, 0.95, 0.985, 0.9985][g];
    let k = 0;
    hub.rng = () => (k++ % 2 === 0 ? w : 0);
  };
  rig(3);
  await cap(a, 1);
  assert.equal(news(lob).length, 1);
  assert.equal(news(lob)[0].g, 3);
  assert.equal(news(lob)[0].name, U(hub, 'aaa').name);
  assert.equal(news(lob)[0].item, msgs(a, 'coin', 'cap').at(-1).pulls[0].id);
  assert.equal(news(inroom).length, 0);
  assert.equal(news(a).length, 0);
  clock.advance(400);
  rig(4);
  await cap(a, 1);
  assert.equal(news(lob).at(-1).g, 4);
  assert.equal(news(inroom).length, 1);
  const before = news(lob).length;
  U(hub, 'zzz').coins = 100;
  rig(4);
  await adm.send({ t: 'coin', a: 'cap', n: 1 });
  assert.equal(news(lob).length, before);
});
