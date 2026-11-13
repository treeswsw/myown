// 라이어게임 화면 모듈들을 하나로 묶는다. 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/COMMON-CONTRACT.md 4-2.
// 대기실(설정·참가자·시작·강퇴)·상단 줄(방 코드/소리/이모티콘/나가기)·머리 위 이모티콘·채팅 칸·소리 끄기·나가기 확인은 틀이 한다.
// 이 모듈은 게임 판(3D 장면, 역할·투표·결과·엔딩 화면)만 그린다. 방을 나가면(또는 다른 방으로 가면) 틀이 unmount 를 부르고,
// 그때 3D 장면·stage·리스너를 모두 정리한다(다른 게임 화면을 덮지 않게).
import './liar.css';
import './ui/hud.css';
import './ui/vote.css';
import './ui/result.css';
import './ui/role.css';
import './ui/firstsays.css';
import './ui/rules.css';
import './ui/rank.css';
import './anim/unmask.css';
import './anim/ending.css';
import { LIMITS } from '../../../shared/liar/constants.js';
import { cameraFor } from './scene/layout.js'; // three.js 를 가져오지 않는 순수 함수
import { createHud, chatLockFor } from './ui/hud.js';
import { createVote } from './ui/vote.js';
import { createResult } from './ui/result.js';
import { createRole } from './ui/role.js';
import { createFirstSays } from './ui/firstsays.js';
import { createRules } from './ui/rules.js';
import { createRank, createRankPart } from './ui/rank.js';
import { createUnmask } from './anim/unmask.js';
import { createEnding } from './anim/ending.js';
import { createAudio } from './audio.js';
import { chatMsgFor, plainChat, soundForEvent, resultSound, leaveNoteFor } from './pure.js';

export { chatMsgFor, plainChat, soundForEvent, resultSound, leaveNoteFor };

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

export function mount(ctx, opts = {}) {
  const { ui, stage, send, faces, clock, profile, sound } = ctx;
  const sceneFactory = opts.sceneFactory; // 시험용
  const nogl = !!stage?.nogl;
  const root = el('div', 'lg-root');
  const action = el('div', 'lg-action');
  root.append(action);
  ctx.root.append(root);

  let scene = null;
  let loading = null; // 3D 장면을 불러오는 중이면 그 약속
  let state = null;
  let prevPhase = null;
  let size = '';
  let disposed = false;
  let rankPart = null; // 대기실 칸 'lg-rank'(틀이 만들고 대기실을 걷을 때 dispose)
  const audio = createAudio(sound);
  sound.unlock?.();

  // 사진·꾸미기는 공용 프로필 부품 한 곳(ui/kit/avatar.js). 이 화면의 동그라미 칸에 꽉 채워 넣는다.
  const avatarKey = (p) => {
    const f = faces.get(p.id);
    return `${f.avatar ?? ''}|${JSON.stringify(f.look ?? null)}|${p.color ?? ''}|${(p.name ?? '').slice(0, 1)}`;
  };
  const avatar = (p, px = 32) => {
    const f = faces.get(p.id);
    const box = profile.playerAvatar({ id: p.id, name: p.name ?? '', face: f.avatar, look: f.look, size: px });
    box.classList.add('lg-av-fit');
    return box;
  };

  const mods = {};
  const lctx = {
    root, action, send,
    now: () => clock.now(),
    anchor: (id) => (scene ? scene.screenPos(id) : nogl ? (mods.vote?.tagPos(id) ?? null) : null),
    tagAnchor: (id) => (scene ? (scene.tagPos?.(id) ?? scene.screenPos(id)) : null),
    avatar, avatarKey,
    toast: ctx.toast, nogl, limits: LIMITS,
    toWait: () => ctx.toWait(),
  };

  const viewFor = (s) => cameraFor(s);
  mods.hud = createHud(lctx);
  mods.vote = createVote(lctx);
  mods.result = createResult(lctx);
  mods.role = createRole(lctx);
  mods.firstsays = createFirstSays(lctx);
  mods.rules = createRules(lctx);
  mods.rank = createRank(lctx);
  mods.unmask = createUnmask(lctx, {
    onStage(st, info) {
      if (st === 'dark') scene?.setView({ mode: 'table' });
      else if (st === 'liar') {
        audio.play('liar');
        if (info?.id != null) scene?.setView({ mode: 'liar', id: info.id });   // CONTRACTS 6절
      } else if (st === 'end' && state && state.phase !== 'guess' && state.phase !== 'answer') {
        scene?.setView(viewFor(state)); // guess·answer 는 엔딩이 이어받는다(spot 그대로, 테이블로 돌리지 않는다: 깜빡임 방지)
      }
    },
    onTick(big) { audio.play(big ? 'tickBig' : 'tick'); },
  });
  // 엔딩(답 입력 + 정답 공개): 3D 에서만 라이어 머리 자리(anchor)를 준다. nogl 은 null 이라 카드 위에 말풍선이 붙는다.
  const endCtx = { ...lctx, anchor: (id) => (scene ? scene.screenPos(id) : null) };
  mods.ending = createEnding(endCtx, {
    onStage(st, info) {
      if (st === 'verdict') audio.play(info?.correct ? 'guessOk' : 'guessNo');
      // 'end' 에서는 카메라를 건드리지 않는다. 결과 단계로 넘어가면 syncScene 이 테이블로 돌린다.
    },
    onTick(big) { audio.play(big ? 'tickBig' : 'tick'); },
  });

  const each = (fn) => { for (const m of Object.values(mods)) fn(m); };

  function syncFaces() {
    if (!scene) return;
    for (const p of state?.players ?? []) scene.setFace(p.id, faces.get(p.id).avatar);
  }

  function syncScene(s) {
    if (!scene) return;
    scene.setPlayers(s.players, s.you);
    scene.setVotes?.(s.votes ?? null);
    scene.setJudge?.(s.judge?.picks ?? null);
    if (!mods.unmask.busy) scene.setView(viewFor(s));
  }

  async function loadScene() {
    try {
      const make = sceneFactory ?? (await import('./scene/index.js')).createLiarScene;
      if (disposed) return; // 불러오는 사이에 방을 나갔다: 장면을 만들지 않는다
      scene = make();
      stage.use(scene.scene, scene.camera);
      size = '';
      if (state) { syncScene(state); syncFaces(); }
    } catch (err) {
      console.error(err);
    }
  }
  if (!nogl || sceneFactory) loading = loadScene();

  // 사진·꾸미기가 새로 왔다: 사진이 있는 화면들만 다시 그린다
  const offFaces = faces.onChange(() => {
    if (!state) return;
    syncFaces();
    mods.vote.update(state);
    mods.firstsays.update(state);
  });

  // 캔버스(마네킹) 누르기 -> 투표 지목
  const onCanvasClick = (e) => {
    if (e.target?.tagName !== 'CANVAS' || !scene?.pick) return;
    if (state?.phase !== 'discuss' && state?.phase !== 'revote') return;
    const id = scene.pick(e.clientX, e.clientY);
    if (id) mods.vote?.pick?.(id);
  };
  document.addEventListener('click', onCanvasClick);

  return {
    room(s) {
      if (disposed) return;
      if (!s) { // 틀은 부르지 않지만(방을 나가면 unmount) 시험이 화면을 비울 때 쓴다
        state = null;
        prevPhase = null;
        root.hidden = true;
        root.dataset.ed = '';
        each((m) => m.update(null));
        scene?.setPlayers([], null);
        scene?.setVotes?.(null);
        scene?.setJudge?.(null);
        return;
      }
      root.hidden = false;
      state = s;
      // 답 입력·정답 공개 동안: 가운데 큰 글을 가리지 않게 규칙·첫 발언 버튼을 숨긴다 (ending.css)
      root.dataset.ed = s.phase === 'guess' || s.phase === 'answer' ? '1' : '';
      each((m) => m.update(s));
      syncScene(s);
      syncFaces();
      if (prevPhase != null && prevPhase !== s.phase) {
        const snd = resultSound(s);
        if (snd) audio.play(snd);
      }
      prevPhase = s.phase;
    },

    event(e) {
      if (!e || disposed) return;
      if (e.k === 'lgRank') { mods.rank?.event?.(e); rankPart?.event(e); return; }
      if (e.k === 'faces') return; // 틀의 faces 가 받아 onChange 로 알려 준다
      const snd = soundForEvent(e, state?.you);
      if (snd) audio.play(snd);
      const ev = e.k === 'chat' && (e.kind === 'talk' || e.kind === 'plea') ? { ...e, text: plainChat(e.text) } : e;
      each((m) => m.event?.(ev));
    },

    // 채팅 칸 규칙(COMMON-CONTRACT 4-4): 80자, 단계별 잠금, 내 설명 차례면 say, 설명·변론은 말풍선 없이 큰 글로만.
    // 내 입력 차례(첫 설명·최후 변론)에는 입력 줄을 열어 둔다(input, 차례가 끝나면 틀이 닫는다)
    chatRule: {
      maxLen: LIMITS.chat,
      lock: (s) => chatLockFor(s),
      input: (s) => Boolean(s) && Boolean(chatLockFor(s).hot),
      route: (text) => chatMsgFor(state, text),
      bubble: (e) => e.kind !== 'say' && e.kind !== 'plea',
    },

    // 대기실 칸: 'lg-rank' = 전체 랭킹 버튼(shared/liar/settings.js 의 custom 줄)
    waitPart(name) {
      if (name !== 'lg-rank') return null;
      const part = createRankPart({ send, modal: ctx.modal });
      const dispose = part.dispose;
      part.dispose = () => { dispose(); if (rankPart === part) rankPart = null; };
      rankPart = part;
      return part;
    },

    // 판 도중(참가자)이면 안내. 대기·결과·구경은 null (결과는 틀이 확인 없이 나간다)
    leaveNote: (s) => leaveNoteFor(s),

    anchorOf: (id) => (root.hidden ? null : lctx.anchor(id)),

    frame(dt) {
      if (disposed) return;
      if (scene) {
        const k = `${innerWidth}x${innerHeight}`;
        if (k !== size) { size = k; scene.resize(innerWidth, innerHeight); }
        scene.frame(dt);
      }
      each((m) => m.frame?.(dt));
    },

    // 방을 나갔거나 다른 게임으로 간다: 3D 장면·stage·리스너·소리·화면 요소를 전부 정리한다.
    // 틀은 이 약속(promise)이 끝난 뒤에야 다음 게임을 mount 한다.
    async unmount() {
      disposed = true;
      offFaces();
      document.removeEventListener('click', onCanvasClick);
      try { await loading; } catch { /* 장면을 못 불러왔어도 정리는 계속 */ }
      each((m) => { try { m.dispose?.(); } catch (e) { console.error(e); } });
      audio.dispose();
      try { scene?.dispose(); } catch (e) { console.error(e); }
      scene = null;
      try { stage?.use?.(null); } catch { /* 장면은 이미 없다 */ }
      root.remove();
    },
  };
}
