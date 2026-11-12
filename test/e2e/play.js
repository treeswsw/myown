// Shared game drivers used by several e2e tests.
import { Bot, sleep } from './bot.js';
import { seatAll } from './helpers.js';

/** Fail-fast stall watchdog: rejects if a playing room produces no message for `ms`. */
export function watchdog(bots, ms = 9000) {
  let stop = false;
  let rejectFn;
  const p = new Promise((_, rej) => { rejectFn = rej; });
  p.catch(() => {});
  (async () => {
    while (!stop) {
      await sleep(250);
      const now = Date.now();
      for (const b of bots) {
        b._lastMsgAt = b._lastMsgAt || now;
        const n = b.messages.length;
        if (b._lastN !== n) { b._lastN = n; b._lastMsgAt = now; }
        if (b.state && b.state.phase === 'playing' && now - b._lastMsgAt > ms) {
          stop = true;
          rejectFn(new Error(`STALL: no message for ${ms}ms in phase=playing turn=${b.state.turn} (bot ${b.id}) state=${JSON.stringify(b.state).slice(0, 600)}`));
        }
      }
    }
  })();
  return { promise: p, stop: () => { stop = true; } };
}

export async function runHoldem(server, n, hands, { timeout = 120000 } = {}) {
  const { bots, code } = await seatAll(server, 'holdem', n);
  const host = bots[0];
  const wd = watchdog(bots);
  let wins = 0;
  const countWins = () => {
    wins = host.messages.filter((m) => m.t === 'event' && m.e && m.e.k === 'win').length;
    return wins;
  };
  host.start();
  try {
    await Promise.race([
      host.waitFor(() => countWins() >= hands, timeout, `${hands} hands (got ${wins})`),
      wd.promise,
    ]);
  } finally { wd.stop(); }
  return { bots, code, hands: countWins() };
}

export async function runBluff(server, n, games, { timeout = 120000 } = {}) {
  const { bots, code } = await seatAll(server, 'bluff', n);
  const host = bots[0];
  const wd = watchdog(bots);
  const wins = () => host.messages.filter((m) => m.t === 'event' && m.e && m.e.k === 'bluffWin').length;
  try {
    await Promise.race([
      (async () => {
        while (wins() < games) {
          await host.waitFor(() => wins() >= games || (host.state && host.state.phase === 'lobby'), timeout, `lobby before game ${wins() + 1}`);
          if (wins() >= games) break;
          host.start();
          await host.waitFor(() => host.state.phase !== 'lobby', 5000, `bluff start (errors=${JSON.stringify(host.errors.slice(-3))} state=${JSON.stringify(host.state).slice(0, 500)})`);
        }
      })(),
      wd.promise,
    ]);
  } finally { wd.stop(); }
  return { bots, code, games: wins() };
}

export async function stopAll(bots) {
  for (const b of bots) b.close();
  await sleep(50);
}

/** Read each id's persisted account by logging in again (fresh connection). */
export async function readAccounts(server, ids) {
  const out = {};
  for (const id of ids) {
    const b = new Bot(server.url, id, { autoplay: false });
    await b.connect();
    await b.login();
    out[id] = b.me;
    b.close();
  }
  return out;
}
