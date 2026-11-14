// Admin bot for 갱식마인드 (SPEC 21-3): one full round with admin + 1 bot, skip, and no server errors for the bots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

// Swaps the draw brain in the registry; every message a bot receives is also passed to `seen`.
async function withSpy(seen, fn) {
  const { games } = await import('../../server/admin/games/index.js');
  const orig = games.draw;
  games.draw = {
    ...orig,
    createBrain(bot) {
      const brain = orig.createBrain(bot);
      return { onMsg(msg) { seen(bot, msg); brain.onMsg(msg); } };
    },
  };
  try {
    await fn();
  } finally {
    games.draw = orig;
  }
}

const dr = (env, msg) => env.admin.send({ t: 'dr', ...msg });
const phase = (env) => env.state?.phase;

test('admin + 1 bot play one full round (1 round, 2 questions) to the final ranking, bots get no errors', async () => {
  const errors = [];
    await withSpy((bot, msg) => { if (msg.t === 'error') errors.push({ id: bot.id, ...msg }); }, async () => {
    const env = await setupAdmin({ mode: 'draw', bots: 1, seed: 7 });
    assert.equal(phase(env), 'lobby');
    await env.admin.send({ t: 'set', patch: { rounds: 1, time: 60 } });
    assert.equal(env.state.settings.rounds, 1);
    await env.admin.send({ t: 'start' });
    assert.notEqual(phase(env), 'lobby');

    const seenQ = new Set();
    let adminStroked = -1;
    await env.until((e) => {
      const s = e.state;
      if (s.phase === 'pick' || s.phase === 'draw') seenQ.add(s.q);
      if (s.phase === 'pick' && s.drawerId === s.you && s.choices) { dr(e, { a: 'pick', i: 0 }); }
      if (s.phase === 'draw' && s.drawerId === s.you && adminStroked !== s.q) {
        adminStroked = s.q;
        e.admin.send({ t: 'dr', a: 'st', c: 4, w: 10, e: 0, p: [400, 400, 20, 10, 15, -10] });
        e.admin.send({ t: 'dr', a: 'pt', p: [], f: 1 });
      }
      return s.phase === 'final';
    }, { max: 900_000 });

    assert.deepEqual([...seenQ].sort(), [1, 2]); // both players drew once
    assert.equal(env.state.ranking.length, 2);
    assert.equal(env.state.roundNo, 1);
    // the bot drew (admin saw its strokes) and guessed (admin saw its chat)
    const evs = env.admin.sock.msgs.filter((m) => m.t === 'event').map((m) => m.e);
    assert.ok(evs.some((e) => e.k === 'drSt'), 'bot drew');
    assert.ok(evs.some((e) => e.k === 'chat' && e.id === '~bot1'), 'bot guessed');
    env.close();
  });
  assert.deepEqual(errors, []);
});

test('bot as drawer picks a word and draws strokes the other player sees', async () => {
  const errors = [];
  await withSpy((bot, msg) => { if (msg.t === 'error') errors.push(msg); }, async () => {
    // find a seed where the bot draws first
    for (let seed = 1; seed < 40; seed++) {
      const env = await setupAdmin({ mode: 'draw', bots: 1, seed });
      await env.admin.send({ t: 'start' });
      if (env.state.drawerId !== '~bot1') { env.close(); continue; }
      assert.equal(phase(env), 'pick');
      await env.until((e) => phase(e) === 'draw');
      const before = env.admin.sock.msgs.length;
      await env.until((e) => e.admin.sock.msgs.slice(before).filter((m) => m.t === 'event' && m.e.k === 'drSt').length >= 3, { max: 20_000 });
      assert.equal(env.room.impl.drawing.ops.length >= 3, true);
      env.close();
      assert.deepEqual(errors, []);
      return;
    }
    assert.fail('no seed with the bot drawing first');
  });
});

test('skip ends pick, draw and reveal at once; lobby and final have nothing to skip', async () => {
  const env = await setupAdmin({ mode: 'draw', bots: 1, seed: 3 });
  let r = await env.adm('skip');
  assert.equal(r.error?.code, 'adm_noskip'); // lobby
  await env.admin.send({ t: 'set', patch: { rounds: 1, time: 60 } });
  await env.admin.send({ t: 'start' });
  assert.equal(phase(env), 'pick');
  const t0 = env.clock.now();

  r = await env.adm('skip'); // pick -> draw (first word)
  assert.equal(r.ok, true);
  assert.equal(phase(env), 'draw');
  r = await env.adm('skip'); // draw -> reveal (time over)
  assert.equal(r.ok, true);
  assert.equal(phase(env), 'reveal');
  assert.equal(env.state.reveal.why, 'time');
  r = await env.adm('skip'); // reveal -> next question
  assert.equal(r.ok, true);
  assert.equal(phase(env), 'pick');
  assert.equal(env.state.q, 2);
  assert.equal(env.clock.now(), t0); // no fake time passed: skipped, not waited

  await env.adm('skip');
  await env.adm('skip');
  await env.adm('skip'); // q2: pick -> draw -> reveal -> final
  assert.equal(phase(env), 'final');
  r = await env.adm('skip');
  assert.equal(r.error?.code, 'adm_noskip');
  assert.equal(env.state.ranking.length, 2);
  // the skipped timer is not left behind to fire a second time
  await env.tick(120_000);
  assert.equal(phase(env), 'final');
  env.close();
});
