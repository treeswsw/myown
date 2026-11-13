// 공용 방 Shell (docs/COMMON-CONTRACT.md 1절). 사람·자리·방장·강퇴·끊김 유예·재접속·빈 방·타이머·시작·설정·상태 합치기·요청 분배.
// 규칙은 게임 객체(impl = entry.make(ctx, opt))가 맡는다. Shell 은 게임 이름을 모르고 훅(1-4)만 부른다.
import { createChatLog, handleChat } from './chat.js';
import { createMedia, MEDIA } from './media.js';

const POKER_T = new Set(['act', 'play', 'liar', 'mode']);
const COMMON_MSG = {
  host: '방장만 할 수 있습니다.',
  now: '지금은 할 수 없습니다.',
  bad: '알 수 없는 요청입니다.',
  kicked: '방장이 내보냈습니다.',
  full: '방이 가득 찼습니다.',
};

export function createRoomShell(hub, code, entry, opt = {}) {
  const p = entry.err;
  let members = []; // [{id, session, connected, grace, awayUntil, joinNo}] 입장 순서
  let hostId = null;
  let joinSeq = 0;
  let finished = false; // 이번 판에 finish 를 이미 받았나
  const leaving = new Set();
  const timers = new Map(); // 게임 타이머 name -> handle
  let gc = null;
  const log = entry.chat ? createChatLog(entry.chat.log) : createChatLog(30);

  const err = (c, msg) => ({ msg: msg ?? entry.errors?.[c] ?? COMMON_MSG[c.slice(p.length)] ?? COMMON_MSG.now, code: c });
  const member = (id) => members.find((m) => m.id === id);
  const clearAll = () => {
    for (const h of timers.values()) hub.timers.clearTimeout(h);
    timers.clear();
  };

  function emit(events, to = 'all') {
    const list = to === 'all' ? members : members.filter((m) => to.includes(m.id));
    for (const m of list) for (const e of events) hub.send(m.session, { t: 'event', e });
  }

  const ctx = {
    hub, code, mode: entry.mode, rng: hub.rng, now: () => hub.now(),
    members: () => members.slice(),
    member,
    hostId: () => hostId,
    timer(name, ms, fn) {
      ctx.clear(name);
      timers.set(name, hub.timers.setTimeout(hub.guard(() => { timers.delete(name); fn(); }), ms));
    },
    clear(name) {
      if (timers.has(name)) hub.timers.clearTimeout(timers.get(name));
      timers.delete(name);
    },
    emit,
    push: (events = []) => shell.push(events),
    pushTo(ids) {
      for (const m of members) if (ids.includes(m.id)) hub.send(m.session, { t: 'room', state: shell.view(m.id) });
    },
    sendTo(id, msg) {
      const m = member(id);
      if (m) hub.send(m.session, msg);
    },
    chatLine(item) {
      log.add({ ...item });
      emit([{ k: 'chat', ...item }]);
    },
    // 판 끝 코인: 판마다 한 번만(D4). 두 번째는 무시.
    finish(rows) {
      if (finished) {
        console.error(`room ${code}: finish called twice in one round`);
        return;
      }
      finished = true;
      if (entry.coin) hub.award(shell, entry.coin, rows);
    },
    drop(id, reason) {
      if (member(id) && !leaving.has(id)) shell.leave(id, reason);
    },
    err,
  };

  const basePlayer = (m) => ({ id: m.id, name: m.session.user.name, connected: m.connected, awayUntil: m.awayUntil, spectating: false });
  // 게임 줄을 공통 칸 위에 얹는다. 자리 없는 사람(관전)에게는 끊김 시계(awayUntil)를 보이지 않는다: 기다릴 차례가 없다.
  const playerRow = (m, x) => { const row = { ...basePlayer(m), ...x }; if (row.spectating) row.awayUntil = null; return row; };
  // 게임 훅이 던져도 방 정리는 끝까지 한다(나가기·방장 넘김·빈 방).
  const hook = (name, fn, fb) => {
    try { return fn(); } catch (e) { console.error(`room ${code}: ${name} failed:`, e?.stack ?? e); return fb; }
  };
  const notHost = (msg) => err(`${p}host`, msg);

  const shell = {
    shell: true, code, mode: entry.mode, entry, impl: null, hub,
    get hostId() { return hostId; },
    get phase() { return shell.impl.phase(); },
    get members() { return members; },
    member,

    join(session) {
      if (members.length >= entry.max) return err(`${p}full`);
      if (gc !== null) hub.timers.clearTimeout(gc);
      gc = null;
      const m = { id: session.id, session, connected: true, grace: null, awayUntil: null, joinNo: ++joinSeq };
      const prevHost = hostId;
      members.push(m);
      hostId ??= session.id;
      session.room = shell;
      let bad;
      try {
        bad = shell.impl.onJoin?.(m);
      } catch (e) {
        console.error(`room ${code}: onJoin failed:`, e?.stack ?? e);
        bad = err(`${p}bad`, '방에 들어가지 못했습니다.');
      }
      if (bad) {
        members = members.filter((x) => x !== m);
        hostId = prevHost;
        session.room = null;
        if (members.length === 0) gc = hub.timers.setTimeout(hub.guard(() => hub.rooms.delete(code)), hub.timing.roomGc);
        return bad;
      }
      shell.push();
      media.sendFaces([session.id], (x) => x.id !== session.id);
      emit([{ k: 'joined', id: session.id, name: session.user.name }]);
      shell.sendExtras(session);
      return null;
    },

    leave(id, reason = 'leave') {
      const m = member(id);
      if (!m || leaving.has(id)) return;
      leaving.add(id);
      try {
        if (m.grace !== null) hub.timers.clearTimeout(m.grace);
        m.grace = null;
        const events = hook('onLeave', () => shell.impl.onLeave?.(id, reason), null) ?? [];
        members = members.filter((x) => x !== m);
        m.session.room = null;
        if (hostId === id) {
          hostId = (members.find((x) => x.connected) ?? members[0])?.id ?? null;
          if (hostId !== null) hook('onHost', () => shell.impl.onHost?.(hostId));
        }
        hub.send(m.session, { t: 'room', state: null });
        hub.sendMe(m.session);
        hub.sendRooms(m.session);
        if (!m.session.conn) hub.sessions.delete(id);
        if (members.length === 0) {
          hook('onEmpty', () => shell.impl.onEmpty?.());
          clearAll();
          hub.roomsChanged();
          gc = hub.timers.setTimeout(hub.guard(() => hub.rooms.delete(code)), hub.timing.roomGc);
          return;
        }
        emit([{ k: 'left', id, name: m.session.user.name }]);
        shell.push(events);
      } finally {
        leaving.delete(id);
      }
    },

    setConnected(id, on) {
      const m = member(id);
      if (!m) return;
      const changed = m.connected !== on; // 같은 아이디로 가로채기 접속은 끊긴 적이 없다
      m.connected = on;
      if (m.grace !== null) hub.timers.clearTimeout(m.grace);
      m.grace = on ? null : hub.timers.setTimeout(hub.guard(() => shell.leave(id, 'away')), hub.timing.grace);
      m.awayUntil = on ? null : hub.now() + hub.timing.grace;
      const events = [];
      if (changed) {
        events.push({ k: on ? 'back' : 'away', id });
        events.push(...((on ? shell.impl.onBack?.(id) : shell.impl.onAway?.(id)) ?? []));
      }
      shell.push(events);
    },

    kick(by, id) {
      if (by !== hostId) return notHost('방장만 내보낼 수 있습니다.');
      if (!shell.impl.isWaiting()) return err(`${p}now`, '지금은 내보낼 수 없습니다.');
      const m = member(id);
      if (!m || id === by) return err(`${p}bad`, '내보낼 수 없는 사람입니다.');
      hub.send(m.session, { t: 'error', ...err(`${p}kicked`) });
      shell.leave(id, 'kick');
      return null;
    },

    start(by) {
      if (by !== hostId) return notHost('방장만 시작할 수 있습니다.');
      if (!shell.impl.isWaiting()) return err(`${p}now`, '이미 게임이 진행 중입니다.');
      const why = shell.impl.canStart();
      if (why) return why;
      const bad = shell.impl.onStart(by);
      if (bad) return bad;
      finished = false;
      shell.push();
      return null;
    },

    set(by, patch) {
      if (by !== hostId) return notHost('방장만 바꿀 수 있습니다.');
      if (!shell.impl.isWaiting()) return err(`${p}now`, '게임 중에는 바꿀 수 없습니다.');
      if (!shell.impl.setSettings) return err(`${p}bad`);
      const bad = shell.impl.setSettings(by, patch);
      if (bad) return bad;
      shell.push();
      return null;
    },

    pick(by, patch) {
      if (!shell.impl.isWaiting()) return err(`${p}now`, '게임 중에는 바꿀 수 없습니다.');
      if (!shell.impl.pick) return err(`${p}bad`);
      const bad = shell.impl.pick(by, patch);
      if (bad) return bad;
      shell.push();
      return null;
    },

    // chatLog(chatLogFor 우선) -> faces(전원) -> sndList(있으면) -> extrasFor
    sendExtras(session) {
      const items = shell.impl.chatLogFor ? shell.impl.chatLogFor(session.id) : log.list();
      hub.send(session, { t: 'event', e: { k: 'chatLog', items } });
      media.extras(session);
      for (const e of shell.impl.extrasFor?.(session) ?? []) hub.send(session, { t: 'event', e });
    },

    faceChanged(session, prev) {
      media.faceChanged(session, prev);
    },

    view(id) {
      const impl = shell.impl;
      const v = impl.view(id);
      const players = Array.isArray(v.players)
        ? v.players.map((x) => { const m = member(x.id); return m ? playerRow(m, x) : x; })
        : members.map(basePlayer);
      let wait = null;
      if (impl.isWaiting()) {
        const why = impl.canStart();
        wait = { can: !why, why: why ?? null, ...(impl.waitInfo?.() ?? { set: {}, own: {} }) };
      }
      return { ...v, code, mode: entry.mode, hostId, you: id, now: hub.now(), phase: impl.phase(), players, wait, specs: [] };
    },

    sendEvents(events) {
      emit(events);
    },

    chatLine: (item) => ctx.chatLine(item), // chat.js 가 쓴다

    push(events = []) {
      hub.roomsChanged();
      emit(events);
      for (const m of members) hub.send(m.session, { t: 'room', state: shell.view(m.id) });
      media.releaseFaces();
    },

    request(session, msg) {
      const id = session.id;
      switch (msg.t) {
        case 'leave': shell.leave(id, 'leave'); return null;
        case 'start': return shell.start(id);
        case 'kick': return shell.kick(id, msg.id);
        case 'set': return shell.set(id, msg.patch);
        case 'pick': return shell.pick(id, msg.patch);
        case 'chat': return handleChat(shell, session, msg.text);
        default:
      }
      if (MEDIA.has(msg.t)) return media.handle(session, msg);
      if (entry.msgs.includes(msg.t)) return shell.impl.onAction(session, msg) ?? null;
      if (POKER_T.has(msg.t)) return err(`${p}now`);
      return err(`${p}bad`);
    },

    listInfo() {
      const host = member(hostId) ?? members[0];
      return {
        code, mode: entry.mode, hostName: host.session.user.name, count: members.length, max: entry.max,
        phase: shell.impl.phase(), ...(shell.impl.listExtra?.() ?? {}),
      };
    },

    flush() {
      shell.impl.flush?.();
    },

    // 타이머 전부 해제(게임·빈 방·끊김 유예). flush 는 허브가 초기화가 아닐 때 먼저 부른다.
    close() {
      clearAll();
      if (gc !== null) hub.timers.clearTimeout(gc);
      gc = null;
      for (const m of members) if (m.grace !== null) hub.timers.clearTimeout(m.grace);
    },
  };

  const media = createMedia(shell);
  shell.impl = entry.make(ctx, opt);
  return shell;
}
