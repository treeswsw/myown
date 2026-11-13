// 갱스껄 방 (GDD 3·4·8·9절). 본보기: server/yacht/room.js.
// 규칙·시간 판정은 shared/gsk/game.js(순수 엔진)가 하고, 이 방은 사람(입장·끊김·기권)·전달·저장만 맡는다.
//  - 모든 요청 처리 전에 tick(now). 시계는 하나: 엔진의 nextDeadline(+대기·결과 화면에서 끊긴 사람 정리).
//  - 방 상태는 사람마다 viewFor(state, id) 로 따로 보낸다(mine 은 본인만). 이벤트는 to 대로.
//  - 난수는 crypto.randomInt 만(Math.random 금지).
import { randomInt } from 'node:crypto';
import {
  createGame, addPlayer, setConnected, start, act, leave, tick, nextDeadline, viewFor,
} from '../../shared/gsk/game.js';
import { MAX_PLAYERS, errorMsg } from '../../shared/gsk/constants.js';

export { MAX_PLAYERS };
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const CHAT_LOG = 30; // 포커 방과 같다

const secureRnd = (n) => randomInt(n);
const bad = (code) => ({ msg: errorMsg(code), code });

export function createGskRoom(hub, code, opts = {}) {
  return new GskRoom(hub, code, opts);
}

class GskRoom {
  constructor(hub, code, opts = {}) {
    this.hub = hub;
    this.code = code;
    this.mode = 'gsk';
    this.rnd = opts.rnd ?? secureRnd;
    this.s = createGame({ code, hostId: null, graceMs: hub.timing.grace });
    this.members = []; // {id, session, connected}
    this.booked = new Set(); // 이번 판 전적을 이미 넣은 사람
    this.chatLog = [];
    this.sounds = []; // [{sid, by, name, data}] 방과 함께 사라진다
    this.timers = { gc: null, dl: null };
  }

  get hostId() {
    return this.s.hostId;
  }

  get phase() {
    return this.s.phase;
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

  // ---- 입장·퇴장 ----

  join(session) {
    this.apply(tick(this.s, this.hub.now(), this.rnd)); // 오래 끊긴 사람부터 정리
    if (this.members.length >= MAX_PLAYERS) { this.flush(); return '방이 가득 찼습니다.'; }
    this.clearTimer('gc');
    const r = addPlayer(this.s, { id: session.id, name: session.user.name });
    if (!r.ok) return r.error;
    this.members.push({ id: session.id, session, connected: true });
    session.room = this;
    this.sendFaces([session.id], (m) => m.id !== session.id);
    this.sendEvents([{ k: 'joined', id: session.id, name: session.user.name }]);
    this.flush();
    this.sendExtras(session);
    return null;
  }

  // 들어오거나 다시 붙는 사람에게 방 상태 말고 필요한 것
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

  faceChanged(session) {
    if (!this.member(session.id)) return;
    this.sendFaces([session.id]);
  }

  // 끊김·재접속. 끊긴 시각은 엔진이 적고, 60초 뒤 기권은 tick 이 한다.
  setConnected(id, connected) {
    const m = this.member(id);
    if (!m) return;
    this.apply(tick(this.s, this.hub.now(), this.rnd));
    const changed = m.connected !== connected; // 같은 아이디로 가로채기 접속은 끊긴 적이 없다
    m.connected = connected;
    setConnected(this.s, id, connected, this.hub.now());
    if (changed) this.sendEvents([{ k: connected ? 'back' : 'away', id }]);
    this.flush();
  }

  leave(id) {
    const m = this.member(id);
    if (!m) return;
    this.apply(tick(this.s, this.hub.now(), this.rnd));
    // 판 도중 나가면(탈락한 사람 포함) 그 판 전적 games + 1
    if (this.s.phase === 'playing' && this.s.seats.some((x) => x.id === id)) this.book(id, false);
    const fx = leave(this.s, id, this.hub.now(), this.rnd);
    this.members = this.members.filter((x) => x !== m);
    m.session.room = null;
    this.apply(fx);
    this.hub.send(m.session, { t: 'room', state: null });
    this.hub.sendMe(m.session);
    this.hub.sendRooms(m.session);
    if (!m.session.conn) this.hub.sessions.delete(id);
    if (this.members.length === 0) {
      this.clearTimer('dl');
      this.hub.roomsChanged();
      this.setTimer('gc', this.hub.timing.roomGc, () => this.hub.rooms.delete(this.code));
      return;
    }
    this.sendEvents([{ k: 'left', id, name: m.session.user.name }]);
    this.flush();
  }

  // ---- 판 ----

  // 방장 "시작"(대기·결과 화면). 문구 또는 {msg, code}, 성공이면 null.
  start(id) {
    this.apply(tick(this.s, this.hub.now(), this.rnd));
    const fx = start(this.s, id, this.hub.now(), this.rnd);
    if (!fx.ok) { this.flush(); return { msg: fx.error, code: fx.code }; }
    this.booked = new Set();
    this.apply(fx);
    this.flush();
    return null;
  }

  // 모든 {t:'gk'} 요청. 오류면 {msg, code}, 아니면 null.
  gk(session, raw) {
    if (!this.member(session.id)) return bad('gk_now');
    this.apply(tick(this.s, this.hub.now(), this.rnd));
    const fx = act(this.s, session.id, raw, this.hub.now(), this.rnd);
    if (!fx.ok) { this.flush(); return { msg: fx.error, code: fx.code }; }
    this.apply(fx);
    this.flush();
    return null;
  }

  // 타이머가 울렸다
  advance() {
    this.apply(tick(this.s, this.hub.now(), this.rnd));
    this.flush();
  }

  // 엔진 결과를 반영한다: 이벤트 전달, 기권 전적, 판 끝 전적. 상태 전송은 flush.
  apply(fx) {
    if (fx.events.length) this.dispatch(fx.events);
    // 끊김 60초로 기권한 사람은 그 순간 games + 1
    for (const x of this.s.seats) if (x.out === 'away' && !this.booked.has(x.id)) this.book(x.id, false);
    if (fx.finished) for (const id of fx.finished.players) this.book(id, id === fx.finished.winner);
  }

  dispatch(events) {
    for (const { to, e } of events) {
      for (const m of this.members) if (to === 'all' || to === m.id) this.hub.send(m.session, { t: 'event', e });
    }
  }

  // 사람마다 한 판에 한 번만. 방에 있는 계정에게만 넣을 수 있다.
  book(id, won) {
    if (this.booked.has(id)) return;
    this.booked.add(id);
    const m = this.member(id);
    if (!m) return;
    const user = m.session.user;
    user.stats ??= {};
    const st = (user.stats.gsk ??= { games: 0, wins: 0 });
    st.games++;
    if (won) st.wins++;
    this.hub.persist(user);
    this.hub.sendMe(m.session);
  }

  // 끊긴 지 유예가 지난, 판에 참여 중이 아닌 사람(대기·결과·관전·기권자)은 방에서 뺀다.
  waiting(m) {
    if (m.connected || m.awayAt == null) return false;
    const seat = this.s.seats.find((x) => x.id === m.id);
    return !(this.s.phase === 'playing' && seat && !seat.out);
  }

  // 다음 시각 하나: 엔진의 nextDeadline 과 방에서 뺄 시각 중 빠른 것
  deadline() {
    let d = nextDeadline(this.s);
    for (const m of this.s.members) {
      if (!this.waiting(m)) continue;
      const t = m.awayAt + this.s.graceMs;
      if (d == null || t < d) d = t;
    }
    return Number.isFinite(d) ? d : null;
  }

  // 모두에게 각자의 상태를 보내고 타이머를 다시 건다.
  flush() {
    const now = this.hub.now();
    const gone = this.s.members.filter((m) => this.waiting(m) && now >= m.awayAt + this.s.graceMs).map((m) => m.id);
    if (gone.length) {
      for (const id of gone) this.leave(id); // leave 가 다시 flush 한다
      return;
    }
    this.s.now = now;
    this.hub.roomsChanged();
    for (const m of this.members) this.hub.send(m.session, { t: 'room', state: this.view(m.id) });
    const d = this.deadline();
    if (d === null) this.clearTimer('dl');
    else this.setTimer('dl', Math.max(0, d - now), () => this.advance());
  }

  // ---- 소리·이모티콘·채팅: 포커 방과 같다 ----

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

  chat(session, text) {
    const item = { id: session.id, name: session.user.name, text, ts: this.hub.now() };
    this.chatLog.push(item);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.sendEvents([{ k: 'chat', ...item }]);
  }

  // ---- 내보내기 ----

  sendEvents(events) {
    for (const m of this.members) {
      for (const e of events) this.hub.send(m.session, { t: 'event', e });
    }
  }

  // 이벤트를 보내고 상태를 다시 보낸다(rooms.js 의 다른 방 공통 처리가 부를 수 있다)
  push(events = []) {
    this.sendEvents(events);
    this.flush();
  }

  // GDD 9-2. 받는 사람 시점. 프로필 사진은 없다(faces 알림).
  view(viewerId) {
    return viewFor(this.s, viewerId);
  }
}
