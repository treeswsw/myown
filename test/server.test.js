import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { startServer } from '../server/index.js';
import { createStore } from '../server/store.js';

function rawGet(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: pathname, host: '127.0.0.1' }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

test('http: healthz, static files, SPA fallback, traversal safety', async (t) => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<h1>home</h1>');
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'assets', 'a.js'), 'x');
  fs.writeFileSync(path.join(dist, '..', path.basename(dist) + '-secret.txt'), 'secret');
  const app = await startServer({ port: 0, store: createStore(), distDir: dist });
  t.after(() => app.close());

  assert.equal((await rawGet(app.port, '/healthz')).status, 200);
  const home = await rawGet(app.port, '/');
  assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(home.body, '<h1>home</h1>');
  assert.equal((await rawGet(app.port, '/assets/a.js')).headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await rawGet(app.port, '/room/ABCD')).body, '<h1>home</h1>');
  assert.equal((await rawGet(app.port, '/missing.png')).status, 404);
  for (const p of [`/../${path.basename(dist)}-secret.txt`, '/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2f' + path.basename(dist) + '-secret.txt', '/%00']) {
    const r = await rawGet(app.port, p);
    assert.notEqual(r.body, 'secret');
    assert.ok(r.status === 400 || r.status === 404 || r.body === '<h1>home</h1>', `${p} -> ${r.status}`);
  }
});

test('websocket: login, create and receive room state; same-ID takeover closes the old socket', async (t) => {
  const app = await startServer({ port: 0, store: createStore(), distDir: os.tmpdir() });
  t.after(() => app.close());
  const open = () => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    ws.inbox = [];
    ws.on('message', (d) => ws.inbox.push(JSON.parse(d)));
    ws.on('open', () => resolve(ws));
  });
  const waitFor = async (ws, pred) => {
    for (let i = 0; i < 100; i++) {
      const m = ws.inbox.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail('timeout');
  };
  const a = await open();
  a.send(JSON.stringify({ t: 'login', id: 'wsuser' }));
  assert.equal((await waitFor(a, (m) => m.t === 'me')).user.bank, 10000);
  a.send(JSON.stringify({ t: 'create', mode: 'bluff' }));
  const room = await waitFor(a, (m) => m.t === 'room' && m.state);
  assert.equal(room.state.mode, 'bluff');
  assert.equal(room.state.players[0].id, 'wsuser');

  const closed = new Promise((resolve) => a.on('close', resolve));
  const b = await open();
  b.send(JSON.stringify({ t: 'login', id: 'WSUSER' }));
  const again = await waitFor(b, (m) => m.t === 'room' && m.state);
  assert.equal(again.state.code, room.state.code);
  await closed;
  b.close();
});
