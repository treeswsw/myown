// mountLiar: 화면 모듈들을 하나로 묶는다 (과제 I-1). 약속: docs/team/CONTRACTS.md 2절·6절, docs/PLAN.md 1-4.
import './liar.css';
import './ui/hud.css';
import './ui/vote.css';
import './ui/result.css';
import './ui/role.css';
import './ui/firstsays.css';
import './ui/settings.css';
import './ui/emote.css';
import './ui/rules.css';
import './ui/rank.css';
import './anim/unmask.css';
import { LIMITS, TIME_CHOICES, GOAL_CHOICES } from '../../../shared/liar/constants.js';
import { cameraFor } from './scene/layout.js'; // three.js 를 가져오지 않는 순수 함수
import { createHud, chatLockFor } from './ui/hud.js';
import { createVote } from './ui/vote.js';
import { createResult } from './ui/result.js';
import { createRole } from './ui/role.js';
import { createFirstSays } from './ui/firstsays.js';
import { createSettings } from './ui/settings.js';
import { createEmote } from './ui/emote.js';
import { createRules } from './ui/rules.js';
import { createRank } from './ui/rank.js';
import { createUnmask } from './anim/unmask.js';
import { createAudio } from './audio.js';
import { chatMsgFor, plainChat, soundForEvent, resultSound } from './pure.js';

export { chatMsgFor, plainChat, soundForEvent, resultSound };

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

let current = null; // 이미 마운트된 인스턴스. 다시 마운트하면 먼저 정리해 화면 요소가 하나만 남게 한다.

export function mountLiar(opts) {
  current?.dispose();
  const inst = mountLiarInner(opts);
  const dispose = inst.dispose;
  inst.dispose = () => { if (current === inst) current = null; dispose(); };
  current = inst;
  return inst;
}

function mountLiarInner({ ui, stage, send, getMe, chat, toast, emotePanel, sceneFactory }) { // eslint-disable-line no-unused-vars
  const nogl = !!stage?.nogl;
  const root = el('div', 'lg-root');
  const action = el('div', 'lg-action');
  const lobbyBox = el('div', 'lg-lobbybox');
  root.append(action, lobbyBox);
  root.hidden = true;
  ui.append(root);

  let scene = null;
  let state = null;
  let offset = 0;
  let prevPhase = null;
  let size = '';
  let disposed = false;
  const faces = new Map();
  const audio = createAudio();
  const unlock = () => audio.unlock();
  addEventListener('pointerdown', unlock, { once: true, capture: true });

  const rowPos = (id) => {
    const r = lobbyBox.hidden ? null : lobbyBox.querySelector(`.lg-st-player[data-id="${id}"]`);
    if (!r) return null;
    const rect = r.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return { x: rect.left - base.left + rect.width / 2, y: rect.top - base.top };
  };

  const mods = {};
  const ctx = {
    root, action, send,
    now: () => Date.now() + offset,
    anchor: (id) => (scene ? scene.screenPos(id) : nogl ? (mods.vote?.tagPos(id) ?? rowPos(id)) : null),
    faceOf: (id) => faces.get(id) ?? null,
    toast, nogl, limits: LIMITS,
  };

  const viewFor = (s) => cameraFor(s);
  mods.hud = createHud(ctx);
  mods.vote = createVote(ctx);
  mods.result = createResult(ctx);
  mods.role = createRole(ctx);
  mods.firstsays = createFirstSays(ctx);
  mods.emote = createEmote(ctx);
  mods.rules = createRules(ctx);
  mods.rank = createRank(ctx);
  mods.unmask = createUnmask(ctx, {
    onStage(st, info) {
      if (st === 'dark') scene?.setView({ mode: 'table' });
      else if (st === 'liar') {
        audio.play('liar');
        if (info?.id != null) scene?.setView({ mode: 'liar', id: info.id });   // CONTRACTS 6절
      } else if (st === 'end' && state) scene?.setView(viewFor(state));
    },
    onTick(big) { audio.play(big ? 'tickBig' : 'tick'); },
  });
  mods.settings = createSettings(ctx, { timeChoices: TIME_CHOICES, goalChoices: GOAL_CHOICES });
  lobbyBox.append(mods.settings.el);
  lobbyBox.hidden = true;

  const each = (fn) => { for (const m of Object.values(mods)) fn(m); };

  function syncScene(s) {
    if (!scene) return;
    scene.setPlayers(s.players, s.you);
    scene.setVotes?.(s.votes ?? null);
    scene.setJudge?.(s.judge?.picks ?? null);
    if (!mods.unmask.busy) scene.setView(viewFor(s));
  }

  async function loadScene() {
    try {
      const make = sceneFactory ?? (await import('./scene/index.js')).createLiarScene; // sceneFactory: 시험용
      if (disposed) return;
      scene = make();
      for (const [id, a] of faces) scene.setFace(id, a);
      stage.use(scene.scene, scene.camera);
      size = '';
      if (state) syncScene(state);
    } catch (err) {
      console.error(err);
    }
  }
  if (!nogl || sceneFactory) loadScene();

  function applyRoom(s) {
    if (!s) {
      state = null;
      prevPhase = null;
      root.hidden = true;
      lobbyBox.hidden = true;
      each((m) => m.update(null));
      chat.setLock(false);
      stage.use(null);
      scene?.setPlayers([], null);
      scene?.setVotes?.(null);
      scene?.setJudge?.(null);
      return;
    }
    if (typeof s.now === 'number') offset = s.now - Date.now();
    state = s;
    root.hidden = false;
    lobbyBox.hidden = s.phase !== 'lobby';
    each((m) => m.update(s));
    syncScene(s);
    const lock = chatLockFor(s);
    chat.setLock(lock.locked, lock.hint);
    if (prevPhase != null && prevPhase !== s.phase) {
      const snd = resultSound(s);
      if (snd) audio.play(snd);
    }
    prevPhase = s.phase;
  }

  function handleEvent(e) {
    if (!e) return;
    if (e.k === 'lgRank') { mods.rank?.event?.(e); return; }
    if (e.k === 'faces') {
      for (const f of e.items ?? []) { faces.set(f.id, f.avatar); scene?.setFace(f.id, f.avatar); }
      if (state) each((m) => m.update(state));
      return;
    }
    const snd = soundForEvent(e, state?.you);
    if (snd) audio.play(snd);
    const ev = e.k === 'chat' && (e.kind === 'talk' || e.kind === 'plea') ? { ...e, text: plainChat(e.text) } : e;
    each((m) => m.event?.(ev));
  }

  return {
    applyRoom,
    handleEvent,
    chatMsg: (text) => chatMsgFor(state, text),
    lobbyPanel(room) { if (room) mods.settings.update(room); return lobbyBox; },
    anchorOf: (id) => (root.hidden ? null : ctx.anchor(id)),
    frame(dt) {
      if (scene) {
        const k = `${innerWidth}x${innerHeight}`;
        if (k !== size) { size = k; scene.resize(innerWidth, innerHeight); }
        scene.frame(dt);
      }
      each((m) => m.frame?.(dt));
    },
    dispose() {
      disposed = true;
      removeEventListener('pointerdown', unlock, { capture: true });
      each((m) => m.dispose?.());
      audio.dispose();
      scene?.dispose();
      scene = null;
      lobbyBox.remove();
      root.remove();
      stage.use(null);
    },
  };
}
