import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { createStore } from './store.js';
import { createHub } from './rooms.js';
import { MAX_FRAME } from './protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

async function statFile(file) {
  try {
    const s = await fs.promises.stat(file);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

function plain(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

async function serveStatic(req, res, distDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'Method Not Allowed');
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return plain(res, 400, 'Bad Request');
  }
  if (pathname.includes('\0')) return plain(res, 400, 'Bad Request');
  // Normalizing against "/" first removes every ".." segment before it touches the disk.
  const rel = path.posix.normalize('/' + pathname);
  let file = path.join(distDir, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (file !== distDir && !file.startsWith(distDir + path.sep)) return plain(res, 403, 'Forbidden');
  let stat = await statFile(file);
  if (!stat && !path.extname(rel)) {
    file = path.join(distDir, 'index.html'); // SPA fallback
    stat = await statFile(file);
  }
  if (!stat) return plain(res, 404, 'Not Found');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

export async function startServer({
  port = 8080, store, distDir = path.join(ROOT, 'dist'), hubOptions = {},
} = {}) {
  distDir = path.resolve(distDir);
  // Unref'd so pending game timers never keep a closing process alive.
  const timers = { setTimeout: (fn, ms) => setTimeout(fn, ms).unref(), clearTimeout };
  const hub = createHub({ store, timers, ...hubOptions });
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') return plain(res, 200, 'ok');
    serveStatic(req, res, distDir).catch(() => {
      if (!res.headersSent) plain(res, 500, 'Server Error');
      else res.destroy();
    });
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_FRAME });
  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const conn = hub.connect({
      send: (text) => { if (ws.readyState === ws.OPEN) ws.send(text); },
      close: (code, reason) => ws.close(code, reason),
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) conn.message(data.toString());
    });
    ws.on('close', () => conn.close());
    ws.on('error', () => ws.terminate());
  });
  // Proxies drop idle sockets; ping so dead peers are noticed and their seat grace starts.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 30_000);

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    server,
    hub,
    port: server.address().port,
    async close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
      await hub.close(); // flushes rooms, then waits for saves; after the sockets are gone: their close handlers start grace timers
    },
  };
}

const envNum = (name) => (process.env[name] ? Number(process.env[name]) : undefined);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const store = createStore(process.env.DATABASE_URL);
  await store.init();
  const timing = Object.fromEntries(Object.entries({
    grace: envNum('GRACE_MS'), roomGc: envNum('ROOM_GC_MS'),
    result: envNum('RESULT_MS'), resultFold: envNum('RESULT_FOLD_MS'), tieExtra: envNum('TIE_EXTRA_MS'),
    bluffResult: envNum('BLUFF_RESULT_MS'), bustExtra: envNum('BUST_EXTRA_MS'),
    street: envNum('STREET_MS'), roomList: envNum('ROOM_LIST_MS'), reveal: envNum('REVEAL_MS'),
  }).filter(([, v]) => Number.isFinite(v)));
  const app = await startServer({
    port: process.env.PORT === undefined ? 8080 : Number(process.env.PORT),
    store,
    hubOptions: {
      timing,
      liar: ['test', 'off'].includes(process.env.LIAR) ? process.env.LIAR : 'on',
      yacht: ['test', 'off'].includes(process.env.YACHT) ? process.env.YACHT : 'on',
      gsk: ['on', 'off'].includes(process.env.GSK) ? process.env.GSK : 'test', // default test: Render ignores render.yaml env changes on an existing service
      draw: ['test', 'off'].includes(process.env.DRAW) ? process.env.DRAW : 'on',
      adminKey: process.env.ADMIN_KEY || undefined, // default 9975 (SPEC 21-1)
      coinSeed: Number(process.env.COIN_SEED) > 0 ? Math.floor(Number(process.env.COIN_SEED)) : 0, // click tests only (SPEC 22-12)
    },
  });
  console.log(`listening on ${app.port}`);
  // Render kills the process about 30 s after SIGTERM: wait for the last saves (liar scores) at most 10 s.
  const shutdown = async () => {
    const giveUp = new Promise((resolve) => setTimeout(resolve, 10_000).unref());
    const finish = (async () => { await app.close(); await store.close(); })()
      .catch((err) => console.error('shutdown failed:', err.message));
    await Promise.race([finish, giveUp]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
