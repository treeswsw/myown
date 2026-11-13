// Shared setup for admin-mode tests (SPEC 21). Later bot tests (one per game) use this instead of wiring a hub.
//
//   import { setupAdmin } from './helpers.js';
//   const env = await setupAdmin({ mode: 'yacht', bots: 1 });
//   await env.until(() => env.state?.phase === 'lobby');   // phase names are the game's own
//   await env.admin.send({ t: 'start' });                   // admin plays like a person (client() from test/helpers.js)
//   await env.until(() => env.state?.phase === 'result', { max: 600_000 });
//   env.close();
//
// setupAdmin({ mode = 'holdem', bots = 0, seed = 1, hubOptions = {} }) -> env (async)
//   env.hub, env.clock (FakeClock), env.store (memory store)
//   env.admin   client(hub) of the logged-in admin, already in a room of `mode` with `bots` bots; .send(obj) .sock .state
//   env.room    the room object (env.hub.rooms.get(code))
//   env.state   admin's latest room state (same as env.admin.state)
//   env.bots()  bot sessions currently in the hub, oldest first ({ id, name, user, room })
//   env.adm(a)  sends {t:'adm', a}, waits, returns { ok, bots, error } (error = last {t:'error'} message of the admin, if any)
//   env.drain() lets pending promises / queued bot messages run (no clock movement)
//   env.tick(ms = 100)  advances the fake clock by ms, then drain
//   env.until(pred, { step = 250, max = 120_000 })  tick(step) repeatedly (bots act 0.5~1.5 s later) until pred(env) is truthy;
//                                                   throws with the admin's last state if `max` ms of fake time pass first
//   env.close() ends the hub (timers cleared, saves awaited)
// Other humans: env.human(id) logs a normal user in (returns the client; join with .send({t:'join', code: env.room.code})).
import { createHub } from '../../server/rooms.js';
import { createStore } from '../../server/store.js';
import { client, FakeClock, seeded } from '../helpers.js';

export const ADMIN_PW = '9975';

export async function setupAdmin({ mode = 'holdem', bots = 0, seed = 1, hubOptions = {} } = {}) {
  const clock = new FakeClock();
  const store = createStore(undefined);
  const hub = createHub({
    store, rng: seeded(seed), now: clock.now, timers: clock, liar: 'on', yacht: 'on', draw: 'on', ...hubOptions,
  });
  const drain = async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  const login = async (id, pw) => {
    const c = client(hub);
    await c.send({ t: 'login', id, ...(pw === undefined ? {} : { pw }) });
    return c;
  };
  const admin = await login('관리자', ADMIN_PW);
  await admin.send({ t: 'create', mode });
  const room = [...hub.rooms.values()].at(-1);
  const env = {
    hub, clock, store, admin, room, drain, login,
    get state() { return admin.state; },
    bots: () => [...hub.sessions.values()].filter((s) => s.bot),
    human: (id) => login(id),
    async adm(a) {
      const before = admin.sock.raw.length;
      await admin.send({ t: 'adm', a });
      await drain();
      const got = admin.sock.msgs.slice(before);
      const ok = got.find((m) => m.t === 'admOk');
      return { ok: !!ok, bots: ok?.bots, error: got.filter((m) => m.t === 'error').at(-1) };
    },
    async tick(ms = 100) {
      clock.advance(ms);
      await drain();
    },
    async until(pred, { step = 250, max = 120_000 } = {}) {
      await drain();
      for (let t = 0; !pred(env); t += step) {
        if (t >= max) throw new Error(`until: not reached in ${max} ms (fake time); state=${JSON.stringify(admin.state)?.slice(0, 600)}`);
        await env.tick(step);
      }
    },
    close: () => hub.close(),
  };
  for (let i = 0; i < bots; i++) {
    const r = await env.adm('bot+');
    if (!r.ok) throw new Error(`bot+ failed: ${JSON.stringify(r.error)}`);
  }
  return env;
}
