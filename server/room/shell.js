// 공용 방 Shell (docs/COMMON-CONTRACT.md 1절). 사람·자리·방장·강퇴·끊김 유예·재접속·빈 방·타이머·시작·설정·상태 합치기·요청 분배.
// 규칙은 게임 객체(impl = entry.make(ctx, opt))가 맡는다. Shell 은 게임 이름을 모르고 훅(1-4)만 부른다.
import { createChatLog, handleChat } from './chat.js';
import { createMedia, MEDIA } from './media.js';
import { isSpectatorId, SPEC_MAX } from '../../shared/spectator.js';

const POKER_T = new Set(['act', 'play', 'liar', 'mode']);
const COMMON_MSG = {
  host: '방장만 할 수 있습니다.',
  now: '지금은 할 수 없습니다.',
  bad: '알 수 없는 요청입니다.',
  kicked: '방장이 내보냈습니다.',
  full: '방이 가득 찼습니다.',
  specfull: '관전 자리가 가득 찼습니다.',
  spec: '관전 중에는 할 수 없습니다.',
};

export function createRoomShell(hub, code, entry, opt = {}) {
  const p = entry.err;
  let members = []; // [{id, session, connected, grace, awayUntil, joinNo}] 입장 순서
  // 관전 계정(shared/spectator.js): 정원·자리·차례·방장 밖. 게임 훅(onJoin·onLeave·onAway…)은 이들을 모른다(SPEC 7-4).
  let specs = []; // [{id, session, connected, grace, awayUntil}]
  let hostId = null;
  let joinSeq = 0;
  let finished = false; // 이번 판에 finish 를 이미 받았나
  let result = null; // 지난 판 공통 결과(ctx.finish). 다음 판 시작 때 지운다
  const leaving = new Set();
  const timers = new Map(); // 게임 타이머 name -> handle
  let gc = null;
  const log = entry.chat ? createChatLog(entry.chat.log) : createChatLog(30);

  const err = (c, msg) => ({ msg: msg ?? entry.errors?.[c] ?? COMMON_MSG[c.slice(p.length)] ?? COMMON_MSG.now, code: c });
  const member = (id) => members.find((m) => m.id === id);
  const spec = (id) => specs.find((m) => m.id === id);
  const clearAll = () => {
    for (const h of timers.values()) hub.timers.clearTimeout(h);
    timers.clear();
  };

  function emit(events, to = 'all') {
    const list = to === 'all' ? [...members, ...specs] : [...members, ...specs].filter((m) => to.includes(m.id));
    for (const m of list) for (const e of events) hub.send(m.session, { t: 'event', e });
  }

  const ctx = {
    hub, code, mode: entry.mode, rng: hub.rng, now: () => hub.now(),
    members: () => members.slice(),
    member,
    // 관전자: 게임이 "비밀 없는 시점"을 따로 보내야 할 때만 쓴다(갱식마인드처럼 events 를 참가자 목록으로 보내는 게임)
    specIds: () => specs.map((m) => m.id),
    isSpec: (id) => Boolean(spec(id)),
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
      for (const m of [...members, ...specs]) if (ids.includes(m.id)) hub.send(m.session, { t: 'room', state: shell.view(m.id) });
    },
    sendTo(id, msg) {
      const m = member(id) ?? spec(id);
      if (m) hub.send(m.session, msg);
    },
    chatLine(item) {
      log.add({ ...item });
      emit([{ k: 'chat', ...item }]);
    },
    // 판 끝(D4, 판마다 한 번, 두 번째는 무시): 코인 지급 + 공통 결과 화면 wait.result (COMMON-CONTRACT 1-3).
    // rows [{id, rank, won?, opp?, score?, note?}]: 코인은 opp 가 있는 줄만. info {unit?: 'coin'|'chip', scale?: finish 비율(갱식마인드 문제 수/8), add?: {label?, by: {id: n}}}
    // add = 지급 말고 더할 증감(홀덤 칩, 미니 베팅). label 이 있으면 화면이 "판 코인 +a · <label> +b" 로 나눠 보인다.
    finish(rows, info = {}) {
      if (finished) {
        console.error(`room ${code}: finish called twice in one round`);
        return;
      }
      finished = true;
      const here = rows.filter((r) => member(r.id)); // 관전자·나간 사람은 판 코인 없음
      const pay = here.filter((r) => r.opp !== undefined);
      const paid = entry.coin && pay.length ? hub.award(shell, entry.coin, pay, info.scale) ?? {} : {};
      const by = info.add?.by ?? {};
      const gain = {};
      for (const r of here) gain[r.id] = (paid[r.id] ?? 0) + (by[r.id] ?? 0);
      result = {
        rows: here.map((r) => ({
          id: r.id, name: member(r.id).session.user.name, rank: r.rank,
          ...(r.score !== undefined ? { score: r.score } : {}), ...(r.note ? { note: r.note } : {}),
        })).sort((a, b) => a.rank - b.rank),
        gain, unit: info.unit ?? 'coin',
        ...(info.add?.label ? { add: { label: info.add.label, by: { ...by } } } : {}),
      };
    },
    drop(id, reason) {
      if ((member(id) || spec(id)) && !leaving.has(id)) shell.leave(id, reason);
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
    get specs() { return specs; },
    get everyone() { return [...members, ...specs]; }, // 매체(faces·소리)를 받는 사람 전부
    member,
    spec,
    isSpec: (id) => Boolean(spec(id)),

    // 관전 계정 입장: 정원 밖 자리(최대 SPEC_MAX). 참가자가 있는 방에만, 대기 중이든 게임 중이든. 게임 onJoin 은 부르지 않는다.
    joinSpec(session) {
      if (members.length === 0) return err(`${p}bad`, '참가자가 없는 방입니다.');
      if (specs.length >= SPEC_MAX) return err(`${p}specfull`);
      specs.push({ id: session.id, session, connected: true, grace: null, awayUntil: null, spec: true });
      session.room = shell;
      shell.push();
      media.sendFaces([session.id], (x) => x.id !== session.id);
      emit([{ k: 'joined', id: session.id, name: session.user.name, spec: true }]);
      shell.sendExtras(session);
      return null;
    },

    // 관전자를 내보낸다(나가기·강퇴·유예 끝·방 닫힘). 게임 훅 없음.
    leaveSpec(m, reason, quiet = false) {
      if (m.grace !== null) hub.timers.clearTimeout(m.grace);
      m.grace = null;
      specs = specs.filter((x) => x !== m);
      m.session.room = null;
      if (reason === 'closed') hub.send(m.session, { t: 'error', msg: '참가자가 모두 나가 방이 닫혔습니다.', code: `${p}closed` });
      hub.send(m.session, { t: 'room', state: null });
      hub.sendMe(m.session);
      hub.sendRooms(m.session);
      if (!m.session.conn) hub.sessions.delete(m.id);
      if (quiet) return;
      emit([{ k: 'left', id: m.id, name: m.session.user.name, spec: true }]);
      shell.push();
    },

    join(session) {
      if (isSpectatorId(session.id)) return shell.joinSpec(session);
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
      const sp = spec(id);
      if (sp) { shell.leaveSpec(sp, reason); return; }
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
          // 빈 방은 참가자 기준: 관전자만 남으면 방을 닫고 알린다
          for (const s of specs.slice()) shell.leaveSpec(s, 'closed', true);
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
      const sp = spec(id);
      if (sp) { // 관전자: 유예 시계만(게임 훅 없음)
        sp.connected = on;
        if (sp.grace !== null) hub.timers.clearTimeout(sp.grace);
        sp.grace = on ? null : hub.timers.setTimeout(hub.guard(() => shell.leave(id, 'away')), hub.timing.grace);
        sp.awayUntil = on ? null : hub.now() + hub.timing.grace;
        shell.push();
        return;
      }
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
      const sp = spec(id);
      if (sp) { // 관전자는 게임 중에도 내보낼 수 있다(게임에 영향 없음)
        hub.send(sp.session, { t: 'error', ...err(`${p}kicked`) });
        shell.leave(id, 'kick');
        return null;
      }
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
      result = null;
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
        wait = { can: !why, why: why ?? null, ...(impl.waitInfo?.() ?? { set: {}, own: {} }), result };
      }
      const specRows = specs.map((m) => ({ id: m.id, name: m.session.user.name, connected: m.connected }));
      return { ...v, code, mode: entry.mode, hostId, you: id, now: hub.now(), phase: impl.phase(), players, wait, specs: specRows };
    },

    sendEvents(events) {
      emit(events);
    },

    chatLine: (item) => ctx.chatLine(item), // chat.js 가 쓴다

    push(events = []) {
      hub.roomsChanged();
      emit(events);
      for (const m of [...members, ...specs]) hub.send(m.session, { t: 'room', state: shell.view(m.id) });
      media.releaseFaces();
    },

    request(session, msg) {
      const id = session.id;
      if (spec(id)) return shell.specRequest(session, msg);
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

    // 관전자 요청: 나가기·채팅·매체만. 게임 요청(onAction)·시작·설정·개인 칸은 게임에 넘기지 않는다.
    specRequest(session, msg) {
      switch (msg.t) {
        case 'leave': shell.leave(session.id, 'leave'); return null;
        case 'chat':
          // 채팅을 게임이 통째로 맡는 게임(chatOwn, 갱식마인드: 정답 판정)은 대기·결과 중에만 Shell 길로 받는다
          if (shell.impl.chatOwn && !shell.impl.isWaiting()) return err(`${p}spec`, '게임 중에는 관전자가 채팅할 수 없습니다.');
          return handleChat(shell, session, msg.text, true);
        case 'start': return notHost('방장만 시작할 수 있습니다.');
        case 'kick': return notHost('방장만 내보낼 수 있습니다.');
        case 'set': return notHost('방장만 바꿀 수 있습니다.');
        default:
      }
      if (MEDIA.has(msg.t)) return media.handle(session, msg);
      return err(`${p}spec`);
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
      for (const m of [...members, ...specs]) if (m.grace !== null) hub.timers.clearTimeout(m.grace);
    },
  };

  const media = createMedia(shell);
  shell.impl = entry.make(ctx, opt);
  return shell;
}
