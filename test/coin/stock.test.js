import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { item, ITEMS } from '../../shared/coin/shop.js';
import { ROWS, NEVER, priceOf, periodOf, rollRow } from '../../shared/coin/stock.js';
import { parseCoin } from '../../shared/coin/protocol.js';

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
const stockOfMe = (c) => msgs(c, 'me').at(-1).wallet.stock;

test('같은 기간 두 번 → 같은 진열, 기간이 바뀌면 다시 뽑음', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const s1 = stockOfMe(a);
  hub.sendMe(sess(hub, 'aaa'));
  assert.deepEqual(stockOfMe(a), s1);
  assert.equal(s1.a.ids.length, 5);
  assert.equal(s1.b.ids.length, 5);
  clock.advance(10_000);
  hub.sendMe(sess(hub, 'aaa'));
  const s3 = stockOfMe(a);
  assert.deepEqual(s3.a.ids, s1.a.ids);
  assert.equal(s3.a.left, s1.a.left - 10_000);
  // next period of row a (5 min)
  const t = clock.now();
  clock.advance(ROWS.a.ms - (t % ROWS.a.ms));
  hub.sendMe(sess(hub, 'aaa'));
  const s4 = stockOfMe(a);
  assert.notDeepEqual(s4.a.ids, s1.a.ids);
  assert.ok(s4.a.left > 0 && s4.a.left <= ROWS.a.ms);
  assert.equal(sess(hub, 'aaa').user.gear.stock.a.p, periodOf(ROWS.a, clock.now()));
  // a whole hour later row b changes too
  clock.advance(ROWS.b.ms);
  hub.sendMe(sess(hub, 'aaa'));
  assert.notDeepEqual(stockOfMe(a).b.ids, s1.b.ids);
});

test('안 가진 것만, 겹침 없음, 금지 품목·갱식 없음', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { hub } = await setup({ seed });
    const a = await login(hub, 'aaa');
    const u = sess(hub, 'aaa').user;
    u.gear.owned = ITEMS.filter((i) => i.g === 0 && i.cap).slice(0, 20).map((i) => i.id);
    u.gear.stock = {};
    hub.sendMe(sess(hub, 'aaa'));
    const st = stockOfMe(a);
    const all = [...st.a.ids, ...st.b.ids].filter(Boolean);
    assert.equal(new Set(all).size, all.length, 'no duplicates, rows do not overlap');
    for (const id of all) {
      const it = item(id);
      assert.ok(it.cap && it.g < 4, id);
      assert.ok(!NEVER.includes(id), id);
      assert.ok(!u.gear.owned.includes(id), id);
      assert.ok(priceOf(it) > 0, id);
    }
  }
});

test('rollRow: 후보 부족하면 다른 등급, 모두 없으면 null', () => {
  const rng = seeded(7);
  const everything = ITEMS.map((i) => i.id);
  assert.deepEqual(rollRow(rng, ROWS.a, everything, []), [null, null, null, null, null]);
  const g0 = ITEMS.filter((i) => i.g === 0).map((i) => i.id);
  for (const id of rollRow(rng, ROWS.a, g0, [])) assert.ok(id && item(id).g >= 1);
});

test('rollRow: 등급 비율(10만 칸) ±1%p', () => {
  for (const key of ['a', 'b']) {
    const row = ROWS[key];
    const rng = seeded(12345);
    const cnt = {};
    const rolls = 20000;
    for (let i = 0; i < rolls; i++) for (const id of rollRow(rng, row, [], [])) cnt[item(id).g] = (cnt[item(id).g] ?? 0) + 1;
    const total = rolls * row.n;
    const wt = row.w.reduce((s, [, w]) => s + w, 0);
    for (const [g, w] of row.w) {
      const got = ((cnt[g] ?? 0) / total) * 100;
      assert.ok(Math.abs(got - (w / wt) * 100) <= 1, `row ${key} grade ${g}: ${got}`);
    }
    for (const g of Object.keys(cnt)) assert.ok(row.w.some(([x]) => x === Number(g)), `unexpected grade ${g}`);
  }
});

test('사기: 진열 밖은 shop_gone, 진열 안은 성공, 금액은 priceOf', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  u.coins = 100000;
  const st = stockOfMe(a);
  const shown = new Set([...st.a.ids, ...st.b.ids]);
  const outside = ITEMS.find((i) => i.cap && i.g < 4 && !shown.has(i.id) && priceOf(i));
  await a.send({ t: 'coin', a: 'buy', id: outside.id });
  assert.equal(lastErr(a).code, 'shop_gone');
  assert.equal(lastErr(a).msg, '진열이 바뀌었습니다.');
  assert.equal(u.coins, 100000);
  const pick = st.b.ids[0];
  await a.send({ t: 'coin', a: 'buy', id: pick });
  assert.equal(u.coins, 100000 - priceOf(pick));
  assert.ok(u.gear.owned.includes(pick));
  await a.send({ t: 'coin', a: 'buy', id: pick });
  assert.equal(lastErr(a).code, 'shop_own');
  await a.send({ t: 'coin', a: 'buy', id: 'title.jackpot' });
  assert.equal(lastErr(a).code, 'shop_no');
});

test('기간이 바뀐 뒤 옛 진열 품목 사기는 shop_gone', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  u.coins = 100000;
  const old = stockOfMe(a).a.ids[0];
  clock.advance(ROWS.b.ms);
  hub.sendMe(sess(hub, 'aaa'));
  const now = stockOfMe(a);
  if ([...now.a.ids, ...now.b.ids].includes(old)) return;
  await a.send({ t: 'coin', a: 'buy', id: old });
  assert.equal(lastErr(a).code, 'shop_gone');
});

test('stock 요청: 방 안팎 어디서나, 1초에 한 번, me 다시 보냄', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const before = msgs(a, 'me').length;
  await a.send({ t: 'coin', a: 'stock' });
  assert.equal(msgs(a, 'me').length, before + 1);
  await a.send({ t: 'coin', a: 'stock' });
  assert.equal(msgs(a, 'me').length, before + 1, 'rate limited');
  clock.advance(1100);
  await a.send({ t: 'create', mode: 'bluff' });
  const n = msgs(a, 'me').length;
  await a.send({ t: 'coin', a: 'stock' });
  assert.equal(msgs(a, 'me').length, n + 1);
  assert.equal(msgs(a, 'error').length, 0);
  assert.deepEqual(parseCoin({ t: 'coin', a: 'stock' }).msg, { t: 'coin', a: 'stock' });
});

test('진열이 gear.stock 에 저장된다', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const st = stockOfMe(a);
  const gear = sess(hub, 'aaa').user.gear;
  assert.deepEqual(gear.stock.a.ids, st.a.ids);
  assert.deepEqual(gear.stock.b.ids, st.b.ids);
  assert.equal(gear.stock.a.p, periodOf(ROWS.a, hub.now()));
});
