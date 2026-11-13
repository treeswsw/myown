// Admin bots in yacht (SPEC 21-3): full 12-round game with the admin playing by hand, no rejected bot requests, skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';
import { games } from '../../server/admin/games/index.js';
import { scoreOf } from '../../shared/yacht/score.js';
import { CATS, ROUNDS } from '../../shared/yacht/constants.js';

// Wraps the yacht brain: collects every server error a bot receives and every request a bot sends.
async function withSpy(fn) {
  const orig = games.yacht;
  const errors = [];
  const sent = [];
  games.yacht = {
    ...orig,
    createBrain(bot) {
      const inner = orig.createBrain({ ...bot, send: (m) => { sent.push({ id: bot.id, ...m }); return bot.send(m); } });
      return { onMsg(msg) { if (msg.t === 'error') errors.push({ id: bot.id, ...msg }); inner.onMsg(msg); } };
    },
  };
  try {
    await fn({ errors, sent });
  } finally {
    games.yacht = orig;
  }
}

// The admin's own moves, sent like a person: roll up to 3 times, pick the best empty cell, then confirm it.
async function adminMove(env) {
  const st = env.state;
  const me = st.you;
  if (st.phase !== 'playing' || st.turn !== me) return false;
  const col = st.cols.find((c) => c.id === me);
  if (!st.dice || st.rollsLeft > 0) {
    await env.admin.send({ t: 'yt', a: 'roll' });
    return true;
  }
  const values = st.dice.map((d) => d.v);
  const empty = CATS.filter((c) => col.scores[c] == null);
  const cat = empty.reduce((a, b) => (scoreOf(b, values) > scoreOf(a, values) ? b : a));
  await env.admin.send(st.pick === cat ? { t: 'yt', a: 'score', cat } : { t: 'yt', a: 'pick', cat });
  return true;
}

async function playToEnd(env) {
  for (let t = 0; env.state?.phase !== 'result'; t += 250) {
    assert.ok(t < 3_600_000, `game did not finish: ${JSON.stringify(env.state)?.slice(0, 400)}`);
    await env.tick(250);
    while (await adminMove(env)) await env.drain();
  }
}

for (const nBots of [1, 3]) {
  test(`yacht: admin + ${nBots} bot(s) play 12 rounds to the result with no rejected request`, async () => {
    await withSpy(async ({ errors, sent }) => {
      const env = await setupAdmin({ mode: 'yacht', bots: nBots, seed: 7 });
      await env.admin.send({ t: 'start' });
      await env.until(() => env.state?.phase === 'playing');
      assert.equal(env.state.cols.length, nBots + 1);
      await playToEnd(env);
      const st = env.state;
      assert.equal(st.phase, 'result');
      assert.equal(st.result.reason, 'done');
      assert.equal(st.result.ranks.length, nBots + 1);
      for (const c of st.cols) {
        assert.equal(CATS.filter((k) => c.scores[k] != null).length, ROUNDS, `${c.id} filled every cell`);
      }
      assert.deepEqual(errors, []);
      const mine = new Set(sent.map((m) => m.id));
      assert.equal(mine.size, nBots, 'every bot played');
      // scoring is two presses: every bot score request was preceded by a pick of the same cell
      for (const id of mine) {
        const seq = sent.filter((m) => m.id === id);
        seq.forEach((m, i) => {
          if (m.a === 'score') assert.deepEqual(seq[i - 1], { id, t: 'yt', a: 'pick', cat: m.cat });
        });
        assert.equal(seq.filter((m) => m.a === 'score').length, ROUNDS);
      }
      env.close();
    });
  });
}

test('yacht: a bot waits 0.5~1.5 s before acting and the first press (pick) is visible to the room', async () => {
  await withSpy(async ({ sent }) => {
    const env = await setupAdmin({ mode: 'yacht', bots: 1, seed: 3 });
    await env.admin.send({ t: 'start' });
    await env.drain();
    const botId = env.bots()[0].id;
    // make it the bot's turn: the admin plays its turn through if it comes first
    while (env.state.turn !== botId) {
      await adminMove(env);
      await env.drain();
    }
    const n0 = sent.length;
    await env.tick(400);
    assert.equal(sent.length, n0, 'nothing before 500 ms');
    await env.until(() => sent.some((m) => m.a === 'pick'), { step: 100 });
    assert.equal(env.state.pick, sent.find((m) => m.a === 'pick').cat, 'pick shown to everyone in the room state');
    env.close();
  });
});

test('yacht: skip has nothing to skip (no timed phase): adm_noskip in lobby and in play', async () => {
  const env = await setupAdmin({ mode: 'yacht', bots: 1 });
  assert.equal((await env.adm('skip')).error.code, 'adm_noskip');
  await env.admin.send({ t: 'start' });
  await env.drain();
  const r = await env.adm('skip');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'adm_noskip');
  assert.equal(games.yacht.skip(env.room), false);
  env.close();
});
