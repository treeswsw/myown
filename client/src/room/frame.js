// 화면 공통 방 틀 (COMMON-CONTRACT 4-1·4-2). CLIENT_GAMES[mode].mount 가 true 인 게임만 이 틀로 그린다(나머지는 main.js 옛 길).
// createRoomFrame(deps) -> { apply(state|null) -> bool, event(e) -> bool, error(err) -> bool, frame(dt), current(),
//                             anchorOf(id), chatMsg(text), enqueue(fn) }
//   apply: 이 틀이 그리는 방이면 true(main.js 는 옛 길을 건너뛴다). 다른 방·null 이면 그리던 게임을 unmount 하고 false.
//   enqueue: 게임 모듈 불러오기·호출 줄 하나(stage.use 가 하나라 옛 길 라이어·요트·미니도 이 줄을 쓴다, 옛 liarQ).
//   anchorOf: 대기실이면 참가자 줄 사진 위, 게임 판이면 게임의 anchorOf. chatMsg: 채팅 글 → 보낼 메시지(게임 chatRule.route).
// deps = { ui, stage, send, chat, emotePanel, emote(createEmoteToggle), sound, getMe, toast, staleReload, onEnter?(), onExit?() }
import './room.css';
import { h } from '../ui/dom.js';
import { GAMES, CLIENT_GAMES, isFramed } from '../games.js';
import { createFaces } from './faces.js';
import { createFloat } from './float.js';
import { createRoomBar } from './bar.js';
import { createWait } from './wait.js';
import { openModal, confirmBox } from '../ui/kit/modal.js';
import { profile } from '../ui/kit/avatar.js';

// 틀이 다 쓰고 게임에 넘기지 않는 것 / 틀이 처리하고 게임에도 넘기는 것 (4-2)
const MEDIA = new Set(['emote', 'pemote', 'snd', 'sndAdd', 'sndList', 'sndDel', 'sndRename']);

export function createClock() {
  let offset = 0;
  return {
    sync(serverNow) { if (Number.isFinite(serverNow)) offset = serverNow - Date.now(); },
    now: () => Date.now() + offset,
    left(endsAt) { return Number.isFinite(endsAt) ? Math.max(0, endsAt - (Date.now() + offset)) : 0; },
  };
}

export function createRoomFrame(deps) {
  const { ui, stage, send, chat, emotePanel, emote, sound, getMe, toast, staleReload } = deps;
  const faces = createFaces();
  const clock = createClock();
  let q = Promise.resolve();
  const enqueue = (fn) => { q = q.then(fn).catch((e) => console.error(e)); return q; };

  const root = h('div', 'rm-game');
  root.hidden = true;
  ui.append(root);
  let cur = null; // { mode, code, entry, schema, wait, game, alive }
  let state = null;
  let toWait = false;
  let showingWait = false;

  const rule = () => cur?.game?.chatRule ?? null;
  const safe = (fn, fb = null) => { try { return fn(); } catch (e) { console.error(e); return fb; } };
  const callGame = (r, fn) => enqueue(() => { if (r.alive && r.game) return fn(r.game); });

  function anchorOf(id) {
    if (!cur) return null;
    if (showingWait) return cur.wait.anchorOf(id);
    return safe(() => cur.game?.anchorOf?.(id) ?? null);
  }
  const float = createFloat(ui, anchorOf);

  function leave() {
    if (!cur) return;
    if (showingWait || !state) { send({ t: 'leave' }); return; }
    const note = safe(() => cur.game?.leaveNote?.(state) ?? null);
    confirmBox({ title: '방에서 나갈까요?', text: note ?? '', ok: '나가기', danger: true }).then((ok) => { if (ok) send({ t: 'leave' }); });
  }
  const bar = createRoomBar({ ui, sound, emote, onLeave: leave });
  const chatEmo = chat.waitEl.querySelector('.chat-emo');
  if (chatEmo) emote.owner(chatEmo);

  function render() {
    if (!cur || !state) return;
    const s = state;
    if (!s.wait) toWait = false; // 새 판이 시작됐다
    showingWait = Boolean(s.wait) && (s.phase === 'lobby' || toWait);
    cur.wait.el.hidden = !showingWait;
    root.hidden = showingWait;
    bar.el.hidden = showingWait;
    const r = rule();
    chat.setEnabled(true);
    chat.setRule(r);
    if (showingWait) {
      chat.setMode('wait');
      const g = cur.game;
      cur.wait.update(s, cur.schema, (name) => safe(() => g?.waitPart?.(name) ?? null));
    } else {
      bar.update(s, cur.entry);
      chat.setMode(r?.own && safe(() => r.own(s), false) ? 'own' : 'game');
    }
    const lk = r?.lock ? safe(() => r.lock(s), null) : null;
    chat.setLock(Boolean(lk?.locked), lk?.hint, lk?.hot);
  }

  function ctxFor(r) {
    return {
      root, ui, stage: r.entry.stage ? stage : null, send,
      me: () => getMe(), faces, clock, sound,
      toast, confirm: confirmBox, modal: openModal, profile,
      openEmote: () => emote.open(),
      leave,
      toWait: () => { if (cur === r) { toWait = true; render(); } },
    };
  }

  function mount(s) {
    const entry = CLIENT_GAMES[s.mode];
    const r = {
      mode: s.mode, code: s.code, entry, schema: GAMES[s.mode], game: null, alive: true,
      wait: createWait({ send, sound, profile, faces, chat, toast, onLeave: () => send({ t: 'leave' }) }),
    };
    ui.append(r.wait.el);
    cur = r;
    toWait = false;
    deps.onEnter?.();
    enqueue(async () => {
      if (!r.alive) return;
      let mod;
      try { mod = await entry.load(); } catch (e) { staleReload(e); return; } // 파일을 못 받음 = 새 버전이 나옴
      if (!r.alive) return;
      try {
        if (typeof mod.mount !== 'function') throw new Error(`${r.mode}: mount 없음`);
        r.game = mod.mount(ctxFor(r));
      } catch (e) {
        console.error(e);
        toast('게임 화면을 여는 중 오류가 났어요. 나갔다가 다시 들어와 주세요.', { kind: 'error', key: 'rm-mount' });
        return;
      }
      if (cur === r) render(); // 대기실 커스텀 칸(waitPart)이 이제 그려진다. 상태는 줄에 이어 선 room() 이 준다
    });
  }

  function unmount() {
    const r = cur;
    if (!r) return;
    r.alive = false;
    cur = null;
    state = null;
    showingWait = false;
    toWait = false;
    r.wait.dispose();
    bar.el.hidden = true;
    root.hidden = true;
    float.clear();
    faces.clear();
    emote.close();
    chat.setRule(null);
    chat.setLock(false);
    enqueue(async () => {
      if (r.game) await r.game.unmount();
      r.game = null;
      root.replaceChildren();
    });
    deps.onExit?.();
  }

  return {
    apply(s) {
      if (!s || !isFramed(s.mode)) { unmount(); return false; }
      if (cur && (cur.mode !== s.mode || cur.code !== s.code)) unmount();
      if (!cur) mount(s);
      state = s;
      clock.sync(s.now);
      const r = cur;
      callGame(r, (g) => g.room(s));
      render();
      return true;
    },

    event(e) {
      if (!cur || !e) return false;
      const r = cur;
      if (MEDIA.has(e.k)) {
        if (e.k === 'emote') { if (!safe(() => r.game?.showEmote?.(e.id, e.e), false)) float.emote(e.id, e.e); }
        else if (e.k === 'pemote') emotePanel.showPhoto(e.id, e.data);
        else if (e.k === 'snd') emotePanel.playSound(e.id, e.sid);
        else if (e.k === 'sndAdd') emotePanel.addRoomSound(e);
        else if (e.k === 'sndList') { emotePanel.setRoomSounds(e.items); emotePanel.syncMine(); }
        else if (e.k === 'sndDel') emotePanel.removeRoomSound(e.sid);
        else if (e.k === 'sndRename') emotePanel.renameRoomSound(e.sid, e.name);
        return true;
      }
      const you = state?.you;
      if (e.k === 'faces') faces.apply(e);
      else if (e.k === 'chat') {
        const ru = rule();
        chat.push(e, { mine: e.id === you, bubble: ru?.bubble ? safe(() => ru.bubble(e) !== false, true) : true });
      } else if (e.k === 'chatLog') chat.setLog(e.items ?? [], you);
      else if (e.k === 'joined') chat.system(`${e.name ?? ''} 님이 들어왔어요`);
      else if (e.k === 'left') chat.system(`${e.name ?? ''} 님이 나갔어요`);
      else if (e.k === 'away') {
        const p = state?.players?.find((x) => x.id === e.id);
        if (p) chat.system(`${p.name} 님의 연결이 끊겼어요 (60초 기다림)`);
      }
      callGame(r, (g) => g.event(e));
      return true;
    },

    error(err) {
      if (!cur || !err) return false;
      const p = GAMES[cur.mode]?.err;
      if (p && typeof err.code === 'string' && err.code.startsWith(p)) callGame(cur, (g) => g.error?.(err));
      if (err.msg) toast(err.msg, { kind: 'error', key: err.code ?? err.msg }); // 알림은 틀이 한 번만(B6)
      return true;
    },

    frame(dt) {
      if (!cur) return;
      const g = cur.game;
      if (g?.frame) safe(() => g.frame(dt));
      float.frame(dt);
    },

    current: () => cur?.game ?? null,
    anchorOf,
    chatMsg(text) {
      const ru = rule();
      return ru?.route ? safe(() => ru.route(text), { t: 'chat', text }) : { t: 'chat', text };
    },
    enqueue,
  };
}
