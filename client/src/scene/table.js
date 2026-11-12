import * as THREE from 'three';
import { TY, R } from './room.js';
import { cardMesh, setFace, dealerButton, plaqueMaterials, plaqueGeo, CR } from './art.js';
import { stackGroup, pileGroup } from './chips.js';
import { tween, ease } from '../anim/tween.js';
import { sfx } from '../audio.js';

// Seat slots: x across the table, s = side (-1 far, +1 near). Slot 4 / 3 is "me".
const SLOTS = {
  holdem: [{ x: -1.3, s: -1 }, { x: 0, s: -1 }, { x: 1.3, s: -1 }, { x: 1.3, s: 1 }, { x: 0, s: 1 }, { x: -1.3, s: 1 }],
  bluff: [{ x: -1.1, s: -1 }, { x: 0, s: -1 }, { x: 1.1, s: -1 }, { x: 0, s: 1 }],
};
// Clockwise from me, indexed by player count.
const ORDER = {
  holdem: { 1: [4], 2: [4, 1], 3: [4, 0, 2], 4: [4, 5, 1, 3], 5: [4, 0, 1, 2, 3], 6: [4, 5, 0, 1, 2, 3] },
  bluff: { 1: [3], 2: [3, 1], 3: [3, 0, 2], 4: [3, 0, 1, 2] },
};
const POT = new THREE.Vector3(0.62, TY, 0.02);
const BOARD_X = (i) => -0.68 + i * 0.225;

const pose = {
  cards: (slot, i, n) => {
    const d = i - (n - 1) / 2;
    return { x: slot.x - 0.2 + d * 0.085, y: TY + 0.003 + i * 0.0035, z: slot.s * (R - 0.36), ry: (slot.s > 0 ? 0 : Math.PI) + d * 0.14 };
  },
  stack: (slot) => new THREE.Vector3(slot.x + 0.12, TY, slot.s * (R - 0.3) - (slot.s < 0 ? CR * 2 : 0)),
  bet: (slot) => new THREE.Vector3(slot.x, TY, slot.s * (R - 0.56)),
  head: (slot) => new THREE.Vector3(slot.x, slot.s > 0 ? 0.95 : 0.92, slot.s * (R + 0.42) + (slot.s > 0 ? 0.05 : -0.05)),
};

const move = (obj, to, dur, delay = 0, easing = ease.out) => {
  const from = obj.position.clone();
  return tween(dur, (k) => obj.position.lerpVectors(from, to, k), easing, delay);
};

export function createTable(stage) {
  const scene = stage.scene;
  const root = new THREE.Group();
  scene.add(root);
  const seats = new Map(); // id -> { cards:[], faceUp:string, stack:{amount,group}, bet:{amount,group} }
  const holds = new Set();
  const board = [];
  let pot = { amount: -1, group: null };
  let dealer = { id: null, mesh: null };
  let plaque = null;
  const pile = { group: new THREE.Group(), n: 0, round: undefined };
  pile.group.position.set(0.05, TY, 0.05);
  root.add(pile.group);
  let layout = new Map();
  let mode = null;
  let potDelay = 0;

  const put = (obj, parent = root) => { parent.add(obj); return obj; };
  const drop = (obj, to) => {
    if (!to) { obj.parent?.remove(obj); return; }
    move(obj, to, 350, 0, ease.in).then(() => obj.parent?.remove(obj));
  };

  function computeLayout(room) {
    const slots = SLOTS[room.mode];
    const ps = [...room.players].sort((a, b) => a.seat - b.seat);
    const i = Math.max(0, ps.findIndex((p) => p.id === room.you));
    const rotated = [...ps.slice(i), ...ps.slice(0, i)];
    const order = ORDER[room.mode][Math.min(rotated.length, slots.length)];
    return new Map(rotated.slice(0, order.length).map((p, k) => [p.id, { ...slots[order[k]], me: p.id === room.you }]));
  }

  function setMode(m) {
    mode = m;
    stage.setMode(m, SLOTS[m].filter((s) => s.s < 0).map((s) => s.x));
    for (const s of seats.values()) clearSeat(s);
    seats.clear();
    board.splice(0).forEach((c) => c.parent?.remove(c));
    pile.group.clear(); pile.n = 0; pile.round = undefined;
    if (plaque) { scene.remove(plaque); plaque = null; }
    if (m === 'bluff') {
      plaque = new THREE.Mesh(plaqueGeo, plaqueMaterials('K'));
      plaque.position.set(1.15, TY + 0.13, -0.1);
      plaque.rotation.set(-0.3, -0.55, 0);
      plaque.castShadow = true;
      scene.add(plaque);
    }
    if (pot.group) { root.remove(pot.group); pot = { amount: -1, group: null }; }
  }

  function clearSeat(s) {
    s.cards.forEach((c) => c.parent?.remove(c));
    if (s.stack.group) root.remove(s.stack.group);
    if (s.bet.group) root.remove(s.bet.group);
  }

  const dealerSpot = (room) => {
    const d = room.players.find((p) => p.isDealer);
    const slot = d && layout.get(d.id);
    return slot ? new THREE.Vector3(slot.x, TY + 0.1, slot.s * (R - 0.36)) : new THREE.Vector3(0, TY + 0.1, 0);
  };

  function syncCards(room, p, slot, seat, from) {
    const holdem = room.mode === 'holdem';
    const live = room.phase !== 'lobby' && !p.spectating && (holdem ? !p.folded : p.alive !== false && !slot.me);
    const n = live ? (holdem ? 2 : p.handCount ?? 0) : 0;
    while (seat.cards.length > n) {
      const c = seat.cards.pop();
      drop(c, new THREE.Vector3(0, TY + 0.05, 0));
    }
    while (seat.cards.length < n) {
      const c = cardMesh(null);
      c.rotation.x = Math.PI;
      const i = seat.cards.length;
      const t = pose.cards(slot, i, n);
      c.position.set(from.x, from.y, from.z);
      c.visible = false;
      seat.cards.push(c);
      put(c);
      const k = seat.cards.length;
      tween(380, (e) => {
        c.visible = true;
        c.position.set(from.x + (t.x - from.x) * e, from.y + (t.y - from.y) * e + Math.sin(e * Math.PI) * 0.12, from.z + (t.z - from.z) * e);
        c.rotation.y = t.ry * e;
      }, ease.out, k * 140 + [...layout.keys()].indexOf(p.id) * 90).then(() => sfx.card());
    }
    seat.cards.forEach((c, i) => {
      const t = pose.cards(slot, i, n);
      if (c.visible && Math.abs(c.position.x - t.x) + Math.abs(c.position.z - t.z) > 1e-4 && !c.userData.fly) {
        c.userData.fly = true;
        move(c, new THREE.Vector3(t.x, t.y, t.z), 250).then(() => { c.userData.fly = false; });
        c.rotation.y = t.ry;
      }
    });
    // Showdown: reveal the cards the server lets us see.
    const up = holdem ? room.result?.shown?.[p.id] ?? (p.id !== room.you ? p.cards : null) : null;
    const key = up ? up.join() : '';
    if (key !== seat.faceUp) {
      seat.faceUp = key;
      seat.cards.forEach((c, i) => {
        setFace(c, up?.[i] ?? null);
        tween(450, (e) => { c.rotation.x = up ? Math.PI * (1 - e) : Math.PI * e; c.position.y = TY + 0.003 + i * 0.0035 + Math.sin(e * Math.PI) * 0.06; }, ease.inOut, i * 120);
      });
    }
  }

  function syncChips(room, p, slot, seat) {
    if (room.mode !== 'holdem') return;
    if (!holds.has(p.id) && seat.stack.amount !== p.stack) {
      if (seat.stack.group) root.remove(seat.stack.group);
      seat.stack.amount = p.stack;
      seat.stack.group = p.stack > 0 ? put(stackGroup(p.stack)) : null;
      seat.stack.group?.position.copy(pose.stack(slot));
    }
    const bet = p.bet || 0;
    if (!holds.has(p.id) && seat.bet.amount !== bet) {
      const old = seat.bet.group;
      if (old && bet === 0) {
        // Betting round over: the chips travel to the pot.
        const to = POT.clone().sub(pose.bet(slot)).add(old.position);
        potDelay = 450;
        move(old, to, 420, 0, ease.inOut).then(() => root.remove(old));
        sfx.chip();
      } else if (old) root.remove(old);
      seat.bet.amount = bet;
      seat.bet.group = bet > 0 ? put(stackGroup(bet)) : null;
      const g = seat.bet.group;
      if (g) {
        const to = pose.bet(slot);
        g.position.copy(to);
        if (!old || bet > 0) {
          g.position.copy(pose.stack(slot));
          move(g, to, 380).then(() => sfx.chip());
        }
      }
    }
  }

  function syncBoard(room) {
    if (room.mode !== 'holdem') return;
    while (board.length > room.board.length) { const c = board.pop(); c.parent?.remove(c); }
    const first = board.length;
    room.board.forEach((code, i) => {
      if (board[i]) return;
      const c = cardMesh(code);
      c.scale.set(1.35, 1, 1.35);
      c.position.set(BOARD_X(i), TY + 0.003, -0.02);
      c.rotation.x = Math.PI;
      board[i] = put(c);
      tween(520, (e) => {
        c.rotation.x = Math.PI * (1 - e);
        c.position.y = TY + 0.003 + Math.sin(e * Math.PI) * 0.18;
        c.position.z = -0.02 + (1 - e) * -0.35;
      }, ease.inOut, 150 * (i - first)).then(() => sfx.card());
    });
  }

  function syncPot(room) {
    if (room.mode !== 'holdem' || holds.has('pot')) return;
    if (room.pot === pot.amount) return;
    pot.amount = room.pot;
    const apply = () => {
      if (holds.has('pot')) return;
      if (pot.group) root.remove(pot.group);
      pot.group = pot.amount > 0 ? put(pileGroup(pot.amount)) : null;
      pot.group?.position.copy(POT);
    };
    if (potDelay) { setTimeout(apply, potDelay); potDelay = 0; } else apply();
  }

  function syncDealer(room) {
    const d = room.mode === 'holdem' && room.phase !== 'lobby' ? room.players.find((p) => p.isDealer) : null;
    const slot = d && layout.get(d.id);
    if (!slot) { if (dealer.mesh) { root.remove(dealer.mesh); dealer = { id: null, mesh: null }; } return; }
    const to = new THREE.Vector3(slot.x + 0.3, TY + 0.005, slot.s * (R - 0.5));
    if (!dealer.mesh) { dealer.mesh = put(dealerButton()); dealer.mesh.position.copy(to); }
    else if (dealer.id !== d.id) move(dealer.mesh, to, 500);
    dealer.id = d.id;
  }

  function syncBluff(room) {
    if (room.mode !== 'bluff') return;
    if (plaque) plaque.visible = room.phase !== 'lobby' && Boolean(room.tableRank);
    if (plaque && room.tableRank && plaque.userData.rank !== room.tableRank) {
      plaque.material = plaqueMaterials(room.tableRank);
      plaque.userData.rank = room.tableRank;
    }
    if (pile.round === undefined) {
      pile.round = room.round;
      if (room.lastPlay) addToPile(room.lastPlay.count, room.lastPlay.by);
    } else if (pile.round !== room.round) { pile.round = room.round; clearPile(); }
  }

  function addToPile(count, fromId) {
    const slot = layout.get(fromId);
    for (let i = 0; i < count; i++) {
      const c = cardMesh(null);
      c.rotation.x = Math.PI;
      const k = pile.n++;
      const to = new THREE.Vector3((Math.random() - 0.5) * 0.18, 0.003 + k * 0.0035, (Math.random() - 0.5) * 0.12);
      const ry = Math.random() * 6;
      pile.group.add(c);
      const from = slot ? new THREE.Vector3(slot.x - pile.group.position.x, 0.06, slot.s * (R - 0.36) - pile.group.position.z) : to;
      tween(420, (e) => {
        c.position.lerpVectors(from, to, e);
        c.position.y += Math.sin(e * Math.PI) * 0.1;
        c.rotation.y = ry * e;
      }, ease.out, i * 90).then(() => sfx.card());
    }
  }
  function clearPile() { pile.group.clear(); pile.n = 0; }

  function sync(room) {
    if (room.mode !== mode) setMode(room.mode);
    layout = computeLayout(room);
    for (const id of seats.keys()) if (!layout.has(id)) { clearSeat(seats.get(id)); seats.delete(id); }
    const from = dealerSpot(room);
    for (const p of room.players) {
      const slot = layout.get(p.id);
      if (!slot) continue;
      if (!seats.has(p.id)) seats.set(p.id, { cards: [], faceUp: '', stack: { amount: -1, group: null }, bet: { amount: -1, group: null } });
      const seat = seats.get(p.id);
      syncCards(room, p, slot, seat, from);
      syncChips(room, p, slot, seat);
    }
    syncBoard(room);
    syncPot(room);
    syncDealer(room);
    syncBluff(room);
  }

  /* hooks for animations */
  const slotOf = (id) => layout.get(id);
  const release = (id) => holds.delete(id);

  // All-in: the whole stack slides to the bet spot while tumbling.
  async function shove(id) {
    const slot = slotOf(id);
    const seat = seats.get(id);
    if (!slot || !seat?.stack.group) return;
    holds.add(id);
    const g = seat.stack.group;
    const dest = pose.bet(slot).sub(pose.stack(slot));
    const jobs = g.children.map((c, i) => {
      const from = c.position.clone();
      const to = from.clone().add(dest).add(new THREE.Vector3((Math.random() - 0.5) * 0.14, Math.random() * 0.03, (Math.random() - 0.5) * 0.14));
      const spin = (Math.random() - 0.5) * 2;
      return tween(650, (e) => { c.position.lerpVectors(from, to, e); c.rotation.x = spin * Math.sin(e * Math.PI) * 0.6; }, ease.out, Math.random() * 250 + (i % 5) * 10);
    });
    sfx.chip();
    await Promise.all(jobs);
  }

  // Pot chips fly to each winner and merge into their stack.
  async function payout(winners) {
    holds.add('pot');
    if (pot.group) { root.remove(pot.group); pot.group = null; }
    winners.forEach((w) => holds.add(w.id));
    await Promise.all(winners.map(async (w, wi) => {
      const slot = slotOf(w.id);
      if (!slot) return;
      const g = pileGroup(w.amount + wi);
      g.position.copy(POT);
      put(g);
      const to = pose.stack(slot).sub(POT);
      await Promise.all(g.children.map((c, i) => {
        const from = c.position.clone();
        return tween(700, (e) => { c.position.set(from.x + to.x * e, from.y + Math.sin(e * Math.PI) * 0.25, from.z + to.z * e); }, ease.inOut, i * 22);
      }));
      root.remove(g);
      sfx.chip();
    }));
    holds.delete('pot');
    winners.forEach((w) => holds.delete(w.id));
    pot.amount = -1;
  }

  return {
    sync, shove, payout, release, addToPile, clearPile,
    reset: () => setMode('holdem'),
    releaseAll: () => holds.clear(),
    slot: slotOf,
    head: (id) => { const s = slotOf(id); return s ? pose.head(s) : null; },
    stackPos: (id) => { const s = slotOf(id); return s ? pose.stack(s) : null; },
    potPos: () => POT.clone().setY(TY + 0.12),
    boardPos: () => new THREE.Vector3(0, TY, -0.02),
  };
}
