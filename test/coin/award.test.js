// Coin awards through the real games (SPEC 22-2, 22-12 #2~#3): amounts, leavers, spectators, ties, void rounds, bot rooms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { FakeClock, client, seeded } from '../helpers.js';
import * as L from '../liar/e2e/helpers.js';
import { CATS } from '../../shared/yacht/constants.js';

// ---------- hub + fake clock ----------

async function setup(seed = 1) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({ store, rng: seeded(seed), now: clock.now, timers: clock, liar: 'on', yacht: 'on', draw: 'on' });
  return { clock, store, hub };
}
async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  c.id = id;
  return c;
}
async function lobby(hub, mode, names) {
  const cs = [];
  for (const n of names) cs.push(await login(hub, n));
  await cs[0].send({ t: 'create', mode });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  return cs;
}
const coins = (hub, id) => hub.sessions.get(id)?.user.coins ?? 0;
const got = (c) => c.sock.msgs.filter((m) => m.t === 'coin' && m.a === 'got');

// ---------- bluff ----------

test('bluff: winner 1+1*opp, eliminated-in-game finisher 1, leaver 0, spectator 0', async () => {
  const { hub, clock } = await setup(8);
  const cs = await lobby(hub, 'bluff', ['ann1', 'bob1', 'cat1']);
  const spec = await login(hub, 'dan1');
  await cs[0].send({ t: 'start' });
  await spec.send({ t: 'join', code: cs[0].state.code }); // joins after the deal: not in the game
  const room = [...hub.rooms.values()][0];
  await cs[2].send({ t: 'leave' }); // cat leaves mid game
  const g = room.impl.game.g;
  const who = (id) => g.players.find((p) => p.id === id);
  who('ann1').hand = ['Q', 'Q', 'Q', 'Q', 'Q'];
  who('ann1').bullet = 0;
  g.tableRank = 'K';
  g.turn = g.players.indexOf(who('ann1'));
  await cs[0].send({ t: 'play', cards: [0, 1] });
  await cs[1].send({ t: 'liar' });
  assert.equal(cs[0].state.phase, 'result');
  assert.equal(cs[0].state.winnerId, 'bob1');
  assert.equal(coins(hub, 'bob1'), 1 + 1 * 2, 'winner: opp = starters - 1 = 2');
  assert.equal(coins(hub, 'ann1'), 1, 'shot in game still finished');
  assert.equal(coins(hub, 'cat1'), 0, 'leaver');
  assert.equal(coins(hub, 'dan1'), 0, 'spectator');
  assert.equal(got(cs[1]).length, 1);
  clock.advance(6000);
});

// ---------- yacht ----------

async function playYacht(clock, cs, room, { stop = () => false } = {}) {
  for (let n = 0; n < 400 && room.game.phase === 'playing' && !stop(); n++) {
    const g = room.game;
    const id = g.cols[g.turnIdx].id;
    const c = cs.find((x) => x.id === id);
    await c.send({ t: 'yt', a: 'roll' });
    const col = g.cols.find((x) => x.id === id);
    const cat = CATS.find((k) => col.scores[k] === null);
    await c.send({ t: 'yt', a: 'pick', cat });
    await c.send({ t: 'yt', a: 'score', cat });
    clock.advance(1000);
  }
}

test('yacht: 3 players finish: 3 each, winner +4 per opponent; spectator 0', async () => {
  const { hub, clock } = await setup(3);
  const cs = await lobby(hub, 'yacht', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  const spec = await login(hub, 'dan1');
  await spec.send({ t: 'join', code: cs[0].state.code });
  const room = [...hub.rooms.values()][0].impl; // 요트는 공용 방 틀(Shell) 안의 게임 객체
  await playYacht(clock, cs, room);
  assert.equal(room.game.phase, 'result');
  const r = room.game.result;
  assert.equal(r.reason, 'done');
  for (const id of ['ann1', 'bob1', 'cat1']) {
    assert.equal(coins(hub, id), 3 + (r.winners.includes(id) ? 4 * 2 : 0), id);
  }
  assert.equal(coins(hub, 'dan1'), 0);
  assert.equal(got(spec).length, 0);
});

test('yacht: a forfeiter gets 0, opponents still count the leaver', async () => {
  const { hub, clock } = await setup(5);
  const cs = await lobby(hub, 'yacht', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  const room = [...hub.rooms.values()][0].impl;
  await playYacht(clock, cs, room, { stop: () => room.game.round >= 2 });
  const leaver = room.game.cols[(room.game.turnIdx + 1) % 3].id;
  await cs.find((c) => c.id === leaver).send({ t: 'leave' });
  await playYacht(clock, cs, room);
  assert.equal(room.game.phase, 'result');
  const r = room.game.result;
  assert.ok(!r.ranks.some((x) => x.id === leaver));
  assert.equal(coins(hub, leaver), 0);
  for (const row of r.ranks) assert.equal(coins(hub, row.id), 3 + (r.winners.includes(row.id) ? 4 * 2 : 0), row.id);
});

test('yacht: a room with a bot pays nobody', async () => {
  const { hub, clock } = await setup(5);
  const cs = await lobby(hub, 'yacht', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const room = [...hub.rooms.values()][0].impl;
  hub.sessions.get('bob1').bot = true;
  await playYacht(clock, cs, room);
  assert.equal(room.game.phase, 'result');
  assert.equal(coins(hub, 'ann1'), 0);
  assert.equal(coins(hub, 'bob1'), 0);
});

// ---------- draw ----------

export async function playDraw(clock, cs, { guesser = 'bob1', stop = () => false } = {}) {
  for (let n = 0; n < 600 && !stop() && !cs.every((c) => c.state?.phase === 'final' || c.state === null); n++) {
    for (const c of cs) {
      const st = c.state;
      if (!st) continue;
      if (st.phase === 'pick' && st.drawerId === st.you && st.choices) await c.send({ t: 'dr', a: 'pick', i: 0 });
      if (st.phase === 'draw' && st.drawerId !== st.you && st.you === guesser) {
        const word = cs.find((x) => x.state?.you === st.drawerId)?.state?.word;
        if (word) await c.send({ t: 'chat', text: word });
      }
    }
    clock.advance(1000);
  }
}

test('draw: final ranking pays 2, rank 1 +2 per opponent; leaver and late joiner 0', async () => {
  const { hub, clock } = await setup(9);
  const cs = await lobby(hub, 'draw', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'dr', a: 'settings', rounds: 1, time: 60 });
  await cs[0].send({ t: 'start' });
  const late = await login(hub, 'dan1');
  await late.send({ t: 'join', code: cs[0].state.code });
  await playDraw(clock, cs, { stop: () => cs[0].state.q >= 2 });
  await cs[2].send({ t: 'leave' });
  await playDraw(clock, [cs[0], cs[1], late]);
  const st = cs[0].state;
  assert.equal(st.phase, 'final');
  const rk = st.ranking;
  assert.ok(rk.find((r) => r.id === 'cat1').left);
  assert.ok(rk.some((r) => r.id === 'dan1'), 'late joiner is ranked but not paid');
  for (const r of rk.filter((x) => x.id !== 'dan1' && !x.left)) {
    assert.equal(coins(hub, r.id), 2 + (r.rank === 1 ? 2 * 2 : 0), r.id); // opp = 3 starters - 1
  }
  assert.equal(coins(hub, 'cat1'), 0);
  assert.equal(coins(hub, 'dan1'), 0);
});

// ---------- liar (real server, fast clock) ----------

const T = { judge: 15, guess: 30 };
const bal = (hub, id) => hub.sessions.get(id)?.user.coins ?? 0;

async function liarRound(t, n) {
  const r = await L.roomN(n);
  t.after(() => r.close());
  await L.setTimes(r, T);
  await L.startRound(r);
  const liar = L.findLiar(r.cs);
  const word = L.citizenWordOf(r.cs, liar);
  return { r, liar, word, hub: r.fast.app.hub };
}

async function liarExecute(r, liar, guess) {
  const others = r.cs.filter((c) => c !== liar);
  await L.speakAll(r);
  await L.accuse(r, liar.id);
  await L.judgeMap(r, Object.fromEntries(others.slice(0, 3).map((c) => [c.id, 'yes'])));
  await L.until(() => r.cs.every((c) => c.state.phase === 'unmask'), 'unmask', { clients: r.cs });
  await L.waitPhase(r, 'guess');
  liar.guess(guess);
  await L.waitResult(r);
}

test('liar: citizens win -> citizens 2, liar 1; spectator 0', async (t) => {
  const { r, liar, hub } = await liarRound(t, 4);
  const spec = await L.client(r.fast.app, 'zulu1');
  spec.send({ t: 'join', code: r.code });
  await L.until(() => spec.state?.code, 'spectate', { clients: [spec] });
  await liarExecute(r, liar, '틀린답');
  assert.equal(r.host.state.result.winner, 'citizens');
  await L.until(() => r.cs.every((c) => bal(hub, c.id) > 0), 'paid');
  for (const c of r.cs) assert.equal(bal(hub, c.id), c === liar ? 1 : 2, c.id);
  assert.equal(bal(hub, 'zulu1'), 0);
  assert.ok(!spec.msgs.some((m) => m.t === 'coin'));
  spec.close();
});

test('liar: liar wins -> liar 1 + 3 = 4, citizens 1', async (t) => {
  const { r, liar, word, hub } = await liarRound(t, 4);
  await liarExecute(r, liar, word);
  assert.equal(r.host.state.result.winner, 'liar');
  await L.until(() => r.cs.every((c) => bal(hub, c.id) > 0), 'paid');
  for (const c of r.cs) assert.equal(bal(hub, c.id), c === liar ? 4 : 1, c.id);
});

test('liar: a citizen who leaves gets 0; the rest are paid', async (t) => {
  const { r, liar, hub } = await liarRound(t, 5);
  const leaver = r.cs.find((c) => c !== liar && c !== r.host);
  leaver.send({ t: 'leave' });
  await L.until(() => !r.host.state.players.some((p) => p.id === leaver.id), 'left', { clients: r.cs });
  const rest = { ...r, cs: r.cs.filter((c) => c !== leaver) };
  await liarExecute(rest, liar, '틀린답');
  await L.until(() => rest.cs.every((c) => bal(hub, c.id) > 0), 'paid');
  for (const c of rest.cs) assert.equal(bal(hub, c.id), c === liar ? 1 : 2, c.id);
  assert.equal(bal(hub, leaver.id), 0);
});

test('liar: void round (too few players left) pays nobody', async (t) => {
  const { r, liar, hub } = await liarRound(t, 3);
  const leaver = r.cs.find((c) => c !== r.host && c !== liar);
  leaver.send({ t: 'leave' });
  await L.until(() => r.host.state.phase === 'result', 'result', { clients: r.cs });
  assert.equal(r.host.state.result.winner, 'void');
  await L.sleep(100);
  for (const c of r.cs) assert.equal(bal(hub, c.id), 0, c.id);
  assert.ok(!r.host.msgs.some((m) => m.t === 'coin'));
});

// ---------- alone-end: nobody is paid (SPEC 22-2 "무효") ----------

test('bluff: the last one standing after the others leave gets nothing', async () => {
  const { hub, clock } = await setup(8);
  const cs = await lobby(hub, 'bluff', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  await cs[1].send({ t: 'leave' });
  assert.equal(cs[0].state.phase, 'result');
  assert.equal(cs[0].state.winnerId, 'ann1');
  assert.equal(coins(hub, 'ann1'), 0);
  assert.equal(got(cs[0]).length, 0);
  clock.advance(6000);
});

test('yacht: everyone else left (reason alone) pays nobody', async () => {
  const { hub } = await setup(5);
  const cs = await lobby(hub, 'yacht', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const room = [...hub.rooms.values()][0].impl;
  await cs[1].send({ t: 'leave' });
  assert.equal(room.game.result?.reason, 'alone');
  assert.equal(coins(hub, 'ann1'), 0);
  assert.equal(coins(hub, 'bob1'), 0);
});

test('draw: everyone else left (finished.reason alone) pays nobody', async () => {
  const { hub } = await setup(9);
  const cs = await lobby(hub, 'draw', ['ann1', 'bob1']);
  await cs[0].send({ t: 'dr', a: 'settings', rounds: 1, time: 60 });
  await cs[0].send({ t: 'start' });
  await cs[1].send({ t: 'leave' });
  assert.equal(coins(hub, 'ann1'), 0);
  assert.equal(coins(hub, 'bob1'), 0);
});
