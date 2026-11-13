// Admin bot in the mini room (SPEC 21-3): plays random legal moves, bets nothing, ends a game and a best-of-3 match without a rejected request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';
import { games } from '../../server/admin/games/index.js';
import { GAMES } from '../../shared/mini/index.js';

async function withSpy(fn) {
  const orig = games.mini;
  const errors = [];
  const sent = [];
  games.mini = {
    ...orig,
    createBrain(bot) {
      const inner = orig.createBrain({ ...bot, send: (m) => { sent.push({ id: bot.id, ...m }); return bot.send(m); } });
      return { onMsg(msg) { if (msg.t === 'error') errors.push({ id: bot.id, ...msg }); inner.onMsg(msg); } };
    },
  };
  try {
    await fn({ errors, sent });
  } finally {
    games.mini = orig;
  }
}

// 관리자도 사람처럼: 자기 차례면 규칙이 받아 주는 아무 수나 둔다.
async function adminMove(env) {
  const st = env.state;
  if (st?.phase !== 'play' || st.mn.turn !== st.mySeat) return false;
  const rules = GAMES[st.game];
  const ok = rules.legalMoves(st.mn).filter((m) => rules.apply(st.mn, m));
  await env.admin.send({ t: 'mn', a: 'move', move: ok[Math.floor(env.hub.rng() * ok.length)] });
  return true;
}

async function playToEnd(env) {
  for (let t = 0; env.state?.phase !== 'end'; t += 250) {
    assert.ok(t < 3_600_000, `did not finish: ${JSON.stringify(env.state)?.slice(0, 300)}`);
    await env.tick(250);
    while (await adminMove(env)) await env.drain();
  }
}

test('mini bot: connect4 against the admin to the result, no rejected request, bot waits before moving', async () => {
  await withSpy(async ({ errors, sent }) => {
    const env = await setupAdmin({ mode: 'mini', bots: 1, seed: 5, hubOptions: { mini: 'on' } });
    await env.admin.send({ t: 'set', patch: { game: 'connect4' } });
    await env.admin.send({ t: 'start' });
    await env.drain();
    assert.equal(env.state.phase, 'play');
    await playToEnd(env);
    assert.equal(env.state.phase, 'end');
    assert.deepEqual(errors, []);
    assert.ok(sent.length > 0 && sent.every((m) => m.t === 'mn' && m.a === 'move'), 'the bot only sends moves');
    assert.equal(env.state.match.bet, 0, 'bots bet 0');
    env.close();
  });
});

test('mini bot: best of 3 (order of two games), skip ends the pause between games', async () => {
  await withSpy(async ({ errors }) => {
    const env = await setupAdmin({ mode: 'mini', bots: 1, seed: 11, hubOptions: { mini: 'on' } });
    await env.admin.send({ t: 'set', patch: { kind: 'order', games: ['connect4', 'reversi'], len: 3 } });
    await env.admin.send({ t: 'start' });
    await env.drain();
    let sawBetween = false;
    for (let t = 0; env.state?.phase !== 'end'; t += 250) {
      assert.ok(t < 3_600_000, 'did not finish');
      await env.tick(250);
      while (await adminMove(env)) await env.drain();
      if (env.state?.phase === 'between' && !sawBetween) {
        sawBetween = true;
        const r = await env.adm('skip');
        assert.equal(r.ok, true, 'skip ends the pause');
        assert.equal(env.state.phase, 'play');
      }
    }
    assert.ok(sawBetween || env.state.match.score.includes(2));
    assert.deepEqual(errors, []);
    env.close();
  });
});

test('mini bot: it never plays a forbidden renju cell', async () => {
  await withSpy(async ({ errors, sent }) => {
    const env = await setupAdmin({ mode: 'mini', bots: 1, seed: 2, hubOptions: { mini: 'on' } });
    await env.admin.send({ t: 'set', patch: { game: 'gomoku', rule: 'renju' } });
    await env.admin.send({ t: 'start' });
    await env.drain();
    for (let t = 0; sent.length < 25 && env.state.phase === 'play'; t += 250) {
      assert.ok(t < 600_000);
      await env.tick(250);
      while (await adminMove(env)) await env.drain();
    }
    assert.deepEqual(errors, []);
    env.close();
  });
});
