import { secureRng } from '../shared/cards.js';
import { describe } from '../shared/handeval.js';
import * as holdem from '../shared/holdem.js';
import * as bluff from '../shared/bluff.js';
import { parseMessage } from './protocol.js';

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
const MAX_PLAYERS = { holdem: 6, bluff: 4 };
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// WebSocket close code sent to a connection that was taken over by a newer login of the same ID.
export const REPLACED_CODE = 4001;
const RATE_LIMIT = 20;
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const CHAT_LOG = 30; // messages remembered per room

const publicUser = (u) => ({ id: u.id, name: u.name, bank: u.bank, avatar: u.avatar, stats: { ...u.stats } });

class Room {
  constructor(hub, code, mode) {
    this.hub = hub;
    this.code = code;
    this.mode = mode;
    this.hostId = null;
    this.phase = 'lobby';
    this.members = []; // join order == seat order
    this.hand = null; // holdem: { st, users: Map id -> user }
    this.game = null; // bluff: { g, users }
    this.result = null;
    this.lastDealer = null;
    this.chatLog = [];
    this.sounds = []; // [{sid, by, name, data}], oldest first; lives and dies with the room
    this.timers = { next: null, gc: null };
  }

  member(id) {
    return this.members.find((m) => m.id === id);
  }

  setTimer(name, ms, fn) {
    this.clearTimer(name);
    this.timers[name] = this.hub.timers.setTimeout(this.hub.guard(fn), ms);
  }

  clearTimer(name) {
    if (this.timers[name] !== null) this.hub.timers.clearTimeout(this.timers[name]);
    this.timers[name] = null;
  }

  // ---- membership ----

  join(session) {
    if (this.members.length >= MAX_PLAYERS[this.mode]) return '방이 가득 찼습니다.';
    this.clearTimer('gc');
    this.members.push({ id: session.id, session, connected: true, grace: null, inHand: false });
    this.hostId ??= session.id;
    session.room = this;
    this.push();
    this.sendExtras(session);
    return null;
  }

  // What a joining/reconnecting player needs besides the room state.
  sendExtras(session) {
    this.hub.send(session, { t: 'event', e: { k: 'chatLog', items: this.chatLog.map((x) => ({ ...x })) } });
    if (this.sounds.length) {
      this.hub.send(session, { t: 'event', e: { k: 'sndList', items: this.sounds.map((x) => ({ ...x })) } });
    }
  }

  // Sounds and photo emotes never touch game state or timers.
  addSound(session, sid, name, data) {
    const existing = this.sounds.find((x) => x.sid === sid);
    if (existing) return existing.by === session.id ? null : '이미 사용 중인 소리 번호입니다.';
    this.sounds.push({ sid, by: session.id, name, data });
    const mine = this.sounds.filter((x) => x.by === session.id);
    if (mine.length > MAX_ACCOUNT_SOUNDS) this.sounds.splice(this.sounds.indexOf(mine[0]), 1);
    if (this.sounds.length > MAX_ROOM_SOUNDS) this.sounds.shift();
    this.sendEvents([{ k: 'sndAdd', sid, by: session.id, name, data }]);
    return null;
  }

  playSound(session, sid) {
    if (!sid.startsWith('builtin:') && !this.sounds.some((x) => x.sid === sid)) return '없는 소리입니다.';
    this.sendEvents([{ k: 'snd', id: session.id, sid }]);
    return null;
  }

  // Chat is independent of the game: no state push, no timers.
  chat(session, text) {
    const item = { id: session.id, name: session.user.name, text, ts: this.hub.now() };
    this.chatLog.push(item);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.sendEvents([{ k: 'chat', ...item }]);
  }

  setConnected(id, connected) {
    const m = this.member(id);
    if (!m) return;
    m.connected = connected;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = connected ? null : this.hub.timers.setTimeout(this.hub.guard(() => this.graceExpired(id)), this.hub.timing.grace);
    this.push();
  }

  // The only time limit in the game: a disconnected player on turn is auto-played, then removed.
  graceExpired(id) {
    if (this.turnId() === id) this.autoAct();
    this.leave(id);
  }

  leave(id) {
    const m = this.member(id);
    if (!m) return;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    this.members = this.members.filter((x) => x !== m);
    m.session.room = null;
    const events = [];
    if (this.hand && this.phase === 'playing' && m.inHand) {
      events.push(...holdem.forceFold(this.hand.st, id).events);
      // A leaver folds: committed chips stay in the pot, the rest goes home now. Only an
      // uncalled-bet refund can still arrive later (see settleSeat).
      const seat = this.hand.st.seats.find((x) => x.id === id);
      this.settleSeat(seat, m.session.user);
      seat.stack = 0;
      this.hand.start.set(id, 0);
    }
    if (this.game && this.phase === 'playing') events.push(...bluff.removePlayer(this.game.g, id).events);
    if (this.hostId === id) this.hostId = this.members[0]?.id ?? null;
    this.hub.send(m.session, { t: 'room', state: null });
    this.hub.sendMe(m.session);
    this.hub.sendRooms(m.session);
    if (!m.session.conn) this.hub.sessions.delete(id);
    if (this.members.length === 0) {
      this.toLobby();
      this.hub.roomsChanged();
      this.setTimer('gc', this.hub.timing.roomGc, () => this.hub.rooms.delete(this.code));
      return;
    }
    if (this.hand && this.phase === 'playing') this.afterHoldem(events);
    else if (this.game && this.phase === 'playing') this.afterBluff(events);
    else this.push(events);
  }

  setMode(id, mode) {
    if (id !== this.hostId) return '방장만 변경할 수 있습니다.';
    if (this.phase !== 'lobby') return '게임 중에는 변경할 수 없습니다.';
    if (this.members.length > MAX_PLAYERS[mode]) return `${mode === 'bluff' ? '블러핑 카드' : '텍사스 홀덤'}은 최대 ${MAX_PLAYERS[mode]}명입니다.`;
    this.mode = mode;
    this.push();
    return null;
  }

  start(id) {
    if (id !== this.hostId) return '방장만 시작할 수 있습니다.';
    if (this.phase !== 'lobby') return '이미 게임이 진행 중입니다.';
    const ready = this.members.filter((m) => m.connected && (this.mode === 'bluff' || m.session.user.bank > 0));
    if (ready.length < 2) return this.mode === 'bluff' ? '2명 이상 필요합니다.' : '칩이 있는 사람이 2명 이상 필요합니다.';
    if (this.mode === 'holdem') this.startHoldem();
    else this.startBluff();
    return null;
  }

  emote(id, e) {
    if (!this.member(id)) return;
    this.sendEvents([{ k: 'emote', id, e }]);
  }

  // ---- holdem ----

  startHoldem() {
    // Everything the account owns is the stack. Busted (0 chips) and disconnected players sit out.
    const seated = this.members.filter((m) => m.connected && m.session.user.bank > 0);
    if (seated.length < 2) {
      this.toLobby();
      return;
    }
    const at = seated.findIndex((m) => m.id === this.lastDealer);
    const dealer = (at + 1) % seated.length;
    const { st, events } = holdem.startHand(
      seated.map((m) => ({ id: m.id, stack: m.session.user.bank })), dealer, this.hub.rng,
    );
    this.lastDealer = seated[dealer].id;
    // user.bank keeps the pre-hand amount; only the difference is applied (settleSeat), so chips
    // are conserved even when a leaver's refund arrives after they joined another room.
    this.hand = {
      st, users: new Map(seated.map((m) => [m.id, m.session.user])),
      start: new Map(seated.map((m) => [m.id, m.session.user.bank])),
    };
    for (const m of this.members) m.inHand = seated.includes(m);
    this.phase = 'playing';
    this.result = null;
    this.afterHoldem(events);
  }

  act(id, a, amount) {
    if (this.mode !== 'holdem' || this.phase !== 'playing') return '지금은 할 수 없습니다.';
    const r = holdem.act(this.hand.st, id, a, amount);
    if (!r.ok) return r.error;
    this.afterHoldem(r.events);
    return null;
  }

  afterHoldem(events) {
    if (this.hand.st.phase === 'done') this.endHand(events);
    this.push(events);
  }

  settleSeat(seat, user) {
    user.bank += seat.stack - this.hand.start.get(seat.id);
    this.hand.start.set(seat.id, seat.stack);
    this.hub.persist(user);
  }

  endHand(events) {
    const { st, users } = this.hand;
    const res = st.result;
    for (const seat of st.seats) {
      const user = users.get(seat.id);
      this.settleSeat(seat, user);
      user.stats.hands++;
      const w = res.winners.find((x) => x.id === seat.id);
      if (w) {
        user.stats.wins++;
        user.stats.biggestWin = Math.max(user.stats.biggestWin, w.amount);
      }
      this.hub.persist(user);
      const session = this.hub.sessions.get(seat.id);
      if (session) this.hub.sendMe(session);
    }
    this.result = { winners: res.winners, shown: res.shown, busted: res.busted };
    events.push({ k: 'win', winners: res.winners, pot: res.pot });
    const by = res.winners.reduce((best, w) => (w.amount > best.amount ? w : best)).id;
    for (const id of res.busted) events.push({ k: 'bust', id, by });
    this.phase = 'result';
    const runout = events.filter((ev) => ev.k === 'street').length;
    const t = this.hub.timing;
    const wait = (Object.keys(res.shown).length ? t.result : t.resultFold) + runout * t.street +
      (res.winners.length - 1) * t.tieExtra +
      (res.busted.length ? this.hub.timing.bustExtra : 0);
    const busted = res.busted.length > 0;
    this.setTimer('next', wait, () => this.afterResult(busted));
  }

  // After the result display: next hand, or the room's champion when a bust left one player with chips.
  afterResult(busted) {
    const withChips = this.members.filter((m) => m.session.user.bank > 0);
    if (busted && withChips.length === 1) {
      this.toLobby([{ k: 'champion', id: withChips[0].id }]);
      return;
    }
    this.startHoldem();
  }

  // ---- bluff ----

  startBluff() {
    const players = this.members.filter((m) => m.connected);
    const { game, events } = bluff.createGame(players.map((m) => m.id), this.hub.rng);
    this.game = { g: game, users: new Map(players.map((m) => [m.id, m.session.user])) };
    for (const m of this.members) m.inHand = players.includes(m);
    this.phase = 'playing';
    this.result = null;
    this.afterBluff(events);
  }

  play(id, cards) {
    if (this.mode !== 'bluff' || this.phase !== 'playing') return '지금은 할 수 없습니다.';
    const r = bluff.play(this.game.g, id, cards);
    if (!r.ok) return r.error;
    this.afterBluff(r.events);
    return null;
  }

  liar(id) {
    if (this.mode !== 'bluff' || this.phase !== 'playing') return '지금은 할 수 없습니다.';
    const r = bluff.liar(this.game.g, id);
    if (!r.ok) return r.error;
    this.afterBluff(r.events);
    return null;
  }

  afterBluff(events) {
    const { g, users } = this.game;
    if (g.phase === 'reveal') {
      this.setTimer('next', this.hub.timing.reveal, () => this.afterBluff(bluff.nextRound(g).events));
    } else if (g.phase === 'done') {
      for (const [id, user] of users) {
        user.stats.bluffGames++;
        if (id === g.winner) user.stats.bluffWins++;
        this.hub.persist(user);
        const session = this.hub.sessions.get(id);
        if (session) this.hub.sendMe(session);
      }
      this.phase = 'result';
      this.setTimer('next', this.hub.timing.bluffResult, () => this.toLobby());
    }
    this.push(events);
  }

  toLobby(events = []) {
    this.clearTimer('next');
    this.phase = 'lobby';
    this.hand = null;
    this.game = null;
    this.result = null;
    for (const m of this.members) m.inHand = false;
    this.push(events);
  }

  // ---- turns: no time limit for connected players; only a disconnected one is auto-played ----

  turnId() {
    if (this.phase !== 'playing') return null;
    if (this.hand) {
      const { st } = this.hand;
      return st.turn >= 0 ? st.seats[st.turn].id : null;
    }
    const g = this.game.g;
    return g.phase === 'playing' ? g.players[g.turn].id : null;
  }

  // Check (or fold) / the bluff default for the player on turn.
  autoAct() {
    const id = this.turnId();
    if (id === null) return;
    if (this.hand) {
      this.act(id, holdem.options(this.hand.st, id).canCheck ? 'check' : 'fold');
    } else {
      const a = bluff.timeoutAction(this.game.g);
      if (a.t === 'play') this.play(id, a.cards);
      else this.liar(id);
    }
  }

  // ---- output ----

  sendEvents(events) {
    for (const m of this.members) {
      for (const e of events) this.hub.send(m.session, { t: 'event', e });
    }
  }

  push(events = []) {
    this.hub.roomsChanged();
    this.sendEvents(events);
    for (const m of this.members) this.hub.send(m.session, { t: 'room', state: this.view(m.id) });
  }

  // Per-viewer state: only what this player is allowed to see.
  view(viewerId) {
    const spectating = (m) => this.phase !== 'lobby' && !m.inHand;
    const base = {
      code: this.code, mode: this.mode, hostId: this.hostId, phase: this.phase, you: viewerId,
      turn: this.turnId(), turnEndsAt: null,
    };
    const common = (m, i) => ({
      id: m.id, name: m.session.user.name, avatar: m.session.user.avatar, seat: i,
      connected: m.connected, spectating: spectating(m),
    });
    return this.mode === 'holdem' ? this.holdemView(base, viewerId, common) : this.bluffView(base, viewerId, common);
  }

  holdemView(base, viewerId, common) {
    const st = this.hand?.st;
    const seatOf = (id) => st?.seats.find((s) => s.id === id);
    const players = this.members.map((m, i) => {
      const seat = seatOf(m.id);
      const shown = this.result?.shown[m.id];
      return {
        ...common(m, i),
        stack: seat ? seat.stack : m.session.user.bank,
        eliminated: m.session.user.bank <= 0,
        bet: seat && st.phase === 'betting' ? seat.bet : 0,
        folded: seat?.folded ?? false,
        allin: seat?.allin ?? false,
        isDealer: !!seat && st.seats[st.dealer].id === m.id,
        cards: m.id === viewerId ? (seat?.cards ?? null) : (shown ?? null),
      };
    });
    const mine = seatOf(viewerId);
    const o = st ? holdem.options(st, viewerId) : null;
    // While betting, pots only hold collected chips; the current street's bets stay in front of the players.
    const betting = st?.phase === 'betting';
    const collected = st ? st.seats.map((s) => ({ ...s, total: betting ? s.total - s.bet : s.total })) : [];
    const { pots, refund } = holdem.buildPots(collected);
    return {
      ...base,
      players,
      board: st ? [...st.board] : [],
      pot: st ? holdem.totalPot({ seats: collected }) : 0,
      pots: refund && !betting ? [...pots, { amount: refund.amount, eligible: [refund.id] }] : pots,
      street: st?.street ?? 0,
      toCall: o?.toCall ?? 0,
      minRaiseTo: o?.minRaiseTo ?? 0,
      maxRaiseTo: o?.maxRaiseTo ?? 0,
      myCards: mine ? [...mine.cards] : null,
      myBest: mine ? describe([...mine.cards, ...st.board]) : null,
      result: this.result,
    };
  }

  bluffView(base, viewerId, common) {
    const g = this.game?.g;
    const players = this.members.map((m, i) => {
      const p = g?.players.find((x) => x.id === m.id);
      return {
        ...common(m, i),
        alive: p?.alive ?? false,
        handCount: p?.hand.length ?? 0,
        shots: p?.shots ?? 0,
      };
    });
    const me = g?.players.find((x) => x.id === viewerId);
    return {
      ...base,
      players,
      tableRank: g?.tableRank ?? null,
      round: g?.round ?? 0,
      myHand: me ? [...me.hand] : [],
      lastPlay: g?.pile ? { by: g.pile.by, count: g.pile.cards.length } : null,
      reveal: g?.reveal ?? null,
      winnerId: g?.winner ?? null,
    };
  }
}

export function createHub({
  store, rng = secureRng, now = Date.now, timers = { setTimeout, clearTimeout }, timing = {},
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
    roomsSig: '[]',
    sessions: new Map(), // id -> { id, user, conn, room }

    send(session, obj) {
      session.conn?.send(obj);
    },
    sendMe(...sessions) {
      for (const s of sessions) hub.send(s, { t: 'me', user: publicUser(s.user) });
    },
    // Open rooms only: empty rooms waiting for GC are not listed. Nothing but these fields leaves the server.
    roomList() {
      return [...hub.rooms.values()].filter((r) => r.members.length > 0).map((r) => ({
        code: r.code, mode: r.mode, hostName: r.member(r.hostId).session.user.name,
        count: r.members.length, max: MAX_PLAYERS[r.mode], phase: r.phase,
      }));
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
      store.save(user).catch((err) => console.error('save failed:', err.message));
    },
    connect(sock) {
      return createConn(hub, sock);
    },
    close() {
      if (hub.roomsTimer !== null) timers.clearTimeout(hub.roomsTimer);
      for (const room of hub.rooms.values()) {
        for (const name of Object.keys(room.timers)) room.clearTimer(name);
        for (const m of room.members) if (m.grace !== null) timers.clearTimeout(m.grace);
      }
    },
  };
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
    queue: Promise.resolve(),
    windowStart: 0,
    count: 0,
    send(obj) {
      sock.send(JSON.stringify(obj));
    },
    // Resolves when this message has been fully handled (tests await it).
    message(raw) {
      const t = hub.now();
      if (t - conn.windowStart >= 1000) {
        conn.windowStart = t;
        conn.count = 0;
      }
      if (++conn.count > RATE_LIMIT) return Promise.resolve();
      const parsed = parseMessage(raw);
      if (!parsed.ok) {
        conn.send({ t: 'error', msg: parsed.error });
        return Promise.resolve();
      }
      conn.queue = conn.queue
        .then(() => dispatch(hub, conn, parsed.msg))
        .then((err) => err && conn.send({ t: 'error', msg: err }))
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
      const s = conn.session;
      if (!s || s.conn !== conn) return;
      s.conn = null;
      if (s.room) s.room.setConnected(s.id, false);
      else hub.sessions.delete(s.id);
    },
  };
  return conn;
}

async function login(hub, conn, msg) {
  if (conn.session) {
    if (conn.session.id !== msg.key) return '이미 로그인되어 있습니다.';
    return null;
  }
  let session = hub.sessions.get(msg.key);
  if (!session) {
    const user = await hub.store.getOrCreate(msg.key, msg.name);
    session = hub.sessions.get(msg.key) ?? { id: msg.key, user, conn: null, room: null, chatTimes: [], lastSent: {} };
    hub.sessions.set(msg.key, session);
  }
  const old = session.conn;
  if (old && old !== conn) {
    old.session = null; // so its close does not mark the seat as disconnected
    old.send({ t: 'error', msg: '다른 곳에서 접속하여 연결이 종료됩니다.' });
    old.closeSocket(REPLACED_CODE, 'replaced');
  }
  session.conn = conn;
  conn.session = session;
  hub.sendMe(session);
  if (session.room) session.room.setConnected(session.id, true);
  hub.send(session, { t: 'room', state: session.room ? session.room.view(session.id) : null });
  session.room?.sendExtras(session);
  hub.sendRooms(session);
  return null;
}

// Per-account (not per-socket) minimum spacing; a refused attempt does not extend the wait.
function tooSoon(hub, session, key, ms) {
  const t = hub.now();
  const last = session.lastSent[key];
  if (last !== undefined && t - last < ms) return true;
  session.lastSent[key] = t;
  return false;
}

async function dispatch(hub, conn, msg) {
  if (msg.t === 'login') return login(hub, conn, msg);
  const session = conn.session;
  if (!session) return '먼저 로그인하세요.';
  const room = session.room;
  switch (msg.t) {
    case 'avatar':
      session.user.avatar = msg.data;
      hub.persist(session.user);
      hub.sendMe(session);
      room?.push();
      return null;
    case 'create': {
      if (room) return '이미 방에 있습니다.';
      if (msg.mode === 'holdem' && session.user.bank <= 0) return '칩이 없습니다. 새 아이디로 다시 시작하세요';
      const r = new Room(hub, newCode(hub), msg.mode);
      hub.rooms.set(r.code, r);
      return r.join(session);
    }
    case 'join': {
      if (room) return '이미 방에 있습니다.';
      const r = hub.rooms.get(msg.code);
      return r ? r.join(session) : '존재하지 않는 방입니다.';
    }
    default:
  }
  if (!room) return '방에 들어가 있지 않습니다.';
  switch (msg.t) {
    case 'leave': room.leave(session.id); return null;
    case 'mode': return room.setMode(session.id, msg.mode);
    case 'start': return room.start(session.id);
    case 'act': return room.act(session.id, msg.a, msg.amount);
    case 'play': return room.play(session.id, msg.cards);
    case 'liar': return room.liar(session.id);
    case 'emote': room.emote(session.id, msg.e); return null;
    case 'pemote':
      if (tooSoon(hub, session, 'pemote', 3000)) return '사진 이모티콘을 너무 빨리 보내고 있습니다';
      room.sendEvents([{ k: 'pemote', id: session.id, data: msg.data }]);
      return null;
    case 'sndAdd':
      if (tooSoon(hub, session, 'sndAdd', 10_000)) return '소리를 너무 빨리 올리고 있습니다';
      return room.addSound(session, msg.sid, msg.name, msg.data);
    case 'snd':
      if (tooSoon(hub, session, 'snd', 2000)) return '소리를 너무 빨리 재생하고 있습니다';
      return room.playSound(session, msg.sid);
    case 'chat': {
      const t = hub.now();
      // Kept on the account, not the socket, so reconnecting or taking over does not reset it.
      const times = session.chatTimes.filter((x) => t - x < 10_000);
      const last = times.at(-1);
      if (times.length >= 5 || (last !== undefined && t - last < 1000)) return '채팅을 너무 빨리 보내고 있습니다';
      times.push(t);
      session.chatTimes = times;
      room.chat(session, msg.text);
      return null;
    }
    default: return '알 수 없는 요청입니다.';
  }
}
