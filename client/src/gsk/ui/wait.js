// 갱스껄 방 대기 화면 (phase lobby): 색 고르기 + 들어온 사람 + 시작. 사용자 글자는 textContent 로만.
// createWait(parent, ctx) → { el, update(view), event(e), dispose() }
// ctx 에서 쓰는 것: send, face
import './wait.css';
import { requestFor } from '../actions.js';
import { COLORS, matUrl } from '../art.js';
import { colorStates, waitInfo } from './result.pure.js';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const colorOf = (c) => (COLORS[c] ? COLORS[c].base : '#c9a45c');

export function createWait(parent, ctx) {
  const root = h('div', 'gk-wt-root');
  root.hidden = true;
  parent.append(root);
  let disposed = false;
  let lastView = null;
  let sig = '';

  const act = (key) => (lastView && lastView.actions.find((a) => a.key === key)) || null;
  const fire = (key) => {
    const a = act(key);
    const req = a && requestFor(a);
    if (req) ctx.send(req);
  };

  function draw() {
    const v = lastView;
    root.textContent = '';
    const box = h('div', 'gk-wt-box');
    box.append(h('div', 'gk-wt-ttl', '갱스껄'));
    box.append(h('div', 'gk-wt-sub', '방에서 기다리는 중'));

    const seated = !!v.me;
    const cs = colorStates(v);
    if (seated) {
      box.append(h('div', 'gk-wt-cap', '내 색 고르기'));
      const row = h('div', 'gk-wt-colors');
      for (const c of cs) {
        const b = h('button', 'gk-wt-color gk-wt-' + c.state);
        b.type = 'button';
        b.dataset.gk = c.key;
        b.title = COLORS[c.c].name + (c.state === 'taken' ? ` (${c.by} 님)` : '');
        b.setAttribute('aria-label', b.title);
        const im = h('img', 'gk-wt-mat');
        im.alt = '';
        im.draggable = false;
        im.src = matUrl(c.c, false);
        b.append(im);
        b.append(h('span', 'gk-wt-cname', COLORS[c.c].name));
        if (c.state === 'taken') b.disabled = true;
        else b.addEventListener('click', () => fire(c.key));
        row.append(b);
      }
      box.append(row);
    }

    box.append(h('div', 'gk-wt-cap', `들어온 사람 ${v.seats.length}명`));
    const list = h('div', 'gk-wt-list');
    for (const s of v.seats) {
      const r = h('div', 'gk-wt-p' + (s.isMe ? ' gk-wt-me' : ''));
      const av = h('span', 'gk-wt-av');
      const url = ctx.face ? ctx.face(s.id) : null;
      if (url) {
        const im = h('img', 'gk-wt-avimg');
        im.alt = '';
        im.src = url;
        av.append(im);
      }
      av.style.boxShadow = `0 0 0 1.5px ${s.color != null ? colorOf(s.color) : 'rgba(201,164,92,.4)'}`;
      r.append(av);
      r.append(h('span', 'gk-wt-nm', s.isMe ? `${s.name} (나)` : s.name));
      if (s.color != null) {
        const d = h('i', 'gk-wt-dot');
        d.style.background = colorOf(s.color);
        d.title = COLORS[s.color].name;
        r.append(d);
        r.append(h('span', 'gk-wt-cn', COLORS[s.color].name));
      } else {
        r.append(h('span', 'gk-wt-cn gk-wt-none', '색 안 고름'));
      }
      if (!s.connected) r.append(h('span', 'gk-wt-off', '연결 끊김'));
      list.append(r);
    }
    box.append(list);

    const w = waitInfo(v);
    if (isHostView(v)) {
      const b = h('button', 'gk-wt-btn' + (w.canStart ? '' : ' gk-wt-dim'));
      b.type = 'button';
      b.dataset.gk = 'start';
      b.append(h('span', null, '시작'));
      if (w.canStart) b.addEventListener('click', () => fire('start'));
      else b.setAttribute('aria-disabled', 'true');
      box.append(b);
      if (!w.canStart) box.append(h('div', 'gk-wt-need', '3명 이상 필요'));
    } else {
      box.append(h('div', 'gk-wt-need', '방장이 시작하기를 기다리는 중'));
    }
    root.append(box);
  }

  // 방장인데 아직 3명이 안 되면 start 행동이 없다 → 버튼은 흐리게 보여야 한다.
  // 방장 판단: start 행동이 있음 / view.hostId(model.js 에 추가되면) / ctx.isHost(view)(선택).
  function isHostView(v) {
    if (v.actions.some((a) => a.a === 'start')) return true;
    if (v.hostId && ctx.meId && v.hostId === ctx.meId()) return true;
    return !!(ctx.isHost && ctx.isHost(v));
  }

  function update(view) {
    if (disposed) return;
    lastView = view || null;
    const show = !!(view && view.phase === 'lobby');
    if (!show) {
      if (sig) { sig = ''; root.textContent = ''; }
      root.hidden = true;
      return;
    }
    const next = JSON.stringify([
      view.seats.map((s) => [s.id, s.name, s.color, s.connected, s.isMe, ctx.face ? (ctx.face(s.id) || '').length : 0]),
      view.ranges, !!view.me, view.actions.map((a) => a.key), isHostView(view),
    ]);
    root.hidden = false;
    if (next === sig) return;
    sig = next;
    draw();
  }

  return {
    el: root,
    update,
    event() {},
    dispose() {
      disposed = true;
      root.remove();
    },
  };
}
