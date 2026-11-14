import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import { item, ITEMS } from '../../shared/coin/shop.js';
import { NEVER, priceOf, WEIGHTS, TICK_MS, FEAT_MS, rollSlot, rollFeat } from '../../shared/coin/stock.js';
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

const ids = (st) => st.row.map((c) => c.id);
const toNextTick = (clock) => clock.advance(TICK_MS - (clock.now() % TICK_MS));

test('틱이 지나면 한 칸 밀리고 오른쪽 끝에 새 칸, left·next 값', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const s1 = stockOfMe(a);
  assert.equal(s1.row.length, 6);
  assert.equal(s1.feat.ids.length, 2);
  assert.ok(s1.next > 0 && s1.next <= TICK_MS);
  assert.equal(s1.row[0].left, s1.next, '맨 왼쪽 칸은 다음 틱에 나간다');
  for (let i = 1; i < 6; i++) assert.equal(s1.row[i].left, s1.row[i - 1].left + TICK_MS);
  assert.equal(s1.row[5].left, s1.next + 5 * TICK_MS);
  hub.sendMe(sess(hub, 'aaa'));
  assert.deepEqual(stockOfMe(a), s1, '같은 시각이면 같다');
  clock.advance(10_000);
  hub.sendMe(sess(hub, 'aaa'));
  const s2 = stockOfMe(a);
  assert.deepEqual(ids(s2), ids(s1));
  assert.equal(s2.next, s1.next - 10_000);
  assert.equal(s2.row[0].left, s1.row[0].left - 10_000);
  toNextTick(clock);
  hub.sendMe(sess(hub, 'aaa'));
  const s3 = stockOfMe(a);
  assert.deepEqual(ids(s3).slice(0, 5), ids(s1).slice(1));
  assert.equal(s3.row[5].left, 6 * TICK_MS);
  assert.equal(s3.next, TICK_MS);
  assert.equal(sess(hub, 'aaa').user.gear.stock.t, Math.floor(hub.now() / TICK_MS));
  // 여러 틱(5개 미만) 한꺼번에: 그만큼 밀림
  const before = ids(s3);
  clock.advance(3 * TICK_MS);
  hub.sendMe(sess(hub, 'aaa'));
  assert.deepEqual(ids(stockOfMe(a)).slice(0, 3), before.slice(3));
  // 6틱 이상 지나면 전부 새로
  clock.advance(6 * TICK_MS);
  hub.sendMe(sess(hub, 'aaa'));
  const s5 = stockOfMe(a);
  assert.equal(s5.row.length, 6);
  assert.ok(s5.row.every((c) => c.left > 0 && c.left <= 6 * TICK_MS));
});

test('명품은 1시간마다 바뀌고 레전드만(없으면 컨셉)', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const f1 = stockOfMe(a).feat;
  assert.equal(f1.left, FEAT_MS - (clock.now() % FEAT_MS));
  for (const id of f1.ids) assert.equal(item(id).g, 3);
  const fp0 = Math.floor(clock.now() / FEAT_MS);
  clock.advance(10 * TICK_MS);
  if (Math.floor(clock.now() / FEAT_MS) === fp0) { // 같은 시간 안
    hub.sendMe(sess(hub, 'aaa'));
    assert.deepEqual(stockOfMe(a).feat.ids, f1.ids);
  }
  clock.advance(FEAT_MS);
  hub.sendMe(sess(hub, 'aaa'));
  const f2 = stockOfMe(a).feat;
  assert.ok(f2.left > 0 && f2.left <= FEAT_MS);
  assert.notDeepEqual(f2.ids, f1.ids);
  // 레전드를 다 가졌다면 컨셉으로
  const u = sess(hub, 'aaa').user;
  u.gear.owned = ITEMS.filter((i) => i.g === 3).map((i) => i.id);
  clock.advance(FEAT_MS);
  hub.sendMe(sess(hub, 'aaa'));
  const f3 = stockOfMe(a).feat;
  assert.equal(f3.ids.length, 2);
  for (const id of f3.ids) assert.equal(item(id).g, 2);
  // 직접: 레전드가 1개만 남으면 레전드 1 + 컨셉 1
  const legends = ITEMS.filter((i) => i.cap && i.g === 3).map((i) => i.id);
  const f4 = rollFeat(seeded(3), legends.slice(1), []);
  assert.equal(item(f4[0]).g, 3);
  assert.equal(item(f4[1]).g, 2);
});

test('안 가진 것만, 겹침 없음, 금지 품목·갱식 없음', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { hub, clock } = await setup({ seed });
    const a = await login(hub, 'aaa');
    const u = sess(hub, 'aaa').user;
    u.gear.owned = ITEMS.filter((i) => i.g === 0 && i.cap).slice(0, 20).map((i) => i.id);
    u.gear.stock = {};
    for (let step = 0; step < 15; step++) {
      hub.sendMe(sess(hub, 'aaa'));
      const st = stockOfMe(a);
      const all = [...ids(st), ...st.feat.ids].filter(Boolean);
      assert.equal(new Set(all).size, all.length, 'no duplicates across row and featured');
      for (const id of all) {
        const it = item(id);
        assert.ok(it.cap && it.g < 4, id);
        assert.ok(!NEVER.includes(id), id);
        assert.ok(!u.gear.owned.includes(id), id);
        assert.ok(priceOf(it) > 0, id);
      }
      clock.advance(step % 4 === 3 ? FEAT_MS : TICK_MS);
    }
  }
});

test('rollSlot: 후보 부족하면 다른 등급, 모두 없으면 null', () => {
  const rng = seeded(7);
  assert.equal(rollSlot(rng, ITEMS.map((i) => i.id), []), null);
  const g0 = ITEMS.filter((i) => i.g === 0).map((i) => i.id);
  for (let i = 0; i < 50; i++) assert.ok(item(rollSlot(rng, g0, [])).g >= 1);
});

test('rollSlot: 등급 비율(20만 칸) ±1%p', () => {
  const rng = seeded(12345);
  const cnt = {};
  const N = 200000;
  for (let i = 0; i < N; i++) { const g = item(rollSlot(rng, [], [])).g; cnt[g] = (cnt[g] ?? 0) + 1; }
  const wt = WEIGHTS.reduce((s, [, w]) => s + w, 0);
  for (const [g, w] of WEIGHTS) {
    const got = ((cnt[g] ?? 0) / N) * 100;
    assert.ok(Math.abs(got - (w / wt) * 100) <= 1, `grade ${g}: ${got}`);
  }
  for (const g of Object.keys(cnt)) assert.ok(WEIGHTS.some(([x]) => x === Number(g)), `unexpected grade ${g}`);
});

test('사기: 진열·명품 밖은 shop_gone, 안은 성공(각각), 금액은 priceOf', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  u.coins = 1000000;
  const st = stockOfMe(a);
  const shown = new Set([...ids(st), ...st.feat.ids]);
  const outside = ITEMS.find((i) => i.cap && i.g < 4 && !shown.has(i.id) && priceOf(i));
  await a.send({ t: 'coin', a: 'buy', id: outside.id });
  assert.equal(lastErr(a).code, 'shop_gone');
  assert.equal(lastErr(a).msg, '진열이 바뀌었습니다.');
  assert.equal(u.coins, 1000000);
  const fromRow = ids(st).find(Boolean);
  await a.send({ t: 'coin', a: 'buy', id: fromRow });
  assert.equal(u.coins, 1000000 - priceOf(fromRow));
  assert.ok(u.gear.owned.includes(fromRow));
  await a.send({ t: 'coin', a: 'buy', id: fromRow });
  assert.equal(lastErr(a).code, 'shop_own');
  const c0 = u.coins;
  const fromFeat = st.feat.ids[0];
  await a.send({ t: 'coin', a: 'buy', id: fromFeat });
  assert.equal(u.coins, c0 - priceOf(fromFeat));
  assert.ok(u.gear.owned.includes(fromFeat));
  // 산 칸은 나갈 때까지 남는다(보유)
  hub.sendMe(sess(hub, 'aaa'));
  assert.ok(ids(stockOfMe(a)).includes(fromRow));
  await a.send({ t: 'coin', a: 'buy', id: 'title.jackpot' });
  assert.equal(lastErr(a).code, 'shop_no');
});

test('나간 칸의 품목 사기는 shop_gone', async () => {
  const { hub, clock } = await setup();
  const a = await login(hub, 'aaa');
  const u = sess(hub, 'aaa').user;
  u.coins = 1000000;
  const gone = ids(stockOfMe(a))[0];
  toNextTick(clock);
  hub.sendMe(sess(hub, 'aaa'));
  const now = stockOfMe(a);
  if (ids(now).includes(gone) || now.feat.ids.includes(gone)) return; // 다시 뽑혔으면 건너뜀
  await a.send({ t: 'coin', a: 'buy', id: gone });
  assert.equal(lastErr(a).code, 'shop_gone');
  assert.equal(u.coins, 1000000);
});

test('옛 모양(gear.stock {a,b}) 이나 깨진 값은 비우고 새로 채움', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'aaa');
  const s = sess(hub, 'aaa');
  for (const old of [{ a: { p: 1, ids: ['x'] }, b: { p: 1, ids: [] } }, null, 'junk', 5, { t: 1, row: 'x' }, { t: 1, fp: 1, row: [], feat: [] }]) {
    s.user.gear.stock = old;
    hub.sendMe(s);
    const st = stockOfMe(a);
    assert.equal(st.row.length, 6);
    assert.equal(st.feat.ids.length, 2);
    assert.equal(s.user.gear.stock.row.length, 6);
  }
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
  assert.deepEqual(gear.stock.row.map((c) => c.id), ids(st));
  assert.deepEqual(gear.stock.feat, st.feat.ids);
  assert.equal(gear.stock.t, Math.floor(hub.now() / TICK_MS));
  assert.equal(gear.stock.fp, Math.floor(hub.now() / FEAT_MS));
});
