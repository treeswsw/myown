import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bot, sleep } from './bot.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Timer overrides the server honors for tests (names agreed in docs/SYNC.md).
export const FAST_TIMERS = {
  ROOM_LIST_MS: '150',
  RESULT_MS: '60',
  BUST_EXTRA_MS: '0',
  STREET_MS: '30',
  REVEAL_MS: '80',
  GRACE_MS: '1500',
  ROOM_GC_MS: '1500',
};

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

export async function startServer(env = {}) {
  const port = await freePort();
  const childEnv = { ...process.env, ...FAST_TIMERS, ...env, PORT: String(port) };
  delete childEnv.DATABASE_URL;
  if (env.DATABASE_URL) childEnv.DATABASE_URL = env.DATABASE_URL;
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let exited = null;
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('exit', (code, sig) => { exited = { code, sig }; });
  const deadline = Date.now() + 8000;
  for (;;) {
    if (exited) throw new Error(`server exited early ${JSON.stringify(exited)}\n${log}`);
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`server did not start\n${log}`); }
    const ok = await new Promise((r) => {
      const c = net.connect(port, '127.0.0.1', () => { c.destroy(); r(true); });
      c.on('error', () => r(false));
    });
    if (ok) break;
    await sleep(50);
  }
  return {
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    http: `http://127.0.0.1:${port}`,
    log: () => log,
    alive: () => !exited,
    async stop() {
      if (exited) return;
      child.kill('SIGTERM');
      await new Promise((r) => { const t = setTimeout(() => { child.kill('SIGKILL'); r(); }, 2000); child.on('exit', () => { clearTimeout(t); r(); }); });
    },
  };
}

let seq = 0;
export function uid(prefix = 'bot') {
  return `${prefix}${Date.now().toString(36).slice(-4)}${(seq++).toString(36)}`.slice(0, 12);
}

export async function makeBots(server, n, opts = {}) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    const b = new Bot(server.url, uid('b'), opts);
    await b.connect();
    await b.login();
    bots.push(b);
  }
  return bots;
}

export async function seatAll(server, mode, n, opts = {}) {
  const bots = await makeBots(server, n, opts);
  const code = await bots[0].create(mode);
  for (const b of bots.slice(1)) await b.join(code);
  return { bots, code };
}

/** Collect structurally every string/number leaf in an object. */
export function* walk(v, p = '') {
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) yield* walk(x, p ? `${p}.${k}` : k);
  } else yield [p, v];
}

export const CARD_RE = /^[2-9TJQKA][shdc]$/;
