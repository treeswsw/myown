// 미니게임 방 (docs/mini/PLAN.md). 본보기: server/yacht/room.js.
// 규칙은 shared/mini 가 판정하고, 이 방은 사람(입장·끊김·기권)과 전달만 맡는다. 시간 제한 없음.
// 자리(seats)는 먼저 들어온 연결된 2명, 선(seat 0)은 hub.rng(crypto)로 정한다. 나머지는 관전.
import { GAMES, GAME_IDS } from '../../shared/mini/index.js';

export const MAX_PLAYERS = 8;
const MAX_ROOM_SOUNDS = 24;
const MAX_ACCOUNT_SOUNDS = 8;
const CHAT_LOG = 30;
const err = (code, msg) => ({ code, msg });

export function createMiniRoom(hub, code, game = 'gomoku') {
  return new MiniRoom(hub, code, GAME_IDS.includes(game) ? game : 'gomoku');
}

class MiniRoom {
  constructor(hub, code, game) {
    this.hub = hub;
    this.code = code;
    this.mode = 'mini';
    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'play' | 'end'
    this.game = game;
    this.members = []; // {id, session, connected, grace, awayUntil}
    this.seats = [null, null];
    this.names = [null, null];
    this.mn = null; // 규칙 상태
    this.result = null;
    this.chatLog = [];
    this.sounds = [];
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
    if (this.members.length >= MAX_PLAYERS) return { code: 'mn_full', msg: '방이 가득 찼습니다.' };
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

  sendExtras(session) {
    this.hub.send(session, { t: 'event', e: { k: 'chatLog', items: this.chatLog.map((x) => ({ ...x })) } });
    this.hub.send(session, {
      t: 'event',
      e: { k: 'faces', items: this.members.map((m) => ({ id: m.id, avatar: m.session.user.avatar })) },
    });
    if (this.sounds.length) this.hub.send(session, { t: 'event', e: { k: 'sndList', items: this.sounds.map((x) => ({ ...x })) } });
  }

  sendFaces(ids, filter = () => true) {
    const items = ids.map((id) => ({ id, avatar: this.member(id)?.session.user.avatar ?? null }));
    for (const m of this.members) if (filter(m)) this.hub.send(m.session, { t: 'event', e: { k: 'faces', items } });
  }

  faceChanged(session) {
    if (this.member(session.id)) this.sendFaces([session.id]);
  }

  setConnected(id, connected) {
    const m = this.member(id);
    if (!m) return;
    const changed = m.connected !== connected;
    m.connected = connected;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = connected ? null : this.hub.timers.setTimeout(this.hub.guard(() => this.leave(id)), this.hub.timing.grace);
    m.awayUntil = connected ? null : this.hub.now() + this.hub.timing.grace;
    this.push(changed ? [{ k: connected ? 'back' : 'away', id }] : []);
  }

  leave(id) {
    const m = this.member(id);
    if (!m) return;
    if (m.grace !== null) this.hub.timers.clearTimeout(m.grace);
    m.grace = null;
    const seat = this.seats.indexOf(id);
    if (this.phase === 'play' && seat >= 0) this.finish(1 - seat, 'leave'); // 나가기·끊김 60초 = 기권
    this.members = this.members.filter((x) => x !== m);
    m.session.room = null;
    if (this.hostId === id) this.hostId = this.members[0]?.id ?? null;
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
    this.push();
  }

  // ---- 판 ----

  finish(winner, reason) {
    this.phase = 'end';
    this.result = { winner, reason };
  }

  begin(id) {
    if (id !== this.hostId) return err('mn_host', '방장만 시작할 수 있습니다.');
    if (this.phase !== 'lobby') return err('mn_now', '지금은 할 수 없습니다.');
    const ready = this.members.filter((m) => m.connected).slice(0, 2);
    if (ready.length < 2) return err('mn_need2', '2명이 필요합니다.');
    if (this.hub.rng() < 0.5) ready.reverse();
    this.seats = ready.map((m) => m.id);
    this.names = ready.map((m) => m.session.user.name);
    this.mn = GAMES[this.game].init();
    this.result = null;
    this.phase = 'play';
    this.push([{ k: 'mnStart', game: this.game }]);
    return null;
  }

  // 최상위 {t:'start'} 용
  start(id) {
    return this.begin(id)?.msg ?? null;
  }

  // 모든 {t:'mn'} 요청. 오류는 {code, msg} 또는 null.
  request(session, msg) {
    const id = session.id;
    switch (msg.a) {
      case 'game':
        if (id !== this.hostId) return err('mn_host', '방장만 고를 수 있습니다.');
        if (this.phase !== 'lobby') return err('mn_now', '지금은 할 수 없습니다.');
        if (!GAME_IDS.includes(msg.game)) return err('mn_game', '알 수 없는 게임입니다.');
        this.game = msg.game;
        this.push();
        return null;
      case 'start': return this.begin(id);
      case 'move': {
        if (this.phase !== 'play') return err('mn_now', '지금은 할 수 없습니다.');
        const seat = this.seats.indexOf(id);
        if (seat < 0) return err('mn_seat', '관전 중입니다.');
        if (seat !== this.mn.turn) return err('mn_turn', '당신 차례가 아닙니다.');
        const next = GAMES[this.game].apply(this.mn, msg.move);
        if (!next) return err('mn_move', '둘 수 없는 곳입니다.');
        this.mn = next;
        if (next.winner !== null) this.finish(next.winner, next.winner === 'draw' ? 'draw' : 'win');
        this.push();
        return null;
      }
      case 'resign': {
        const seat = this.seats.indexOf(id);
        if (this.phase !== 'play' || seat < 0) return err('mn_now', '지금은 할 수 없습니다.');
        this.finish(1 - seat, 'resign');
        this.push();
        return null;
      }
      case 'again':
        if (id !== this.hostId) return err('mn_host', '방장만 다시 시작할 수 있습니다.');
        if (this.phase !== 'end') return err('mn_now', '지금은 할 수 없습니다.');
        this.phase = 'lobby';
        this.mn = null;
        this.result = null;
        this.seats = [null, null];
        this.names = [null, null];
        this.push();
        return null;
      default: return err('mn_bad', '알 수 없는 요청입니다.');
    }
  }

  // ---- 소리·이모티콘·채팅 ----

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
    if (this.member(id)) this.sendEvents([{ k: 'emote', id, e }]);
  }

  chat(session, text) {
    const item = { id: session.id, name: session.user.name, text, ts: this.hub.now() };
    this.chatLog.push(item);
    if (this.chatLog.length > CHAT_LOG) this.chatLog.shift();
    this.sendEvents([{ k: 'chat', ...item }]);
  }

  // ---- 내보내기 ----

  sendEvents(events) {
    for (const m of this.members) for (const e of events) this.hub.send(m.session, { t: 'event', e });
  }

  push(events = []) {
    this.hub.roomsChanged();
    this.sendEvents(events);
    for (const m of this.members) this.hub.send(m.session, { t: 'room', state: this.view(m.id) });
  }

  // 프로필 사진은 없다(faces 알림). 판은 모두에게 같다.
  view(viewerId) {
    const turnId = this.phase === 'play' ? this.seats[this.mn.turn] : null;
    const turnMember = turnId ? this.member(turnId) : null;
    return {
      code: this.code, mode: 'mini', hostId: this.hostId, you: viewerId,
      now: this.hub.now(),
      phase: this.phase,
      game: this.game,
      seats: [...this.seats],
      names: [...this.names],
      mySeat: this.seats.indexOf(viewerId), // -1 = 관전
      players: this.members.map((m) => ({
        id: m.id, name: m.session.user.name, connected: m.connected, awayUntil: m.awayUntil,
        spectating: this.phase !== 'lobby' && !this.seats.includes(m.id),
      })),
      turn: turnId,
      waiting: turnMember && !turnMember.connected ? turnMember.id : null,
      mn: this.mn,
      result: this.result,
    };
  }
}
