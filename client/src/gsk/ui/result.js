// 갱스껄 벌칙 고르기 창 (GDD 16절 G5). 판 끝 결과는 공통 결과 화면(room/result.js). 사용자 글자는 textContent 로만.
// createResult(parent, ctx) → { el, update(view), event(e), dispose() }
// ctx 에서 쓰는 것: send, meId, face, busy
import './result.css';
import { requestFor } from '../actions.js';
import { discFlowerUrl, discSkullUrl, setSkullImg } from '../art.js';
import { penaltyPlan } from './result.pure.js';

const GONE_MS = 360;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const img = (src, cls) => {
  const i = h('img', cls);
  i.alt = '';
  i.draggable = false;
  i.src = src;
  return i;
};
export function createResult(parent, ctx) {
  const root = h('div', 'gk-rs-root');
  root.hidden = true;
  parent.append(root);

  let disposed = false;
  let lastView = null;
  let sig = '';
  let sent = false; // 벌칙 고르기를 이미 보냈는지(같은 창에서 두 번 못 누름)
  let timer = null;

  const act = (key) => (lastView && lastView.actions.find((a) => a.key === key)) || null;

  function clear() {
    root.textContent = '';
    root.hidden = true;
  }

  function pickCell(btn, key) {
    btn.dataset.gk = key;
    btn.addEventListener('click', () => {
      if (sent || disposed) return;
      const a = act(key);
      const req = a && requestFor(a);
      if (!req) return;
      sent = true;
      btn.classList.add('gk-rs-picked');
      root.classList.add('gk-rs-sent');
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed) root.classList.add('gk-rs-fade');
      }, GONE_MS);
      ctx.send(req);
    });
  }

  function drawPenalty(plan) {
    const wrap = h('div', 'gk-rs-pen gk-rs-in');
    if (plan.mode === 'watch') {
      wrap.classList.add('gk-rs-watch');
      wrap.append(h('div', 'gk-rs-watchtxt', plan.name ? `${plan.name} 님이 버릴 원판을 고르는 중` : '버릴 원판을 고르는 중'));
      root.append(wrap);
      return;
    }
    const me = lastView.seats.find((s) => s.isMe);
    const color = me && me.color != null ? me.color : 0;
    wrap.append(h('div', 'gk-rs-ask', '하나를 골라 버리세요'));
    wrap.append(h('div', 'gk-rs-asksub', '내 원판 중에서 버립니다. 무엇을 버렸는지는 나만 압니다'));
    const row = h('div', 'gk-rs-pen-row');
    plan.cells.forEach((c) => {
      const b = h('button', 'gk-rs-disc');
      b.type = 'button';
      const skull = c.k === 'S';
      const i = img(skull ? discSkullUrl(color) : discFlowerUrl(color), 'gk-rs-discimg');
      if (skull) setSkullImg(i, color, ctx.face && ctx.face(ctx.meId()), () => !disposed);
      b.append(i);
      b.append(h('span', 'gk-rs-cnt', `×${c.count}`));
      b.setAttribute('aria-label', skull ? '해골 원판' : '꽃 원판');
      b.append(h('span', 'gk-rs-kind', skull ? '해골' : '꽃'));
      pickCell(b, c.key);
      row.append(b);
    });
    wrap.append(row);
    root.append(wrap);
  }

  function update(view) {
    if (disposed) return;
    lastView = view || null;
    const busy = !!(ctx.busy && ctx.busy());
    let mode = null;
    let plan = null;
    if (view && !busy && (plan = penaltyPlan(view))) mode = 'pen-' + plan.mode;
    const next = mode ? [mode, plan.cells ? plan.cells.map((c) => c.key).join(',') : '', plan.name || ''].join('|') : '';
    if (next === sig) return;
    sig = next;
    sent = false;
    clearTimeout(timer);
    root.className = 'gk-rs-root';
    if (!mode) { clear(); return; }
    root.textContent = '';
    root.hidden = false;
    drawPenalty(plan);
  }

  return {
    el: root,
    update,
    event() {},
    dispose() {
      disposed = true;
      clearTimeout(timer);
      root.remove();
    },
  };
}
