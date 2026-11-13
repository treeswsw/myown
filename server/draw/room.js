// 갱식마인드 방 하나 (GDD 9·10절). 순수 엔진(shared/draw/game.js)·그림 기록(ops.js)·단어 뽑기(words.js)를
// 접속·타이머·전송에 잇는 층. 허브(server/rooms.js)가 라이어 방(server/liar/room.js)과 같은 방식으로 부른다.
//
// 허브에서 쓰는 것(hub): send, sendMe, sendRooms, persist, roomsChanged, timers, guard, now, rng, timing.roomGc,
//   rooms(방 지우기), sessions(떠난 사람 정리).
// 오류 돌려주기: 메서드는 null(성공) 또는 오류를 돌려준다. 오류는 문자열(코드 없는 기존 글) 또는 {msg, code}.
//   (허브가 두 모양을 모두 {t:'error', msg, code?} 로 보내야 한다 — 보고 참고)
// 프로필 사진은 상태에 넣지 않고 faces 알림으로 보낸다.

import { createRoom, join as gJoin, back as gBack, away as gAway, leave as gLeave, kick as gKick, setSettings, start as gStart,
  toLobby, end as gEnd, pickWord, give, skip, chat as gChat, chatLogFor, mediaCheck, tick, nextDeadline, viewFor,
  canDraw, noteInk, setCanvasFlags, ERRORS } from '../../shared/draw/game.js';
import * as ops from '../../shared/draw/ops.js';
import { checkDr } from '../../shared/draw/protocol.js';
import { MAX_PLAYERS } from '../../shared/draw/constants.js';
import { createWordPicker, listTopics, defaultTopics } from './words.js';

export { MAX_PLAYERS };
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const SYNC_GAP_MS = 1000; // 거절 뒤 drSync 는 한 사람에게 1초에 1번
const DRAW_ACTS = new Set(['st', 'pt', 'cx', 'rm', 'undo', 'redo', 'clear']);

// hub.rng() 는 [0,1) 실수(32비트). 엔진이 원하는 0..n-1 정수로 바꾼다(치우침 없이).
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

const errOf = (code) => ({ msg: ERRORS[code], code });
const errFx = (fx) => (fx.code ? { msg: fx.msg, code: fx.code } : fx.msg);

/**
 * opts: { picker?, saveDraw?(rows) }
 *  - saveDraw 가 있으면 판이 끝날 때(finished.save) rows 를 넘기고, 없으면 user.stats.draw 에 직접 더하고 hub.persist 한다.
 *    rows = [{id, name, rank, left, games:1, wins, correct, points}]
 */
export function createDrawRoom(hub, code, opts = {}) {
  return new DrawRoom(hub, code, opts);
}

class DrawRoom {
  constructor(hub, code, opts) {
    this.hub = hub;
    this.code = code;
    this.mode = 'draw';
    this.hostId = null;
    this.phase = 'lobby'; // 방 목록용: 'lobby'(대기·최종 순위) | 'playing'
    this.members = []; // {id, session, connected, grace(항상 null: 자리 유지는 엔진이 잰다)}
    this.sounds = [];
    this.heldFaces = new Map(); // 사진 이모티콘이 막힌 동안 바꾼 사람의 사진: id -> 방에 보여 준(바뀌기 전) 사진
    this.timers = { gc: null, game: null };
    this.g = null; // 엔진 상태. 첫 입장 때 만든다. viewFor 로만 밖에 나간다.
    this.drawing = ops.createDrawing();
    this.picker = opts.picker ?? createWordPicker();
    this.saveDraw = opts.saveDraw ?? null;
    this.allTopics = listTopics();
    this.rng = intRng(hub.rng);
    this.lastSync = new Map(); // id -> 마지막으로 거절 뒤 drSync 를 보낸 시각
    this.drawnQ = 0; // 그림을 비운 마지막 문제 번호
  }

  member(id) { return this.members.find((m) => m.id === id); }

  setTimer(name, ms, fn) {
    this.clearTimer(name);
    this.timers[name] = this.hub.timers.setTimeout(this.hub.guard(fn), ms);
  }

  clearTimer(name) {
    if (this.timers[name] !== null && this.timers[name] !== undefined) this.hub.timers.clearTimeout(this.timers[name]);
    this.timers[name] = null;
  }

  env(now) {
    return { now, rng: this.rng, words: (topics) => this.picker.pick(topics) };
  }

  // ---- 모든 진입점: 먼저 tick, 끝나면 타이머 다시 걸기 ----

  run(fn) {
    const now = this.hub.now();
    if (this.g) this.apply(tick(this.g, now, this.env(now)));
    const r = fn(now);
    this.arm();
    return r;
  }

  arm() {
    this.clearTimer('game');
    if (!this.g || this.members.length === 0) return;
    const at = nextDeadline(this.g);
    if (at === null || at === undefined) return;
    const now = this.hub.now();
    this.setTimer('game', Math.max(0, at - now), () => this.onTimer());
  }

  onTimer() {
    this.timers.game = null;
    if (!this.g) return;
    const now = this.hub.now();
    try {
      this.apply(tick(this.g, now, this.env(now)));
    } catch (err) {
      console.error(`draw room ${this.code}: timer failed:`, err.stack);
      this.setTimer('game', 1000, () => this.onTimer());
      return;
    }
    const next = this.members.length ? nextDeadline(this.g) : null;
    if (next !== null && next <= now) { // 일이 없는데 시각이 과거면 무한 반복이 된다: 1초 뒤에 다시
      console.error(`draw room ${this.code}: tick made no progress in phase ${this.g.phase}`);
      this.setTimer('game', 1000, () => this.onTimer());
      return;
    }
    this.arm();
  }

  // ---- 엔진이 돌려준 fx 를 실제로 보낸다 ----

  apply(fx) {
    if (!fx) return;
    if (this.g.q !== this.drawnQ && this.g.q > 0) { // 새 문제가 시작됨(받는 사람이 없어도)
      this.drawing = ops.createDrawing();
      this.drawnQ = this.g.q;
    }
    for (const w of fx.use) this.picker.use(w);
    for (const id of fx.kicked) {
      const m = this.member(id);
      if (m) this.hub.send(m.session, { t: 'error', ...errOf('dr_kicked') });
    }
    for (const { to, e } of fx.events) for (const id of to) this.sendEvent(id, e);
    for (const id of fx.room) {
      const m = this.member(id);
      if (m) this.hub.send(m.session, { t: 'room', state: this.view(id) });
    }
    if (fx.finished?.save) this.save(fx.finished.ranking);
    this.syncMembers();
    this.releaseFaces();
  }

  // 엔진에서 사라진 사람을 방에서도 뺀다. 방장·목록 단계도 맞춘다.
  syncMembers() {
    const g = this.g;
    const alive = new Set(g.players.map((p) => p.id));
    const gone = this.members.filter((m) => !alive.has(m.id));
    this.members = this.members.filter((m) => alive.has(m.id));
    this.hostId = g.hostId; // 나간 사람에게 방 목록을 보내기 전에 새 방장으로 바꿔 둔다
    for (const m of gone) {
      if (m.session.room === this) m.session.room = null;
      this.lastSync.delete(m.id);
      this.hub.send(m.session, { t: 'room', state: null });
      this.hub.sendMe(m.session);
      this.hub.sendRooms(m.session);
      if (!m.session.conn) this.hub.sessions.delete(m.id);
    }
    this.phase = g.phase === 'lobby' || g.phase === 'final' ? 'lobby' : 'playing';
    if (g.phase === 'lobby') {
      this.drawnQ = 0;
      if (this.drawing.ops.length || this.drawing.cur) this.drawing = ops.createDrawing();
    }
    this.hub.roomsChanged();
    if (this.members.length === 0 && this.timers.gc === null) {
      this.clearTimer('game');
      this.setTimer('gc', this.hub.timing.roomGc, () => this.hub.rooms.delete(this.code));
    }
  }

  // 판이 끝나 누적 기록을 남긴다(finished.save 일 때만)
  save(ranking) {
    const rows = ranking.map((r) => ({
      id: r.id, name: r.name, rank: r.rank, left: !!r.left,
      games: 1, wins: r.rank === 1 ? 1 : 0, correct: r.correct, points: r.score,
    }));
    if (this.saveDraw) { this.saveDraw(rows); return; }
    for (const row of rows) {
      // 지금 로그인해 있는 사람의 지금 user 만 쓴다(옛 사본을 저장하면 그 사이 바뀐 값을 덮어쓴다)
      const session = this.member(row.id)?.session ?? this.hub.sessions.get(row.id);
      const user = session?.user;
      if (!user) continue;
      user.stats ??= {};
      const d = (user.stats.draw ??= { games: 0, wins: 0, correct: 0, points: 0 });
      d.games += row.games; d.wins += row.wins; d.correct += row.correct; d.points += row.points;
      this.hub.persist(user);
      if (session.conn) this.hub.sendMe(session);
    }
  }

  sendEvent(id, e) {
    const m = this.member(id);
    if (m) this.hub.send(m.session, { t: 'event', e });
  }

  // 모든 사람에게(이모티콘·사운드 등). 허브의 pemote 도 이것을 부른다.
  sendEvents(events) {
    for (const m of this.members) for (const e of events) this.hub.send(m.session, { t: 'event', e });
  }

  // 그리는 사람을 뺀 방 전원
  toWatchers(drawerId, e) {
    for (const m of this.members) if (m.id !== drawerId) this.hub.send(m.session, { t: 'event', e });
  }

  view(id) {
    // now = 서버 시각(epochMs): 화면이 endsAt 을 자기 시계에 맞추는 데 쓴다(라이어 상태와 같음)
    return this.g ? { ...viewFor(this.g, id), now: this.hub.now() } : null;
  }

  push() { // 허브가 상태만 다시 보내고 싶을 때
    for (const m of this.members) this.hub.send(m.session, { t: 'room', state: this.view(m.id) });
    this.hub.roomsChanged();
  }

  // ---- 들어오기·나가기·끊김 ----

  join(session) {
    return this.run((now) => {
      if (this.members.length >= MAX_PLAYERS) return '방이 가득 찼습니다.';
      const user = { id: session.id, name: session.user.name };
      if (!this.g) {
        this.g = createRoom({ code: this.code, host: user, allTopics: this.allTopics, topics: defaultTopics(), now });
        this.members.push({ id: session.id, session, connected: true, grace: null });
        session.room = this;
        this.clearTimer('gc');
        this.syncMembers();
        this.push();
        this.sendExtras(session);
        return null;
      }
      const fx = gJoin(this.g, user, this.env(now));
      if (!fx.ok) return errFx(fx);
      this.clearTimer('gc');
      this.members.push({ id: session.id, session, connected: true, grace: null });
      session.room = this;
      this.apply(fx);
      this.sendFaces([session.id], (m) => m.id !== session.id);
      this.sendExtras(session);
      return null;
    });
  }

  // 입장·재접속: faces -> chatLog -> sndList -> drSync (room 은 이미 보냈거나 허브가 보낸다)
  sendExtras(session) {
    if (!this.g) return;
    const id = session.id;
    this.hub.send(session, {
      t: 'event', e: { k: 'faces', items: this.members.map((m) => ({ id: m.id, avatar: this.faceOf(m) })) },
    });
    this.hub.send(session, { t: 'event', e: { k: 'chatLog', items: chatLogFor(this.g, id) } });
    if (this.sounds.length) this.hub.send(session, { t: 'event', e: { k: 'sndList', items: this.sounds.map((x) => ({ ...x })) } });
    this.hub.send(session, { t: 'event', e: { k: 'drSync', ...ops.exportSync(this.drawing) } });
  }

  sendFaces(ids, filter = () => true) {
    const items = ids.map((id) => ({ id, avatar: this.faceOf(this.member(id)) }));
    for (const m of this.members) if (filter(m)) this.hub.send(m.session, { t: 'event', e: { k: 'faces', items } });
  }

  // 방에 보여 줄 사진. 막힌 동안 바꾼 사진은 풀릴 때까지 바뀌기 전 것을 쓴다(그리는 사람·맞힌 사람 구별 누출 방지).
  faceOf(m) {
    if (!m) return null;
    return (this.heldFaces.has(m.id) ? this.heldFaces.get(m.id) : m.session.user.avatar) ?? null;
  }

  faceChanged(session, prev) {
    if (!this.member(session.id)) return;
    if (this.g && !mediaCheck(this.g, session.id, 'media').ok) {
      if (!this.heldFaces.has(session.id)) this.heldFaces.set(session.id, prev ?? null);
      return;
    }
    this.heldFaces.delete(session.id);
    this.sendFaces([session.id]);
  }

  // 막힘이 풀린 사람의 바뀐 사진을 방에 내보낸다.
  releaseFaces() {
    if (!this.heldFaces.size) return;
    const ids = [];
    for (const id of [...this.heldFaces.keys()]) {
      if (!this.member(id)) this.heldFaces.delete(id);
      else if (!this.g || mediaCheck(this.g, id, 'media').ok) { this.heldFaces.delete(id); ids.push(id); }
    }
    if (ids.length) this.sendFaces(ids);
  }

  setConnected(id, connected) {
    this.run((now) => {
      const m = this.member(id);
      if (!m || m.connected === connected) return; // 같은 아이디로 가로채기 접속은 끊긴 적이 없다
      m.connected = connected;
      this.apply(connected ? gBack(this.g, id, this.env(now)) : gAway(this.g, id, this.env(now)));
    });
  }

  leave(id) {
    this.run((now) => {
      if (!this.member(id)) return;
      this.apply(gLeave(this.g, id, this.env(now)));
    });
  }

  // ---- 시작과 요청 ----

  start(id) {
    return this.run((now) => {
      if (!this.g || !this.member(id)) return errOf('dr_now');
      let fx;
      try {
        fx = gStart(this.g, id, this.env(now));
      } catch (err) {
        console.error(`draw room ${this.code}: start failed:`, err.message);
        return errOf('dr_topics');
      }
      if (!fx.ok) return errFx(fx);
      this.apply(fx);
      return null;
    });
  }

  // 모든 {t:'dr'} 요청
  dr(session, raw) {
    return this.run((now) => {
      const id = session.id;
      if (!this.g || !this.member(id)) return errOf('dr_now');
      const c = checkDr(raw);
      if (!c.ok) {
        if (DRAW_ACTS.has(raw?.a)) { // 그림 요청의 형식 오류: 오류 글 없이 버리고, 지금 그리는 사람이면 drSync
          if (canDraw(this.g, id)) this.resync(id, now);
          return null;
        }
        return errOf('dr_bad');
      }
      const msg = c.msg;
      if (DRAW_ACTS.has(msg.a)) return this.drawReq(session, msg, now);
      const env = this.env(now);
      let fx;
      switch (msg.a) {
        case 'settings': { const { a, ...patch } = msg; fx = setSettings(this.g, id, patch, env); break; }
        case 'kick': fx = gKick(this.g, id, msg.id, env); break;
        case 'pick': fx = pickWord(this.g, id, msg.i, env); break;
        case 'give': fx = give(this.g, id, env); break;
        case 'skip': fx = skip(this.g, id, env); break;
        case 'end': fx = gEnd(this.g, id, env); break;
        case 'lobby': fx = toLobby(this.g, id, env); break;
        default: return errOf('dr_bad');
      }
      if (!fx.ok) return errFx(fx);
      this.apply(fx);
      return null;
    });
  }

  // 그림 요청. checkDr 를 통과한 것만 온다.
  drawReq(session, msg, now) {
    const id = session.id;
    // draw 단계 밖이거나 그리는 사람이 아니면 조용히 버린다(오류도 drSync 도 없음).
    if (!canDraw(this.g, id)) return null;
    const d = this.drawing;
    let r;
    switch (msg.a) {
      case 'st': r = ops.st(d, msg); break;
      case 'pt': r = ops.pt(d, msg); break;
      case 'rm': r = ops.rm(d, msg); break;
      case 'cx': r = ops.cx(d); break;
      case 'undo': r = ops.undo(d); break;
      case 'redo': r = ops.redo(d); break;
      default: r = ops.clear(d);
    }
    if (r.event) this.toWatchers(id, r.event); // 성공한 전달, 또는 거절되며 닫힌 선을 보는 사람들에게 알림
    if (!r.ok) {
      if (r.error === 'full') this.hub.send(session, { t: 'error', ...errOf('dr_canvas_full') });
      this.resync(id, now); // bad·range·full 모두 오류 글 없이(full 은 위 오류 글만) 화면을 서버와 맞춘다
    } else if (!r.noop && msg.a === 'st') {
      noteInk(this.g, id);
    }
    this.flags();
    return null;
  }

  // 되돌리기·다시 하기 가능 여부를 엔진에 알린다(바뀌면 그리는 사람에게만 room)
  flags() {
    const d = this.drawing;
    this.apply(setCanvasFlags(this.g, { canUndo: ops.canUndo(d), canRedo: !d.cur && ops.canRedo(d) }));
  }

  // 거절 뒤 drSync: 한 사람에게 1초에 1번 이하
  resync(id, now) {
    const last = this.lastSync.get(id);
    if (last !== undefined && now - last < SYNC_GAP_MS) return;
    this.lastSync.set(id, now);
    this.sendEvent(id, { k: 'drSync', ...ops.exportSync(this.drawing) });
  }

  // ---- 채팅·이모티콘·사운드 ----

  chat(session, text) {
    return this.run((now) => {
      if (!this.g || !this.member(session.id)) return errOf('dr_now');
      const fx = gChat(this.g, session.id, text, this.env(now));
      if (!fx.ok) return errFx(fx);
      this.apply(fx);
      return null;
    });
  }

  // 허브가 emote/pemote/snd/sndAdd 를 처리하기 전에 부른다. kind = 그 메시지의 t
  mediaBlocked(session, kind) {
    return this.run(() => {
      if (!this.g) return errOf('dr_now');
      const r = mediaCheck(this.g, session.id, kind === 'emote' ? 'basic' : 'media');
      return r.ok ? null : errFx(r);
    });
  }

  emote(id, e) {
    if (!this.member(id)) return;
    this.sendEvents([{ k: 'emote', id, e }]);
  }

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

  // 점수는 판이 끝날 때 이미 저장했다. 허브 close() 가 부르므로 비워 둔다.
  flush() {}
}
