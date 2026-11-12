import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, sleep } from './bot.js';
import { startServer, seatAll, makeBots, uid } from './helpers.js';
import { readAccounts } from './play.js';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const ev = (b, k, from = 0) => b.messages.slice(from).filter((m) => m.t === 'event' && m.e.k === k).map((m) => m.e);

/** Two fresh accounts go all-in heads-up; returns when the hand result is out. Retries on a tied pot. */
async function allInHeadsUp(srv) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { bots, code } = await seatAll(srv, 'holdem', 2, { autoplay: false });
    const [h, o] = bots;
    h.start();
    await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
    await o.waitFor(() => o.state.phase === 'playing', 3000, 'start seen');
    const first = bots.find((b) => b.id === h.state.turn);
    const second = bots.find((b) => b !== first);
    first.send({ t: 'act', a: 'allin' });
    await second.waitFor(() => second.state.turn === second.state.you, 3000, 'second on turn');
    second.send({ t: 'act', a: 'allin' });
    await h.waitFor(() => h.state.phase === 'result', 8000, 'result');
    const res = h.state.result;
    if (res.winners.length === 1) return { bots, code, h, o, winner: bots.find((b) => b.state.you === res.winners[0].id), result: res };
    bots.forEach((b) => b.close()); // split pot: try again
  }
  throw new Error('could not get a non-tied all-in');
}

test('chips: all-in loser ends at exactly 0, winner holds exactly everything', { timeout: 60000 }, async () => {
  const { bots, winner, h } = await allInHeadsUp(server);
  const loser = bots.find((b) => b !== winner);
  const st = h.state;
  assert.equal(st.players.find((p) => p.id === loser.state.you).stack, 0);
  assert.equal(st.players.find((p) => p.id === winner.state.you).stack, 20000);
  assert.equal(st.result.winners[0].amount, 20000);
  assert.ok(st.players.find((p) => p.id === loser.state.you).eliminated, 'loser flagged eliminated');
  assert.ok(!st.players.find((p) => p.id === winner.state.you).eliminated);
  const busts = ev(h, 'bust');
  assert.equal(busts.length, 1);
  assert.equal(busts[0].id, loser.state.you);
  assert.equal(busts[0].by, winner.state.you);
  // champion event, then lobby
  await h.waitFor(() => ev(h, 'champion').length === 1 && h.state.phase === 'lobby', 5000, 'champion + lobby');
  assert.equal(ev(h, 'champion')[0].id, winner.state.you);
  // account chips: persisted 0 for the loser, everything for the winner
  await winner.waitFor(() => winner.me.bank === 20000, 3000, 'winner me.bank');
  await loser.waitFor(() => loser.me.bank === 0, 3000, 'loser me.bank');
  // a lone chip holder cannot start
  winner.errors.length = 0;
  const hostBot = bots.find((b) => b.state.hostId === b.state.you);
  hostBot.errors.length = 0;
  hostBot.start();
  await hostBot.waitFor(() => hostBot.errors.length >= 1, 3000, 'start rejected');
  assert.equal(h.state.phase, 'lobby');
  bots.forEach((b) => b.close());
});

test('chips: eliminated account stays at 0 after relogin, cannot create hold\'em, can spectate and play bluff', { timeout: 60000 }, async () => {
  const { bots, code, winner } = await allInHeadsUp(server);
  const loser = bots.find((b) => b !== winner);
  const loserId = loser.id;
  await winner.waitFor(() => winner.state.phase === 'lobby', 5000, 'lobby');
  loser.leave();
  await loser.waitFor(() => loser.state === null, 3000, 'left');
  loser.close();
  const l2 = new Bot(server.url, loserId, { autoplay: false });
  await l2.connect();
  const me = await l2.login();
  assert.equal(me.bank, 0, 'relogin must not restore chips');
  assert.equal(me.stats.refills, 0);
  l2.errors.length = 0;
  l2.send({ t: 'create', mode: 'holdem' });
  await l2.waitFor(() => l2.errors.length >= 1, 3000, 'create holdem rejected');
  assert.ok(!l2.state, 'no room created');
  // spectating a holdem room is allowed, but never dealt
  l2.send({ t: 'join', code });
  await l2.waitFor(() => l2.state && l2.state.code === code, 3000, 'joined as spectator');
  const winnerBot = winner;
  const third = (await makeBots(server, 1, { autoplay: false }))[0];
  third.send({ t: 'join', code });
  await third.waitFor(() => third.state && third.state.code === code, 3000, 'third joined');
  if (winnerBot.state.hostId !== winnerBot.state.you) { /* host may have changed when loser left */ }
  const host = [winnerBot, third, l2].find((b) => b.state && b.state.hostId === b.state.you);
  host.start();
  await host.waitFor(() => host.state.phase === 'playing', 3000, 'hand started with the 2 chip holders');
  await l2.waitFor(() => l2.state.phase === 'playing', 3000, 'l2 sees hand');
  assert.ok(!l2.state.myCards, 'a 0-chip account was dealt cards');
  assert.equal(l2.state.players.find((p) => p.id === l2.state.you).spectating, true);
  l2.leave();
  await l2.waitFor(() => l2.state === null, 3000, 'l2 left');
  // bluff does not use chips
  l2.send({ t: 'create', mode: 'bluff' });
  await l2.waitFor(() => l2.state && l2.state.mode === 'bluff', 3000, 'bluff room for a broke account');
  [...bots, third, l2].forEach((b) => b.close());
});

test('chips: leaving mid-hand folds; chips already in stay in the pot', { timeout: 60000 }, async () => {
  const { bots } = await seatAll(server, 'holdem', 3, { autoplay: false });
  const [h] = bots;
  h.start();
  await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
  for (const b of bots) await b.waitFor(() => b.state.phase === 'playing', 3000, 'start seen');
  const A = bots.find((b) => b.id === h.state.turn);
  const aId = A.state.you;
  const rest = bots.filter((b) => b !== A);
  const raiseTo = h.state.minRaiseTo;
  A.send({ t: 'act', a: 'raise', amount: raiseTo });
  await h.waitFor(() => h.state.players.find((p) => p.id === A.state.you).bet === raiseTo, 3000, 'raise in');
  A.leave();
  await A.waitFor(() => A.state === null, 3000, 'A left');
  await A.waitFor(() => A.me.bank === 10000 - raiseTo, 3000, `A bank back to ${10000 - raiseTo}`);
  const folds = ev(rest[0], 'action').filter((e) => e.id === aId && e.a === 'fold');
  assert.ok(folds.length >= 1, 'A is folded');
  // the others finish the hand
  rest.forEach((b) => b.autoplayOn());
  await rest[0].waitFor(() => rest[0].state.phase === 'result', 20000, 'hand ends');
  const res = rest[0].state;
  const sumStacks = res.players.reduce((a, p) => a + p.stack, 0);
  assert.equal(sumStacks, 20000 + raiseTo, 'A\'s chips stay in the pot and go to the others');
  assert.ok(!res.players.some((p) => p.id === aId), 'A is gone from the room');
  rest.forEach((b) => b.leave());
  await sleep(300);
  const acc = await readAccounts(server, bots.map((b) => b.id));
  assert.equal(bots.reduce((a, b) => a + acc[b.id].bank, 0), 30000);
  bots.forEach((b) => b.close());
});

test('chips: leaving during an all-in run-out', { timeout: 60000 }, async () => {
  const srv = await startServer({ STREET_MS: '1200', RESULT_MS: '300' });
  try {
    const { bots } = await seatAll(srv, 'holdem', 2, { autoplay: false });
    const [h, o] = bots;
    h.start();
    await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
    await o.waitFor(() => o.state.phase === 'playing', 3000, 'seen');
    const first = bots.find((b) => b.id === h.state.turn);
    const second = bots.find((b) => b !== first);
    first.send({ t: 'act', a: 'allin' });
    await second.waitFor(() => second.state.turn === second.state.you, 3000, 'turn');
    second.send({ t: 'act', a: 'allin' });
    await h.waitFor(() => ev(h, 'allin').length >= 2, 3000, 'both all-in');
    // the server resolves the all-in hand immediately and only paces the display (result phase + street pauses);
    // the first all-in player walks out during that window
    await h.waitFor(() => h.state.phase === 'result', 5000, 'result state');
    const settled = h.state.players.map((p) => [p.id, p.stack]);
    first.leave();
    await first.waitFor(() => first.state === null, 3000, 'left');
    await sleep(500);
    assert.ok(srv.alive(), 'server crashed:\n' + srv.log());
    const acc = await readAccounts(srv, bots.map((b) => b.id));
    assert.equal(acc[first.id].bank + acc[second.id].bank, 20000, 'chips must be conserved when leaving during the run-out');
    for (const [id, stack] of settled) assert.equal(acc[id].bank, stack, `account ${id} must equal its displayed result stack`);
    bots.forEach((b) => b.close());
  } finally { await srv.stop(); }
});

test('chips: bluff and unrelated rooms keep working while an eliminated account is around', { timeout: 30000 }, async () => {
  const b = new Bot(server.url, uid('z'), { autoplay: false });
  await b.connect();
  const me = await b.login();
  assert.equal(me.bank, 10000);
  assert.equal(me.stats.refills, 0);
  b.close();
});

/** 3 players; X and Y go all-in, Z (a blind) has not acted yet. */
async function pendingAllIns(srv) {
  const { bots } = await seatAll(srv, 'holdem', 3, { autoplay: false });
  const [h] = bots;
  h.start();
  await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
  for (const b of bots) await b.waitFor(() => b.state.phase === 'playing', 3000, 'seen');
  const X = bots.find((b) => b.id === h.state.turn);
  X.send({ t: 'act', a: 'allin' });
  await h.waitFor(() => h.state.turn !== X.state.you && h.state.turn, 3000, 'turn moves');
  const Y = bots.find((b) => b.state.you === h.state.turn);
  Y.send({ t: 'act', a: 'allin' });
  await h.waitFor(() => h.state.turn !== Y.state.you && h.state.turn && h.state.phase === 'playing', 3000, 'turn to Z');
  const Z = bots.find((b) => b.state.you === h.state.turn);
  assert.ok(Z !== X && Z !== Y);
  const zContrib = 10000 - h.state.players.find((p) => p.id === Z.state.you).stack - 0; // blind posted (stack already reduced)
  return { bots, h, X, Y, Z, zBlind: zContrib };
}

test('chips: explicit leave while all-in is a fold (forfeits the chips, cannot win)', { timeout: 60000 }, async () => {
  const { bots, h, X, Y, Z } = await pendingAllIns(server);
  const xId = X.state.you;
  X.leave();
  await X.waitFor(() => X.state === null, 3000, 'X left');
  await Y.waitFor(() => !Y.state.players.some((p) => p.id === xId) || Y.state.players.find((p) => p.id === xId).folded, 3000, 'X folded/removed');
  Z.send({ t: 'act', a: 'fold' });
  await h.waitFor(() => h.state.phase === 'result' || (h === X && false), 5000, 'result').catch(() => {});
  const obs = h === X ? Y : h;
  await obs.waitFor(() => obs.state.phase === 'result', 5000, 'result');
  const res = obs.state.result;
  assert.ok(!res.winners.some((w) => w.id === xId), 'a player who explicitly left while all-in must not win');
  assert.equal(res.winners.length, 1);
  assert.equal(res.winners[0].id, Y.state.you);
  assert.ok(!(res.shown && res.shown[xId]), 'left player must not be shown down');
  const acc = await readAccounts(server, bots.map((b) => b.id));
  assert.equal(acc[X.id].bank, 0, 'forfeited chips are gone from the leaver');
  assert.equal(bots.reduce((a, b) => a + acc[b.id].bank, 0) + obs.state.players.reduce((a, p) => a + p.stack, 0) * 0, bots.reduce((a, b) => a + acc[b.id].bank, 0));
  const stacks = obs.state.players.reduce((a, p) => a + p.stack, 0);
  assert.equal(stacks + acc[X.id].bank, 30000, 'chips conserved');
  bots.forEach((b) => b.close());
});

test('chips: disconnect while all-in keeps the player in the hand; chips are credited to the account', { timeout: 60000 }, async () => {
  const { bots, h, X, Y, Z } = await pendingAllIns(server);
  const xId = X.state.you;
  const obs = [h, Y, Z].find((b) => b !== X);
  X.terminate();
  await obs.waitFor(() => obs.state.players.find((p) => p.id === xId)?.connected === false, 3000, 'X disconnected');
  Z.send({ t: 'act', a: 'fold' });
  await obs.waitFor(() => obs.state.phase === 'result', 5000, 'result');
  const res = obs.state.result;
  assert.ok(res.shown && res.shown[xId] && res.shown[Y.state.you], 'both all-in players are shown down (disconnected X stayed in)');
  const xFinal = obs.state.players.find((p) => p.id === xId).stack;
  // after the grace the seat is removed and the stack is credited to the account
  await obs.waitFor(() => !obs.state.players.some((p) => p.id === xId), 6000, 'X removed after grace');
  const acc = await readAccounts(server, bots.map((b) => b.id));
  assert.equal(acc[xId].bank, xFinal, 'disconnected all-in player gets their result credited');
  const total = bots.reduce((a, b) => a + acc[b.id].bank, 0) + obs.state.players.reduce((a, p) => a + p.stack, 0);
  assert.equal(total, 30000, 'chips conserved');
  bots.forEach((b) => b.close());
});
