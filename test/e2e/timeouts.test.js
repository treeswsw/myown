import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Bot, sleep } from './bot.js';
import { startServer, seatAll } from './helpers.js';

const GRACE = 1500; // FAST_TIMERS.GRACE_MS
let server;
before(async () => { server = await startServer(); });
after(async () => { await server.stop(); });

const actionsBy = (bot, id, kinds) => bot.messages.filter((m) => m.t === 'event' && kinds.includes(m.e.k) && (m.e.id === id));

for (const mode of ['holdem', 'bluff']) {
  test(`timeouts: ${mode} connected player's turn never times out`, { timeout: 30000 }, async () => {
    const { bots } = await seatAll(server, mode, 3, { autoplay: false });
    const h = bots[0];
    h.start();
    await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
    const turn = h.state.turn;
    const n0 = h.messages.length;
    await sleep(GRACE * 3 + 500); // far beyond the old 30s limit scaled to the fast timers and the grace
    assert.equal(h.state.turn, turn, 'turn moved without any action');
    assert.equal(h.state.turnEndsAt, null);
    for (const b of bots) assert.equal(b.state.turnEndsAt, null);
    const acts = h.messages.slice(n0).filter((m) => m.t === 'event' && ['action', 'bluffPlay', 'liar'].includes(m.e.k));
    assert.equal(acts.length, 0, 'an automatic action happened for a connected player');
    for (const m of h.messages.filter((x) => x.t === 'room' && x.state)) assert.equal(m.state.turnEndsAt, null);
    // and they can still act afterwards
    const mover = bots.find((b) => b.id === turn);
    mover.send(mode === 'holdem' ? { t: 'act', a: mover.state.toCall > 0 ? 'call' : 'check' } : { t: 'play', cards: [0] });
    await h.waitFor(() => h.state.turn !== turn, 3000, 'late action accepted');
    bots.forEach((b) => b.close());
  });

  test(`timeouts: ${mode} disconnected player on turn is auto-acted then removed after grace`, { timeout: 30000 }, async () => {
    const { bots } = await seatAll(server, mode, 3, { autoplay: false });
    const h = bots[0];
    h.start();
    await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
    const victim = bots.find((b) => b.id === h.state.turn);
    const watcher = bots.find((b) => b !== victim && b !== h) || h;
    const live = bots.filter((b) => b !== victim);
    victim.terminate();
    const t0 = Date.now();
    await watcher.waitFor(() => watcher.state.players.find((p) => p.id === victim.id)?.connected === false, 3000, 'disconnect seen');
    await sleep(GRACE * 0.5);
    assert.equal(watcher.state.turn, victim.id, 'auto action fired before the grace period');
    assert.equal(actionsBy(watcher, victim.id, ['action', 'bluffPlay', 'liar']).length, 0);
    await watcher.waitFor(() => !watcher.state.players.some((p) => p.id === victim.id), GRACE + 3000, 'victim removed');
    const dt = Date.now() - t0;
    assert.ok(dt >= GRACE * 0.8, `removed after ${dt}ms, too early`);
    const kinds = mode === 'holdem' ? ['action'] : ['bluffPlay', 'liar'];
    const evs = watcher.messages.filter((m) => m.t === 'event' && kinds.includes(m.e.k) && (m.e.id === victim.id || m.e.caller === victim.id));
    assert.ok(evs.length >= 1, 'victim got an automatic action before removal');
    if (mode === 'holdem') assert.ok(['fold', 'check'].includes(evs[0].e.a), `auto action ${evs[0].e.a}`);
    assert.ok(server.alive());
    live.forEach((b) => b.close());
  });

  test(`timeouts: ${mode} reconnecting within grace cancels the auto action`, { timeout: 30000 }, async () => {
    const { bots, code } = await seatAll(server, mode, 3, { autoplay: false });
    const h = bots[0];
    h.start();
    await h.waitFor(() => h.state.phase === 'playing' && h.state.turn, 3000, 'start');
    const victim = bots.find((b) => b.id === h.state.turn);
    const watcher = bots.find((b) => b !== victim && b !== h) || h;
    victim.terminate();
    await watcher.waitFor(() => watcher.state.players.find((p) => p.id === victim.id)?.connected === false, 3000, 'disconnect seen');
    await sleep(GRACE * 0.4);
    const v2 = new Bot(server.url, victim.id, { autoplay: false });
    await v2.connect();
    await v2.login();
    await v2.waitFor(() => v2.state && v2.state.code === code, 3000, 'resumed');
    await sleep(GRACE * 1.5); // well past the original deadline
    assert.ok(watcher.state.players.some((p) => p.id === victim.id), 'seat was removed despite reconnect');
    assert.equal(watcher.state.turn, victim.id, 'turn moved on');
    assert.equal(actionsBy(watcher, victim.id, ['action', 'bluffPlay', 'liar']).length, 0, 'auto action fired after reconnect');
    assert.equal(v2.state.turn, victim.id);
    bots.forEach((b) => b.close());
    v2.close();
  });
}
