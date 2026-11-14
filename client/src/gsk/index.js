// 갱스껄 화면 모듈. 공통 방 틀(client/src/room/frame.js)이 mount(ctx) 로 불러 쓴다. 약속: docs/COMMON-CONTRACT.md 4-2, GDD 16절.
// 대기실(참가자·시작·나가기·채팅)·상단 줄(방 코드/소리/이모티콘/나가기)·이모티콘/사진/말풍선·나가기 확인·소리 끄기는 틀이 한다.
// 이 모듈은 게임 판(탁자·손·벌칙·연출)과 공통 결과 화면 제목만 그리고, 대기실 개인 칸 하나(waitPart 'gk-color': 내 색 고르기)를 내준다.
//
//   const game = mount(ctx);
//   game.room(state)     방 상태(GDD 9-2)가 올 때마다(대기 중에도).
//   game.event(e)        event.e 하나(gkFlip, gkPlace, gkReveal ... 사이트 공통 이벤트는 틀이 먼저 처리한다).
//   game.anchorOf(id)    말풍선·이모티콘 자리(이름표 위, 없으면 개인판 위)
//   game.leaveNote(s)    나가기 확인 글(판 중 참가자일 때 기권 안내)
//   game.holdWait() · resultTitle(s)  공통 결과 화면(연출 뒤에, 제목)
//   game.waitPart(name)  대기실 커스텀 칸
//   game.unmount()       화면을 걷어낸다.
//
// 화면 구성: .gk-root(나무 바닥 + 비네팅) > .gk-stage(시안 크기 상자를 창 크기에 맞게 scale) > 모듈들.
// 모듈 약속: createXxx(parent, ctx) → { el, update(view), event(e), dispose() }.
//   ctx = { send, meId(), now(), face(id), look(id), who(id), layout()('pc'|'phone'), anchor(kind, id), fx, busy(), stage, scale() }
//   anchor(kind, id) → DOM 요소 | null
//     'mat'(id=자리 주인) 개인판 · 'stack'(id) 더미 맨 위 칸 · 'tag'(id) 이름표 · 'center' 가운데 덩어리
//     'row' 펼친 줄 틀 · 'rowSlot'(id=0부터 센 칸 번호, 줄 왼쪽·윗줄부터) · 'handDock' 손이 접혀 있을 때 놓이는 자리
//   view = toView(state, meId) + { hold, outcome, penalty, progress(flip·reveal·penalty 동안 {flipped, need}) }
//   view.hold = { shown: { [id]: 감출 공개 원판 수 }, row: 감출 펼친 줄 칸 수 }  (연출이 끝나면 줄어든다)
// 비밀: 이 화면은 서버가 준 값만 그린다. 남의 원판 종류를 추측하지 않는다.
import './gsk.css';
import { toView } from './model.js';
import { floorUrl, preload } from './art.js';
import { gskLook } from './face.js';
import { createTable } from './ui/table.js';
import { LAYOUTS, layoutFor } from './ui/table.pure.js';
import { createHand } from './ui/hand.js';
import { createResult } from './ui/result.js';
import { winnerInfo, winCaption } from './ui/result.pure.js';
import { createColorPart } from './ui/wait.js';
import { createFx } from './anim/fx.js';

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap';
const FLOW_TIMEOUT = 9000; // 연출이 끝났다고 알려 주지 않아도 이 시간 뒤에는 보여 주기 지연을 푼다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), sleep(ms)]);

function ensureFonts() {
  if (typeof document === 'undefined' || document.getElementById('gk-fonts')) return;
  const l = el('link');
  l.id = 'gk-fonts';
  l.rel = 'stylesheet';
  l.href = FONT_HREF;
  document.head.append(l);
}

export function mount({ root: host, send, me: getMe, faces, ready }) {
  ensureFonts();
  const root = el('div', 'gk-root');
  root.style.backgroundImage = `url(${floorUrl()})`;
  root.hidden = true;
  const vig = el('div', 'gk-vig');
  const stage = el('div', 'gk-stage');
  root.append(vig, stage);
  host.append(root);

  let state = null;
  let offset = 0;
  let disposed = false;
  let lay = layoutFor(window.innerHeight);
  let scale = 1;

  // ---- 보여 주기 지연(hold)과 연출 줄 세우기 ----
  const holdShown = {};
  let holdRow = 0;
  let pending = 0;
  let chain = Promise.resolve();
  let deferred = false; // 연출 때문에 벌칙·결과 화면 갱신을 미뤘는가

  const meId = () => state?.you ?? getMe?.()?.id ?? null;
  const ctx = {
    send: (m) => { if (!disposed && m) send(m); },
    meId,
    now: () => Date.now() + offset,
    face: (id) => faces.get(id)?.avatar || null,
    look: (id) => gskLook(faces.get(id)?.look), // 겉모습(모자 제외) — 신원 정보일 뿐
    who: (id) => ({ id, name: '', face: ctx.face(id), look: ctx.look(id) }),
    layout: () => lay,
    anchor: (kind, id) => mods.table?.anchor(kind, id) || null,
    fx: null,
    busy: () => pending > 0 || !!(ctx.fx && ctx.fx.busy && ctx.fx.busy()),
    stage,
    scale: () => scale,
  };

  const mods = {};
  mods.table = createTable(stage, ctx);
  mods.fx = createFx(stage, ctx);
  ctx.fx = mods.fx;
  mods.hand = createHand(stage, ctx);
  mods.result = createResult(stage, ctx);

  const safe = (name, fn) => {
    try { fn(); } catch (e) { console.error(`gsk ${name}`, e); }
  };

  function fit() {
    lay = layoutFor(window.innerHeight);
    const L = LAYOUTS[lay];
    scale = Math.max(0.2, Math.min(2, Math.min(window.innerWidth / L.W, window.innerHeight / L.H)));
    stage.dataset.lay = lay;
    stage.style.setProperty('--gk-s', String(scale));
  }
  fit();

  function viewNow() {
    const v = toView(state, meId());
    if (!v) return null;
    v.hold = { shown: { ...holdShown }, row: holdRow };
    return v;
  }

  function draw() {
    if (disposed) return;
    const v = viewNow();
    if (!v || v.phase === 'lobby') { // 대기실은 공통 틀이 그린다
      root.hidden = true;
      if (v) for (const name of ['table', 'hand', 'fx', 'result']) safe(name, () => mods[name].update(null));
      return;
    }
    root.hidden = false;
    safe('table', () => mods.table.update(v));
    safe('hand', () => mods.hand.update(v));
    safe('fx', () => mods.fx.update(v));
    // 판정·벌칙·결과 화면은 앞 연출이 끝난 뒤에 띄운다
    if (ctx.busy()) deferred = true;
    else { deferred = false; safe('result', () => mods.result.update(v)); }
  }

  function enqueue(run) {
    pending++;
    chain = chain
      .then(run)
      .catch((e) => console.error('gsk fx', e))
      .then(() => {
        pending--;
        if (disposed) return;
        if (pending === 0 || deferred) draw();
        if (pending === 0) ready(); // 연출이 끝났다: 틀이 공통 결과 화면을 띄운다(holdWait)
      });
  }

  function onFlip(e) {
    const p = e.p;
    const flower = e.disc === 'F';
    holdShown[p] = (holdShown[p] | 0) + 1;
    if (flower) holdRow++;
    enqueue(async () => {
      await sleep(50); // 이벤트가 상태보다 먼저 오므로, 상태가 그려진 뒤에 연출이 자리를 잰다
      try {
        await withTimeout(mods.fx.flip(e, { view: viewNow(), need: state?.need, flipped: e.flipped }), FLOW_TIMEOUT);
      } finally {
        holdShown[p] = Math.max(0, (holdShown[p] | 0) - 1);
        if (!holdShown[p]) delete holdShown[p];
        if (flower) holdRow = Math.max(0, holdRow - 1);
        if (!disposed) draw();
      }
    });
  }

  function clearHold() {
    for (const k of Object.keys(holdShown)) delete holdShown[k];
    holdRow = 0;
  }

  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);
  function onResize() {
    if (disposed) return;
    const before = lay;
    fit();
    if (before !== lay) draw();
  }

  preload();

  // 사진·꾸미기가 새로 왔다: 이름표·결과의 사진만 다시 그린다
  const offFaces = faces.onChange(() => { if (state && !disposed) draw(); });

  // 말풍선·이모티콘 자리: 이름표 위(없으면 개인판 위). 공개 연출 중에도 같은 자리다.
  function anchorOf(id) {
    if (disposed || root.hidden) return null;
    const node = mods.table.anchor('tag', id) || mods.table.anchor('mat', id);
    if (!node || !node.isConnected) return null;
    const r = node.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + 4 } : null;
  }

  return {
    room(s) {
      if (disposed) return;
      state = s || null;
      if (state && typeof state.now === 'number') offset = state.now - Date.now();
      if (!state) {
        clearHold();
        root.hidden = true;
        for (const name of ['table', 'hand', 'fx', 'result']) safe(name, () => mods[name].update(null));
        return;
      }
      if (state.step === 'setup' || state.phase !== 'playing') clearHold();
      draw();
    },
    event(e) {
      if (disposed || !e) return;
      if (e.k === 'gkFlip') onFlip(e);
      else if (e.k === 'gkReveal') enqueue(() => withTimeout(mods.fx.reveal(e, { view: viewNow(), need: state?.bid?.n ?? state?.need }), FLOW_TIMEOUT));
      else if (e.k === 'gkPlace' && e.id !== meId()) {
        Promise.resolve().then(() => mods.fx.place(e)).catch((err) => console.error('gsk fx', err));
      } else if (e.k === 'gkStart' || e.k === 'gkRound' || e.k === 'gkVoid') clearHold();
      // gkReveal 은 위에서 줄 세워 한 번만 돌린다(fx.event 로 또 보내지 않는다)
      for (const name of ['table', 'hand', 'result']) safe(name, () => mods[name].event(e));
    },
    anchorOf,
    // 판이 진행 중이고 내가 탈락하지 않은 참가자면 기권 안내. 아니면 null(결과 화면은 확인 없이, 관전은 기본 확인)
    leaveNote(s) {
      const mine = s?.phase === 'playing' && (s.seats ?? []).find((x) => x.id === s.you);
      return mine && !mine.out ? '나가면 기권 처리돼요' : null;
    },
    // 공개·승리 연출이 도는 동안은 공통 결과 화면을 미룬다
    holdWait: () => ctx.busy(),
    resultTitle(s) {
      const w = winnerInfo(s);
      return w ? { title: w.id ? `${w.name} 승리` : '판 끝', sub: winCaption(w) } : null;
    },
    waitPart(name) {
      return name === 'gk-color' ? createColorPart({ send: ctx.send }) : null;
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      offFaces();
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
      for (const name of ['fx', 'table', 'hand', 'result']) safe(name, () => mods[name].dispose());
      root.remove();
    },
  };
}
