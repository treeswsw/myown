// 요트다이스 방 (SPEC 19, GDD 5·7·8·9절). 본보기: server/liar/room.js.
// 규칙은 shared/yacht/game.js 가 판정하고, 이 방은 사람(입장·끊김·기권)과 저장·전달만 맡는다.
// 차례 타이머는 없다. 시계는 끊김 유예(hub.timing.grace) 하나뿐이다.
import { createGame, shake, roll, keep, pick, score, drop, viewOf } from '../../shared/yacht/game.js';
import { parseYt } from '../../shared/yacht/protocol.js';
import { CATS, ROUNDS, MAX_PLAYERS } from '../../shared/yacht/constants.js';
import { simulateRoll, freeSpot } from '../../shared/yacht/sim.js';

export { MAX_PLAYERS };
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const CHAT_LOG = 30; // 포커 방과 같다
const RATE = { shake: 4, pick: 8 }; // 1초에 이만큼까지, 넘으면 조용히 버린다(계정 기준)
const E_NOW = '지금은 할 수 없습니다.';

// 상태에 넣는 자리는 소수 3자리(SPEC 19-3). 서버가 계산한 자리가 곧 모두가 보는 자리다.
const r3 = (n) => Math.round(n * 1000) / 1000;
const place = (seed, thrown) => simulateRoll(seed, thrown, { frames: false }).rest.map((s) => ({ i: s.i, x: r3(s.x), z: r3(s.z), yaw: r3(s.yaw) }));
const spotFor = (others, prefer) => {
  const s = freeSpot(others, prefer);
  return { x: r3(s.x), z: r3(s.z), yaw: r3(s.yaw) };
};
const emptyScores = () => Object.fromEntries(CATS.map((c) => [c, null]));

export function createYachtRoom(hub, code) {
  return new YachtRoom(hub, code);
}

class YachtRoom {
  constructor(hub, code) {
    this.hub = hub;
    this.code = code;
    this.mode = 'yacht';
    this.hostId = null;
    this.phase = 'lobby';
    this.members = []; // {id, session, connected, grace, awayUntil}
    this.gameNo = 0;
    this.game = null; // 규칙 엔진 상태. viewOf 로만 나간다
    this.settledGame = null; // 전적을 이미 넣은 판
    this.chatLog = [];
    this.sounds = []; // [{sid, by, name, data}] 방과 함께 사라진다
    this.rate = new Map(); // id -> {shake: [ms], pick: [ms]}
    this.timers = { gc: null };
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
    if (this.members.length >= MAX_PLAYERS) return '방이 가득 찼습니다.';
    this.clearTimer('gc');
    this.members.push({ id: session.id, session, connected: true, grace: null, awayUntil: null });
    this.hostId ??= session.id;
    session.room = this;
    this.push();
    this.sendFaces([session.id], (m) => m.id !== session.id);
    this.sendEvents([{ k: 'joined', id: session.id, name: session.user.name }]);
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

  // 이번 판의 참가자(기권하지 않은)인가
  inGame(id) {
    const c = this.game?.cols.find((x) => x.id === id);
    return !!c && !c.left;
  }

  // 끊김: 사이트 공통 유예 타이머 하나. 차례인 사람이면 흔들기를 끝낸다(상태의 waiting 은 view 가 계산한다).
  setConnected(id, connected) {
    const m = this.member(id);
    if (!m) return;
    const changed = m.connected !== connected; // 같은 아이디로 가로채기 접속은 끊긴 적이 없다
    m.connected = connected;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = connected ? null : this.hub.timers.setTimeout(this.hub.guard(() => this.graceExpired(id)), this.hub.timing.grace);
    m.awayUntil = connected ? null : this.hub.now() + this.hub.timing.grace;
    const events = changed ? [{ k: connected ? 'back' : 'away', id }] : [];
    if (changed && !connected) events.push(...this.stopShake(id));
    this.push(events);
  }

  // id 가 차례이고 컵을 흔들던 중이면 끝낸다(엔진의 drop 은 이 알림을 내지 않는다)
  stopShake(id) {
    const g = this.game;
    if (!g || g.phase !== 'playing' || !g.shaking || g.cols[g.turnIdx].id !== id) return [];
    return shake(g, id, false).events;
  }

  // 끊긴 지 유예(60초)가 지났다: 진행 중인 판이면 기권, 그리고 방에서 뺀다.
  graceExpired(id) {
    this.leave(id, 'away');
  }

  leave(id, reason = 'leave') {
    const m = this.member(id);
    if (!m) return;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = null;
    const g = this.game;
    const events = [];
    if (g && g.phase === 'playing' && this.inGame(id)) {
      events.push(...this.stopShake(id));
      events.push(...drop(g, id, reason).events);
      this.bookDrop(m.session);
      this.sync();
    }
    this.members = this.members.filter((x) => x !== m);
    this.rate.delete(id);
    m.session.room = null;
    if (this.hostId === id) this.hostId = this.members[0]?.id ?? null; // 먼저 들어온 사람
    this.hub.send(m.session, { t: 'room', state: null });
    this.hub.sendMe(m.session);
    this.hub.sendRooms(m.session);
    if (!m.session.conn) this.hub.sessions.delete(id);
    if (this.members.length === 0) {
      this.hub.roomsChanged();
      this.setTimer('gc', this.hub.timing.roomGc, () => this.hub.rooms.delete(this.code));
      return;
    }
    this.sendEvents([{ k: 'left', id, name: m.session.user.name }]);
    this.push(events);
  }

  // ---- 판 ----

  start(id) {
    if (id !== this.hostId) return '방장만 시작할 수 있습니다.';
    if (this.phase !== 'lobby' && this.phase !== 'result') return '이미 게임이 진행 중입니다.';
    const players = this.members.filter((m) => m.connected).map((m) => ({ id: m.id, name: m.session.user.name }));
    if (players.length < 2) return '2명 이상 필요합니다.';
    const r = createGame({ players, rng: this.hub.rng, gameNo: this.gameNo + 1 });
    if (!r.ok) return r.error;
    this.gameNo++;
    this.game = r.game;
    this.sync();
    this.push(r.events);
    return null;
  }

  // 모든 {t:'yt'} 요청. 문구 또는 null.
  yt(session, raw) {
    const c = parseYt(raw);
    if (!c.ok) return c.error;
    const msg = c.msg;
    const g = this.game;
    if (!g) return E_NOW;
    if ((msg.a === 'shake' || msg.a === 'pick') && this.tooFast(session.id, msg.a)) return null; // 조용히 버린다
    let r;
    switch (msg.a) {
      case 'shake': r = shake(g, session.id, msg.on); break;
      case 'roll': r = roll(g, session.id, this.hub.rng, place); break;
      case 'keep': r = keep(g, session.id, msg.i, msg.on, spotFor); break;
      case 'pick': r = pick(g, session.id, msg.cat); break;
      case 'score': r = score(g, session.id, msg.cat); break;
      default: return E_NOW;
    }
    if (!r.ok) return r.error;
    if (r.events.length === 0) return null; // 이미 그 상태: 아무 일 없음
    this.sync();
    this.push(r.events);
    return null;
  }

  tooFast(id, kind) {
    const t = this.hub.now();
    const rec = this.rate.get(id) ?? { shake: [], pick: [] };
    this.rate.set(id, rec);
    rec[kind] = rec[kind].filter((x) => t - x < 1000);
    if (rec[kind].length >= RATE[kind]) return true;
    rec[kind].push(t);
    return false;
  }

  sync() {
    this.phase = this.game ? this.game.phase : 'lobby';
    if (this.game && this.game.phase === 'result' && this.settledGame !== this.game) this.settle();
  }

  yachtStats(user) {
    user.stats ??= {};
    return (user.stats.yacht ??= { games: 0, wins: 0, best: 0 });
  }

  // 판이 끝났다: 끝까지 한 사람(기권 아닌)에게 전적을 한 번만 넣는다. best 는 끝까지 간 판('done')만.
  settle() {
    const g = this.game;
    this.settledGame = g;
    const r = g.result;
    if (!r) return;
    for (const row of r.ranks) {
      const m = this.member(row.id);
      if (!m) continue;
      const st = this.yachtStats(m.session.user);
      st.games++;
      if (r.winners.includes(row.id)) st.wins++;
      if (r.reason === 'done') st.best = Math.max(st.best, row.total);
      this.hub.persist(m.session.user);
      this.hub.sendMe(m.session);
    }
  }

  // 기권하는 순간 games + 1
  bookDrop(session) {
    this.yachtStats(session.user).games++;
    this.hub.persist(session.user);
    this.hub.sendMe(session);
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

  push(events = []) {
    this.hub.roomsChanged();
    this.sendEvents(events);
    for (const m of this.members) this.hub.send(m.session, { t: 'room', state: this.view(m.id) });
  }

  // SPEC 19-3. 프로필 사진은 없다(faces 알림). 키 순서는 모두에게 같다.
  view(viewerId) {
    const g = this.game;
    const v = g ? viewOf(g, viewerId) : null;
    const turnMember = v?.turn ? this.member(v.turn) : null;
    return {
      code: this.code, mode: 'yacht', hostId: this.hostId, you: viewerId,
      now: this.hub.now(),
      phase: v ? v.phase : 'lobby',
      gameNo: this.gameNo,
      players: this.members.map((m) => ({
        id: m.id, name: m.session.user.name, connected: m.connected, awayUntil: m.awayUntil,
        spectating: g ? !this.inGame(m.id) : false,
      })),
      cols: v ? v.cols : this.members.filter((m) => m.connected).map((m) => ({
        id: m.id, name: m.session.user.name, left: false, scores: emptyScores(), upper: 0, bonus: 0, total: 0,
      })),
      round: v ? v.round : 0,
      rounds: ROUNDS,
      turn: v ? v.turn : null,
      waiting: turnMember && !turnMember.connected ? turnMember.id : null,
      rollsLeft: v && v.phase === 'playing' ? v.rollsLeft : 0,
      rollNo: v ? v.rollNo : 0,
      shaking: v ? v.shaking : false,
      dice: v ? v.dice : null,
      preview: v ? v.preview : null,
      pick: v ? v.pick : null,
      last: v ? v.last : null,
      result: v ? v.result : null,
    };
  }
}
