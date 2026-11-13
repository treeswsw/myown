// Admin bots in the liar room (SPEC 21-3): a full round with admin + bots, skip, and no rejected bot requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';
import { seeded } from '../helpers.js';
import { createBrain } from '../../server/admin/games/liar.js';
import { createGame, tick, act, viewFor } from '../../shared/liar/game.js';

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
  // keep skipping: a round whose votes fail no longer ends by itself (extended vote), so the host ends it
  for (let i = 0; i < 60 && env.state.phase !== 'result' && !(env.state.extendNo >= 1); i++) {
    r = await env.adm('skip');
    assert.equal(r.ok, true);
  }
  if (env.state.phase !== 'result') {
    assert.ok(env.state.extendNo >= 1, 'a failed vote extends the game');
    await env.admin.send({ t: 'lg', a: 'end' });
  }
  assert.equal(env.state.phase, 'lobby');
  r = await env.adm('skip');
  assert.equal(r.ok, false);
  env.close();
});

// Leak promise: in the "different word" mode the liar must not know it is the liar before the unmask, so the
// bot (which only reads what the server sends it) must send identical requests at identical times either way.
test('bot behaves identically as citizen or as the different-word liar until the unmask', () => {
  const ME = 'bot';
  const run = (botIsLiar) => {
    const players = ['a', 'b', ME];
    const g = createGame({
      players, settings: { liarMode: 'word' }, draw: { topic: '음식', citizenWord: '사과', liarWord: '배' },
      rng: (n) => Math.floor(seeded(5)() * n), now: 0,
    });
    g.liarId = botIsLiar ? ME : 'a'; // same order/seats/timings in both runs; only the bot's own secret differs
    const sent = [];
    const queue = [];
    let t = 0;
    const brain = createBrain({
      id: ME, name: '봇', rng: seeded(99),
      send: (msg) => { sent.push({ t, msg }); act(g, { type: msg.a, by: ME, text: msg.text, target: msg.target, v: msg.v }, t); },
      later: (ms, fn) => queue.push({ at: t + ms, fn }),
    });
    const phases = [];
    let ownWord = null;
    for (; t < 400_000; t += 250) {
      tick(g, t);
      if (g.phase === 'unmask' || g.phase === 'result') break;
      // others play the same way in both runs: the speaker writes, 'b' votes for 'a'
      if (g.phase === 'speak' && viewFor(g, 'a').speaker === 'a') act(g, { type: 'say', by: 'a', text: '설명' }, t);
      if (g.phase === 'judge') act(g, { type: 'judge', by: 'b', v: 'yes' }, t);
      if (g.phase === 'discuss' || g.phase === 'revote') act(g, { type: 'vote', by: 'b', target: 'a' }, t);
      const v = viewFor(g, ME);
      ownWord = v.my.word;
      if (phases.at(-1) !== g.phase) phases.push(g.phase);
      assert.equal(v.my.role, null, 'role is hidden before the unmask');
      brain.onMsg({ t: 'room', state: { mode: 'liar', you: ME, players: players.map((id) => ({ id, spectating: false })), ...v } });
      for (const q of queue.filter((x) => x.at <= t)) { queue.splice(queue.indexOf(q), 1); q.fn(); }
    }
    return { sent, phases, ownWord };
  };
  const citizen = run(false);
  const liar = run(true);
  assert.notEqual(citizen.ownWord, liar.ownWord); // the two runs really differ in the bot's own state
  assert.deepEqual(liar.phases, citizen.phases);
  assert.ok(citizen.phases.length >= 3, `phases ${citizen.phases}`);
  assert.ok(citizen.sent.length >= 1, 'the bot sent something before the unmask');
  assert.deepEqual(liar.sent, citizen.sent);
});
