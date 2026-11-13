// 그림판 입구 (GDD 6, 10-5, 11-2). createBoard(parent, ctx) → { el, update, event, dispose, local, stop }
//   local(a)  a='undo'|'redo'|'clear' : 그리는 사람 자신의 되돌리기 등을 내 화면에 즉시 반영. 도구 칸이 send 직전에 부른다
//             (긋는 중이면 그 선을 먼저 끝내 보내므로, 반드시 send 보다 먼저).
//   stop()    : 긋던 선을 멈춘다(dr_canvas_full 오류를 받았을 때 index.js 가 부른다. drSync 는 event 가 알아서 처리).
//   history   : { get() → {canUndo, canRedo}, on(fn) → off }  내 로컬 그림 상태 기준(긋는 중이면 canRedo false). 바뀔 때만 fn({canUndo,canRedo}) 호출.
// ctx: { send, meId, now, layout, tool:{get()}, onFull?() }  — onFull 은 내 화면에서 한도가 찼을 때 선택적으로 불린다.
import { MAX_NUMS_PER_MSG, SEND_INTERVAL_MS, SMOOTH_FINGER, SMOOTH_PEN } from '../../../../shared/draw/constants.js';
import {
  createDrawing, apply, st as opSt, pt as opPt, cx as opCx, rm as opRm, undo as opUndo, redo as opRedo, clear as opClear,
  visibleStrokes, importSync, absPoints, canUndo, canRedo,
} from '../../../../shared/draw/ops.js';
import { createRenderer, absOf } from './render.js';
import { createInput } from './input.js';
import {
  fitBox, toLogical, smoothToward, farEnough, planMessages, planRm, appendAbs, strokeHit, bbox,
} from './pure.js';

const boxCache = new WeakMap();
const boxOf = (p, a) => { let b = boxCache.get(p); if (!b) { b = bbox(a); boxCache.set(p, b); } return b; };

export function createBoard(parent, ctx) {
  const el = document.createElement('div');
  el.className = 'dr-cv-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'dr-cv-paper';
  el.appendChild(canvas);
  parent.appendChild(el);
  const rd = createRenderer(canvas);

  let state = createDrawing();
  let synced = false; // drSync 또는 drNew 를 받기 전의 그림 이벤트는 버린다 (10-5 재접속 순서)
  let canDraw = false;
  let live = null; // 받는 쪽: { c,w,e, a:[abs...], shown, done }
  let raf = 0;
  let g = null; // 내가 긋는 중인 한 번의 누름
  let size = { w: 0, h: 0 };

  const sendDr = (a, body) => ctx.send({ t: 'dr', a, ...body });

  // ---- 되돌리기 상태 알림 ----
  const listeners = new Set();
  let hist = { canUndo: false, canRedo: false };
  const histNow = () => ({ canUndo: canUndo(state), canRedo: !state.cur && canRedo(state) });
  function notify() {
    const h = histNow();
    if (h.canUndo === hist.canUndo && h.canRedo === hist.canRedo) return;
    hist = h;
    for (const fn of [...listeners]) { try { fn({ ...h }); } catch (_) { /* 무시 */ } }
  }
  const history = {
    get: () => histNow(),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  // ---- 다시 그리기 ----
  function fullRedraw() {
    notify();
    if (!size.w) return;
    const strokes = visibleStrokes(state);
    rd.drawAll(strokes);
    live = null;
    if (state.cur && !(g && !g.dead && g.mode !== 'strokeErase')) {
      const a = absPoints(state.cur.p);
      live = { c: state.cur.c, w: state.cur.w, e: state.cur.e, a, shown: a.length >> 1, done: false };
    }
    if (g && g.cur) g.drawn = state.cur ? state.cur.p.length >> 1 : 0;
  }

  // ---- 받는 쪽 이어 그리기: 한 묶음을 2~3 화면 갱신에 나눠 ----
  function kick() { if (!raf && live) raf = requestAnimationFrame(tick); }
  function tick() {
    raf = 0;
    if (!live) return;
    const n = live.a.length >> 1;
    if (live.shown < n) {
      const next = Math.min(n, live.shown + Math.max(1, Math.ceil((n - live.shown) / 3)));
      rd.drawGrowth(live, live.a, live.shown, next);
      live.shown = next;
    }
    if (live.shown >= n && live.done) { live = null; return; }
    if (live.shown < n) raf = requestAnimationFrame(tick);
  }
  function flushLive() { // 남은 점을 한꺼번에 그린다
    if (!live) return;
    const n = live.a.length >> 1;
    rd.drawGrowth(live, live.a, live.shown, n);
    live = null;
  }

  // ---- 내가 긋기 ----
  function endTimer() { if (g && g.timer) { clearInterval(g.timer); g.timer = 0; } }

  function flushPen(final) {
    if (!g || g.mode === 'strokeErase') return;
    if (g.sendOff) { g.q = []; return; }
    const msgs = planMessages(g.q, g.lastSent, final);
    for (const m of msgs) {
      if (m.kind === 'st') sendDr('st', { c: g.c, w: g.w, e: g.e, p: m.p });
      else sendDr('pt', m.f ? { p: m.p, f: 1 } : { p: m.p });
    }
    if (g.q.length) g.lastSent = g.q[g.q.length - 1];
    g.q = [];
  }

  function flushRm() {
    if (!g || g.mode !== 'strokeErase' || !g.rmQueue.length) return;
    for (const m of planRm(g.rmQueue, g.rmSent)) sendDr('rm', m);
    g.rmSent = true;
    g.rmQueue = [];
  }

  function flush(final) { if (g.mode === 'strokeErase') flushRm(); else flushPen(final); }

  function finishGesture() {
    if (!g) return;
    endTimer();
    if (g.mode !== 'strokeErase' && !g.dead) {
      flush(true);
      opPt(state, { p: [], f: 1 }); // 내 상태도 선 끝
      notify();
    } else if (g.mode === 'strokeErase') flushRm();
    g = null;
  }

  // 멈춤: 서버에 알릴지(tell) 여부. 손바닥/취소는 cx, 강제 중단은 알리지 않음.
  function cancelGesture(tell) {
    if (!g) return;
    endTimer();
    const was = g;
    g = null;
    if (was.mode === 'strokeErase') {
      if (tell) { g = was; flushRm(); g = null; }
      return;
    }
    const hadCur = !!state.cur;
    opCx(state);
    notify();
    if (tell && was.lastSent && !was.sendOff) sendDr('cx', {}); // 서버가 이미 st 를 받았을 때만
    if (hadCur) fullRedraw();
  }

  function hitErase(ax, ay, bx, by) {
    const hits = [];
    for (const s of visibleStrokes(state, { cur: false })) {
      if (s.e !== 0 || s.id === null) continue;
      const a = absOf(s.p);
      if (strokeHit(a, s.w, ax, ay, bx, by, boxOf(s.p, a))) hits.push(s.id);
    }
    return hits;
  }

  function eraseSegment(ax, ay, bx, by) {
    const ids = hitErase(ax, ay, bx, by);
    let changed = false;
    for (const id of ids) {
      const r = opRm(state, g.rmLocal ? { ids: [id], g: 1 } : { ids: [id] });
      if (r.ok && !r.noop) { g.rmLocal = true; g.rmQueue.push(id); changed = true; }
    }
    if (changed) fullRedraw();
  }

  const input = createInput(canvas, {
    enabled: () => canDraw,
    down(cx, cy, type) {
      const t = (ctx.tool && ctx.tool.get && ctx.tool.get()) || { tool: 'pen', color: 0, penW: 10, eraseW: 24 };
      const rect = canvas.getBoundingClientRect();
      const p = toLogical(cx, cy, rect);
      g = {
        mode: t.tool, rect, k: type === 'touch' ? SMOOTH_FINGER : SMOOTH_PEN,
        last: p, q: [], lastSent: null, timer: 0, dead: false, sendOff: false,
        cur: false, drawn: 0, rmLocal: false, rmSent: false, rmQueue: [],
      };
      if (t.tool === 'strokeErase') {
        eraseSegment(p.x, p.y, p.x, p.y);
      } else {
        g.e = t.tool === 'erase' ? 1 : 0;
        g.c = g.e ? 0 : t.color | 0;
        g.w = g.e ? t.eraseW | 0 : t.penW | 0;
        const r = opSt(state, { c: g.c, w: g.w, e: g.e, p: [p.x, p.y] });
        if (!r.ok) {
          // 내 화면에서 한도 초과: 서버가 오류 글을 줄 수 있게 st 만 보내고 이 선은 그리지 않는다
          if (r.error === 'full') { sendDr('st', { c: g.c, w: g.w, e: g.e, p: [p.x, p.y] }); if (ctx.onFull) ctx.onFull(); }
          g.dead = true;
          g.sendOff = true;
          fullRedraw();
          return true;
        }
        g.cur = true;
        notify();
        g.q.push(p);
        g.drawn = 1;
        flushLive();
        rd.drawGrowth(g, absPoints(state.cur.p), 0, 1);
      }
      g.timer = setInterval(() => { if (g) flush(false); }, SEND_INTERVAL_MS);
      return true;
    },
    move(list) {
      if (!g || g.dead) return;
      if (g.mode === 'strokeErase') {
        for (const raw of list) {
          const p = toLogical(raw.x, raw.y, g.rect);
          eraseSegment(g.last.x, g.last.y, p.x, p.y);
          g.last = p;
        }
        return;
      }
      for (const raw of list) {
        const sm = smoothToward(g.last, toLogical(raw.x, raw.y, g.rect), g.k);
        if (!farEnough(g.last, sm)) continue;
        const r = opPt(state, { p: [sm.x - g.last.x, sm.y - g.last.y] });
        if (!r.ok) { // 한도 초과 등: 이 선은 버린다
          g.dead = true;
          endTimer();
          sendDr('cx', {});
          if (r.error === 'full' && ctx.onFull) ctx.onFull();
          fullRedraw();
          return;
        }
        g.last = sm;
        g.q.push(sm);
      }
      if (state.cur) { // 입력 처리 안에서 바로 그린다
        const a = absPoints(state.cur.p);
        const n = a.length >> 1;
        rd.drawGrowth(g, a, g.drawn, n);
        g.drawn = n;
      }
    },
    up() { finishGesture(); },
    cancel() { cancelGesture(true); },
  });

  // ---- 바깥에서 부르는 것 ----
  function local(a) {
    if (g) { input.release(); finishGesture(); } // 긋던 선을 먼저 끝내 보낸다(send 보다 앞서야 서버 순서가 맞다)
    const fn = a === 'undo' ? opUndo : a === 'redo' ? opRedo : a === 'clear' ? opClear : null;
    if (!fn) return;
    const r = fn(state);
    if (r.ok && !r.noop) fullRedraw();
  }

  function stop() {
    if (!g) return;
    input.release();
    cancelGesture(false);
    fullRedraw();
  }

  function update(s) {
    const was = canDraw;
    canDraw = !!(s && s.phase === 'draw' && s.drawerId && s.drawerId === ctx.meId());
    if (was && !canDraw && g) { input.release(); cancelGesture(false); }
  }

  function event(e) {
    if (!e) return;
    if (e.k === 'drSync') {
      const r = importSync(e);
      if (!r.ok) return;
      if (g) { input.release(); cancelGesture(false); }
      state = r.state;
      synced = true;
      fullRedraw();
      kick();
      return;
    }
    if (e.k === 'drNew') {
      if (g) { input.release(); cancelGesture(false); }
      state = createDrawing();
      synced = true;
      fullRedraw();
      return;
    }
    if (!synced || canDraw) return; // sync 전 이벤트는 버림. 내가 그리는 사람이면 서버가 보내지 않으니 무시
    if (e.k === 'drSt') {
      flushLive();
      const r = apply(state, e);
      if (!r.ok) { fullRedraw(); return; }
      live = { c: e.c, w: e.w, e: e.e, a: absPoints(e.p), shown: 0, done: false };
      kick();
    } else if (e.k === 'drPt') {
      const r = apply(state, e);
      if (!r.ok || (r.event && r.event.k === 'drCx')) { fullRedraw(); return; }
      if (live) { appendAbs(live.a, e.p); if (e.f === 1) live.done = true; kick(); } else fullRedraw();
    } else if (e.k === 'drCx' || e.k === 'drRm' || e.k === 'drUndo' || e.k === 'drRedo' || e.k === 'drClear') {
      apply(state, e);
      fullRedraw();
    }
  }

  // ---- 크기 ----
  function layout() {
    const b = fitBox(el.clientWidth, el.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    if (b.w === size.w && b.h === size.h && dpr === layout.dpr) return;
    layout.dpr = dpr;
    size = b;
    if (!b.w) return;
    rd.resize(b.w, b.h, dpr);
    fullRedraw();
  }
  layout.dpr = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  if (ro) ro.observe(el);
  layout();
  if (size.w) rd.paper();

  function dispose() {
    if (ro) ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    endTimer();
    input.dispose();
    el.remove();
  }

  return { el, update, event, dispose, local, stop, history };
}
