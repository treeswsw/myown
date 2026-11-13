// 그림판 입구 (GDD 6, 10-5, 11-2). createBoard(parent, ctx) → { el, update, event, dispose, local, stop, history, snapshot }
//   local(a)  a='undo'|'redo'|'clear' : 그리는 사람 자신의 되돌리기 등을 내 화면에 즉시 반영. 도구 칸이 send 직전에 부른다
//             (긋는 중이면 그 선을 먼저 끝내 보내므로, 반드시 send 보다 먼저).
//   stop()    : 긋던 선을 멈춘다(dr_canvas_full 오류를 받았을 때 index.js 가 부른다. drSync 는 event 가 알아서 처리).
//   history   : { get() → {canUndo, canRedo}, on(fn) → off }  내 로컬 그림 상태 기준(긋는 중이면 canRedo false). 바뀔 때만 fn({canUndo,canRedo}) 호출.
// ctx: { send, meId, now, layout, tool:{get()}, onFull?(), clock?() }  — onFull 은 내 화면에서 한도가 찼을 때 선택적으로 불린다. clock 은 보내기 한도용 시계(ms, 없으면 performance.now).
import { SEND_INTERVAL_MS, SEND_PER_SEC, SMOOTH_FINGER, SMOOTH_PEN } from '../../../../shared/draw/constants.js';
import {
  createDrawing, apply, st as opSt, pt as opPt, cx as opCx, rm as opRm, undo as opUndo, redo as opRedo, clear as opClear,
  visibleStrokes, importSync, exportSync, absPoints, canUndo, canRedo,
} from '../../../../shared/draw/ops.js';
import { createRenderer, absOf } from './render.js';
import { createInput } from './input.js';
import {
  fitBox, toLogical, smoothToward, farEnough, finalPoint, planMessages, planRm, appendAbs, strokeHit, bbox,
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
  let disposed = false;

  // ---- 보내기: 어느 1초 구간에도 SEND_PER_SEC 개 이하(서버가 한도를 넘은 요청을 조용히 버려 선이 어긋나지 않게) ----
  // 한도에 닿으면 버리지 않고 줄(outbox)에 세워 순서대로 보낸다. 긋는 중의 묶음은 한도에 닿으면 미뤄 다음 묶음과 합친다.
  const mono = ctx.clock || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
  const outbox = [];
  const sentAt = []; // 최근 1초 안에 보낸 시각
  let outTimer = 0;
  function budget(t) {
    while (sentAt.length && t - sentAt[0] >= 1000) sentAt.shift();
    return SEND_PER_SEC - sentAt.length;
  }
  function drain(force) {
    const t = mono();
    while (outbox.length && (force || budget(t) > 0)) { sentAt.push(t); ctx.send(outbox.shift()); }
    if (outbox.length && !outTimer) {
      outTimer = setTimeout(() => { outTimer = 0; if (!disposed) drain(false); }, Math.max(4, Math.ceil(1000 - (t - sentAt[0])) + 1));
    }
  }
  function dropOutbox() {
    outbox.length = 0;
    if (outTimer) { clearTimeout(outTimer); outTimer = 0; }
  }
  const canSendNow = () => !outbox.length && budget(mono()) > 0;
  const sendDr = (a, body) => { outbox.push({ t: 'dr', a, ...body }); drain(false); };

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
      const next = Math.min(n, live.shown + Math.max(1, Math.ceil((n - live.shown) / 2))); // 묶음이 30ms마다 오므로 2번에 나눠 바로 따라잡는다
      rd.drawGrowth(live, live.a, live.shown, next);
      live.shown = next;
    }
    if (live.shown >= n && live.done) { rd.commit(live, live.a); live = null; return; }
    if (live.shown < n) raf = requestAnimationFrame(tick);
  }
  function flushLive() { // 남은 점을 한꺼번에 그린다
    if (!live) return;
    const n = live.a.length >> 1;
    rd.drawGrowth(live, live.a, live.shown, n);
    rd.commit(live, live.a); // 꼬리를 본 그림에 확정
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
      if (state.cur) rd.commit(g, absPoints(state.cur.p)); // 꼬리를 본 그림에 확정
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
      else if (!r.ok && r.error === 'full') { if (!g.fullTold) { g.fullTold = true; if (ctx.onFull) ctx.onFull(); } break; }
    }
    if (changed) fullRedraw();
  }

  function dropStroke(r) {
    g.dead = true;
    endTimer();
    sendDr('cx', {});
    if (r.error === 'full' && ctx.onFull) ctx.onFull();
    fullRedraw();
  }

  // 손을 뗀 자리를 선의 마지막 점으로 더한다(손가락 보정 때문에 선이 뗀 자리보다 앞에서 끝나지 않게).
  // 점 간격·범위 규칙은 그대로, 로컬과 보내는 점이 같다.
  function addFinalPoint(cx, cy) {
    if (!g || g.dead || g.mode === 'strokeErase' || !g.cur || !state.cur) return;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
    const p = finalPoint(g.last, toLogical(cx, cy, g.rect));
    if (!p) return;
    const r = opPt(state, { p: [p.x - g.last.x, p.y - g.last.y] });
    if (!r.ok) { if (r.error === 'full') dropStroke(r); return; } // 한도: 선을 버림(pt 가 이미 버렸다). 그 밖: 마지막 점만 포기
    g.last = p;
    g.q.push(p);
    const a = absPoints(state.cur.p);
    const n = a.length >> 1;
    rd.drawGrowth(g, a, g.drawn, n);
    g.drawn = n;
  }

  // 긋는 중에 drSync(서버가 내 요청을 버렸다)를 받음: 서버 그림을 받아들이되 손에 든 선은 끊지 않는다(GDD 15절).
  // 펜·정밀 지우개: 서버의 긋던 선을 없던 것으로(cx) 하고, 내 선 전체를 새 st 로 다시 보낸다 → 서버·보는 사람·내 화면이 다시 같아진다.
  // 획 지우개: 문지르기를 그대로 이어 간다(새 묶음부터 보냄).
  function adoptKeepingGesture(next) {
    const mine = g.mode !== 'strokeErase' && g.cur && state.cur ? absPoints(state.cur.p) : null;
    state = next;
    synced = true;
    const stopHere = (r) => {
      g.dead = true;
      g.sendOff = true;
      endTimer();
      if (r && r.error === 'full' && ctx.onFull) ctx.onFull();
      fullRedraw();
      kick();
    };
    if (g.mode === 'strokeErase') {
      g.rmLocal = false; g.rmSent = false; g.rmQueue = [];
      fullRedraw();
      kick();
      return;
    }
    if (state.cur) opCx(state); // 내 화면에만 있던 선도 지운다: 서버에는 늘 cx 를 보낸다(서버 그림에 긋던 선이 없어도 안전)
    sendDr('cx', {});
    if (!mine) { stopHere(null); return; }
    const r = opSt(state, { c: g.c, w: g.w, e: g.e, p: [mine[0], mine[1]] });
    if (!r.ok) { stopHere(r); return; }
    const pts = [{ x: mine[0], y: mine[1] }];
    for (let i = 2; i < mine.length; i += 2) {
      const q = opPt(state, { p: [mine[i] - mine[i - 2], mine[i + 1] - mine[i - 1]] });
      if (!q.ok) { opCx(state); stopHere(q); return; }
      pts.push({ x: mine[i], y: mine[i + 1] });
    }
    g.q = pts;
    g.lastSent = null;
    g.sendOff = false;
    fullRedraw();
    kick();
    if (canSendNow()) flushPen(false);
  }

  const input = createInput(canvas, {
    enabled: () => canDraw,
    palm: () => !(ctx.tool && ctx.tool.get && ctx.tool.get().palm === false),
    down(cx, cy, type) {
      if (g) finishGesture(); // 앞 선이 아직 열려 있으면(끝 알림을 못 받음) 정상으로 끝내고 새 선
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
        if (canSendNow()) flushPen(false); // 첫 점은 바로 보낸다(보는 사람 화면에 선이 곧바로 시작)
      }
      g.timer = setInterval(() => { if (g && canSendNow()) flush(false); }, SEND_INTERVAL_MS);
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
        if (!r.ok) { dropStroke(r); return; } // 한도 초과 등: 이 선은 버린다
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
    up(cx, cy) { addFinalPoint(cx, cy); finishGesture(); },
    cancel() { cancelGesture(true); },
  });

  // ---- 바깥에서 부르는 것 ----
  function local(a) {
    if (g) { input.release(); finishGesture(); } // 긋던 선을 먼저 끝내 보낸다(send 보다 앞서야 서버 순서가 맞다)
    drain(true); // 줄에 남은 것도 지금 보낸다(도구 칸의 send 가 그 뒤에 가야 한다)
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
    if (was && !canDraw && g) { // 단계가 끝날 때 긋던 선: 가능하면 정상으로 끝내 서버와 맞춘다(서버가 거절해도 drNew 로 정리된다)
      input.release();
      if (g.dead) cancelGesture(false); else finishGesture();
    }
  }

  function event(e) {
    if (!e || disposed) return;
    if (e.k === 'drSync') {
      const r = importSync(e);
      if (!r.ok) return;
      dropOutbox(); // 아직 안 보낸 것은 서버에 없다: 서버 그림을 받아들이는 순간 함께 버린다(둘이 같아진다)
      if (g && canDraw && !g.dead) { adoptKeepingGesture(r.state); return; }
      if (g) { input.release(); cancelGesture(false); }
      state = r.state;
      synced = true;
      fullRedraw();
      kick();
      return;
    }
    if (e.k === 'drNew') {
      dropOutbox();
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
    disposed = true;
    listeners.clear();
    if (ro) ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    endTimer();
    dropOutbox();
    input.dispose();
    el.remove();
  }

  // snapshot(): 지금 내 화면 그림 상태(exportSync 모양). 시험·점검용
  return { el, update, event, dispose, local, stop, history, snapshot: () => exportSync(state) };
}
