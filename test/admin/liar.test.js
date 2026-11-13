// Admin bots in the liar room (SPEC 21-3): a full round with admin + bots, skip, and no rejected bot requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

// Wraps the liar brain so every error message a bot receives is collected.
async function withErrorCapture(fn) {
  const { games } = await import('../../server/admin/games/index.js');
  const orig = games.liar;
  const errors = [];
  games.liar = {
    ...orig,
    createBrain(bot) {
      const brain = orig.createBrain(bot);
      return {
        onMsg(msg) {
          if (msg.t === 'error') errors.push({ bot: bot.id, msg });
          brain.onMsg(msg);
        },
      };
    },
  };
  try {
    await fn(errors);
  } finally {
    games.liar = orig;
  }
}

// The admin plays like a person: one simple legal move per situation, each once.
function adminMover(env) {
  const done = new Set();
  return async () => {
    const s = env.state;
    if (!s) return;
    const once = async (key, msg) => {
      if (done.has(key)) return;
      done.add(key);
      await env.admin.send(msg);
    };
    const k = `${s.round}:`;
    if (s.phase === 'speak' && s.speaker === s.you && !s.speakDone) await once(`${k}say`, { t: 'lg', a: 'say', text: '관리자 설명' });
    if ((s.phase === 'discuss' || s.phase === 'revote') && !s.votes[s.you]) {
      const pool = (s.phase === 'revote' && s.candidates ? s.candidates : s.players.map((p) => p.id)).filter((id) => id !== s.you);
      if (pool.length) await once(`${k}vote:${s.phase}:${s.accuseNo}`, { t: 'lg', a: 'vote', target: pool[0] });
    }
    if (s.phase === 'judge' && s.accused !== s.you && !s.judge?.picks[s.you]) await once(`${k}judge:${s.accuseNo}`, { t: 'lg', a: 'judge', v: 'yes' });
    if (s.phase === 'guess' && s.my.role === 'liar' && !s.guess) await once(`${k}guess`, { t: 'lg', a: 'guess', text: '아무거나' });
  };
}

test('admin + 2 bots play one full round to the result with no rejected bot request', async () => {
  await withErrorCapture(async (errors) => {
    const env = await setupAdmin({ mode: 'liar', bots: 2, seed: 7 });
    assert.equal(env.state.players.length, 3);
    await env.admin.send({ t: 'start' });
    assert.equal(env.state.phase, 'reveal');
    const move = adminMover(env);
    const seen = new Set();
    for (let t = 0; env.state.phase !== 'result'; t += 250) {
      assert.ok(t < 1_200_000, `round did not finish; phase ${env.state.phase}`);
      await env.tick(250);
      seen.add(env.state.phase);
      await move();
    }
    for (const p of ['reveal', 'speak', 'discuss', 'defense', 'judge', 'judged', 'unmask', 'guess', 'answer', 'result']) {
      assert.ok(seen.has(p) || p === 'result', `phase ${p} was seen`);
    }
    const r = env.state.result;
    assert.ok(['citizens', 'liar'].includes(r.winner));
    assert.equal(Object.keys(r.delta).length, 3);
    assert.deepEqual(errors, []);
    // every bot said its first line when it was its turn
    const says = env.state.firstSays.filter((x) => x.text != null);
    assert.equal(says.length, 3);
    env.close();
  });
});

test('bots in a bigger room also finish a round (more votes, revotes)', async () => {
  await withErrorCapture(async (errors) => {
    const env = await setupAdmin({ mode: 'liar', bots: 5, seed: 21 });
    await env.admin.send({ t: 'start' });
    const move = adminMover(env);
    for (let t = 0; env.state.phase !== 'result'; t += 250) {
      assert.ok(t < 1_800_000, `round did not finish; phase ${env.state.phase}`);
      await env.tick(250);
      await move();
    }
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('skip ends the pending phase now; nothing to skip in the lobby or the result', async () => {
  const env = await setupAdmin({ mode: 'liar', bots: 2 });
  let r = await env.adm('skip');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'adm_noskip');
  await env.admin.send({ t: 'start' });
  assert.equal(env.state.phase, 'reveal');
  r = await env.adm('skip'); // reveal -> speak
  assert.equal(r.ok, true);
  assert.equal(env.state.phase, 'speak');
  const first = env.state.speaker;
  r = await env.adm('skip'); // current speaker's turn ends at once
  assert.equal(r.ok, true);
  assert.notEqual(env.state.speaker, first);
  // keep skipping until the round ends; the room must stay consistent and finish
  for (let i = 0; i < 60 && env.state.phase !== 'result'; i++) {
    r = await env.adm('skip');
    assert.equal(r.ok, true);
  }
  assert.equal(env.state.phase, 'result');
  r = await env.adm('skip');
  assert.equal(r.ok, false);
  env.close();
});
