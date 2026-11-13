// 그림판(board.js + input.js)을 가짜 DOM·가짜 시계로 돌린다: "펜을 떼고 곧바로 다시 대도 새 선이 바로 시작되는가"
// (사용자 실기기 버그, GDD 15절 2026-11-13). 그리는 사람 로컬 · 서버(ops.js) · 받는 사람 그림이 모두 같은지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../../shared/draw/ops.js';
import { checkDr } from '../../shared/draw/protocol.js';
import { SEND_PER_SEC } from '../../shared/draw/constants.js';

// ---- 가짜 시계·타이머·rAF ----
let now = 0;
let seq = 1;
const timers = new Map(); // id -> { at, every, fn }
const rafs = new Map();
globalThis.setInterval = (fn, ms) => { const id = seq++; timers.set(id, { at: now + ms, every: ms, fn }); return id; };
globalThis.setTimeout = (fn, ms) => { const id = seq++; timers.set(id, { at: now + (ms || 0), every: 0, fn }); return id; };
globalThis.clearInterval = (id) => timers.delete(id);
globalThis.clearTimeout = (id) => timers.delete(id);
globalThis.requestAnimationFrame = (fn) => { const id = seq++; rafs.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => rafs.delete(id);
function advance(ms) {
  const end = now + ms;
  for (;;) {
    let next = null;
    for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
    if (!next) break;
    const [id, t] = next;
    now = t.at;
    if (t.every) t.at += t.every; else timers.delete(id);
    t.fn();
  }
  now = end;
  for (let i = 0; i < 20 && rafs.size; i++) { const l = [...rafs.values()]; rafs.clear(); l.forEach((f) => f()); }
}
globalThis.window = { devicePixelRatio: 1 };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
function mkEl() {
  const L = {};
  return {
    style: {}, children: [], clientWidth: 800, clientHeight: 600, parentNode: null,
    appendChild(c) { this.children.push(c); c.parentNode = this; }, remove() {},
    addEventListener(t, f) { (L[t] ||= []).push(f); }, removeEventListener(t, f) { L[t] = (L[t] || []).filter((x) => x !== f); },
    fire(t, e) { for (const f of L[t] || []) f({ preventDefault() {}, button: 0, width: 1, height: 1, isPrimary: true, cancelable: true, ...e }); },
    setPointerCapture() {}, releasePointerCapture() {},
    getContext: () => ctx2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
}
globalThis.document = { createElement: mkEl };
const { createBoard } = await import('../../client/src/draw/canvas/board.js');

// ---- 서버 흉내 (server/draw/room.js drawReq 와 같은 규칙: 거절이면 그리는 사람에게 drSync) ----
function world(opts = {}) {
  const server = O.createDrawing();
  const sent = []; // [시각, msg]
  const rejected = [];
  let me = null;
  let rx = null;
  const deliverSync = [];
  const send = (msg) => {
    sent.push([now, msg]);
    if (opts.drop && opts.drop(msg, sent.length)) return; // 서버 한도 등으로 조용히 버려짐
    const c = checkDr(msg);
    assert.ok(c.ok, `형식 오류: ${JSON.stringify(msg)}`);
    const m = c.msg;
    const fn = { st: O.st, pt: O.pt, cx: O.cx, rm: O.rm, undo: O.undo, redo: O.redo, clear: O.clear }[m.a];
    const r = fn(server, m);
    if (r.event) rx.event(r.event);
    if (!r.ok) { rejected.push([m.a, r.error]); deliverSync.push(true); }
  };
  me = createBoard(mkEl(), { send, meId: () => 'A', now: () => now, layout: () => 'wide', clock: () => now, tool: { get: () => ({ tool: 'pen', color: 0, penW: 10, eraseW: 24 }) } });
  rx = createBoard(mkEl(), { send: () => assert.fail('받는 사람이 보냄'), meId: () => 'B', now: () => now, layout: () => 'wide', clock: () => now });
  for (const b of [me, rx]) { b.event({ k: 'drNew' }); b.update({ phase: 'draw', drawerId: 'A' }); }
  const cv = me.el.children[0];
  // 서버의 drSync 는 조금 늦게(다음 시각 진행 때) 도착한다
  const tick = (ms) => {
    advance(ms);
    while (deliverSync.length) { deliverSync.shift(); me.event({ k: 'drSync', ...O.exportSync(server) }); }
  };
  return { server, sent, rejected, me, rx, cv, tick };
}

const lines = (snap) => snap.ops.filter((op) => Array.isArray(op.p)).length;
const maxPerSecond = (sent) => {
  let best = 0;
  for (let i = 0, j = 0; i < sent.length; i++) {
    while (sent[i][0] - sent[j][0] >= 1000) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
};

// 20번: 누름 → 3번 움직임(16ms 간격) → 뗌(방식 how) → 10ms 뒤 다음 누름
function scribble(w, type, how) {
  let id = 1;
  for (let k = 0; k < 20; k++) {
    if (how === 'newId' || type === 'touch') id++;
    const x = 40 + k * 35;
    w.cv.fire('pointerdown', { pointerType: type, pointerId: id, clientX: x, clientY: 100 });
    for (let s = 1; s <= 3; s++) {
      w.tick(16);
      const pts = [[x + s * 4, 100 + s * 30], [x + s * 6, 110 + s * 40]];
      w.cv.fire('pointermove', { pointerType: type, pointerId: id, clientX: pts[1][0], clientY: pts[1][1], getCoalescedEvents: () => pts.map(([a, b]) => ({ clientX: a, clientY: b })) });
    }
    if (how === 'up') w.cv.fire('pointerup', { pointerType: type, pointerId: id, clientX: x + 20, clientY: 250 });
    else if (how === 'cancel') w.cv.fire('pointercancel', { pointerType: type, pointerId: id });
    else if (how === 'lost') w.cv.fire('lostpointercapture', { pointerType: type, pointerId: id });
    // how === 'missing' / 'newId': 끝 알림이 오지 않는다(iOS 에서 늦거나 빠짐)
    w.tick(10);
  }
  if (how === 'missing' || how === 'newId') w.cv.fire('pointerup', { pointerType: type, pointerId: id, clientX: 0, clientY: 0 });
  w.tick(2000);
}

function same(w, label) {
  const L = w.me.snapshot();
  const S = O.exportSync(w.server);
  const R = w.rx.snapshot();
  assert.equal(lines(L), 20, `${label}: 그리는 사람 화면 선 수`);
  assert.equal(lines(S), 20, `${label}: 서버 선 수`);
  assert.deepEqual(L, S, `${label}: 그리는 사람 ≠ 서버`);
  assert.deepEqual(R, S, `${label}: 받는 사람 ≠ 서버`);
  assert.ok(maxPerSecond(w.sent) <= SEND_PER_SEC, `${label}: 1초에 ${maxPerSecond(w.sent)}개 보냄`);
}

for (const type of ['mouse', 'touch', 'pen']) {
  for (const how of ['up', 'cancel', 'lost', 'missing']) {
    test(`뗐다 10ms 뒤 다시 그리기 20번: ${type} / 끝 알림 ${how} → 선 20개가 모두에 남는다`, () => {
      const w = world();
      scribble(w, type, how);
      assert.deepEqual(w.rejected, []);
      same(w, `${type}/${how}`);
    });
  }
}

test('펜슬: 끝 알림 없이 새 포인터 번호로 다시 닿아도(isPrimary) 새 선', () => {
  const w = world();
  scribble(w, 'pen', 'newId');
  same(w, 'pen/newId');
});

test('첫 점은 누르는 즉시 보낸다(보는 사람 화면에 바로 시작)', () => {
  const w = world();
  w.cv.fire('pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 });
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0][1].a, 'st');
  assert.equal(w.rx.snapshot().cur.p.length, 2);
});

test('서버가 요청을 버려 drSync 가 와도 그리는 사람이 긋던 선은 끊기지 않고, 결국 모두 같아진다', () => {
  // 5번째 선의 st 를 서버가 조용히 버린다(예전 요청 한도 초과처럼) → 그 선의 pt 가 거절 → 그리는 사람에게 drSync
  let stN = 0;
  const w = world({ drop: (m) => m.a === 'st' && ++stN === 5 });
  scribble(w, 'touch', 'up');
  assert.ok(w.rejected.length >= 1, '거절이 일어나야 시험이 된다');
  same(w, 'drop st');
});

test('아주 빠르게 긁어도 1초 보내기 상한을 넘지 않고, 미룬 것도 빠짐없이 간다', () => {
  const w = world();
  let id = 1;
  for (let k = 0; k < 20; k++) { // 20ms 짜리 선 20개를 2ms 간격으로 (초당 약 45선)
    id++;
    w.cv.fire('pointerdown', { pointerType: 'touch', pointerId: id, clientX: 50 + k * 30, clientY: 300 });
    w.tick(10);
    w.cv.fire('pointermove', { pointerType: 'touch', pointerId: id, clientX: 60 + k * 30, clientY: 360 });
    w.tick(10);
    w.cv.fire('pointerup', { pointerType: 'touch', pointerId: id, clientX: 62 + k * 30, clientY: 380 });
    w.tick(2);
  }
  w.tick(3000);
  assert.deepEqual(w.rejected, []);
  same(w, 'fast');
});
