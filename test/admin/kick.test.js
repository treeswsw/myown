import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdmin } from './helpers.js';

for (const [mode, kick] of [
  ['liar', { t: 'kick', id: '~bot1' }],
  ['draw', { t: 'kick', id: '~bot1' }],
]) {
  test(`${mode}: a bot kicked by the game is fully retired`, async () => {
    const env = await setupAdmin({ mode, bots: 1 });
    assert.equal(env.hub.admin.botsIn(env.room), 1);
    await env.admin.send(kick);
    await env.drain();
    assert.ok(!env.room.members.some((m) => m.id === '~bot1'), 'bot should be out of the room');
    assert.equal(env.hub.admin.botsIn(env.room), 0);
    assert.equal(env.bots().length, 0);
    assert.ok(!env.hub.sessions.has('~bot1'));
    const u = await env.human('손님');
    await u.send({ t: 'join', code: env.room.code });
    assert.ok(env.room.members.some((m) => m.id === '손님'), 'human can join now');
    assert.ok(!u.sock.msgs.some((m) => m.t === 'error'));
    env.close();
  });

  test(`${mode}: bot- after the game kicked the bot gives adm_nobot`, async () => {
    const env = await setupAdmin({ mode, bots: 1 });
    await env.admin.send(kick);
    await env.drain();
    const r = await env.adm('bot-');
    assert.equal(r.ok, false);
    assert.equal(r.error?.code, 'adm_nobot');
    env.close();
  });
}

test('a human cannot join while a bot join is still in flight', async () => {
  const env = await setupAdmin({ mode: 'liar' });
  const p = env.adm('bot+');
  const u = await env.human('손님');
  await u.send({ t: 'join', code: env.room.code });
  assert.ok(!env.room.members.some((m) => m.id === '손님'));
  assert.equal((await p).ok, true);
  env.close();
});
