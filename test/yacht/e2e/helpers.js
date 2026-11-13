// 요트 e2e 도우미: 진짜 서버 + ws 봇. 시계는 그대로(grace 만 짧게).
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../../../server/index.js';
import { createStore } from '../../../server/store.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startYacht({ grace = 400 } = {}) {
  const store = createStore();
  await store.init?.();
  const app = await startServer({ port: 0, store, hubOptions: { yacht: 'on', timing: { grace } } });
  return { app, store, async close() { await app.close(); await store.close?.(); } };
}

export async function until(fn, what, timeout = 6000) {
  const end = Date.now() + timeout;
  while (!(await fn())) {
    if (Date.now() > end) assert.fail(`timeout: ${what}`);
    await sleep(4);
  }
}

export async function bot(app, id) {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
  const c = { id, ws, state: null, me: null, events: [], errors: [], send: (o) => ws.send(JSON.stringify(o)), yt: (a, o = {}) => c.send({ t: 'yt', a, ...o }), close: () => ws.close() };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'room') c.state = m.state;
    else if (m.t === 'me') c.me = m.user;
    else if (m.t === 'event') c.events.push(m.e);
    else if (m.t === 'error') c.errors.push(m.msg);
  });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  c.send({ t: 'login', id });
  await until(() => c.me, `login ${id}`);
  return c;
}

export async function yachtRoom(app, ids) {
  const cs = [];
  for (const id of ids) cs.push(await bot(app, id));
  cs[0].send({ t: 'create', mode: 'yacht' });
  await until(() => cs[0].state?.code, 'create');
  for (const c of cs.slice(1)) c.send({ t: 'join', code: cs[0].state.code });
  await until(() => cs.every((c) => c.state?.players.length === ids.length), 'join');
  return cs;
}
