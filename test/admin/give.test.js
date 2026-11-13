// 관리자 칩·코인 추가 (2026-11-13): 접속 중·접속 안 한 아이디, 없는 아이디, 잘못된 수, 일반 사용자 거절. 새 계정 시작 코인.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

const settle = () => new Promise((r) => setTimeout(r, 20));
function setup(opts = {}) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(5), now: clock.now, timers: clock, ...opts });
  return { store, hub };
}
async function mk(hub, id, extra = {}) { const c = client(hub); await c.send({ t: 'login', id, ...extra }); return c; }
const lastErr = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1);

test('admin gives chips and coins to online and offline accounts', async () => {
  const { hub, store } = setup();
  const ann = await mk(hub, 'ann1');
  const bank0 = ann.sock.last('me').user.chips ?? hub.sessions.get('ann1').user.bank;
  const adm = await mk(hub, '관리자', { pw: '9975' });
  await adm.send({ t: 'adm', a: 'chips', id: 'ann1', n: 5000 });
  assert.equal(adm.sock.last('admOk').a, 'chips');
  assert.equal(hub.sessions.get('ann1').user.bank, 10000 + 5000);
  await adm.send({ t: 'adm', a: 'coins', id: 'ann1', n: 7 });
  assert.equal(hub.sessions.get('ann1').user.coins, 7);
  assert.equal(hub.sessions.get('ann1').user.coinsTotal, 0); // 랭킹(번 합)은 그대로
  assert.equal(ann.sock.last('me').wallet.coins, 7); // 접속 중이면 바로 보임
  assert.ok(bank0 !== undefined);
  // offline
  ann.conn.close();
  hub.sessions.delete('ann1');
  await settle();
  await adm.send({ t: 'adm', a: 'coins', id: 'ann1', n: 3 });
  await settle();
  assert.equal((await store.getOrCreate('ann1', 'ann1')).coins, 10);
  // errors
  await adm.send({ t: 'adm', a: 'coins', id: 'nobody1', n: 3 });
  assert.equal(lastErr(adm).code, 'adm_noid');
  await adm.send({ t: 'adm', a: 'chips', id: 'ann1', n: -5 });
  assert.equal(lastErr(adm).code, 'adm_bad');
  await adm.send({ t: 'adm', a: 'chips', id: 'ann1', n: 1.5 });
  assert.equal(lastErr(adm).code, 'adm_bad');
  const bob = await mk(hub, 'bob1');
  await bob.send({ t: 'adm', a: 'coins', id: 'bob1', n: 100 });
  assert.equal(lastErr(bob).code, 'adm_no');
  assert.equal(hub.sessions.get('bob1').user.coins, 0);
});

test('new accounts start with startCoins; old accounts keep theirs', async () => {
  const { hub } = setup({ startCoins: 20 });
  const a = await mk(hub, 'cat1');
  assert.equal(a.sock.last('me').wallet.coins, 20);
  assert.equal(a.sock.last('me').wallet.total, 0);
  a.conn.close(); hub.sessions.delete('cat1'); await settle();
  const again = await mk(hub, 'cat1');
  assert.equal(again.sock.last('me').wallet.coins, 20); // 다시 들어와도 또 주지 않는다
});

test('getOrCreate without a name only reads: null for a missing account, no nameless row is created', async () => {
  const { store } = setup();
  assert.equal(await store.getOrCreate('ghost1'), null);
  assert.equal(await store.exists('ghost1'), false);
  await store.getOrCreate('real1', '진짜');
  const row = await store.getOrCreate('real1');
  assert.equal(row.name, '진짜');
});

test('admin give: missing account -> adm_noid and nothing created; offline existing account -> given', async () => {
  const { hub, store } = setup();
  const adm = await mk(hub, '관리자', { pw: '9975' });
  await adm.send({ t: 'adm', a: 'chips', id: 'ghost1', n: 10 });
  assert.equal(lastErr(adm).code, 'adm_noid');
  assert.equal(await store.exists('ghost1'), false);
  const dan = await mk(hub, 'dan1');
  dan.conn.close(); hub.sessions.delete('dan1'); await settle();
  await adm.send({ t: 'adm', a: 'chips', id: 'dan1', n: 100 });
  await settle();
  assert.equal(adm.sock.last('admOk').a, 'chips');
  assert.equal((await store.getOrCreate('dan1')).bank, 10100);
});
