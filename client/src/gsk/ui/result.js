// 갱스껄 벌칙 고르기 창 + 결과 창 (GDD 16절 G5). 사용자 글자는 textContent 로만.
// createResult(parent, ctx) → { el, update(view), event(e), dispose() }
// ctx 에서 쓰는 것: send, meId, face, busy
import './result.css';
import { requestFor } from '../actions.js';
import { COLORS, discFlowerUrl, discSkullUrl, matUrl, skullPhotoUrl } from '../art.js';
import { penaltyPlan, rankRows, winnerInfo, winCaption } from './result.pure.js';

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
const SVG_NS = 'http://www.w3.org/2000/svg';
function diamond() {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', '9');
  s.setAttribute('height', '9');
  s.setAttribute('viewBox', '0 0 10 10');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.2');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z');
  s.append(p);
  return s;
}
const colorOf = (c) => (COLORS[c] ? COLORS[c].base : '#c9a45c');

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
      if (skull) {
        const photo = ctx.face && ctx.face(ctx.meId());
        if (photo) skullPhotoUrl(color, photo).then((u) => { if (!disposed) i.src = u; });
      }
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

  function drawResult() {
    const info = winnerInfo(lastView);
    const rows = rankRows(lastView);
    const box = h('div', 'gk-rs-box gk-rs-in');
    box.dataset.gk = 'result';

    const win = h('div', 'gk-rs-win');
    const art = h('div', 'gk-rs-art');
    const bd = img(matUrl(info ? info.color : 0, true), 'gk-rs-bd');
    art.append(bd);
    const photo = info && info.id && ctx.face ? ctx.face(info.id) : null;
    if (info && info.id) {
      const face = h('div', 'gk-rs-ph');
      // 사진이 없으면 그 색 해골 원판
      const f = img(discSkullUrl(info.color), 'gk-rs-phimg');
      if (photo) skullPhotoUrl(info.color, photo).then((u) => { if (!disposed) f.src = u; });
      face.append(f);
      art.append(face);
    }
    win.append(art);
    win.append(h('div', 'gk-rs-cap', winCaption(info)));
    win.append(h('div', 'gk-rs-ttl', info && info.id ? '갱스껄 승리' : '판 끝'));
    if (info && info.name) win.append(h('div', 'gk-rs-nm', info.name));

    const list = h('div', 'gk-rs-list');
    const hd = h('div', 'gk-rs-h');
    hd.append(h('i'), h('span', null, '순위'), h('i'));
    list.append(hd);
    for (const r of rows) {
      const li = h('div', 'gk-rs-r' + (r.out ? ' gk-rs-outrow' : '') + (r.isWinner ? ' gk-rs-top' : ''));
      li.append(h('span', 'gk-rs-k', String(r.rank)));
      const av = h('span', 'gk-rs-av');
      const url = ctx.face ? ctx.face(r.id) : null;
      if (url) {
        const a = img(url, 'gk-rs-avimg');
        a.style.boxShadow = `0 0 0 1.5px ${colorOf(r.color)}`;
        av.append(a);
      } else {
        av.style.background = colorOf(r.color);
      }
      li.append(av);
      const nm = h('span', 'gk-rs-n');
      nm.append(h('span', 'gk-rs-nt', r.isMe ? `${r.name} (나)` : r.name));
      const dot = h('i', 'gk-rs-dot');
      dot.style.background = colorOf(r.color);
      nm.append(dot);
      li.append(nm);
      const m = h('span', 'gk-rs-m');
      if (r.out) {
        m.append(h('span', 'gk-rs-out', '탈락'));
      } else {
        for (const on of r.pips) m.append(h('i', 'gk-rs-pip' + (on ? ' gk-rs-lit' : '')));
        m.append(h('span', 'gk-rs-dn', `원판 ${r.discs}`));
      }
      li.append(m);
      list.append(li);
    }
    const start = act('start');
    const acts = h('div', 'gk-rs-acts');
    if (start) {
      const b = h('button', 'gk-rs-btn');
      b.type = 'button';
      b.dataset.gk = 'start';
      b.append(diamond(), h('span', null, '한 판 더'), diamond());
      b.addEventListener('click', () => {
        const a = act('start');
        const req = a && requestFor(a);
        if (req) ctx.send(req);
      });
      acts.append(b);
    } else {
      acts.append(h('div', 'gk-rs-wait', '방장이 다시 시작하기를 기다리는 중'));
    }
    list.append(acts);

    box.append(win, list);
    root.append(box);
  }

  function update(view) {
    if (disposed) return;
    lastView = view || null;
    const busy = !!(ctx.busy && ctx.busy());
    let mode = null;
    let plan = null;
    if (view && !busy) {
      if (view.phase === 'result' && view.result) mode = 'result';
      else if ((plan = penaltyPlan(view))) mode = 'pen-' + plan.mode;
    }
    const next = mode ? [mode, plan && plan.cells ? plan.cells.map((c) => c.key).join(',') : '', plan && plan.name ? plan.name : '',
      mode === 'result' ? JSON.stringify([view.result, !!act('start'), rankRows(view).map((r) => ((ctx.face && ctx.face(r.id)) || '').length)]) : ''].join('|') : '';
    if (next === sig) return;
    sig = next;
    sent = false;
    clearTimeout(timer);
    root.className = 'gk-rs-root';
    if (!mode) { clear(); return; }
    root.textContent = '';
    root.hidden = false;
    if (mode === 'result') drawResult();
    else drawPenalty(plan);
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
