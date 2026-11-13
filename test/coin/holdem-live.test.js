// Holdem settlement must go to the live session user, not the copy captured at hand start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';

async function started() {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(undefined), rng: seeded(5), now: clock.now, timers: clock });
  const a = client(hub);
  const b = client(hub);
  await a.send({ t: 'login', id: 'aaa' });
  await b.send({ t: 'login', id: 'bbb' });
  await a.send({ t: 'create', mode: 'holdem' });
  const room = [...hub.rooms.values()][0];
  await b.send({ t: 'join', code: room.code });
  await a.send({ t: 'start' });
  return { hub, room };
}

test('settleLive applies the chip delta and stats to the live user, stale copy untouched', async () => {
  const { hub, room } = await started();
  const s = hub.sessions.get('aaa');
  const old = s.user;
  const live = structuredClone(old); // as if the player re-logged-in and loaded a newer copy
  hub.userEpoch.set(live, hub.epoch);
  s.user = live;
  const bank0 = live.bank;
  const seat = room.hand.st.seats.find((x) => x.id === 'aaa');
  seat.stack = room.hand.start.get('aaa') + 100;
  live.coins = 777; // earned meanwhile
  room.settleLive(seat, (u) => { u.stats.hands++; });
  assert.equal(live.bank, bank0 + 100);
  assert.equal(live.coins, 777);
  assert.equal(live.stats.hands, 1);
  assert.equal(old.bank, bank0);
  assert.equal(old.stats.hands, 0);
});

test('settleLive with nobody logged in adds only the delta to the stored row', async () => {
  const { hub, room } = await started();
  const seat = room.hand.st.seats.find((x) => x.id === 'aaa');
  const bank0 = hub.sessions.get('aaa').user.bank;
  hub.sessions.delete('aaa');
  seat.stack = room.hand.start.get('aaa') + 30;
  room.settleLive(seat);
  await new Promise((r) => setTimeout(r, 20));
  await Promise.all([...hub.pendingSaves]);
  const after = await hub.store.getOrCreate('aaa');
  assert.equal(after.bank, bank0 + 30);
});
