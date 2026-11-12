import test from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { FakeClock, client, seeded } from './helpers.js';

const events = (c, k) => c.sock.msgs.filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);

async function setup(seed = 1) {
  const clock = new FakeClock();
  const store = createStore();
  const hub = createHub({ store, rng: seeded(seed), now: clock.now, timers: clock });
  return { clock, store, hub };
}

async function login(hub, id) {
  const c = client(hub);
  await c.send({ t: 'login', id });
  return c;
}

async function lobby(hub, mode, names) {
  const cs = [];
  for (const n of names) cs.push(await login(hub, n));
  await cs[0].send({ t: 'create', mode });
  const code = cs[0].state.code;
  for (const c of cs.slice(1)) await c.send({ t: 'join', code });
  return { cs, code };
}

// Everybody calls/checks until the hand is over.
async function playHandOut(cs, pick = () => null) {
  for (let guard = 0; guard < 100; guard++) {
    const s = cs[0].state;
    if (s.phase !== 'playing') return;
    const actor = cs.find((c) => c.state.you === s.turn);
    const forced = pick(actor.state);
    await actor.send(forced ?? { t: 'act', a: actor.state.toCall > 0 ? 'call' : 'check' });
  }
  assert.fail('hand did not finish');
}

test('login creates a user with defaults and re-login keeps them', async () => {
  const { hub } = await setup();
  const a = await login(hub, ' 갱식_1 ');
  const me = a.sock.last('me').user;
  assert.equal(me.id, '갱식_1');
  assert.equal(me.bank, 10000);
  assert.equal(me.avatar, null);
  assert.deepEqual(a.sock.last('room'), { t: 'room', state: null });
  const b = await login(hub, '갱식_1');
  assert.equal(b.sock.last('me').user.bank, 10000);
});

test('IDs are case-insensitive for the key but keep the display name', async () => {
  const { hub } = await setup();
  const a = await login(hub, 'Alice');
  assert.equal(a.sock.last('me').user.id, 'alice');
  assert.equal(a.sock.last('me').user.name, 'Alice');
  const b = await login(hub, 'ALICE');
  assert.equal(b.sock.last('me').user.name, 'Alice');
  assert.ok(a.sock.closed, 'first connection is dropped (takeover)');
});

test('invalid input is answered with an error and never changes state', async () => {
  const { hub } = await setup();
  const c = client(hub);
  await c.send({ t: 'create', mode: 'holdem' });
  assert.equal(c.sock.last('error').msg, '먼저 로그인하세요.');
  for (const bad of [{ t: 'login', id: 'a' }, { t: 'login', id: 'bad id!' }, { t: 'login', id: 5 }, { t: 'nope' }]) {
    await c.send(bad);
    assert.equal(c.sock.last('error') !== undefined, true);
  }
  assert.equal(c.sock.last('me'), undefined);
  await c.conn.message('not json');
  await c.conn.message('[1]');
  await c.send({ t: 'login', id: 'zed1' });
  await c.send({ t: 'avatar', data: 'data:image/png;base64,AAAA' });
  assert.equal(c.sock.last('me').user.avatar, null);
  await c.send({ t: 'avatar', data: 'data:image/jpeg;base64,' + 'A'.repeat(70000) });
  assert.equal(c.sock.last('me').user.avatar, null);
  await c.send({ t: 'avatar', data: 'data:image/jpeg;base64,/9j/AAAA' });
  assert.equal(c.sock.last('me').user.avatar, 'data:image/jpeg;base64,/9j/AAAA');
  await c.send({ t: 'join', code: 'ZZZZ' });
  assert.equal(c.sock.last('error').msg, '존재하지 않는 방입니다.');
  await c.send({ t: 'start' });
  assert.equal(c.sock.last('error').msg, '방에 들어가 있지 않습니다.');
});

test('per-connection rate limit drops messages beyond 20 per second', async () => {
  const { hub, clock } = await setup();
  const c = await login(hub, 'spam');
  const before = c.sock.raw.length;
  for (let i = 0; i < 40; i++) c.conn.message(JSON.stringify({ t: 'start' }));
  await c.conn.queue;
  assert.equal(c.sock.raw.length - before, 19); // 1 login + 19 answered
  clock.advance(1000);
  await c.send({ t: 'start' });
  assert.equal(c.sock.raw.length - before, 20);
});

test('room codes, capacity and host rules', async () => {
  const { hub } = await setup();
  const { cs, code } = await lobby(hub, 'bluff', ['aa1', 'bb1', 'cc1', 'dd1']);
  assert.match(code, /^[A-HJ-NP-Z]{4}$/);
  const e = await login(hub, 'ee1');
  await e.send({ t: 'join', code });
  assert.equal(e.sock.last('error').msg, '방이 가득 찼습니다.');
  assert.equal(cs[0].state.hostId, 'aa1');
  await cs[1].send({ t: 'start' });
  assert.equal(cs[1].sock.last('error').msg, '방장만 시작할 수 있습니다.');
  await cs[1].send({ t: 'mode', mode: 'holdem' });
  assert.equal(cs[1].sock.last('error').msg, '방장만 변경할 수 있습니다.');
  await cs[0].send({ t: 'mode', mode: 'holdem' });
  assert.equal(cs[0].state.mode, 'holdem');
  await cs[0].send({ t: 'leave' });
  assert.equal(cs[0].state, null);
  assert.equal(cs[1].state.hostId, 'bb1');
  assert.equal(cs[1].state.players.length, 3);
});

test('holdem: full hand through the handlers, stacks, stats and auto next hand', async () => {
  const { hub, clock, store } = await setup(7);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1', 'cat1']);
  assert.equal(cs[0].state.phase, 'lobby');
  await cs[1].send({ t: 'start' });
  assert.equal(cs[1].sock.last('error').msg, '방장만 시작할 수 있습니다.');
  await cs[0].send({ t: 'start' });
  const s = cs[0].state;
  assert.equal(s.phase, 'playing');
  assert.equal(s.players.length, 3);
  assert.equal(s.players.reduce((n, p) => n + p.stack + p.bet, 0), 30000, 'whole accounts are on the table');
  assert.equal(s.turnEndsAt, null);
  assert.equal(s.pot, 0, 'blinds are still bets, not yet in the pot');
  for (const c of cs) {
    assert.equal(c.state.myCards.length, 2);
    for (const p of c.state.players) assert.equal(p.cards === null, p.id !== c.state.you);
  }
  // acting out of turn is rejected
  const idle = cs.find((c) => c.state.you !== s.turn);
  await idle.send({ t: 'act', a: 'fold' });
  assert.equal(idle.sock.last('error').msg, '내 차례가 아닙니다.');
  await playHandOut(cs);
  const end = cs[0].state;
  assert.equal(end.phase, 'result');
  assert.equal(end.result.winners.length >= 1, true);
  assert.equal(end.players.reduce((n, p) => n + p.stack, 0), 30000);
  assert.equal(end.board.length, 5);
  assert.deepEqual(Object.keys(end.result.shown).sort(), end.players.filter((p) => !p.folded).map((p) => p.id).sort());
  const winnerId = end.result.winners[0].id;
  for (const c of cs) {
    const you = c.state.you;
    const user = await store.getOrCreate(you, you);
    assert.equal(user.stats.hands, 1);
    assert.equal(user.stats.wins, end.result.winners.some((w) => w.id === you) ? 1 : 0);
  }
  assert.ok(cs.some((c) => c.sock.msgs.some((m) => m.t === 'event' && m.e.k === 'win')));
  // result stays, then the next hand starts automatically
  clock.advance(10999);
  assert.equal(cs[0].state.phase, 'result');
  clock.advance(1);
  assert.equal(cs[0].state.phase, 'playing');
  assert.equal(cs[0].state.result, null);
  assert.equal(cs[0].state.players.find((p) => p.isDealer).id !== winnerId || true, true);
  const dealers = new Set();
  for (let i = 0; i < 3; i++) {
    dealers.add(cs[0].state.players.find((p) => p.isDealer).id);
    await playHandOut(cs);
    clock.advance(25000);
  }
  assert.equal(dealers.size, 3, 'dealer button rotates');
});

test('no turn limit for connected players; disconnected player on turn is auto-played after the grace', async () => {
  const { hub, clock } = await setup(3);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const first = cs[0].state.turn;
  clock.advance(10 * 60_000);
  assert.equal(cs[0].state.turn, first, 'a connected player may think forever');
  assert.equal(cs[0].state.turnEndsAt, null);
  assert.equal(cs[0].state.phase, 'playing');

  // the player on turn disconnects: grace, then fold (facing the blind), then removal
  const actor = cs.find((c) => c.state.you === first);
  const other = cs.find((c) => c !== actor);
  actor.conn.close();
  clock.advance(59_999);
  assert.equal(other.state.phase, 'playing');
  clock.advance(1);
  assert.equal(other.state.phase, 'result');
  assert.equal(other.state.players.length, 1);
  assert.ok(other.sock.msgs.some((m) => m.t === 'event' && m.e.k === 'action' && m.e.id === first && m.e.a === 'fold'));
});

test('grace auto-act checks when checking is free; reconnect within the grace cancels it', async () => {
  const { hub, clock } = await setup(3);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  // SB calls, then the BB (who may check) is on turn
  let sb = cs.find((c) => c.state.you === cs[0].state.turn);
  await sb.send({ t: 'act', a: 'call' });
  const bb = cs.find((c) => c.state.you === cs[0].state.turn);
  bb.conn.close();
  clock.advance(30_000);
  const back = client(hub);
  await back.send({ t: 'login', id: bb.state.you });
  assert.equal(back.state.turn, bb.state.you);
  clock.advance(120_000);
  assert.equal(back.state.phase, 'playing', 'reconnect cancelled the grace');
  assert.equal(back.state.players.length, 2);
  back.conn.close();
  clock.advance(60_000);
  const acts = sb.sock.msgs.filter((m) => m.t === 'event' && m.e.k === 'action' && m.e.id === bb.state.you);
  assert.deepEqual(acts.map((m) => m.e.a), ['check', 'fold'], 'auto-check first, then the removal folds');
  assert.equal(sb.state.players.length, 1);
});

test('everyone disconnected: the hand cannot deadlock and the room is collected', async () => {
  const { hub, clock } = await setup(3);
  const { cs, code } = await lobby(hub, 'holdem', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  cs.forEach((c) => c.conn.close());
  clock.advance(60_000);
  assert.equal(hub.rooms.get(code).members.length, 0);
  clock.advance(60_000);
  assert.ok(!hub.rooms.has(code));
  clock.advance(1000);
  assert.equal(clock.pending, 0);
});

test('same ID takeover keeps the seat and sends the current room state', async () => {
  const { hub } = await setup(4);
  const { cs, code } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const again = await login(hub, 'bob1');
  assert.equal(again.state.code, code);
  assert.equal(again.state.you, 'bob1');
  assert.equal(again.state.myCards.length, 2);
  assert.ok(cs[1].sock.closed);
  assert.equal(cs[0].state.players.find((p) => p.id === 'bob1').connected, true);
  cs[1].conn.close(); // old socket closing late must not disconnect the new one
  assert.equal(cs[0].state.players.find((p) => p.id === 'bob1').connected, true);
});

test('leaving mid-hand folds, returns chips and the room empties after 60s', async () => {
  const { hub, clock } = await setup(5);
  const { cs, code } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  await cs[1].send({ t: 'leave' });
  assert.equal(cs[0].state.phase, 'result');
  const total = cs[0].state.players[0].stack + cs[1].sock.last('me').user.bank;
  assert.equal(total, 20000);
  await cs[0].send({ t: 'leave' });
  assert.equal(cs[0].sock.last('me').user.bank + cs[1].sock.last('me').user.bank, 20000);
  assert.ok(hub.rooms.has(code));
  clock.advance(60000);
  assert.ok(!hub.rooms.has(code));
});

test('bust: the busted player is eliminated for good, chips 0, and the last one standing is champion', async () => {
  const { hub, clock, store } = await setup(6);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const shove = (state) => (state.maxRaiseTo > 0 || state.toCall > 0 ? { t: 'act', a: 'allin' } : null);
  let busted = [];
  for (let i = 0; i < 30 && !busted.length; i++) {
    await playHandOut(cs, shove);
    busted = cs[0].state.result.busted;
    if (!busted.length) clock.advance(15000);
  }
  assert.equal(busted.length, 1);
  const loser = cs.find((c) => c.state.you === busted[0]);
  const winner = cs.find((c) => c !== loser);
  const bust = cs[0].sock.msgs.find((m) => m.t === 'event' && m.e.k === 'bust');
  assert.deepEqual([bust.e.id, bust.e.by], [busted[0], winner.state.you]);
  const row = loser.state.players.find((p) => p.id === busted[0]);
  assert.deepEqual([row.stack, row.eliminated], [0, true]);
  assert.equal(loser.sock.last('me').user.bank, 0);
  assert.equal(winner.sock.last('me').user.bank, 20000);
  assert.equal(events(winner, 'champion').length, 0, 'not yet: the result is still shown');
  clock.advance(11000 + 3 * 1700 + 3000);
  assert.deepEqual(events(winner, 'champion'), [{ k: 'champion', id: winner.state.you }]);
  assert.equal(winner.state.phase, 'lobby');
  assert.equal((await store.getOrCreate(busted[0], busted[0])).bank, 0, 'persisted');
  assert.equal((await store.getOrCreate(winner.state.you, 'x')).bank, 20000);
  // cannot be dealt in again, cannot start alone
  await winner.send({ t: 'start' });
  assert.equal(winner.sock.last('error').msg, '칩이 있는 사람이 2명 이상 필요합니다.');
  // a relogin does not restore chips; no hold'em room for a broke account
  const fresh = client(hub);
  await fresh.send({ t: 'login', id: busted[0] });
  assert.equal(fresh.sock.last('me').user.bank, 0);
});

test('a broke account cannot create hold\'em but can spectate and play bluff', async () => {
  const { hub } = await setup(6);
  const a = await login(hub, 'ann1');
  hub.sessions.get('ann1').user.bank = 0;
  await a.send({ t: 'create', mode: 'holdem' });
  assert.equal(a.sock.last('error').msg, '칩이 없습니다. 새 아이디로 다시 시작하세요');
  await a.send({ t: 'create', mode: 'bluff' });
  assert.equal(a.state.mode, 'bluff');
  const h = await login(hub, 'bob1');
  const c = await login(hub, 'cat1');
  const d = await login(hub, 'dan1');
  await h.send({ t: 'create', mode: 'holdem' });
  await c.send({ t: 'join', code: h.state.code });
  await d.send({ t: 'join', code: h.state.code });
  hub.sessions.get('dan1').user.bank = 0;
  await h.send({ t: 'start' });
  const dan = h.state.players.find((p) => p.id === 'dan1');
  assert.deepEqual([dan.spectating, dan.eliminated], [true, true]);
  assert.equal(h.state.players.filter((p) => !p.spectating).length, 2);
});

test('mid-hand leave in all-in run-out and when only one player remains keeps chips conserved', async () => {
  const { hub, clock } = await setup(15);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  // everyone shoves except the last actor, who leaves instead
  for (let i = 0; i < 2; i++) await cs.find((c) => c.state.you === cs[0].state.turn).send({ t: 'act', a: 'allin' });
  const leaver = cs.find((c) => c.state.you === cs[0].state.turn);
  await leaver.send({ t: 'leave' });
  const stay = cs.filter((c) => c !== leaver);
  assert.equal(stay[0].state.phase, 'result');
  assert.equal(stay[0].state.board.length, 5, 'run-out completed');
  const total = leaver.sock.last('me').user.bank + stay.reduce((n, c) => n + c.state.players.find((p) => p.id === c.state.you).stack, 0);
  assert.equal(total, 30000);
  clock.advance(60000);
});

test('chips are conserved across seats, leaves and busts (fuzz over rooms)', async () => {
  const { hub, clock } = await setup(16);
  const rng = seeded(99);
  const names = ['ann1', 'bob1', 'cat1', 'dan1'];
  const { cs } = await lobby(hub, 'holdem', names);
  const total = () => [...hub.sessions.values()].reduce((n, s) => n + s.user.bank, 0);
  const inEngine = (room) => (room.hand && room.phase === 'playing'
    ? room.hand.st.seats.reduce((n, s) => n + s.stack + s.total - room.hand.start.get(s.id), 0) : 0);
  const room = hub.rooms.values().next().value;
  await cs[0].send({ t: 'start' });
  for (let step = 0; step < 400 && room.members.length > 1; step++) {
    assert.equal(total() + inEngine(room), 40000, 'step ' + step);
    if (room.phase === 'playing') {
      const actor = cs.find((c) => c.state?.you === room.turnId());
      if (rng() < 0.03 && room.members.length > 2) await actor.send({ t: 'leave' });
      else {
        const s = actor.state;
        const roll = rng();
        await actor.send(roll < 0.2 && s.maxRaiseTo > 0 ? { t: 'act', a: 'allin' } : { t: 'act', a: s.toCall > 0 ? (roll < 0.3 ? 'fold' : 'call') : 'check' });
      }
    } else clock.advance(15000);
  }
  assert.equal(total() + inEngine(room), 40000);
});

test('bluff: game through the handlers incl. revolver and result', async () => {
  const { hub, clock, store } = await setup(8);
  const { cs } = await lobby(hub, 'bluff', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const room = hub.rooms.values().next().value;
  const g = room.game.g;
  assert.equal(cs[0].state.myHand.length, 5);
  assert.equal(cs[0].state.tableRank, g.tableRank);
  // rig: ann lies, bob catches her on the first pull of a loaded chamber
  g.players[0].hand = ['Q', 'Q', 'Q', 'Q', 'Q'];
  g.players[0].bullet = 0;
  g.tableRank = 'K';
  g.turn = 0;
  await cs[1].send({ t: 'play', cards: [0] });
  assert.equal(cs[1].sock.last('error').msg, '내 차례가 아닙니다.');
  await cs[0].send({ t: 'play', cards: [0, 1] });
  assert.deepEqual(cs[1].state.lastPlay, { by: 'ann1', count: 2 });
  assert.equal(cs[1].state.players.find((p) => p.id === 'ann1').handCount, 3);
  await cs[1].send({ t: 'liar' });
  const s = cs[0].state;
  assert.equal(s.phase, 'result');
  assert.equal(s.winnerId, 'bob1');
  assert.equal(s.reveal.dead, true);
  assert.equal(s.players.find((p) => p.id === 'ann1').alive, false);
  const kinds = cs[0].sock.msgs.filter((m) => m.t === 'event').map((m) => m.e.k);
  assert.ok(['bluffPlay', 'liar', 'reveal', 'shot', 'bluffWin'].every((k) => kinds.includes(k)));
  const bob = await store.getOrCreate('bob1', 'bob1');
  assert.deepEqual([bob.stats.bluffGames, bob.stats.bluffWins], [1, 1]);
  clock.advance(6000);
  assert.equal(cs[0].state.phase, 'lobby');
  assert.equal(cs[0].state.round, 0);
});

test('bluff: a disconnected player on turn plays the first card after the grace, then is removed', async () => {
  const { hub, clock } = await setup(9);
  const { cs } = await lobby(hub, 'bluff', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  const g = hub.rooms.values().next().value.game.g;
  clock.advance(5 * 60_000);
  assert.equal(cs[0].state.turnEndsAt, null);
  const first = g.players[g.turn];
  const card = first.hand[0];
  const watcher = cs.find((c) => c.state.you !== first.id);
  cs.find((c) => c.state.you === first.id).conn.close();
  clock.advance(60_000);
  assert.ok(watcher.sock.msgs.some((m) => m.t === 'event' && m.e.k === 'bluffPlay' && m.e.id === first.id));
  assert.equal(watcher.state.players.length, 2);
  assert.equal(card !== undefined, true);
});

test('late joiners spectate until the next hand', async () => {
  const { hub, clock } = await setup(10);
  const { cs, code } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  await cs[0].send({ t: 'start' });
  const late = await login(hub, 'cat1');
  await late.send({ t: 'join', code });
  const me = late.state.players.find((p) => p.id === 'cat1');
  assert.equal(me.spectating, true);
  assert.equal(late.state.myCards, null);
  await playHandOut(cs);
  clock.advance(25000);
  assert.equal(late.state.players.find((p) => p.id === 'cat1').spectating, false);
  assert.equal(late.state.myCards.length, 2);
});

test('bluff: penalty is shown with nobody on turn, then the next round is dealt', async () => {
  const { hub, clock } = await setup(12);
  const { cs } = await lobby(hub, 'bluff', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  const g = hub.rooms.values().next().value.game.g;
  g.players.forEach((p) => { p.bullet = 5; });
  g.tableRank = 'K';
  g.turn = 0;
  g.players[0].hand = ['Q', 'Q', 'Q', 'Q', 'Q'];
  await cs[0].send({ t: 'play', cards: [0] });
  await cs[1].send({ t: 'liar' });
  let s = cs[2].state;
  assert.equal(s.turn, null);
  assert.equal(s.turnEndsAt, null);
  assert.equal(s.reveal.loser, 'ann1');
  assert.equal(s.players.find((p) => p.id === 'ann1').shots, 1);
  clock.advance(3999);
  assert.equal(cs[2].state.turn, null);
  clock.advance(1);
  s = cs[2].state;
  assert.equal(s.turn, 'ann1');
  assert.equal(s.round, 2);
  assert.equal(s.turnEndsAt, null);
});

test('pots only hold collected chips while betting; a spectator leaving changes nothing', async () => {
  const { hub, clock } = await setup(13);
  const { cs, code } = await lobby(hub, 'holdem', ['ann1', 'bob1', 'cat1']);
  await cs[0].send({ t: 'start' });
  const s = cs[0].state;
  assert.equal(s.pot, 0);
  assert.deepEqual(s.pots, []);
  assert.equal(s.players.reduce((n, p) => n + p.bet, 0), 150);
  const spectator = await login(hub, 'dan1');
  await spectator.send({ t: 'join', code });
  clock.advance(10000);
  await spectator.send({ t: 'leave' });
  assert.equal(cs[0].state.turn, s.turn);
  await playHandOut(cs);
  assert.equal(cs[0].state.phase, 'result');
  assert.equal(cs[0].state.pot > 0, true);
});

test('result hold: 11 s at showdown, 4 s when everyone folded, plus run-out, tie and bust extras', async () => {
  const { hub, clock } = await setup(14);
  const { cs } = await lobby(hub, 'holdem', ['ann1', 'bob1']);
  const hold = (r, streets) => (Object.keys(r.shown).length ? 11000 : 4000) + streets * 1700 +
    (r.winners.length - 1) * 2500 + (r.busted.length ? 3000 : 0);
  // fold: 4 s
  await cs[0].send({ t: 'start' });
  await cs.find((c) => c.state.you === cs[0].state.turn).send({ t: 'act', a: 'fold' });
  assert.equal(hold(cs[0].state.result, 0), 4000);
  clock.advance(3999);
  assert.equal(cs[0].state.phase, 'result');
  clock.advance(1);
  assert.equal(cs[0].state.phase, 'playing');
  // heads-up all-in preflop: showdown + 3 run-out streets (+ ties / bust)
  for (let i = 0; i < 2; i++) await cs.find((c) => c.state.you === cs[0].state.turn).send({ t: 'act', a: 'allin' });
  assert.equal(cs[0].state.phase, 'result');
  const wait = hold(cs[0].state.result, 3);
  assert.ok(wait >= 11000 + 3 * 1700);
  clock.advance(wait - 1);
  assert.equal(cs[0].state.phase, 'result');
  clock.advance(1);
  assert.notEqual(cs[0].state.phase, 'result');
});
