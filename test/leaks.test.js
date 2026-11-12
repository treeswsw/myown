import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { FakeClock, client, seeded } from './helpers.js';

const CARD = /"([2-9TJQKA][shdc])"/g;
const cardsIn = (raw) => new Set([...raw.matchAll(CARD)].map((m) => m[1]));

async function table(mode, names, seed) {
  const clock = new FakeClock();
  const hub = createHub({ store: createStore(), rng: seeded(seed), now: clock.now, timers: clock });
  const cs = [];
  for (const n of names) {
    const c = client(hub);
    await c.send({ t: 'login', id: n });
    cs.push(c);
  }
  await cs[0].send({ t: 'create', mode });
  for (const c of cs.slice(1)) await c.send({ t: 'join', code: cs[0].state.code });
  return { clock, hub, cs, room: hub.rooms.values().next().value };
}

function forbiddenKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => forbiddenKeys(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (['deck', 'bullet', 'hand', 'rng', 'bullets'].includes(k)) found.add(k);
      forbiddenKeys(v, found);
    }
  }
  return found;
}

test('holdem: a player only ever receives own hole cards, the board and showdown reveals', async () => {
  const { clock, hub, cs, room } = await table('holdem', ['ann1', 'bob1', 'cat1'], 31);
  const rng = seeded(5);
  for (let h = 0; h < 25; h++) {
    const marks = cs.map((c) => c.sock.raw.length);
    if (h === 0) await cs[0].send({ t: 'start' });
    else clock.advance(13000);
    if (room.phase === 'lobby') {
      // someone busted and a champion was crowned: give everybody chips again and restart
      for (const sess of hub.sessions.values()) sess.user.bank = 10000;
      await cs[0].send({ t: 'start' });
    }
    const { st } = room.hand;
    const hole = Object.fromEntries(st.seats.map((s) => [s.id, [...s.cards]]));
    const deckCards = new Set(st.deck);
    for (let guard = 0; room.phase === 'playing' && guard < 100; guard++) {
      const actor = cs.find((c) => c.state.you === cs[0].state.turn);
      const s = actor.state;
      const roll = rng();
      let msg = { t: 'act', a: s.toCall > 0 ? 'call' : 'check' };
      if (roll < 0.15) msg = { t: 'act', a: 'fold' };
      else if (roll < 0.35 && s.maxRaiseTo > 0) msg = { t: 'act', a: 'raise', amount: s.minRaiseTo };
      else if (roll < 0.4 && s.maxRaiseTo > 0) msg = { t: 'act', a: 'allin' };
      await actor.send(msg);
    }
    assert.equal(room.phase, 'result');
    const board = new Set(st.board);
    const revealed = new Set(Object.values(st.result.shown).flat());
    for (const c of cs) {
      const me = c.state.you;
      const slice = c.sock.raw.slice(marks[cs.indexOf(c)]);
      const cut = slice.findIndex((r) => /"k":"(showdown|win)"/.test(r));
      const before = cut < 0 ? slice : slice.slice(0, cut);
      for (const raw of before) {
        for (const card of cardsIn(raw)) {
          assert.ok((hole[me] ?? []).includes(card) || board.has(card), `${me} saw ${card} before showdown`);
        }
      }
      for (const raw of slice) {
        for (const card of cardsIn(raw)) {
          assert.ok(!deckCards.has(card) || board.has(card), `${me} saw undealt card ${card}`);
          const owner = Object.keys(hole).find((id) => hole[id].includes(card));
          assert.ok(!owner || owner === me || revealed.has(card) || board.has(card), `${me} saw ${owner}'s ${card}`);
        }
        assert.equal(forbiddenKeys(JSON.parse(raw)).size, 0);
      }
    }
  }
});

test('holdem: folded winner never reveals cards', async () => {
  const { cs, room } = await table('holdem', ['ann1', 'bob1'], 32);
  await cs[0].send({ t: 'start' });
  const dealer = cs.find((c) => c.state.you === cs[0].state.turn);
  const other = cs.find((c) => c !== dealer);
  await dealer.send({ t: 'act', a: 'fold' });
  const hole = room.hand.st.seats.find((s) => s.id === other.state.you).cards;
  for (const raw of dealer.sock.raw) for (const card of cardsIn(raw)) assert.ok(!hole.includes(card));
  assert.deepEqual(dealer.state.result.shown, {});
});

test('bluff: no hands of others, bullets or deck in any message', async () => {
  const { clock, cs, room } = await table('bluff', ['ann1', 'bob1', 'cat1'], 33);
  const rng = seeded(8);
  await cs[0].send({ t: 'start' });
  for (let guard = 0; room.phase === 'playing' && guard < 500; guard++) {
    const s = cs[0].state;
    if (s.turn === null) {
      clock.advance(4000);
      continue;
    }
    const actor = cs.find((c) => c.state.you === s.turn);
    const mine = actor.state;
    const canLiar = mine.lastPlay !== null;
    if (mine.myHand.length === 0 || (canLiar && rng() < 0.5)) await actor.send({ t: 'liar' });
    else await actor.send({ t: 'play', cards: [0] });
  }
  assert.equal(room.phase, 'result');
  for (const c of cs) {
    for (const raw of c.sock.raw) {
      assert.equal(forbiddenKeys(JSON.parse(raw)).size, 0, raw.slice(0, 200));
    }
    for (const m of c.sock.msgs.filter((x) => x.t === 'room' && x.state)) {
      assert.ok(Array.isArray(m.state.myHand));
      for (const p of m.state.players) assert.deepEqual(Object.keys(p).filter((k) => /hand|bullet|cards/i.test(k)), ['handCount']);
    }
  }
  const last = cs[0].state;
  assert.equal(last.winnerId !== null, true);
});

test('bluff: myHand matches only the viewer\'s own cards', async () => {
  const { cs, room } = await table('bluff', ['ann1', 'bob1'], 34);
  await cs[0].send({ t: 'start' });
  for (const c of cs) {
    const p = room.game.g.players.find((x) => x.id === c.state.you);
    assert.deepEqual(c.state.myHand, p.hand);
    assert.equal(c.state.players.find((x) => x.id === p.id).handCount, 5);
  }
});
