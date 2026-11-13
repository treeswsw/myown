// Admin mode core (SPEC 21): admin login guard, bot sessions, {t:'adm'} requests.
// Bots are plain in-memory sessions with a fake socket; every request they make goes through conn.message,
// so parsing, rate limit and the room's own rules apply to them like to a person. Nothing here knows a game.
import crypto from 'node:crypto';
import { newUser } from '../store.js';
import { gameOf } from './games/index.js';

export const ADMIN_ID = '관리자';
export const DEFAULT_ADMIN_KEY = '9975';
const LOCK_FAILS = 5; // wrong passwords ...
const LOCK_WINDOW = 10 * 60_000; // ... within this window lock admin login for this long
const MAX_BOTS = 8;

const ERR = {
  adm_pw: '관리자 비밀번호가 틀렸습니다.',
  adm_lock: '잠시 후 다시 시도하세요.',
  adm_no: '관리자만 할 수 있습니다.',
  adm_room: '방에 들어가서 쓰세요.',
  adm_people: '다른 사람이 있는 방에서는 쓸 수 없습니다.',
  adm_nobot: '내보낼 봇이 없습니다.',
  adm_noskip: '건너뛸 단계가 없습니다.',
  adm_test: '관리자 시험 중인 방입니다.',
};
export const admErr = (code) => ({ msg: ERR[code], code });

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function createAdmin(hub, adminKey = DEFAULT_ADMIN_KEY) {
  const keyHash = digest(adminKey);
  const admin = {
    fails: [], // times of recent wrong passwords
    lockedUntil: 0,
    rooms: new Map(), // room -> { adminId, bots: [bot] }, only rooms that have bots

    // null = let in, else an error object. Equal-length hashes keep the compare constant-time.
    checkLogin(pw) {
      const t = hub.now();
      if (t < admin.lockedUntil) return admErr('adm_lock');
      const ok = typeof pw === 'string' && crypto.timingSafeEqual(digest(pw), keyHash);
      if (ok) {
        admin.fails = [];
        return null;
      }
      admin.fails = admin.fails.filter((x) => t - x < LOCK_WINDOW);
      admin.fails.push(t);
      if (admin.fails.length >= LOCK_FAILS) {
        admin.fails = [];
        admin.lockedUntil = t + LOCK_WINDOW;
      }
      return admErr('adm_pw');
    },

    botsIn(room) {
      return admin.rooms.get(room)?.bots.length ?? 0;
    },

    // Called by the hub's join path: a person may not enter a room that has a bot.
    refuseHuman(room, session) {
      return !session.bot && admin.botsIn(room) > 0 ? admErr('adm_test') : null;
    },

    // Stops all bot timers (hub.close / reset). The sessions themselves are cleared by the caller.
    closeAll() {
      for (const entry of admin.rooms.values()) for (const bot of entry.bots) bot.stop();
      admin.rooms.clear();
    },

    // {t:'adm'} from dispatch. Returns an error (string or {msg, code}) or null after replying admOk.
    async handle(session, room, msg) {
      if (!session.admin) return admErr('adm_no');
      if (!room) return admErr('adm_room');
      if (room.members.some((m) => m.id !== session.id && !m.session.bot)) return admErr('adm_people');
      const done = () => {
        hub.send(session, { t: 'admOk', a: msg.a, bots: admin.botsIn(room) });
        return null;
      };
      if (msg.a === 'bot+') {
        const err = await admin.addBot(session, room);
        return err ?? done();
      }
      if (msg.a === 'bot-') {
        const entry = admin.rooms.get(room);
        if (!entry) return admErr('adm_nobot');
        entry.bots.at(-1).leave();
        return done();
      }
      if (msg.a === 'skip') return gameOf(room.mode).skip(room) ? done() : admErr('adm_noskip');
      return '알 수 없는 요청입니다.';
    },

    async addBot(adminSession, room) {
      let entry = admin.rooms.get(room);
      if ((entry?.bots.length ?? 0) >= MAX_BOTS) return '방이 가득 찼습니다.';
      const bot = createBot(hub, admin, room);
      // The join goes through the normal path so the room's own refusal text comes back as it is.
      await bot.conn.message(JSON.stringify({ t: 'join', code: room.code }));
      if (bot.session.room !== room) {
        const why = bot.lastError ?? { msg: '들어갈 수 없습니다.' };
        bot.stop();
        hub.sessions.delete(bot.id);
        hub.conns.delete(bot.conn);
        return why.code ? { msg: why.msg, code: why.code } : why.msg;
      }
      if (!entry) {
        entry = { adminId: adminSession.id, bots: [] };
        admin.rooms.set(room, entry);
        watchAdmin(admin, adminSession);
      }
      entry.bots.push(bot);
      return null;
    },

    // All bots of a room leave (the admin left or lost the seat).
    clearRoom(room) {
      const entry = admin.rooms.get(room);
      if (!entry) return;
      admin.rooms.delete(room);
      for (const bot of [...entry.bots].reverse()) bot.leave(false);
    },
  };
  return admin;
}

// The admin's seat can vanish from inside any game's code (leave, grace, kick, engine sync) and all of them end
// by setting session.room. Watching that one field covers every mode, present and future, without touching them.
function watchAdmin(admin, session) {
  if (session.roomWatched) return;
  session.roomWatched = true;
  let current = session.room;
  Object.defineProperty(session, 'room', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set(v) {
      current = v;
      if (v !== null && v !== undefined) return;
      // After the game code finished its own cleanup (it may still be walking its member list).
      queueMicrotask(() => {
        for (const [r, entry] of [...admin.rooms]) {
          if (entry.adminId === session.id && !r.members.some((m) => m.id === session.id)) admin.clearRoom(r);
        }
      });
    },
  });
}

function createBot(hub, admin, room) {
  let n = 1;
  while (hub.sessions.has(`~bot${n}`)) n++;
  const id = `~bot${n}`;
  const name = `봇${n}`;
  const timerIds = new Set();
  const brains = new Map(); // mode -> brain; a poker room can switch between holdem and bluff
  let dead = false;
  const bot = { id, name, lastError: null, session: null, conn: null };

  const api = {
    id,
    name,
    rng: () => hub.rng(),
    send: (msg) => bot.conn.message(JSON.stringify(msg)),
    later(ms, fn) {
      if (dead) return;
      const tid = hub.timers.setTimeout(hub.guard(() => {
        timerIds.delete(tid);
        if (!dead) fn();
      }), ms);
      timerIds.add(tid);
    },
  };

  // Server messages reach the brain asynchronously: a bot must never react from inside the room's own call stack.
  const deliver = (msg) => {
    if (msg.t === 'error') bot.lastError = msg;
    queueMicrotask(() => {
      if (dead) return;
      try {
        const mode = bot.session.room?.mode ?? room.mode;
        if (!brains.has(mode)) brains.set(mode, gameOf(mode).createBrain(api));
        brains.get(mode).onMsg(msg);
      } catch (err) {
        console.error(`bot ${id} failed:`, err.stack);
      }
    });
  };
  const sock = {
    send: (text) => deliver(JSON.parse(text)),
    close() {},
  };
  const user = newUser(id, name); // never given to the store; no hub.userEpoch entry, so hub.persist skips it
  bot.session = { id, user, conn: null, room: null, chatTimes: [], editTimes: [], lastSent: {}, bot: true };
  bot.conn = hub.connect(sock);
  bot.conn.session = bot.session;
  bot.session.conn = bot.conn;
  hub.sessions.set(id, bot.session);

  bot.stop = () => {
    dead = true;
    for (const tid of timerIds) hub.timers.clearTimeout(tid);
    timerIds.clear();
  };
  // Leaves the room and disappears. alone = also drop it from the room's bot list (bot-); clearRoom does that itself.
  bot.leave = (alone = true) => {
    bot.stop();
    if (alone) {
      const entry = admin.rooms.get(room);
      if (entry) {
        entry.bots = entry.bots.filter((b) => b !== bot);
        if (entry.bots.length === 0) admin.rooms.delete(room);
      }
    }
    bot.session.room?.leave(id);
    hub.sessions.delete(id);
    hub.conns.delete(bot.conn);
  };
  return bot;
}
