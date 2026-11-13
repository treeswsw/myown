// Liar game room (shell). Task 1-A: lobby only. Game flow comes in later tasks.
// Moves to myown unchanged; may only use what PLAN 1-4 lists from `hub`:
// hub.send, hub.sendMe, hub.sendRooms, hub.persist, hub.timers, hub.guard, hub.now, hub.rng,
// hub.timing.grace, hub.roomsChanged (+ hub.rooms/hub.sessions only for the same cleanup myown Room does).
// The sound/emote/chat code below is copied from myown server/rooms.js (1b9da83) Room.

import { readFileSync } from 'node:fs';
import { COLORS, DEFAULT_TIMES, MAX_PLAYERS, TIME_CHOICES, GOAL_CHOICES, LIAR_MODES } from '../../shared/liar/constants.js';
import { listTopics, drawWords, isCorrect } from '../../shared/liar/words.js';
import { createGame, tick, wakeAt, act, viewFor } from '../../shared/liar/game.js';
import { checkLg } from '../../shared/liar/protocol.js';
import { applyDelta, champions, unflushed, flushEntry, roundStats } from './scores.js';
import { chatBlocked, mediaBlocked, chatKind } from './perms.js';

export { MAX_PLAYERS };
// Word lists stay on the server; only topic names go into room state.
const WORDS = JSON.parse(readFileSync(new URL('./words.json', import.meta.url), 'utf8'));
const topicNames = (set) => listTopics(WORDS, set);
const topicsAllOn = (set) => topicNames(set).map((name) => ({ name, on: true }));
const WORD_SETS = Object.keys(WORDS.sets);
const TOPIC_MODES = ['random', 'host'];
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const CHAT_LOG = 50; // GDD 9-4: chatLog = last 50
const MAX_LIAR_CHAT = 80; // GDD 9-1
// Size mark in front of a first-say text (`#` or `*`..`***`): stripped before the engine sees it.
// If nothing real is left after stripping, the original text stays.
const SIZE_MARK = /^(?:#|\*{1,3})\s*(?=\S)/;
export function stripSizeMark(text) {
  const out = text.replace(SIZE_MARK, '');
  return /[^\s#*]/u.test(out) ? out : text;
}

// hub.rng() is myown's crypto float in [0,1) (32-bit). The engine and drawWords want an unbiased int 0..n-1
// (PLAN 1-4 rng(n)), so turn the float back into its 32-bit value and reject the uneven tail.
export function intRng(rng) {
  return (n) => {
    const limit = Math.floor(2 ** 32 / n) * n;
    for (let i = 0; i < 64; i++) {
      const u = Math.floor(rng() * 2 ** 32);
      if (u < limit) return u % n;
    }
    return Math.min(n - 1, Math.floor(rng() * n));
  };
}

export const DEFAULT_SETTINGS = () => ({
  liarMode: 'word',
  times: { ...DEFAULT_TIMES },
  wordSet: 'mine',
  topicMode: 'random',
  topics: topicsAllOn('mine'),
  goal: 0,
  nextTopic: null,
});

export function createLiarRoom(hub, code) {
  return new LiarRoom(hub, code);
}

class LiarRoom {
  constructor(hub, code) {
    this.hub = hub;
    this.code = code;
    this.mode = 'liar';
    this.hostId = null;
    this.phase = 'lobby';
    this.members = []; // {id, session, connected, grace, awayUntil, body, color}
    this.round = 0;
    this.settings = DEFAULT_SETTINGS();
    this.chatLog = [];
    this.sounds = []; // [{sid, by, name, data}], oldest first; lives and dies with the room
    this.timers = { gc: null, game: null };
    this.game = null; // engine state; only ever leaves through viewFor
    this.citizenEntry = null; // private: {w, alt} for grading guesses. Never in view/events/errors.
    this.liarName = null; // GDD 9-3 result.liarName: written at round start, survives the liar leaving
    this.scores = new Map(); // id -> {score, flushed}: the room's score book (R2b). Lives as long as the room.
    this.settledGame = null; // the game object whose result is already booked (once per round)
    this.won = false; // a champion exists: the next start pays out and resets the book
    this.used = {}; // words already drawn in this room (drawWords updates it)
  }

  member(id) {
    return this.members.find((m) => m.id === id);
  }

  setTimer(name, ms, fn) {
    this.clearTimer(name);
    this.timers[name] = this.hub.timers.setTimeout(this.hub.guard(fn), ms);
  }

  clearTimer(name) {
    if (this.timers[name] !== null && this.timers[name] !== undefined) this.hub.timers.clearTimeout(this.timers[name]);
    this.timers[name] = null;
  }

  // ---- membership ----

  join(session) {
    if (this.members.length >= MAX_PLAYERS) return '방이 가득 찼습니다.';
    this.clearTimer('gc');
    // Lowest free slot: body (mannequin 0..7) and color stay fixed while the player is in the room.
    const used = new Set(this.members.map((m) => m.body));
    let body = 0;
    while (used.has(body)) body++;
    this.members.push({ id: session.id, session, connected: true, grace: null, awayUntil: null, body, color: COLORS[body] });
    this.hostId ??= session.id;
    session.room = this;
    // Everyone else learns the newcomer's face; the newcomer gets all faces once in sendExtras.
    this.push();
    this.sendFaces([session.id], (m) => m.id !== session.id);
    this.sendEvents([{ k: 'joined', id: session.id, name: session.user.name }]);
    this.sendExtras(session);
    return null;
  }

  // What a joining/reconnecting player needs besides the room state.
  sendExtras(session) {
    this.hub.send(session, { t: 'event', e: { k: 'chatLog', items: this.chatLog.map((x) => ({ ...x })) } });
    this.hub.send(session, {
      t: 'event',
      e: { k: 'faces', items: this.members.map((m) => ({ id: m.id, avatar: m.session.user.avatar })) },
    });
    if (this.sounds.length) {
      this.hub.send(session, { t: 'event', e: { k: 'sndList', items: this.sounds.map((x) => ({ ...x })) } });
    }
  }

  sendFaces(ids, filter = () => true) {
    const items = ids.map((id) => ({ id, avatar: this.member(id)?.session.user.avatar ?? null }));
    for (const m of this.members) {
      if (filter(m)) this.hub.send(m.session, { t: 'event', e: { k: 'faces', items } });
    }
  }

  // GDD 4-4 permission inputs: g = {phase, speaker, accused}, who = {id, spectating}.
  permG() {
    const g = this.game;
    if (!g) return { phase: 'lobby', speaker: null, accused: null };
    return { phase: g.phase, speaker: g.phase === 'speak' ? g.order[g.speakerIdx] ?? null : null, accused: g.accused };
  }

  // In the current round and not dropped out of it. (A player who left and came back stays a spectator until the round ends.)
  inGame(id) {
    const g = this.game;
    return !!g && g.players.includes(id) && !g.dropped.includes(id);
  }

  permWho(id) {
    return { id, spectating: this.game ? !this.inGame(id) : false };
  }

  // Tell the engine about away/back/drop. Only a running round (not the result) and only its participants.
  // Returns the engine events (already named) for the caller to send with its own push.
  notifyEngine(type, id) {
    if (!this.game || this.game.phase === 'result' || !this.inGame(id)) return [];
    const r = act(this.game, { type, by: id }, this.hub.now());
    if (!r.ok) return [];
    const events = this.engineEvents(r.events);
    this.sync();
    this.arm();
    return events;
  }

  // Returns a Korean sentence or null (perms.js decides).
  mediaBlocked(session, kind) {
    return mediaBlocked(this.permG(), this.permWho(session.id), kind);
  }

  // ---- sounds / emotes: copied from myown Room ----

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

  emote(id, e) {
    if (!this.member(id)) return;
    this.sendEvents([{ k: 'emote', id, e }]);
  }

  // Chat is independent of the game: no state push, no timers. Returns an error sentence or undefined.
  chat(session, text) {
    if ([...text].length > MAX_LIAR_CHAT) return '채팅은 1~80자여야 합니다.';
    const g = this.permG();
    const who = this.permWho(session.id);
    const why = chatBlocked(g, who);
    if (why) return why;
    const item = { id: session.id, name: session.user.name, text, ts: this.hub.now(), kind: chatKind(g, who) };
    this.chatLog.push(item);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.sendEvents([{ k: 'chat', ...item }]);
    return undefined;
  }

  // ---- connection / leaving ----

  setConnected(id, connected) {
    const m = this.member(id);
    if (!m) return;
    const changed = m.connected !== connected; // a same-ID takeover reconnects without ever being away
    m.connected = connected;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = connected ? null : this.hub.timers.setTimeout(this.hub.guard(() => this.leave(id)), this.hub.timing.grace);
    m.awayUntil = connected ? null : this.hub.now() + this.hub.timing.grace; // GDD 9-3 players[].awayUntil
    if (changed) this.sendEvents([{ k: connected ? 'back' : 'away', id }]);
    // 'back' goes to the engine before anything else; an unchanged connection tells it nothing.
    const events = changed ? this.notifyEngine(connected ? 'back' : 'away', id) : [];
    this.push(events);
  }

  leave(id) {
    const m = this.member(id);
    if (!m) return;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    const events = this.notifyEngine('drop', id); // before the cleanup, so names still resolve
    this.flushOne(id);
    this.members = this.members.filter((x) => x !== m);
    m.session.room = null;
    if (this.hostId === id) this.hostId = this.members[0]?.id ?? null; // host succession: next in join order
    this.hub.send(m.session, { t: 'room', state: null });
    this.hub.sendMe(m.session);
    this.hub.sendRooms(m.session);
    if (!m.session.conn) this.hub.sessions.delete(id);
    if (this.members.length === 0) {
      this.clearTimer('game');
      this.hub.roomsChanged();
      this.setTimer('gc', this.hub.timing.roomGc, () => this.hub.rooms.delete(this.code));
      return;
    }
    this.sendEvents([{ k: 'left', id, name: m.session.user.name }]);
    this.push(events);
  }

  start(id) {
    if (id !== this.hostId) return '방장만 시작할 수 있습니다.';
    if (this.phase !== 'lobby' && this.phase !== 'result') return '이미 게임이 진행 중입니다.';
    const players = this.members.filter((m) => m.connected).map((m) => m.id);
    if (players.length < 3) return '3명 이상 필요합니다.';
    const st = this.settings;
    if (st.topicMode === 'host' && !st.nextTopic) return '주제를 먼저 골라 주세요.';
    let drawn;
    try {
      drawn = drawWords({
        words: WORDS, set: st.wordSet, enabled: st.topics.filter((t) => t.on).map((t) => t.name),
        topic: st.topicMode === 'host' ? st.nextTopic : null,
        used: this.used, liarMode: st.liarMode, rng: intRng(this.hub.rng),
      });
    } catch {
      return '제시어를 고를 수 없습니다.';
    }
    if (this.won) { // someone won the last game: pay everyone out, then start from zero
      for (const m of this.members) this.flushOne(m.id);
      this.scores.clear();
      this.won = false;
    }
    const round = this.round + 1;
    const game = createGame({
      players,
      settings: { liarMode: st.liarMode, times: st.times },
      draw: { topic: drawn.topic, citizenWord: drawn.citizenWord, liarWord: drawn.liarWord },
      rng: intRng(this.hub.rng), now: this.hub.now(), round,
    });
    this.game = game;
    this.citizenEntry = drawn.citizenEntry;
    this.liarName = this.member(game.liarId).session.user.name;
    this.round = round;
    st.nextTopic = null;
    this.sync();
    this.arm();
    this.push();
    return null;
  }

  // Every {t:'lg'} request. Returns a Korean error sentence or null/undefined.
  lg(session, raw) {
    const c = checkLg(raw);
    if (!c.ok) return c.error;
    const msg = c.msg;
    switch (msg.a) {
      case 'settings': return this.changeSettings(session.id, msg);
      case 'kick': return this.kick(session.id, msg.id);
      case 'say': return this.play(session, { type: 'say', by: session.id, text: stripSizeMark(msg.text) });
      case 'vote': return this.play(session, { type: 'vote', by: session.id, target: msg.target });
      case 'judge': return this.play(session, { type: 'judge', by: session.id, v: msg.v });
      case 'guess':
        return this.play(session, {
          type: 'guess', by: session.id, text: msg.text, correct: this.citizenEntry ? isCorrect(msg.text, this.citizenEntry) : false,
        });
      case 'end':
        if (session.id !== this.hostId) return '방장만 끝낼 수 있습니다.';
        return this.play(session, { type: 'end', by: session.id });
      default: return '지금은 할 수 없습니다.'; // rank is answered by the host server, never by a room
    }
  }

  // One engine action. Timer is re-armed after every action.
  play(session, action) {
    if (!this.game) return '진행 중인 판이 없습니다.';
    const r = act(this.game, action, this.hub.now());
    if (!r.ok) return r.error;
    if (action.type === 'end') { // discarded: back to the waiting room
      this.game = null;
      this.citizenEntry = null;
    }
    this.sync();
    this.arm();
    this.push(this.engineEvents(r.events));
    if (action.type === 'end') this.endNotice();
    return null;
  }

  // GDD 4-1: everyone sees one system chat line when the host discards the round (existing chat channel, kind 'talk').
  endNotice() {
    const item = { id: this.hostId, name: this.member(this.hostId)?.session.user.name ?? '', text: '방장이 판을 끝냈습니다.', ts: this.hub.now(), kind: 'talk' };
    this.chatLog.push(item);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.sendEvents([{ k: 'chat', ...item }]);
  }

  // Engine `chat` events get the speaker's name and go into chatLog (the engine does not know names).
  engineEvents(events) {
    return events.map((e) => {
      if (e.k !== 'chat') return e;
      const item = { ...e, name: this.member(e.id)?.session.user.name ?? '' };
      this.chatLog.push({ id: item.id, name: item.name, text: item.text, ts: item.ts, kind: item.kind });
      if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
      return item;
    });
  }

  sync() {
    this.phase = this.game ? this.game.phase : 'lobby';
    if (this.game && this.game.phase === 'result' && this.settledGame !== this.game) this.settle();
  }

  // The round just reached its result: book it exactly once (GDD 5). A void round books nothing.
  settle() {
    const g = this.game;
    this.settledGame = g;
    const r = g.result;
    if (!r || r.winner === 'void') return;
    const book = {};
    for (const [id, e] of this.scores) book[id] = e.score;
    const next = applyDelta(book, r.delta);
    for (const id of Object.keys(next)) {
      const e = this.scores.get(id) ?? { score: 0, flushed: 0 };
      e.score = next[id];
      this.scores.set(id, e);
    }
    const stay = g.players.filter((id) => !g.dropped.includes(id));
    for (const [id, st] of Object.entries(roundStats(r, stay))) {
      const user = this.member(id)?.session.user;
      if (!user) continue;
      user.stats ??= {};
      const l = (user.stats.liar ??= { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 });
      l.games += st.games; l.wins += st.wins; l.liarGames += st.liarGames; l.liarWins += st.liarWins;
      this.hub.persist(user);
      this.hub.sendMe(this.member(id).session);
    }
    const all = {};
    for (const [id, e] of this.scores) all[id] = e.score;
    r.champions = champions(all, this.settings.goal);
    this.won = r.champions !== null;
  }

  // Add one person's not-yet-booked room score to their running total (once per point).
  flushOne(id) {
    const e = this.scores.get(id);
    const m = this.member(id);
    if (!e || !m) return;
    const add = unflushed(e);
    if (add === 0) return;
    const user = m.session.user;
    user.stats ??= {};
    const r = flushEntry(user.stats.liar ?? { score: 0, games: 0, wins: 0, liarGames: 0, liarWins: 0 }, e);
    user.stats.liar = r.stats;
    e.flushed = r.flushed;
    this.hub.persist(user);
    if (m.connected) this.hub.sendMe(m.session);
  }

  // The one game timer (0 or 1): cleared and re-set from wakeAt after every start/act/tick.
  arm() {
    this.clearTimer('game');
    const at = this.game ? wakeAt(this.game) : null;
    if (at === null || at === undefined) return;
    this.setTimer('game', Math.max(0, at - this.hub.now()), () => this.onTimer());
  }

  onTimer() {
    this.timers.game = null;
    if (!this.game) return;
    const now = this.hub.now();
    const { events } = tick(this.game, now);
    this.sync();
    const next = wakeAt(this.game);
    if (events.length === 0 && next !== null && next <= now) {
      // tick did nothing and the wake time is still in the past: re-arming would loop forever.
      console.error(`liar room ${this.code}: tick made no progress in phase ${this.game.phase}; timer not re-armed`);
      this.push();
      return;
    }
    this.arm();
    this.push(this.engineEvents(events));
  }

  // GDD 9-1 `lg settings`: host only, between rounds. Validate everything first, then apply, so a bad field changes nothing.
  changeSettings(id, msg) {
    if (id !== this.hostId) return '방장만 바꿀 수 있습니다.';
    if (this.phase !== 'lobby' && this.phase !== 'result') return '판이 끝난 뒤에 바꿀 수 있습니다.';
    const st = this.settings;
    if (msg.liarMode !== undefined && !LIAR_MODES.includes(msg.liarMode)) return '라이어 방식이 올바르지 않습니다.';
    if (msg.topicMode !== undefined && !TOPIC_MODES.includes(msg.topicMode)) return '주제 방식이 올바르지 않습니다.';
    if (msg.wordSet !== undefined && !WORD_SETS.includes(msg.wordSet)) return '제시어 묶음이 올바르지 않습니다.';
    if (msg.goal !== undefined && !GOAL_CHOICES.includes(msg.goal)) return '목표 점수가 올바르지 않습니다.';
    if (msg.times !== undefined) {
      if (msg.times === null || typeof msg.times !== 'object' || Array.isArray(msg.times)) return '시간 설정이 올바르지 않습니다.';
      for (const [k, v] of Object.entries(msg.times)) {
        if (!Object.hasOwn(TIME_CHOICES, k) || !TIME_CHOICES[k].includes(v)) return '시간 설정이 올바르지 않습니다.';
      }
    }
    const newSet = msg.wordSet !== undefined && msg.wordSet !== st.wordSet;
    const set = msg.wordSet ?? st.wordSet;
    const names = topicNames(set);
    let topics = newSet ? topicsAllOn(set) : st.topics;
    if (msg.topics !== undefined && !newSet) {
      if (!Array.isArray(msg.topics)) return '주제 설정이 올바르지 않습니다.';
      const on = new Map(topics.map((t) => [t.name, t.on]));
      for (const t of msg.topics) {
        if (t && on.has(t.name) && typeof t.on === 'boolean') on.set(t.name, t.on); // unknown names are ignored
      }
      topics = names.map((name) => ({ name, on: on.get(name) }));
      if (!topics.some((t) => t.on)) return '주제를 하나 이상 켜 주세요.';
    }
    let nextTopic = newSet ? null : st.nextTopic;
    if (msg.nextTopic !== undefined && !newSet) {
      if (msg.nextTopic !== null && !names.includes(msg.nextTopic)) return '없는 주제입니다.';
      nextTopic = msg.nextTopic;
    }
    if (msg.liarMode !== undefined) st.liarMode = msg.liarMode;
    if (msg.topicMode !== undefined) st.topicMode = msg.topicMode;
    if (msg.goal !== undefined) st.goal = msg.goal;
    if (msg.times !== undefined) Object.assign(st.times, msg.times);
    st.wordSet = set;
    st.topics = topics;
    st.nextTopic = nextTopic;
    this.push();
    return null;
  }

  // GDD 9-1 `lg kick`: host only, lobby only.
  kick(id, targetId) {
    if (id !== this.hostId) return '방장만 내보낼 수 있습니다.';
    if (this.phase !== 'lobby') return '방 대기 중에만 내보낼 수 있습니다.';
    if (targetId === id) return '자기 자신은 내보낼 수 없습니다.';
    const m = this.member(targetId);
    if (!m) return '방에 없는 사람입니다.';
    this.hub.send(m.session, { t: 'error', msg: '방장이 내보냈습니다.' });
    this.leave(targetId);
    return null;
  }

  // The avatar changed: everyone gets that one face again.
  faceChanged(session) {
    if (!this.member(session.id)) return;
    this.sendFaces([session.id]);
  }

  // Adds the room's score to everyone's total (safe to call twice).
  flush() {
    for (const m of this.members) this.flushOne(m.id);
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

  // GDD 9-3. No photos here (they travel as 'faces' events). Key order is the same for everyone.
  view(viewerId) {
    const g = this.game;
    const v = g ? viewFor(g, viewerId) : null;
    return {
      code: this.code, mode: 'liar', hostId: this.hostId, you: viewerId,
      now: this.hub.now(),
      phase: v ? v.phase : this.phase,
      phaseEndsAt: v ? v.phaseEndsAt : null,
      round: this.round,
      settings: structuredClone(this.settings),
      players: this.members.map((m) => ({
        id: m.id, name: m.session.user.name, color: m.color, body: m.body,
        seat: v ? v.seats[m.id] ?? null : null, connected: m.connected, awayUntil: m.awayUntil,
        spectating: g ? !this.inGame(m.id) : false, score: this.scores.get(m.id)?.score ?? 0,
      })),
      topic: v ? v.topic : null,
      my: v ? v.my : { word: null, role: null },
      order: v ? v.order : [],
      speaker: v ? v.speaker : null,
      speakDone: v ? v.speakDone : false,
      firstSays: v ? v.firstSays : [],
      votes: v ? v.votes : {},
      candidates: v ? v.candidates : null,
      accuseNo: v ? v.accuseNo : 0,
      accused: v ? v.accused : null,
      judge: v ? v.judge : null,
      unmask: v ? v.unmask : null,
      guess: v ? v.guess : null,
      result: v?.result ? { ...v.result, liarName: this.liarName } : null,
    };
  }
}
