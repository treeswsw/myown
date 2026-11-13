// Admin holdem bots (SPEC 21-3): full hands with the admin, skip of the result wait, no rejected bot requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

// Wraps the registered brain so every error the bots receive is collected.
async function withErrorCapture(mode, errors, fn) {
  const { games } = await import('../../server/admin/games/index.js');
  const orig = games[mode];
  games[mode] = {
    ...orig,
    createBrain(bot) {
      const brain = orig.createBrain(bot);
      return { onMsg(msg) { if (msg.t === 'error') errors.push({ bot: bot.id, msg }); brain.onMsg(msg); } };
    },
  };
  try {
    await fn();
  } finally {
    games[mode] = orig;
  }
}

// Admin plays check/call when it is on turn (sent by the test).
const adminMove = (env) => {
  const s = env.state;
  if (s?.phase === 'playing' && s.turn === s.you) env.admin.send({ t: 'act', a: s.toCall > 0 ? 'call' : 'check' });
};

const playUntil = (env, pred, max = 600_000) => env.until((e) => {
  adminMove(e);
  return pred(e);
}, { max });

test('admin + 2 bots play a full hand, then the next hand starts; bots get no errors', async () => {
  const errors = [];
  await withErrorCapture('holdem', errors, async () => {
    const env = await setupAdmin({ mode: 'holdem', bots: 2, seed: 7 });
    await env.admin.send({ t: 'start' });
    await env.until((e) => e.state?.phase === 'playing');
    await playUntil(env, (e) => e.state?.phase === 'result');
    assert.ok(env.state.result.winners.length >= 1);
    // the result wait ends by itself, then the next hand is dealt
    await playUntil(env, (e) => e.state?.phase === 'playing' && e.state.board.length === 0 && e.state.myCards);
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('several hands with 3 bots: bots act only on their turn, no errors', async () => {
  const errors = [];
  await withErrorCapture('holdem', errors, async () => {
    const env = await setupAdmin({ mode: 'holdem', bots: 3, seed: 11 });
    await env.admin.send({ t: 'start' });
    let results = 0;
    let last = null;
    await playUntil(env, (e) => {
      const s = e.state;
      if (s?.phase === 'result' && s.result !== last) { last = s.result; results++; }
      return results >= 4 || s?.phase === 'lobby';
    }, 3_000_000);
    assert.ok(results >= 3, `results ${results}`);
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('skip ends the result wait at once; nothing to skip while betting', async () => {
  const env = await setupAdmin({ mode: 'holdem', bots: 1, seed: 3 });
  await env.admin.send({ t: 'start' });
  await env.until((e) => e.state?.phase === 'playing');
  const r0 = await env.adm('skip');
  assert.equal(r0.ok, false);
  assert.equal(r0.error.code, 'adm_noskip');
  await playUntil(env, (e) => e.state?.phase === 'result');
  const t0 = env.clock.now();
  const r = await env.adm('skip');
  assert.equal(r.ok, true);
  assert.ok(env.clock.now() - t0 < 1000);
  const s = env.state;
  assert.ok(s.phase === 'playing' || s.phase === 'lobby', `phase ${s.phase}`);
  env.close();
});

// Frequencies over many seeded decisions: SPEC 21-3 (check/call, ~10% raise, fold only vs big bets, no voluntary all-in).
test('bot decision frequencies: ~10% raise, folds only against big bets, no voluntary all-in', async () => {
  const { createBrain } = await import('../../server/admin/games/holdem.js');
  const { seeded } = await import('../helpers.js');
  const decide = (opts, n) => {
    const counts = {};
    const rng = seeded(42);
    for (let i = 0; i < n; i++) {
      const queue = [];
      let sent = null;
      const brain = createBrain({ id: 'b', name: 'b', rng, send: (m) => { sent = m; }, later: (ms, fn) => queue.push(fn) });
      brain.onMsg({ t: 'room', state: { mode: 'holdem', phase: 'playing', turn: 'b', you: 'b', players: [{ id: 'b', stack: 1000 }], ...opts } });
      queue.forEach((fn) => fn());
      counts[sent.a] = (counts[sent.a] ?? 0) + 1;
    }
    return counts;
  };
  const N = 4000;
  const free = decide({ toCall: 0, minRaiseTo: 20, maxRaiseTo: 1000 }, N);
  assert.ok(free.raise / N > 0.07 && free.raise / N < 0.13, `free raise ${free.raise}`);
  assert.equal(free.check + free.raise, N);
  const small = decide({ toCall: 50, minRaiseTo: 100, maxRaiseTo: 1000 }, N);
  assert.equal(small.fold ?? 0, 0);
  assert.ok(small.raise / N > 0.07 && small.raise / N < 0.13, `small raise ${small.raise}`);
  assert.equal(small.allin ?? 0, 0);
  const big = decide({ toCall: 600, minRaiseTo: 0, maxRaiseTo: 0 }, N);
  assert.ok(big.fold / N > 0.25 && big.fold / N < 0.35, `big fold ${big.fold}`);
  assert.equal(big.fold + big.call, N);
  const noRaise = decide({ toCall: 50, minRaiseTo: 0, maxRaiseTo: 0 }, N);
  assert.deepEqual(Object.keys(noRaise), ['call']);
});
