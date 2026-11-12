#!/usr/bin/env node
// Soak / load check: node scripts/soak.js [--url ws://host:port/ws] [--bots 12] [--minutes 1] [--mode holdem|bluff|mixed]
// Bots are grouped into rooms (holdem 6, bluff 4); the first bot of each room is the host and restarts games.
import { Bot, sleep } from '../test/e2e/bot.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const URL = args.url || 'ws://127.0.0.1:8080/ws';
const N = Number(args.bots || 12);
const MIN = Number(args.minutes || 1);
const MODE = args.mode || 'mixed';
const STALL_MS = Number(args.stall || 45000);
const run = Date.now().toString(36).slice(-4);

const stats = { actions: 0, errors: 0, errorMsgs: {}, stalls: 0, hands: 0, games: 0, msgs: 0, closed: 0 };
const bots = [];
const rooms = [];

function count(b) {
  b.ws.on('message', () => { stats.msgs++; b._last = Date.now(); });
}

async function mkRoom(idx, mode, size) {
  const members = [];
  for (let i = 0; i < size; i++) {
    const b = new Bot(URL, `s${run}${idx}x${i}`.slice(0, 12), { thinkMs: [0, 40] });
    b.messages = { push(m) {
      if (m.t === 'error') { stats.errors++; stats.errorMsgs[m.msg] = (stats.errorMsgs[m.msg] || 0) + 1; }
      else if (m.t === 'event' && m.e.k === 'win') stats.hands++;
      else if (m.t === 'event' && m.e.k === 'bluffWin') stats.games++;
    }, get length() { return 0; }, slice() { return []; }, find() {}, filter() { return []; } };
    b.raw = { push() {} };
    b.stateHistory = { push() {} };
    b.errors = { push() {} };
    await b.connect();
    count(b);
    b.ws.on('close', () => { stats.closed++; });
    await b.login();
    members.push(b);
    bots.push(b);
  }
  const code = await members[0].create(mode);
  for (const b of members.slice(1)) await b.join(code);
  rooms.push({ mode, members, code });
  return members;
}

async function main() {
  console.log(`soak: ${N} bots, ${MIN} min, ${URL}, mode=${MODE}`);
  let left = N;
  let idx = 0;
  while (left >= 2) {
    const mode = MODE === 'mixed' ? (idx % 2 ? 'bluff' : 'holdem') : MODE;
    const size = Math.min(left, mode === 'holdem' ? 6 : 4);
    if (size < 2) break;
    await mkRoom(idx++, mode, size);
    left -= size;
  }
  const t0 = Date.now();
  const end = t0 + MIN * 60000;
  const stalled = new Set();
  let lastReport = t0;
  let lastCounts = { ...stats };
  while (Date.now() < end) {
    for (const r of rooms) {
      const host = r.members[0];
      if (host.state && host.state.phase === 'lobby') host.start();
    }
    for (const b of bots) {
      b._last = b._last || Date.now();
      if (b.state && b.state.phase === 'playing' && Date.now() - b._last > STALL_MS && !stalled.has(b)) {
        stalled.add(b);
        stats.stalls++;
        console.log(`STALL ${b.id}: no message for ${STALL_MS}ms in ${b.state.mode} turn=${b.state.turn}`);
      } else if (Date.now() - b._last < STALL_MS) stalled.delete(b);
    }
    if (Date.now() - lastReport >= 10000) {
      const dt = (Date.now() - lastReport) / 1000;
      console.log(`[${Math.round((Date.now() - t0) / 1000)}s] msgs/s=${((stats.msgs - lastCounts.msgs) / dt).toFixed(0)} hands=${stats.hands} games=${stats.games} errors=${stats.errors} stalls=${stats.stalls} closed=${stats.closed}`);
      lastReport = Date.now();
      lastCounts = { ...stats };
    }
    await sleep(300);
  }
  const secs = (Date.now() - t0) / 1000;
  console.log('\n=== soak summary ===');
  console.log(`duration      ${secs.toFixed(0)}s, rooms=${rooms.length}, bots=${bots.length}`);
  console.log(`messages      ${stats.msgs} (${(stats.msgs / secs).toFixed(0)}/s)`);
  console.log(`hands/games   ${stats.hands} hands (${(stats.hands / secs * 60).toFixed(1)}/min), ${stats.games} bluff games`);
  console.log(`errors        ${stats.errors}`, stats.errors ? JSON.stringify(stats.errorMsgs) : '');
  console.log(`stalls        ${stats.stalls}`);
  console.log(`disconnects   ${stats.closed}`);
  for (const b of bots) b.close();
  process.exit(stats.stalls || stats.closed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
