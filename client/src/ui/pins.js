import { h, svg, avatar, cardEl, cardBack, fmt, fmtShort, view } from './dom.js';
import { PIN } from './icons.js';

const EMOTES = ['👍', '😂', '😮', '😡', '😭', '🔥'];
export const emoteGlyphs = EMOTES;

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
  const lifts = new Map(); // id -> world-space height added to the photo (the winner standing up)
  const betLabels = new Map(); // id -> label element next to the player's bet pile
  const hands = new Map(); // id -> element with the two showdown cards above the photo
  let winners = null; // Set of ids emphasised at showdown, null otherwise
  let room = null;
  let hidden = false;

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
    const entry = { el, top, wrap, nm, rv, emote, av: null, photo: null, id: p.id };
    el.append(top, wrap, nm, rv, emote);
    layer.append(el);
    return entry;
  }

  function render(r) {
    room = r;
    const live = new Set(r.players.map((p) => p.id));
    for (const [id, e] of pins) if (!live.has(id)) { e.el.remove(); pins.delete(id); betLabels.get(id)?.remove(); betLabels.delete(id); }
    const holdem = r.mode === 'holdem';
    for (const p of r.players) {
      const e = pins.get(p.id) ?? (pins.set(p.id, build(p)), pins.get(p.id));
      const photoKey = `${p.avatar ?? ''}|${p.name}`;
      if (e.photo !== photoKey) {
        e.photo = photoKey;
        e.av = avatar(p, 'pav');
        e.wrap.replaceChildren(e.av);
      }
      const playing = r.phase !== 'lobby';
      const out = playing && (holdem ? p.folded : p.alive === false);
      const gone = Boolean(p.eliminated);
      e.el.classList.toggle('dim', Boolean(out) || dead.has(p.id) || gone || Boolean(winners && !winners.has(p.id)));
      e.el.classList.toggle('champ', Boolean(winners?.has(p.id)));
      e.el.classList.toggle('turn', r.turn === p.id);
      e.el.classList.toggle('away', !p.connected);
      e.av.classList.toggle('dead', dead.has(p.id) || gone || (playing && !holdem && p.alive === false));

      let kind = null;
      let amount = '';
      if (holdem) {
        if (p.folded) kind = 'fold';
        else if (r.turn === p.id) kind = 'turn';
        else if (acts.get(p.id)) kind = acts.get(p.id) === 'raise' ? 'raise' : 'call';
        amount = p.allin ? 'ALL IN' : p.bet > 0 ? fmt(p.bet) : '';
      } else if (r.turn === p.id) kind = 'turn';
      else if (r.lastPlay?.by === p.id) { kind = 'play'; amount = `${r.tableRank} ${r.lastPlay.count}장`; }
      if (gone) { amount = '탈락'; kind = null; }
      // The bet amount is shown beside the pile on the felt, not above the photo.
      const bet = holdem && p.bet > 0 ? fmt(p.bet) : '';
      const lbl = betLabels.get(p.id);
      if (bet && !lbl) { const l = h('div', 'betlabel num'); betLabels.set(p.id, l); layer.append(l); }
      if (!bet && lbl) { lbl.remove(); betLabels.delete(p.id); }
      if (bet) betLabels.get(p.id).textContent = bet;
      if (holdem && !gone) amount = p.allin ? 'ALL IN' : '';
      e.top.replaceChildren(...(amount ? [h('div', gone ? 'ko out' : 'num', amount)] : []), ...(kind ? [pinIcon(kind)] : []));
      e.el.classList.toggle('has-top', Boolean(amount || kind));

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
      const head = table.head(id)?.clone();
      if (head) head.y += lifts.get(id) ?? 0;
      e.el.style.display = head ? '' : 'none';
      const bl = betLabels.get(id);
      if (bl) {
        const bp = table.betPos(id);
        const [bx, by] = bp ? stage.project(bp) : [-99, -99];
        bl.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px) translate(-50%, -150%) scale(${view.k})`;
      }
      if (!head) continue;
      const [x, y] = stage.project(head);
      e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${view.k})`;
    }
    const showPot = room.mode === 'holdem' && room.pot > 0;
    potLabel.style.display = showPot ? '' : 'none';
    if (showPot) {
      potLabel.textContent = fmt(room.pot);
      const [x, y] = stage.project(table.potPos());
      potLabel.style.transform = `translate(${x.toFixed(1)}px, ${y - 22}px) translate(-50%, -100%)`;
      potLabel.style.fontSize = `${26 * view.k}px`;
    }
  }

  return {
    render, frame,
    // Showdown: the player's two cards pop up above the photo face-down, then flip.
    showHand(id, codes) {
      const e = pins.get(id);
      if (!e) return;
      hands.get(id)?.remove();
      const box = h('div', 'handup', codes.map(() => cardBack()));
      // Seats near the top edge have no room above the photo, so their cards pop up beside it.
      const head = table.head(id);
      const [x, y] = head ? stage.project(head) : [0, 999];
      if (y < 210 * view.k) box.classList.add('side', x < stage.size.w / 2 ? 'r' : 'l');
      e.el.append(box);
      hands.set(id, box);
      setTimeout(() => box.replaceChildren(...codes.map((c) => cardEl(c, 'flip'))), 380);
    },
    clearHands() { hands.forEach((b) => b.remove()); hands.clear(); },
    emphasize(ids) { winners = ids ? new Set(ids) : null; if (room) render(room); },
    setLift(id, v) { if (v) lifts.set(id, v); else lifts.delete(id); },
    clearStacks() { stacks.clear(); if (room) render(room); },
    setVisible(v) { layer.style.display = v ? '' : 'none'; hidden = !v; },
    // Top of the pin (above the action pin / amount when shown), for chat bubbles; null when off screen.
    anchor(id) {
      const e = pins.get(id);
      const head = table.head(id)?.clone();
      if (head) head.y += lifts.get(id) ?? 0;
      if (!e || !head || hidden) return null;
      const [x, y] = stage.project(head);
      if (x < 0 || y < 0 || x > stage.size.w || y > stage.size.h) return null;
      return { x, y: y - (e.top.childElementCount ? 98 : 44) * view.k };
    },
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
      void e.offsetWidth; // restart the animation for back-to-back emotes
      e.classList.add('show');
    },
  };
}
