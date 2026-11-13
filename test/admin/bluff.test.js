// Admin bots in a bluff room (SPEC 21-3): a full game with the admin + bots, skip, and no rejected bot requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

// Wraps the bluff brain so every `error` a bot receives is collected.
async function withErrorCapture(fn) {
  const { games } = await import('../../server/admin/games/index.js');
  const orig = games.bluff;
  const errors = [];
  games.bluff = {
    ...orig,
    createBrain(bot) {
      const brain = orig.createBrain(bot);
      return { onMsg(msg) { if (msg.t === 'error') errors.push({ bot: bot.id, msg }); brain.onMsg(msg); } };
    },
  };
  try {
    await fn(errors);
  } finally {
    games.bluff = orig;
  }
}

// The admin plays like a person: first card on an open table, or LIAR on a pile.
async function adminMove(env) {
  const s = env.state;
  if (s?.phase !== 'playing' || s.turn !== s.you) return false;
  if (s.lastPlay) await env.admin.send({ t: 'liar' });
  else if (s.myHand.length > 0) await env.admin.send({ t: 'play', cards: [0] });
  else return false;
  return true;
}

async function playToEnd(env, { skipWaits = false } = {}) {
  await env.admin.send({ t: 'start' });
  assert.equal(env.state.phase, 'playing');
  let sawResult = false;
  for (let i = 0; i < 4000 && !(sawResult && env.state.phase === 'lobby'); i++) {
    if (env.state.phase === 'result') sawResult = true;
    if (!(await adminMove(env))) {
      if (skipWaits && env.state.phase === 'playing' && env.state.turn === null) await env.adm('skip');
      else await env.tick(250);
    }
  }
  return sawResult;
}

test('admin + 2 bots play one full game to the winner and back to the lobby', async () => {
  await withErrorCapture(async (errors) => {
    const env = await setupAdmin({ mode: 'bluff', bots: 2, seed: 7 });
    assert.equal(env.state.players.length, 3);
    assert.ok(await playToEnd(env));
    assert.equal(env.state.phase, 'lobby');
    assert.equal(env.admin.sock.msgs.some((m) => m.t === 'event' && m.e.k === 'bluffWin'), true);
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('admin + 3 bots, several seeds: always finishes, bots never get an error', async () => {
  await withErrorCapture(async (errors) => {
    for (const seed of [1, 2, 3]) {
      const env = await setupAdmin({ mode: 'bluff', bots: 3, seed });
      assert.ok(await playToEnd(env), `seed ${seed}`);
      env.close();
    }
    assert.deepEqual(errors, []);
  });
});

test('bots play and call LIAR on their own', async () => {
  await withErrorCapture(async (errors) => {
    let played = false;
    let called = false;
    for (const seed of [11, 12, 13, 14, 15]) {
      const env = await setupAdmin({ mode: 'bluff', bots: 2, seed });
      assert.ok(await playToEnd(env));
      const ev = env.admin.sock.msgs.filter((m) => m.t === 'event').map((m) => m.e);
      played ||= ev.some((e) => e.k === 'bluffPlay' && e.id.startsWith('~bot'));
      called ||= ev.some((e) => e.k === 'liar' && e.caller.startsWith('~bot'));
      env.close();
    }
    assert.ok(played, 'a bot played cards');
    assert.ok(called, 'a bot called LIAR');
    assert.deepEqual(errors, []);
  });
});

test('skip: nothing to skip in the lobby or on a turn; ends the penalty display and the winner display at once', async () => {
  await withErrorCapture(async (errors) => {
    const env = await setupAdmin({ mode: 'bluff', bots: 1, seed: 6 });
    let r = await env.adm('skip');
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'adm_noskip');
    await env.admin.send({ t: 'start' });
    await env.until(() => env.state.turn === env.state.you); // a turn has no timer
    r = await env.adm('skip');
    assert.equal(r.error?.code, 'adm_noskip');
    // Play until a penalty display (nobody on turn), then skip it without moving the clock.
    for (let i = 0; i < 2000 && !(env.state.phase === 'playing' && env.state.turn === null); i++) {
      if (!(await adminMove(env))) await env.tick(250);
    }
    assert.equal(env.state.phase, 'playing');
    assert.equal(env.state.turn, null);
    const round = env.state.round;
    const now = env.clock.now();
    r = await env.adm('skip');
    assert.equal(r.ok, true);
    assert.equal(env.clock.now(), now);
    if (env.state.phase === 'playing') assert.equal(env.state.round, round + 1);
    // Finish; then the winner display is skipped too.
    for (let i = 0; i < 4000 && env.state.phase !== 'result'; i++) {
      if (!(await adminMove(env))) {
        if (env.state.turn === null && env.state.phase === 'playing') await env.adm('skip');
        else await env.tick(250);
      }
    }
    assert.equal(env.state.phase, 'result');
    r = await env.adm('skip');
    assert.equal(r.ok, true);
    assert.equal(env.state.phase, 'lobby');
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('a full game with skip used on every wait also ends cleanly', async () => {
  await withErrorCapture(async (errors) => {
    const env = await setupAdmin({ mode: 'bluff', bots: 2, seed: 9 });
    assert.ok(await playToEnd(env, { skipWaits: true }));
    assert.deepEqual(errors, []);
    env.close();
  });
});
