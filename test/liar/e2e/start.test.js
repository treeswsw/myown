// Real host server (real crypto hub.rng, real timers) + 3 ws clients: a round starts and each sees only its own word.
// Catches hub.rng shape mismatches that fake-rng unit tests (rng: () => 0) cannot (물결 2 검토).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../../../server/index.js';
import { createStore } from '../../../server/store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('진짜 서버: 3명 접속 → 시작 → reveal, 역할 비공개, 단어 2종', async (t) => {
  const store = createStore();
  await store.init?.();
  const app = await startServer({ port: 0, store, hubOptions: { liar: 'on' } });
  const cs = [];
  t.after(async () => { for (const c of cs) c.ws.close(); await app.close(); await store.close?.(); });
  for (const id of ['alpha', 'bravo', 'charl']) {
    const c = { id, state: null, errors: [], ws: new WebSocket(`ws://127.0.0.1:${app.port}/ws`) };
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'room') c.state = m.state;
      if (m.t === 'error') c.errors.push(m.msg);
    });
    await new Promise((r) => c.ws.on('open', r));
    c.ws.send(JSON.stringify({ t: 'login', id }));
    cs.push(c);
  }
  const until = async (fn, what) => {
    for (let i = 0; i < 150; i++) { if (fn()) return; await sleep(20); }
    assert.fail(`timeout: ${what} (errors: ${cs.flatMap((c) => c.errors).join(', ')})`);
  };
  await sleep(100);
  cs[0].ws.send(JSON.stringify({ t: 'create', mode: 'liar' }));
  await until(() => cs[0].state?.code, 'create');
  for (const c of cs.slice(1)) c.ws.send(JSON.stringify({ t: 'join', code: cs[0].state.code }));
  await until(() => cs.every((c) => c.state?.players?.length === 3), 'join');
  for (let round = 1; round <= 3; round++) {   // several draws with the real rng
    cs[0].ws.send(JSON.stringify({ t: 'start' }));
    await until(() => cs.every((c) => c.state?.phase === 'reveal' && c.state.round === round), `reveal ${round}`);
    assert.ok(cs.every((c) => c.state.my.role === null && typeof c.state.my.word === 'string'));
    assert.equal(new Set(cs.map((c) => c.state.my.word)).size, 2);
    cs[0].ws.send(JSON.stringify({ t: 'lg', a: 'end' }));
    await until(() => cs.every((c) => c.state?.phase === 'lobby'), `end ${round}`);
  }
  assert.deepEqual(cs.flatMap((c) => c.errors), []);
});
