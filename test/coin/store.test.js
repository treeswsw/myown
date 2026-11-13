import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, newUser, normalizeUser, RANK_EXCLUDED_ID } from '../../server/store.js';

const mk = async (store, id, name, total) => {
  const u = await store.getOrCreate(id, name);
  u.coinsTotal = total; u.coins = total;
  await store.save(u);
};

test('new fields round-trip', async () => {
  const s = createStore(null);
  const u = await s.getOrCreate('a', 'A');
  assert.equal(u.coins, 0); assert.equal(u.coinsTotal, 0); assert.equal(u.pin, null);
  assert.deepEqual(u.gear, { pity: 0, owned: [], equip: {}, shard: 0, cpity: 0, pos: {} });
  u.coins = 7; u.coinsTotal = 12; u.gear = { pity: 3, owned: ['title.jotbyin'], equip: { title: 'title.jotbyin' }, shard: 12, cpity: 5, pos: {} };
  u.pin = { s: 'x', h: 'y', t: ['z'] };
  await s.save(u);
  assert.deepEqual(await s.getOrCreate('a', 'A'), u);
});

test('old-shape user reads with defaults', async () => {
  const s = createStore(null);
  await s.save({ id: 'o', name: 'O', bank: 5, avatar: null, stats: {} });
  const u = await s.getOrCreate('o', 'O');
  assert.equal(u.coins, 0); assert.equal(u.coinsTotal, 0); assert.equal(u.pin, null);
  assert.deepEqual(u.gear, { pity: 0, owned: [], equip: {}, shard: 0, cpity: 0, pos: {} });
  assert.deepEqual(normalizeUser({ gear: {} }).gear, { pity: 0, owned: [], equip: {}, shard: 0, cpity: 0, pos: {} });
  assert.equal(newUser('x', 'X').coins, 0);
});

test('coin ranking: order, exclusions, rank', async () => {
  const s = createStore(null);
  await mk(s, 'b', 'bob', 5); await mk(s, 'a', 'amy', 5); await mk(s, 'c', 'cat', 9);
  await mk(s, 'z', 'zero', 0); await mk(s, RANK_EXCLUDED_ID, '관리자', 999);
  assert.deepEqual(await s.topCoin(20), [{ name: 'cat', total: 9 }, { name: 'amy', total: 5 }, { name: 'bob', total: 5 }]);
  assert.deepEqual(await s.topCoin(1), [{ name: 'cat', total: 9 }]);
  assert.deepEqual(await s.coinRank('b'), { rank: 3, total: 5 });
  assert.deepEqual(await s.coinRank('z'), { rank: null, total: 0 });
  assert.deepEqual(await s.coinRank(RANK_EXCLUDED_ID), { rank: null, total: 999 });
  assert.deepEqual(await s.coinRank('nobody'), { rank: null, total: 0 });
  // spending does not change the ranking (coinsTotal only)
  const u = await s.getOrCreate('c', 'cat'); u.coins = 0; await s.save(u);
  assert.equal((await s.coinRank('c')).rank, 1);
});

test('exists, clearPin, log, clear', async () => {
  const s = createStore(null);
  assert.equal(await s.exists('a'), false);
  const u = await s.getOrCreate('a', 'A');
  u.pin = { s: 's', h: 'h', t: [] }; await s.save(u);
  assert.equal(await s.exists('a'), true);
  assert.equal(await s.clearPin('nobody'), false);
  assert.equal(await s.clearPin('a'), true);
  assert.equal((await s.getOrCreate('a', 'A')).pin, null);
  await s.log({ uid: 'a', kind: 'earn', delta: 3, bal: 3, note: { mode: 'yacht' } });
  assert.equal(s.ledger().length, 1);
  assert.equal(s.ledger()[0].chips, 0);
  await s.clear();
  assert.equal(await s.exists('a'), false);
  assert.equal(s.ledger().length, 0);
});

test('memory ledger keeps the last 10,000 lines', async () => {
  const s = createStore(null);
  for (let i = 0; i < 10_005; i++) await s.log({ uid: 'a', kind: 'earn', delta: i, bal: i });
  const l = s.ledger();
  assert.equal(l.length, 10_000);
  assert.equal(l[0].delta, 5);
  assert.equal(l.at(-1).delta, 10_004);
});

test('meta: get/set, clear wipes it; ledgerFor newest first', async () => {
  const s = createStore(null);
  assert.equal(await s.getMeta('pool'), null);
  await s.setMeta('pool', 12345);
  assert.equal(await s.getMeta('pool'), 12345);
  await s.setMeta('pool', { a: [1] });
  assert.deepEqual(await s.getMeta('pool'), { a: [1] });
  await s.log({ uid: 'a', kind: 'draw', delta: -5, bal: 1, chips: 200, note: { n: 1 } });
  await s.log({ uid: 'a', kind: 'swap', delta: -1, bal: 0, chips: 100 });
  await s.log({ uid: 'a', kind: 'draw', delta: -50, bal: 0, chips: 2800, note: { n: 10 } });
  await s.log({ uid: 'b', kind: 'draw', delta: -5, bal: 0, chips: 500 });
  const rows = await s.ledgerFor('a', 'draw', 10);
  assert.deepEqual(rows.map((r) => r.chips), [2800, 200]);
  assert.equal(typeof rows[0].at, 'number');
  assert.equal((await s.ledgerFor('a', 'draw', 1)).length, 1);
  await s.clear();
  assert.equal(await s.getMeta('pool'), null);
  assert.deepEqual(await s.ledgerFor('a', 'draw', 10), []);
});
