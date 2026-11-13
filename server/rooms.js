import { secureRng } from '../shared/cards.js';
import { GAMES } from '../shared/games.js';
import { SERVER_GAMES } from './games.js';
import { createRoomShell } from './room/shell.js';
import { parseMessage, RESET_ID } from './protocol.js';
import { createAdmin, ADMIN_ID } from './admin/bots.js';
import { installWallet, walletOf } from './coin/wallet.js';
import { POOL_START } from '../shared/coin/gacha.js';
import { installPin, pinErr } from './coin/pin.js';
import { isSpectatorId } from '../shared/spectator.js';

export const DEFAULT_TIMING = {
  grace: 60_000, // a disconnected player is auto-played (if on turn) and removed after this
  roomGc: 60_000, // empty room is deleted after this
  result: 11_000, // hold'em result display when the hand reached showdown
  resultFold: 4_000, // ... when everyone else folded
  tieExtra: 2_500, // extra per additional winner (each is presented in turn)
  bluffResult: 6_000, // bluff winner display before returning to the lobby
  bustExtra: 3_000, // extra display time when someone busted
  street: 1_700, // extra result time per community card street dealt by an all-in run-out
  roomList: 500, // open-room list broadcasts are coalesced to one per this interval
  reveal: 4_000, // bluff: penalty is shown with no one on turn before the next round is dealt
};
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// WebSocket close code sent to a connection that was taken over by a newer login of the same ID.
export const REPLACED_CODE = 4001;
const RESET_WINDOW = 60_000; // a reset needs a resetAsk this recent, and runs at most once per window
const RATE_LIMIT = 20;
// Games with `fast` (draw: {t:'dr'}) are counted apart so a drawer's strokes are never dropped
// (board sends at most SEND_PER_SEC=50 per 1s, limit 100 = 2x margin for network bunching).
const FAST = Object.values(GAMES).filter((g) => g.fast).map((g) => ({
  t: g.msgs[0], prefix: `{"t":"${g.msgs[0]}"`, limit: g.fast.limit, ops: new Set(g.fast.ops),
}));
const FLAGGED = Object.entries(GAMES).filter(([, g]) => g.flag);
// '<이름>은(는)': 받침이 있으면 은, 없으면 는.
const josa = (name) => {
  const c = name.charCodeAt(name.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? '은' : '는';
};
const offErr = (mode) => {
  const g = GAMES[mode];
  const code = `${g.err}off`;
  return { msg: SERVER_GAMES[mode].errors?.[code] ?? `${g.name}${josa(g.name)} 아직 열리지 않았습니다.`, code };
};
const publicUser = (u) => ({ id: u.id, name: u.name, bank: u.bank, avatar: u.avatar, stats: { ...u.stats } });

export function createHub({
  store, rng = secureRng, now = Date.now, timers = { setTimeout, clearTimeout }, timing = {}, adminKey, coinSeed = 0, startCoins = 0, ...flagOpts
}) {
  const hub = {
    store, rng, now, timers, timing: { ...DEFAULT_TIMING, ...timing },
    rooms: new Map(),
    // A bug in one room's timer must not take the whole server down.
    guard: (fn) => () => {
      try {
        fn();
      } catch (err) {
        console.error('timer failed:', err.stack);
      }
    },
    roomsTimer: null,
    coinSeed,
    startCoins, // 새 계정 시작 코인(배포 설정 20, 시험 기본 0). 랭킹(번 합)에는 넣지 않는다.
    // mode -> 'off' | 'test' | 'on' for games with a switch (GAMES[mode].flag; the hub option has the flag's name)
    flags: Object.fromEntries(FLAGGED.map(([mode, g]) => [mode, flagOpts[g.flag] ?? 'off'])),
    pendingSaves: new Set(),
    epoch: 0, // bumped by a reset: user objects from an older epoch are never saved again
    userEpoch: new WeakMap(),
    conns: new Set(),
    resetting: false,
    pinPending: new Set(), // new ids whose first password is being hashed
    lastResetAt: null,
    roomsSig: '[]',
    sessions: new Map(), // id -> { id, user, conn, room }

    send(session, obj) {
      session.conn?.send(obj);
    },
    sendMe(...sessions) {
      // admin: true only for the admin session; nobody else gets the field.
      for (const s of sessions) hub.send(s, { t: 'me', user: publicUser(s.user), ...Object.fromEntries(FLAGGED.map(([mode, g]) => [g.flag, hub.flags[mode]])), wallet: walletOf(s.user, hub), ...(s.admin ? { admin: true } : {}) });
    },
    // Open rooms only: empty rooms waiting for GC are not listed. Nothing but these fields leaves the server.
    roomList() {
      return [...hub.rooms.values()].filter((r) => r.members.length > 0).map((r) => r.listInfo());
    },
    sendRooms(session) {
      if (!session.room) hub.send(session, { t: 'rooms', list: hub.roomList() });
    },
    roomsChanged() {
      if (hub.roomsTimer !== null) return;
      hub.roomsTimer = timers.setTimeout(hub.guard(() => {
        hub.roomsTimer = null;
        const list = hub.roomList();
        const sig = JSON.stringify(list);
        if (sig === hub.roomsSig) return;
        hub.roomsSig = sig;
        for (const s of hub.sessions.values()) if (!s.room) hub.send(s, { t: 'rooms', list });
      }), hub.timing.roomList);
    },
    persist(user) {
      if (hub.userEpoch.get(user) !== hub.epoch) return;
      const p = store.save(user).catch((err) => console.error('save failed:', err.message));
      hub.pendingSaves.add(p);
      p.then(() => hub.pendingSaves.delete(p));
    },
    connect(sock) {
      return createConn(hub, sock);
    },
    // Wipes every account and room. The sockets stay open, logged out.
    async reset() {
      hub.resetting = true;
      hub.epoch++;
      hub.close();
      hub.rooms.clear();
      hub.roomsSig = '[]';
      hub.sessions.clear();
      hub.pinAuth.reset();
      hub.conns.forEach((c) => { if (c.session?.bot) hub.conns.delete(c); });
      for (const c of hub.conns) c.session = null;
      try {
        await store.clear();
      } finally {
        hub.resetting = false;
      }
      hub.pool = POOL_START;
      hub.lastResetAt = hub.now();
      hub.epoch++;
      for (const c of hub.conns) c.send({ t: 'resetDone' });
    },
    // Resolves once pending saves finished. Rooms get one flush() first (liar scores -> totals), but not on a reset (it wipes everything).
    close() {
      hub.admin.closeAll();
      if (hub.roomsTimer !== null) timers.clearTimeout(hub.roomsTimer);
      hub.roomsTimer = null;
      if (!hub.resetting) {
        for (const room of hub.rooms.values()) {
          try {
            room.flush?.();
          } catch (err) {
            console.error('flush failed:', err.stack);
          }
        }
      }
      for (const room of hub.rooms.values()) room.close();
      return Promise.allSettled([...hub.pendingSaves]);
    },
  };
  hub.admin = createAdmin(hub, adminKey ?? '9975');
  installWallet(hub);
  installPin(hub);
  return hub;
}

function newCode(hub) {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(hub.rng() * CODE_LETTERS.length)];
    if (!hub.rooms.has(code)) return code;
  }
}

function createConn(hub, sock) {
  const conn = {
    session: null,
    resetAskedAt: null,
    queue: Promise.resolve(),
    windowStart: 0,
    count: 0,
    fastCount: {},
    send(obj) {
      sock.send(JSON.stringify(obj));
    },
    // Resolves when this message has been fully handled (tests await it).
    message(raw) {
      const t = hub.now();
      if (t - conn.windowStart >= 1000) {
        conn.windowStart = t;
        conn.count = 0;
        conn.fastCount = {};
      }
      // Counted on the prefix first, like sndAdd in parseMessage.
      const fast = typeof raw === 'string' ? FAST.find((f) => raw.startsWith(f.prefix)) : undefined;
      if (fast) {
        conn.fastCount[fast.t] = (conn.fastCount[fast.t] ?? 0) + 1;
        if (conn.fastCount[fast.t] > fast.limit) return Promise.resolve();
      } else if (++conn.count > RATE_LIMIT) return Promise.resolve();
      const parsed = parseMessage(raw);
      // A duplicate "t" key makes the real type differ from the prefix: such a disguised message also uses the normal limit.
      // Only the game's fast ops ride the high limit; its other requests (settings, kick, pick, ...) also count against the normal one.
      if (fast && parsed.ok && (parsed.msg.t !== fast.t || !fast.ops.has(parsed.msg.a)) && ++conn.count > RATE_LIMIT) return Promise.resolve();
      if (!parsed.ok) {
        conn.send({ t: 'error', msg: parsed.error, ...(parsed.code ? { code: parsed.code } : {}) });
        return Promise.resolve();
      }
      conn.queue = conn.queue
        .then(() => dispatch(hub, conn, parsed.msg))
        .then((err) => err && conn.send(typeof err === 'string' ? { t: 'error', msg: err } : { t: 'error', ...err }))
        .catch((err) => {
          console.error('handler failed:', err.message);
          conn.send({ t: 'error', msg: '서버 오류가 발생했습니다.' });
        });
      return conn.queue;
    },
    closeSocket(code, reason) {
      sock.close(code, reason);
    },
    close() {
      hub.conns.delete(conn);
      const s = conn.session;
      if (!s || s.conn !== conn) return;
      s.conn = null;
      try {
        if (s.room) s.room.setConnected(s.id, false);
        else hub.sessions.delete(s.id);
      } catch (err) {
        console.error('close failed:', err.stack); // runs from the ws 'close' event, outside any guard
      }
    },
  };
  hub.conns.add(conn);
  return conn;
}

const RESET_COOLDOWN_MSG = '방금 초기화했습니다. 잠시 후 다시 시도하세요';
const RESET_BUSY_MSG = '초기화 중입니다. 잠시 후 다시 시도하세요';
const resetCooling = (hub) => hub.lastResetAt !== null && hub.now() - hub.lastResetAt < RESET_WINDOW;

async function login(hub, conn, msg) {
  if (msg.key === RESET_ID) {
    if (conn.session) return '로그인 상태에서는 초기화할 수 없습니다.';
    if (resetCooling(hub)) return RESET_COOLDOWN_MSG;
    conn.resetAskedAt = hub.now();
    conn.send({ t: 'resetAsk' });
    return null;
  }
  if (msg.key === ADMIN_ID) {
    const denied = hub.admin.checkLogin(msg.pw);
    if (denied) return denied;
  }
  if (conn.session) {
    if (conn.session.id !== msg.key) return '이미 로그인되어 있습니다.';
    return null;
  }
  let session = hub.sessions.get(msg.key);
  let user = session?.user;
  let fresh = false;
  const epoch = hub.epoch;
  let pending = false;
  if (!session) {
    if (hub.resetting) return RESET_BUSY_MSG;
    if (hub.pinPending.has(msg.key)) return pinErr('pin_need'); // a password is being set on this new id right now
    if (msg.newPin !== undefined) {
      pending = true;
      hub.pinPending.add(msg.key);
    }
  }
  let gate;
  try {
    if (!session) {
      const existed = hub.coinSeed > 0 || hub.startCoins > 0 || msg.newPin !== undefined ? await hub.store.exists(msg.key) : true;
      user = await hub.store.getOrCreate(msg.key, msg.name);
      fresh = !existed;
      if (fresh && hub.coinSeed > 0) user.coins = hub.coinSeed; // tests only (hubOptions.coinSeed)
      else if (fresh && hub.startCoins > 0) user.coins = hub.startCoins;
      if (epoch !== hub.epoch) return RESET_BUSY_MSG; // a wipe happened while loading: the user is stale
      hub.userEpoch.set(user, epoch);
      session = hub.sessions.get(msg.key);
      if (session) {
        user = session.user; // another login got there first
        fresh = false;
      }
    }
    // Password gate (SPEC 22-8): nothing is sent and no old connection is touched before this passes.
    for (let tries = 0; ; tries++) {
      gate = await hub.pinAuth.gate(user, msg.key, msg, fresh);
      if (epoch !== hub.epoch || hub.resetting) return RESET_BUSY_MSG; // a wipe happened while we waited
      if (gate.err) return gate.err;
      const cur = hub.sessions.get(msg.key);
      if (!cur || cur.user === user) break;
      // another login created the session meanwhile: what we checked is stale, check against the live account
      if (tries >= 2) return pinErr('pin_need');
      user = cur.user;
      fresh = false;
    }
  } finally {
    if (pending) hub.pinPending.delete(msg.key);
  }
  session = hub.sessions.get(msg.key);
  if (!session) {
    if (hub.resetting) return RESET_BUSY_MSG;
    session = { id: msg.key, user, conn: null, room: null, chatTimes: [], editTimes: [], lastSent: {} };
    hub.sessions.set(msg.key, session);
  }
  if (gate.changed) hub.persist(session.user);
  if (msg.key === ADMIN_ID) session.admin = true;
  const old = session.conn;
  if (old && old !== conn) {
    old.session = null; // so its close does not mark the seat as disconnected
    old.send({ t: 'error', msg: '다른 곳에서 접속하여 연결이 종료됩니다.' });
    old.closeSocket(REPLACED_CODE, 'replaced');
  }
  session.conn = conn;
  conn.session = session;
  conn.tokHash = gate.hash ?? null;
  hub.sendMe(session);
  if (gate.tok) hub.send(session, { t: 'pin', a: 'ok', has: true, tok: gate.tok });
  if (session.room) session.room.setConnected(session.id, true);
  hub.send(session, { t: 'room', state: session.room ? session.room.view(session.id) : null });
  session.room?.sendExtras(session);
  hub.sendRooms(session);
  return null;
}

async function dispatch(hub, conn, msg) {
  if (msg.t === 'login') return login(hub, conn, msg);
  if (msg.t === 'reset') {
    if (conn.session) return '로그인 상태에서는 초기화할 수 없습니다.';
    if (conn.resetAskedAt === null || hub.now() - conn.resetAskedAt > RESET_WINDOW) return '초기화 확인이 필요합니다.';
    if (resetCooling(hub) || hub.resetting) return RESET_COOLDOWN_MSG;
    const denied = hub.admin.checkLogin(msg.pw); // same lockout as the admin login (SPEC 22-9)
    if (denied) return denied;
    conn.resetAskedAt = null;
    await hub.reset();
    return null;
  }
  const session = conn.session;
  if (!session) return '먼저 로그인하세요.';
  const room = session.room;
  // Hub-level requests of a game (liar ranking): answered by the hub itself, in the lobby or in a room (never passed to the room).
  for (const g of Object.values(SERVER_GAMES)) {
    const answer = g.hubMsg?.(hub, session, msg);
    if (answer !== undefined) return answer;
  }
  switch (msg.t) {
    case 'avatar':
      const prevAvatar = session.user.avatar;
      session.user.avatar = msg.data;
      hub.persist(session.user);
      hub.sendMe(session);
      room?.faceChanged(session, prevAvatar);
      return null;
    case 'create': {
      if (room) return '이미 방에 있습니다.';
      if (isSpectatorId(session.id)) return { msg: '관전 계정은 방을 만들 수 없습니다. 방 코드로 들어가 관전해 주세요.', code: 'spec_create' };
      if (msg.mode === 'holdem' && session.user.bank <= 0) return '칩이 없습니다. 새 아이디로 다시 시작하세요';
      const g = GAMES[msg.mode];
      if (g.flag && hub.flags[msg.mode] === 'off') return offErr(msg.mode);
      const entry = SERVER_GAMES[msg.mode];
      const code = newCode(hub);
      const r = createRoomShell(hub, code, { mode: msg.mode, ...g, ...entry }, msg); // coins: the game calls ctx.finish
      hub.rooms.set(code, r);
      return r.join(session);
    }
    case 'join': {
      if (room) return '이미 방에 있습니다.';
      const r = hub.rooms.get(msg.code);
      if (!r) return '존재하지 않는 방입니다.';
      return hub.admin.refuseHuman(r, session) ?? r.join(session);
    }
    case 'adm': return hub.admin.handle(session, room, msg);
    case 'coin': return hub.coin(session, msg);
    case 'pin': return hub.pinAuth.handle(session, conn, msg);
    default:
  }
  if (!room) return '방에 들어가 있지 않습니다.';
  // 방 안 게임 바꾸기는 없어졌다(COMMON-CONTRACT 7-3): 포커 방은 한 배포 동안 받아서 안내만(pk_mode). 묶음 3 청소 때 삭제.
  if (msg.t === 'mode' && room.entry.modeMsg) return room.entry.modeMsg(msg);
  return room.request(session, msg);
}
