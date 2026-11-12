import { h, svg, avatar, fmt, fmtShort, view } from './dom.js';
import { PIN } from './icons.js';

const EMOTES = ['👍', '😂', '😮', '😡', '😭', '🔥'];
export const emoteGlyphs = EMOTES;
const TURN_MS = 30000;

// DOM pins above each seat: photo with timer ring, action pin, amount, name and stack.
export function createPins(ui, stage, table) {
  const layer = h('div');
  layer.id = 'pins';
  const potLabel = h('div', 'potlabel num');
  ui.append(layer, potLabel);
  const pins = new Map();
  const acts = new Map(); // id -> last action kind, from events
  const stacks = new Map(); // id -> displayed stack override while the win animation runs
  const dead = new Set();
  let room = null;
  let hidden = false;
  // The server clock may differ from this device's, so the ring counts from when the turn message arrived.
  let turnSeenAt = 0;

  const pinIcon = (kind) => {
    const e = h('div', `pin ${kind === 'turn' ? 't' : ''}`);
    e.append(svg(PIN[kind]));
    return e;
  };

  function build(p) {
    const el = h('div', 'pl');
    const top = h('div', 'top');
    const wrap = h('div', 'av-wrap');
    const nm = h('div', 'nm ko');
    const rv = h('div', 'rv');
    const emote = h('div', 'emote');
    const ring = h('div', 'ring');
    const entry = { el, top, wrap, nm, rv, emote, ring, av: null, photo: null, id: p.id };
    el.append(top, wrap, nm, rv, emote);
    layer.append(el);
    return entry;
  }

  function render(r) {
    room = r;
    const live = new Set(r.players.map((p) => p.id));
    for (const [id, e] of pins) if (!live.has(id)) { e.el.remove(); pins.delete(id); }
    const holdem = r.mode === 'holdem';
    for (const p of r.players) {
      const e = pins.get(p.id) ?? (pins.set(p.id, build(p)), pins.get(p.id));
      const photoKey = `${p.avatar ?? ''}|${p.name}`;
      if (e.photo !== photoKey) {
        e.photo = photoKey;
        e.av = avatar(p, 'pav');
        e.wrap.replaceChildren(e.av, e.ring);
      }
      const playing = r.phase !== 'lobby';
      const out = playing && (holdem ? p.folded : p.alive === false);
      e.el.classList.toggle('dim', Boolean(out) || dead.has(p.id));
      e.el.classList.toggle('turn', r.turn === p.id);
      e.el.classList.toggle('away', !p.connected);
      e.av.classList.toggle('dead', dead.has(p.id) || (playing && !holdem && p.alive === false));

      let kind = null;
      let amount = '';
      if (holdem) {
        if (p.folded) kind = 'fold';
        else if (r.turn === p.id) kind = 'turn';
        else if (acts.get(p.id)) kind = acts.get(p.id) === 'raise' ? 'raise' : 'call';
        amount = p.allin ? 'ALL IN' : p.bet > 0 ? fmt(p.bet) : '';
      } else if (r.turn === p.id) kind = 'turn';
      else if (r.lastPlay?.by === p.id) { kind = 'play'; amount = `${r.tableRank} ${r.lastPlay.count}장`; }
      e.top.replaceChildren(...(amount ? [h('div', 'num', amount)] : []), ...(kind ? [pinIcon(kind)] : []));

      const sub = holdem ? fmtShort(stacks.get(p.id) ?? p.stack ?? 0) : playing ? `${p.handCount ?? 0}장` : '';
      e.nm.replaceChildren(h('i', 'nmt', p.name), ...(sub ? [h('span', '', sub)] : []));
      e.rv.textContent = holdem ? '' : `${p.shots ?? 0} / 6`;
      e.rv.style.display = holdem || !playing ? 'none' : '';
    }
  }

  function frame() {
    if (!room) return;
    potLabel.style.display = 'none';
    if (hidden) return;
    for (const [id, e] of pins) {
      const head = table.head(id);
      e.el.style.display = head ? '' : 'none';
      if (!head) continue;
      const [x, y] = stage.project(head);
      e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${view.k})`;
      if (room.turn === id && room.turnEndsAt) e.ring.style.setProperty('--p', Math.max(0, 100 - (Date.now() - turnSeenAt) / TURN_MS * 100).toFixed(1));
    }
    const showPot = room.mode === 'holdem' && room.pot > 0;
    potLabel.style.display = showPot ? '' : 'none';
    if (showPot) {
      potLabel.textContent = fmt(room.pot);
      const [x, y] = stage.project(table.potPos());
      potLabel.style.transform = `translate(${x - 0}px, ${y - 22}px) translate(-50%, -100%)`;
      potLabel.style.fontSize = `${26 * view.k}px`;
    }
  }

  return {
    render, frame,
    clearStacks() { stacks.clear(); if (room) render(room); },
    setVisible(v) { layer.style.display = v ? '' : 'none'; hidden = !v; },
    noteTurn() { turnSeenAt = Date.now(); },
    get: (id) => pins.get(id),
    setAct(id, kind) { acts.set(id, kind); if (room) render(room); },
    clearActs() { acts.clear(); if (room) render(room); },
    setDead(id, v) { if (v) dead.add(id); else dead.delete(id); if (room) render(room); },
    clearDead() { dead.clear(); if (room) render(room); },
    setStack(id, v) { if (v == null) stacks.delete(id); else stacks.set(id, v); if (room) render(room); },
    emote(id, i) {
      const e = pins.get(id)?.emote;
      if (!e) return;
      e.textContent = EMOTES[i] ?? '';
      e.classList.remove('show');
      void e.offsetWidth;
      e.classList.add('show');
    },
  };
}
