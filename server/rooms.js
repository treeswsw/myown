import { secureRng } from '../shared/cards.js';
import { describe } from '../shared/handeval.js';
import * as holdem from '../shared/holdem.js';
import * as bluff from '../shared/bluff.js';
import { createLiarRoom } from './liar/room.js';
import { createYachtRoom } from './yacht/room.js';
import { createDrawRoom } from './draw/room.js';
import { parseMessage, RESET_ID } from './protocol.js';
import { createAdmin, ADMIN_ID } from './admin/bots.js';
import { installWallet, walletOf } from './coin/wallet.js';
import { POOL_START } from '../shared/coin/gacha.js';
import { installPin, pinErr } from './coin/pin.js';
import { hookRoom } from './coin/hooks.js';

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
const MAX_PLAYERS = { holdem: 6, bluff: 4, liar: 8, yacht: 4, draw: 8 };
const MEDIA = new Set(['emote', 'pemote', 'snd', 'sndAdd']);
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// WebSocket close code sent to a connection that was taken over by a newer login of the same ID.
export const REPLACED_CODE = 4001;
const RESET_WINDOW = 60_000; // a reset needs a resetAsk this recent, and runs at most once per window
const RATE_LIMIT = 20;
const DR_RATE_LIMIT = 100; // {t:'dr'} is counted apart so a drawer's strokes are never dropped (board sends at most SEND_PER_SEC=50 per 1s, 2x margin for network bunching)
const DR_DRAW_OPS = new Set(['st', 'pt', 'cx', 'rm', 'undo', 'redo', 'clear']);
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

  // Only the uploader or the host may edit a shared sound.
  editSound(session, sid, change) {
    const sound = this.sounds.find((x) => x.sid === sid);
    if (!sound) return '없는 소리입니다.';
    if (sound.by !== session.id && this.hostId !== session.id) return '이 사운드를 수정할 권한이 없습니다.';
    if (change.name === undefined) this.sounds.splice(this.sounds.indexOf(sound), 1);
    else sound.name = change.name;
    this.sendEvents([change.name === undefined ? { k: 'sndDel', sid } : { k: 'sndRename', sid, name: change.name }]);
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
      this.settleLive(seat);
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

  // Only the chip difference is applied, and always to the account that is live now (the object
  // captured at hand start may be stale after a re-login). Nobody logged in: the stored row gets
  // the difference (re-checking for a login meanwhile), never a saved stale copy.
  settleLive(seat, stats) {
    const live = this.hub.sessions.get(seat.id)?.user;
    if (live) {
      this.settleSeat(seat, live);
      if (stats) stats(live);
      this.hub.persist(live);
      return;
    }
    const delta = seat.stack - this.hand.start.get(seat.id);
    this.hand.start.set(seat.id, seat.stack);
    if (delta === 0) return;
    const hub = this.hub;
    const epoch = hub.epoch;
    hub.store.getOrCreate(seat.id).then((row) => {
      if (epoch !== hub.epoch) return; // account wipe meanwhile
      hub.userEpoch.set(row, epoch);
      const target = hub.sessions.get(seat.id)?.user ?? row;
      target.bank += delta;
      hub.persist(target);
    }).catch((e) => console.error('settle failed', e));
  }

  endHand(events) {
    const { st } = this.hand;
    const res = st.result;
    for (const seat of st.seats) {
      const w = res.winners.find((x) => x.id === seat.id);
      this.settleLive(seat, (user) => {
        user.stats.hands++;
        if (w) {
          user.stats.wins++;
          user.stats.biggestWin = Math.max(user.stats.biggestWin, w.amount);
        }
      });
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
      const rows = [];
      for (const id of users.keys()) {
        const session = this.hub.sessions.get(id);
        const user = session?.user; // always the live account (the one captured at start may be stale)
        if (this.members.some((m) => m.id === id)) rows.push({ id, won: id === g.winner, opp: users.size - 1 });
        if (!user) continue;
        user.stats.bluffGames++;
        if (id === g.winner) user.stats.bluffWins++;
        this.hub.persist(user);
        this.hub.sendMe(session);
      }
      if (rows.length >= 2) this.hub.award(this, 'bluff', rows); // a lone survivor of leavers gets nothing
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
  store, rng = secureRng, now = Date.now, timers = { setTimeout, clearTimeout }, timing = {}, liar = 'off', yacht = 'off', draw = 'off', adminKey, coinSeed = 0,
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
    liar, // 'off' | 'test' | 'on'
    yacht, // 'off' | 'test' | 'on'
    draw, // 'off' | 'test' | 'on'
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
      for (const s of sessions) hub.send(s, { t: 'me', user: publicUser(s.user), liar: hub.liar, yacht: hub.yacht, draw: hub.draw, wallet: walletOf(s.user, hub), ...(s.admin ? { admin: true } : {}) });
    },
    // Open rooms only: empty rooms waiting for GC are not listed. Nothing but these fields leaves the server.
    roomList() {
      return [...hub.rooms.values()].filter((r) => r.members.length > 0).map((r) => ({
        code: r.code, mode: r.mode, hostName: (r.member(r.hostId) ?? r.members[0]).session.user.name,
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
      for (const room of hub.rooms.values()) {
        for (const name of Object.keys(room.timers)) room.clearTimer(name);
        for (const m of room.members) if (m.grace !== null) timers.clearTimeout(m.grace);
      }
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
    drCount: 0,
    send(obj) {
      sock.send(JSON.stringify(obj));
    },
    // Resolves when this message has been fully handled (tests await it).
    message(raw) {
      const t = hub.now();
      if (t - conn.windowStart >= 1000) {
        conn.windowStart = t;
        conn.count = 0;
        conn.drCount = 0;
      }
      // Counted on the prefix first, like sndAdd in parseMessage.
      const isDr = typeof raw === 'string' && raw.startsWith('{"t":"dr"');
      if (isDr) {
        if (++conn.drCount > DR_RATE_LIMIT) return Promise.resolve();
      } else if (++conn.count > RATE_LIMIT) return Promise.resolve();
      const parsed = parseMessage(raw);
      // A duplicate "t" key makes the real type differ from the prefix: such a disguised message also uses the normal limit.
      // Only drawing ops (DR_DRAW_OPS) ride the high limit; other dr requests (settings, kick, pick, ...) also count against the normal one.
      if (isDr && parsed.ok && (parsed.msg.t !== 'dr' || !DR_DRAW_OPS.has(parsed.msg.a)) && ++conn.count > RATE_LIMIT) return Promise.resolve();
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
      if (s.room) s.room.setConnected(s.id, false);
      else hub.sessions.delete(s.id);
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
      const existed = hub.coinSeed > 0 || msg.newPin !== undefined ? await hub.store.exists(msg.key) : true;
      user = await hub.store.getOrCreate(msg.key, msg.name);
      fresh = !existed;
      if (fresh && !user.coins) user.coins = hub.coinSeed; // tests only (hubOptions.coinSeed)
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
  // A draw room has its own {t:'dr'} requests: the other games' requests (even the overall liar ranking) are refused first.
  if (room?.mode === 'draw' && ['mode', 'act', 'play', 'liar', 'lg'].includes(msg.t)) return { msg: '지금은 할 수 없습니다.', code: 'dr_now' };
  // Overall liar ranking: answered by the hub itself, in the lobby or in a room (never passed to the room).
  if (msg.t === 'lg' && msg.a === 'rank') {
    if (hub.liar === 'off') return '라이어게임은 아직 열리지 않았습니다.';
    try {
      const [top, mine] = await Promise.all([hub.store.topLiar(20), hub.store.liarRank(session.id)]);
      hub.send(session, { t: 'lgRank', top, mine });
    } catch (err) {
      console.error('liar rank failed:', err.message);
      return '랭킹을 불러오지 못했습니다.';
    }
    return null;
  }
  switch (msg.t) {
    case 'avatar':
      session.user.avatar = msg.data;
      hub.persist(session.user);
      hub.sendMe(session);
      if (room) {
        if (room.faceChanged) room.faceChanged(session);
        else room.push();
      }
      return null;
    case 'create': {
      if (room) return '이미 방에 있습니다.';
      if (msg.mode === 'holdem' && session.user.bank <= 0) return '칩이 없습니다. 새 아이디로 다시 시작하세요';
      if (msg.mode === 'liar') {
        if (hub.liar === 'off') return '라이어게임은 아직 열리지 않았습니다.';
        const lr = createLiarRoom(hub, newCode(hub));
        hookRoom(hub, lr);
        hub.rooms.set(lr.code, lr);
        return lr.join(session);
      }
      if (msg.mode === 'yacht') {
        if (hub.yacht === 'off') return '요트다이스는 아직 열리지 않았습니다.';
        const yr = createYachtRoom(hub, newCode(hub));
        hookRoom(hub, yr);
        hub.rooms.set(yr.code, yr);
        return yr.join(session);
      }
      if (msg.mode === 'draw') {
        if (hub.draw === 'off') return { msg: '갱식마인드는 아직 열리지 않았습니다.', code: 'dr_off' };
        const dr = createDrawRoom(hub, newCode(hub));
        hookRoom(hub, dr);
        hub.rooms.set(dr.code, dr);
        return dr.join(session);
      }
      const r = new Room(hub, newCode(hub), msg.mode);
      hub.rooms.set(r.code, r);
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
  // A room may refuse emotes/photos/sounds for now (liar room: during the unmask animation etc.).
  if (MEDIA.has(msg.t)) {
    const why = room.mediaBlocked?.(session, msg.t);
    if (why) return why;
  }
  switch (msg.t) {
    case 'leave': room.leave(session.id); return null;
    case 'lg': return room.lg ? room.lg(session, msg) : '알 수 없는 요청입니다.';
    case 'yt': return room.yt ? room.yt(session, msg) : '알 수 없는 요청입니다.';
    case 'dr': return room.mode === 'draw' ? room.dr(session, msg) : '알 수 없는 요청입니다.';
    case 'start': return room.start(session.id);
    case 'mode':
    case 'act':
    case 'play':
    case 'liar':
      // Poker/bluff requests. A liar room has its own methods of the same names (play), so test the mode, not the method.
      if (room.mode === 'liar' || room.mode === 'yacht') return '지금은 할 수 없습니다.';
      if (msg.t === 'mode') {
        if (msg.mode === 'yacht') return '요트다이스는 방을 새로 만들어 주세요.';
        if (msg.mode === 'draw') return '방을 새로 만들어 주세요.';
        return msg.mode === 'liar' ? '라이어게임은 방을 새로 만들어 주세요.' : room.setMode(session.id, msg.mode);
      }
      if (msg.t === 'act') return room.act(session.id, msg.a, msg.amount);
      if (msg.t === 'play') return room.play(session.id, msg.cards);
      return room.liar(session.id);
    case 'emote': room.emote(session.id, msg.e); return null;
    case 'pemote':
      if (tooSoon(hub, session, 'pemote', 3000)) return '사진 이모티콘을 너무 빨리 보내고 있습니다';
      room.sendEvents([{ k: 'pemote', id: session.id, data: msg.data }]);
      return null;
    case 'sndAdd':
      if (tooSoon(hub, session, 'sndAdd', 10_000)) return '소리를 너무 빨리 올리고 있습니다';
      return room.addSound(session, msg.sid, msg.name, msg.data);
    case 'sndDel':
    case 'sndRename': {
      // 2 edits per second per account
      const t = hub.now();
      const recent = session.editTimes.filter((x) => t - x < 1000);
      if (recent.length >= 2) return '소리를 너무 빨리 수정하고 있습니다';
      recent.push(t);
      session.editTimes = recent;
      return room.editSound(session, msg.sid, msg.t === 'sndRename' ? { name: msg.name } : {});
    }
    case 'snd':
      if (tooSoon(hub, session, 'snd', 2000)) return '소리를 너무 빨리 재생하고 있습니다';
      return room.playSound(session, msg.sid);
    case 'chat': {
      if (room.mode === 'draw') return room.chat(session, msg.text) ?? null; // the engine counts chat speed itself
      const t = hub.now();
      // Kept on the account, not the socket, so reconnecting or taking over does not reset it.
      const times = session.chatTimes.filter((x) => t - x < 10_000);
      const last = times.at(-1);
      if (times.length >= 5 || (last !== undefined && t - last < 1000)) return '채팅을 너무 빨리 보내고 있습니다';
      times.push(t);
      session.chatTimes = times;
      return room.chat(session, msg.text) ?? null;
    }
    default: return '알 수 없는 요청입니다.';
  }
}
