// Admin bots in the gsk room (SPEC 21-3): a full game with admin + bots reaches the result; no rejected bot request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

test('admin + 2 bots play a whole game to the result', async () => {
  const { games } = await import('../../server/admin/games/index.js');
  assert.ok(games.gsk, 'gsk bot is registered');
  const orig = games.gsk;
  const errors = [];
  games.gsk = {
    ...orig,
    createBrain(bot) {
      const brain = orig.createBrain(bot);
      return { onMsg(msg) { if (msg.t === 'error') if (msg.t === 'error' && msg.code !== 'gk_now') errors.push({ bot: bot.id, msg }); brain.onMsg(msg); } };
    },
  };
  try {
    const env = await setupAdmin({ mode: 'gsk', bots: 2, seed: 3, hubOptions: { gsk: 'on' } });
    assert.equal(env.state.players.length, 3);
    await env.admin.send({ t: 'start' });
    assert.equal(env.state.phase, 'playing');
    // the admin plays like a person: one simple legal move per situation
    const done = new Set();
    const once = async (key, msg) => { if (!done.has(key)) { done.add(key); await env.admin.send(msg); } };
    for (let t = 0; env.state.phase !== 'result'; t += 250) {
      assert.ok(t < 3_000_000, `game did not finish; ${JSON.stringify({ ...env.state, players: 0, mine: env.state.mine })}`);
      await env.tick(250);
      const s = env.state;
      if (s.phase !== 'playing') continue;
      const k = `${s.gameNo}:${s.round}:${s.step}:${s.flipped}:${s.bid?.n}:${s.mine?.stack.length}`;
      const me = s.seats.find((x) => x.id === s.you);
      if (s.step === 'setup' && !me.placed) await once(k, { t: 'gk', a: 'place', k: s.mine.hand.F ? 'F' : 'S' });
      else if (s.step === 'turn' && s.turn === s.you) await once(k, { t: 'gk', a: 'bid', n: 1 });
      else if (s.step === 'bid' && s.turn === s.you) await once(k, { t: 'gk', a: 'pass' });
      else if (s.step === 'penalty' && s.penalty.by === s.you) {
        const f = s.mine.hand.F + s.mine.stack.filter((x) => x === 'F').length;
        await once(k, { t: 'gk', a: 'discard', k: f ? 'F' : 'S' });
      }
    }
    assert.ok(env.state.result.winner);
    assert.deepEqual(errors, []);
    env.close();
  } finally {
    games.gsk = orig;
  }
});
