// Review fixes: PIN brute-force serialization, login races, draw chip cap, bluff stats on the live user.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

function setup(opts = {}) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(undefined), rng: seeded(5), now: clock.now, timers: clock, ...opts });
  return { clock, hub };
}
const lastCode = (c) => c.sock.msgs.filter((m) => m.t === 'error').at(-1)?.code;

test('50 parallel wrong-PIN logins + the right one: at most 5 are evaluated, the account locks', async () => {
  const { hub } = setup();
  const first = client(hub);
  await first.send({ t: 'login', id: 'ann1', newPin: '1234' });
  first.conn.close();
  const cs = [];
  for (let i = 0; i < 50; i++) cs.push(client(hub));
  const right = client(hub);
  const all = cs.map((c, i) => c.send({ t: 'login', id: 'ann1', pin: String(2000 + i) }));
  all.push(right.send({ t: 'login', id: 'ann1', pin: '1234' }));
  await Promise.all(all);
  const codes = [...cs, right].map(lastCode);
  assert.equal(codes.filter((c) => c === 'pin_bad').length, 5, 'only 5 wrong guesses were ever checked');
  assert.equal(codes.filter((c) => c === 'pin_lock').length, 46);
  assert.equal(right.sock.last('me'), undefined, 'even the right PIN is locked out after 5 wrong ones');
  const later = client(hub);
  await later.send({ t: 'login', id: 'ann1', pin: '1234' });
  assert.equal(lastCode(later), 'pin_lock');
});

test('plain login racing a new id with a PIN must not slip in without the PIN', async () => {
  const { hub } = setup();
  const a = client(hub);
  const b = client(hub);
  await Promise.all([a.send({ t: 'login', id: 'newb1', newPin: '1234' }), b.send({ t: 'login', id: 'newb1' })]);
  assert.ok(a.sock.last('me'));
  assert.equal(b.sock.last('me'), undefined);
  assert.equal(lastCode(b), 'pin_need');
  assert.ok(hub.sessions.get('newb1').user.pin, 'the PIN was not lost');
});

test('draw respects the chip cap like swap (coin_max)', async () => {
  const { hub } = setup();
  const a = client(hub);
  await a.send({ t: 'login', id: 'aaa' });
  const u = hub.sessions.get('aaa').user;
  u.coins = 1000;
  u.bank = 2_000_000_000 - 19_999;
  await a.send({ t: 'coin', a: 'draw', n: 1 });
  assert.equal(lastCode(a), 'coin_max');
  assert.equal(u.coins, 1000);
  assert.equal(a.sock.msgs.filter((m) => m.t === 'coin' && m.a === 'draw').length, 0);
});

test('bluff end writes stats to the live session user, not the copy taken at game start', async () => {
  const { hub } = setup();
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'aaa' });
  await b.send({ t: 'login', id: 'bbb' });
  await a.send({ t: 'create', mode: 'bluff' });
  const room = [...hub.rooms.values()][0];
  await b.send({ t: 'join', code: room.code });
  await a.send({ t: 'start' });
  const s = hub.sessions.get('aaa');
  const old = s.user;
  const live = structuredClone(old); // as if the player re-logged-in and loaded a newer copy
  hub.userEpoch.set(live, hub.epoch);
  s.user = live;
  room.impl.game.g.phase = 'done';
  room.impl.game.g.winner = 'aaa';
  room.impl.afterBluff([]);
  assert.equal(live.stats.bluffGames, 1);
  assert.equal(live.stats.bluffWins, 1);
  assert.equal(old.stats.bluffGames, 0, 'stale copy untouched');
});
