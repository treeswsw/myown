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

const isEv = (k) => (m) => m.t === 'event' && m.e && m.e.k === k;

/** Everyone leaves (non-hosts first, so the last one standing takes any pot of an unfinished hand). */
export async function leaveAll(bots) {
  for (const b of [...bots.slice(1), bots[0]]) {
    if (b.closed || !b.state) continue;
    b.leave();
    await b.waitFor(() => b.state === null, 5000, 'room:null after leave');
  }
}

/** One room of n fresh accounts, played until a champion appears or `maxHands` hands were played. */
export async function runHoldemSession(server, n, maxHands, { timeout = 120000 } = {}) {
  const { bots, code } = await seatAll(server, 'holdem', n);
  const host = bots[0];
  const wd = watchdog(bots);
  const wins = () => host.messages.filter(isEv('win')).length;
  const champion = () => host.messages.find(isEv('champion'));
  host.start();
  try {
    await Promise.race([
      host.waitFor(() => champion() || wins() >= maxHands, timeout, `session: champion or ${maxHands} hands (got ${wins()})`),
      wd.promise,
    ]);
    if (champion()) await host.waitFor(() => host.state.phase === 'lobby', 5000, 'lobby after champion');
  } finally { wd.stop(); }
  for (const b of bots) b.opts.autoplay = false; // freeze: nobody acts any more
  const champ = champion();
  return { bots, code, hands: wins(), champion: champ ? champ.e.id : null };
}

/** Plays sessions of fresh accounts until `hands` hands were played in total. Every session ends with all bots out of the room. */
export async function runHoldem(server, n, hands, opts = {}) {
  const sessions = [];
  let total = 0;
  while (total < hands) {
    const sess = await runHoldemSession(server, n, hands - total, opts);
    sessions.push(sess);
    total += sess.hands;
    sess.stateHistory = sess.bots[0].stateHistory.slice();
    await leaveAll(sess.bots);
  }
  return { sessions, bots: sessions.flatMap((x) => x.bots), hands: total };
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
    // bluffWin is an event; the matching `room` (phase 'result') follows it as a separate message
    await host.waitFor(() => host.stateHistory.filter((st) => st.phase === 'result').length >= games, 5000, 'final result state');
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
