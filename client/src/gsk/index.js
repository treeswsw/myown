// mountGsk: 갱스껄 화면 입구. 모듈(탁자·손·벌칙/결과·대기·연출)을 GDD 16절 약속대로 조립한다.
//   const gsk = mountGsk({ ui, send, getMe?, toast?, leave?, openEmote? });
//   gsk.room(state) / gsk.update(state)   방 상태(GDD 9-2)가 올 때마다. 방을 나가면 null.
//   gsk.event(e)      event.e 하나(faces, gkFlip, gkPlace, gkReveal ... 사이트 공통 이벤트는 main.js 가 먼저 가려 준다).
//   gsk.error(err)    {code, msg}. toast 가 있으면 보여 준다.
//   gsk.dispose()     화면을 걷어낸다.
//
// 화면 구성: .gk-root(나무 바닥 + 비네팅) > .gk-stage(시안 크기 상자를 창 크기에 맞게 scale) > 모듈들.
// 모듈 약속: createXxx(parent, ctx) → { el, update(view), event(e), dispose() }.
//   ctx = { send, meId(), now(), face(id), layout()('pc'|'phone'), anchor(kind, id), fx, busy(), stage, scale() }
//   anchor(kind, id) → DOM 요소 | null
//     'mat'(id=자리 주인) 개인판 · 'stack'(id) 더미 맨 위 칸 · 'tag'(id) 이름표 · 'center' 가운데 덩어리
//     'row' 펼친 줄 틀 · 'rowSlot'(id=0부터 센 칸 번호, 줄 왼쪽·윗줄부터) · 'handDock' 손이 접혀 있을 때 놓이는 자리
//   view = toView(state, meId) + { hold, outcome, penalty, progress(flip·reveal·penalty 동안 {flipped, need}) }
//   view.hold = { shown: { [id]: 감출 공개 원판 수 }, row: 감출 펼친 줄 칸 수 }  (연출이 끝나면 줄어든다)
// 비밀: 이 화면은 서버가 준 값만 그린다. 남의 원판 종류를 추측하지 않는다.
import './gsk.css';
import { toView } from './model.js';
import { floorUrl, preload } from './art.js';
import { createTable } from './ui/table.js';
import { LAYOUTS, layoutFor } from './ui/table.pure.js';
import { createHand } from './ui/hand.js';
import { createResult } from './ui/result.js';
import { createWait } from './ui/wait.js';
import { createFx } from './anim/fx.js';

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
const IMG = /^data:image\/(jpeg|png|webp);base64,/;
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap';
const FLOW_TIMEOUT = 9000; // 연출이 끝났다고 알려 주지 않아도 이 시간 뒤에는 보여 주기 지연을 푼다
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p), sleep(ms)]);

let current = null;

export function mountGsk(opts) {
  current?.dispose();
  const inst = mountInner(opts);
  const d = inst.dispose;
  inst.dispose = () => { if (current === inst) current = null; d(); };
  current = inst;
  return inst;
}

function ensureFonts() {
  if (typeof document === 'undefined' || document.getElementById('gk-fonts')) return;
  const l = el('link');
  l.id = 'gk-fonts';
  l.rel = 'stylesheet';
  l.href = FONT_HREF;
  document.head.append(l);
}

function mountInner({ ui, send, getMe, toast, leave }) {
  ensureFonts();
  const root = el('div', 'gk-root');
  root.style.backgroundImage = `url(${floorUrl()})`;
  root.hidden = true;
  const vig = el('div', 'gk-vig');
  const stage = el('div', 'gk-stage');
  root.append(vig, stage);
  ui.append(root);

  let state = null;
  let offset = 0;
  let disposed = false;
  let lay = layoutFor(window.innerHeight);
  let scale = 1;
  const faces = new Map();

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
    face: (id) => faces.get(id) || null,
    layout: () => lay,
    anchor: (kind, id) => mods.table?.anchor(kind, id) || null,
    fx: null,
    busy: () => pending > 0 || !!(ctx.fx && ctx.fx.busy && ctx.fx.busy()),
    stage,
    scale: () => scale,
  };
  if (leave) ctx.leave = leave;

  const mods = {};
  mods.table = createTable(stage, ctx);
  mods.fx = createFx(stage, ctx);
  ctx.fx = mods.fx;
  mods.hand = createHand(stage, ctx);
  mods.result = createResult(stage, ctx);
  mods.wait = createWait(stage, ctx);

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
    if (!v) { root.hidden = true; return; }
    root.hidden = false;
    safe('table', () => mods.table.update(v));
    safe('wait', () => mods.wait.update(v));
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

  return {
    room(s) {
      if (disposed) return;
      state = s || null;
      if (state && typeof state.now === 'number') offset = state.now - Date.now();
      if (!state) {
        clearHold();
        root.hidden = true;
        for (const name of ['table', 'wait', 'hand', 'fx', 'result']) safe(name, () => mods[name].update(null));
        return;
      }
      if (state.step === 'setup' || state.phase !== 'playing') clearHold();
      draw();
    },
    update(s) { this.room(s); },
    event(e) {
      if (disposed || !e) return;
      if (e.k === 'faces' && Array.isArray(e.items)) {
        for (const f of e.items) {
          if (f && typeof f.id === 'string') {
            if (typeof f.avatar === 'string' && IMG.test(f.avatar)) faces.set(f.id, f.avatar);
            else faces.delete(f.id);
          }
        }
        if (state) draw();
        return;
      }
      if (e.k === 'gkFlip') onFlip(e);
      else if (e.k === 'gkReveal') enqueue(() => withTimeout(mods.fx.reveal(e, { view: viewNow(), need: state?.bid?.n ?? state?.need }), FLOW_TIMEOUT));
      else if (e.k === 'gkPlace' && e.id !== meId()) {
        Promise.resolve().then(() => mods.fx.place(e)).catch((err) => console.error('gsk fx', err));
      } else if (e.k === 'gkStart' || e.k === 'gkRound' || e.k === 'gkVoid') clearHold();
      // gkReveal 은 위에서 줄 세워 한 번만 돌린다(fx.event 로 또 보내지 않는다)
      for (const name of ['table', 'hand', 'result', 'wait']) safe(name, () => mods[name].event(e));
    },
    error(err) {
      if (disposed || !err) return;
      toast?.(err.msg || '오류');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
      for (const name of ['fx', 'table', 'hand', 'result', 'wait']) safe(name, () => mods[name].dispose());
      root.remove();
    },
  };
}
