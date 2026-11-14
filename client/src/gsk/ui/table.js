// 갱스껄 탁자 (.gk-tb-): 정다각형 자리, 개인판, 더미, 이름표, 가운데(숫자·해골·문구), 펼친 줄, 상대 더미 누르기.
//   const t = createTable(parent, ctx);   // ctx = { send, meId, now, face(id), layout(), busy() }
//   t.update(view)   view = toView(...) + { hold:{shown:{id:n},row:n}, outcome, penalty }  (index.js 가 붙임)
//   t.event(e)       지금은 쓰지 않음(모양만 맞춤)
//   t.anchor(kind, id)  'mat'|'stack'|'tag'|'center'|'row'|'rowSlot'|'handDock' → DOM 요소 | null
//   t.dispose()
// 좌표는 시안 크기(PC 1280x720 / 휴대폰 844x390) 기준이고, 실제 화면 크기에 맞추는 것은 부모(index.js)가 상자째 scale 한다.
// 사용자 글자(이름)는 textContent 로만 넣는다.
import './table.css';
import { requestFor } from '../actions.js';
import { COLORS, discBackUrl, discFlowerUrl, discSkullUrl, matUrl, setSkullImg } from '../art.js';
import {
  LAYOUTS, tintOf, seatGeom, pileModel, badgePos, rowLayout, reconcileRow, isFlipStep, midModel, chipFor, ringFor, orderSeats,
} from './table.pure.js';

const HOST = new URL('../img/marker-skull.png', import.meta.url).href;
const DISC_ICON = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#c8bca4" stroke-width="1.3" aria-hidden="true"><circle cx="6" cy="6" r="4.6"></circle><circle cx="6" cy="6" r="1.5"></circle></svg>';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const px = (n) => `${n}px`;

export function createTable(parent, ctx) {
  const root = el('div', 'gk-tb');
  root.hidden = true;
  parent.appendChild(root);

  const seatLayer = el('div', 'gk-tb-layer');
  const tagLayer = el('div', 'gk-tb-layer');
  const rowBox = el('div', 'gk-tb-row');
  const pickLayer = el('div', 'gk-tb-layer');
  const dock = el('div', 'gk-tb-dock');

  // 가운데
  const mid = el('div', 'gk-tb-mid');
  mid.dataset.gk = 'center';
  const cap = el('div', 'gk-tb-cap');
  const numRow = el('div', 'gk-tb-numrow');
  const numL = el('i');
  const num = el('span', 'gk-tb-num');
  const numR = el('i', 'gk-tb-r');
  numRow.append(numL, num, numR);
  const host = el('img', 'gk-tb-host');
  host.src = HOST;
  host.alt = '';
  host.draggable = false;
  const sayBox = el('div', 'gk-tb-saybox');
  const say = el('div', 'gk-tb-say');
  const sub = el('div', 'gk-tb-sub');
  sayBox.append(say, sub);
  mid.append(cap, numRow, host, sayBox);

  root.append(seatLayer, tagLayer, rowBox, mid, pickLayer, dock);

  let lastNum = '';
  const seats = new Map(); // id → record
  const slotEls = [];
  let row = [];
  let disposed = false;
  let lastView = null;

  function makeSeat(id) {
    const seat = el('div', 'gk-tb-seat');
    const ring = el('div', 'gk-tb-turn');
    ring.hidden = true;
    const board = el('img', 'gk-tb-board');
    board.alt = '';
    board.draggable = false;
    const pile = el('div', 'gk-tb-pile');
    seat.append(ring, board, pile);
    seatLayer.append(seat);

    const tag = el('div', 'gk-tb-tag');
    tag.dataset.gkSeat = id;
    const av = el('img', 'gk-tb-av');
    av.alt = '';
    av.draggable = false;
    const col = el('div', 'gk-tb-info');
    const nm = el('div', 'gk-tb-nm');
    const nmText = el('span');
    const dot = el('i', 'gk-tb-dot');
    const chip = el('span', 'gk-tb-chip');
    chip.hidden = true;
    nm.append(nmText, dot, chip);
    const meta = el('div', 'gk-tb-meta');
    const pip1 = el('i', 'gk-tb-pip');
    const pip2 = el('i', 'gk-tb-pip');
    const icon = el('span', 'gk-tb-icon');
    icon.innerHTML = DISC_ICON;
    const discs = el('span');
    const pick = el('span', 'gk-tb-pick-name'); // 대기실에서는 고른 색 이름
    meta.append(pip1, pip2, icon, discs, pick);
    col.append(nm, meta);
    tag.append(av, col);
    tagLayer.append(tag);
    return { id, seat, ring, board, pile, pileBox: null, tag, av, nmText, dot, chip, meta, pip1, pip2, icon, discs, pick, sigPile: '', sigBoard: '', sigAv: '' };
  }

  function skullSrc(img, c, faceUrl) {
    setSkullImg(img, c, faceUrl);
  }

  function drawPile(rec, s, hold, L, geo, colorIdx) {
    const m = pileModel(s, hold, L);
    const face = ctx.face ? ctx.face(s.id) : null;
    const sig = `${L.kind}|${colorIdx}|${m.backs}|${m.skulls}|${face ? face.length : 0}`;
    rec.pile.style.transform = `rotate(${-geo.rot}deg)`;
    if (sig === rec.sigPile) return;
    rec.sigPile = sig;
    rec.pile.replaceChildren();
    if (!m.count) { rec.pileBox = null; return; }
    for (const d of m.discs) {
      const dk = el('div', 'gk-tb-dk');
      dk.style.left = px(d.x);
      dk.style.top = px(d.y);
      const img = el('img');
      img.alt = '';
      img.draggable = false;
      if (d.kind === 'B') { img.src = discBackUrl(colorIdx); img.style.transform = `rotate(${d.rot}deg)`; } else skullSrc(img, colorIdx, face);
      dk.append(img);
      rec.pile.append(dk);
    }
    const hi = el('i', 'gk-tb-hi');
    hi.style.left = px(m.topX);
    hi.style.top = px(m.topY);
    rec.pile.append(hi);
    const box = el('i', 'gk-tb-pilebox'); // 연출이 위치를 잴 때 쓰는 보이지 않는 칸
    box.style.left = px(m.topX);
    box.style.top = px(m.topY);
    rec.pile.append(box);
    rec.pileBox = box;
    const b = badgePos(geo.side, L);
    const bd = el('div', 'gk-tb-n');
    bd.style.left = px(b.x);
    bd.style.top = px(b.y);
    bd.append(el('span', null, m.label));
    rec.pile.append(bd);
  }

  function update(v) {
    if (disposed) return;
    lastView = v;
    if (v) { root.dataset.step = v.step || ''; root.dataset.phase = v.phase || ''; }
    if (!v || !v.seats || !v.seats.length) {
      root.hidden = true;
      for (const rec of seats.values()) { rec.seat.remove(); rec.tag.remove(); }
      seats.clear();
      while (slotEls.length) slotEls.pop().remove();
      pickLayer.replaceChildren();
      row = [];
      return;
    }
    root.hidden = false;
    const lay = ctx.layout ? ctx.layout() : 'pc';
    const L = LAYOUTS[lay] || LAYOUTS.pc;
    root.classList.toggle('gk-tb-sm', L.kind === 'phone');
    root.dataset.lay = L.kind;
    dock.style.cssText = L.kind === 'phone' ? 'left:16px;top:322px;width:80px;height:56px' : 'left:36px;top:632px;width:100px;height:56px';

    const hold = v.hold || { shown: {}, row: 0 };
    const list = orderSeats(v.seats);
    const geoms = seatGeom(list.length, L);
    const lobby = v.phase === 'lobby';
    root.classList.toggle('gk-tb-lobby', lobby);
    const keep = new Set();

    list.forEach((s, i) => {
      keep.add(s.id);
      let rec = seats.get(s.id);
      if (!rec) { rec = makeSeat(s.id); seats.set(s.id, rec); }
      const q = geoms[i];
      const colorIdx = s.color == null ? 0 : s.color;
      rec.seat.style.left = px(q.x);
      rec.seat.style.top = px(q.y);
      rec.seat.style.transform = `rotate(${q.rot}deg)`;
      rec.seat.classList.toggle('gk-tb-out', !!s.out);
      rec.seat.classList.toggle('gk-tb-nocolor', s.color == null);
      const bsig = `${colorIdx}|${s.points >= 1 ? 1 : 0}`;
      if (bsig !== rec.sigBoard) { rec.sigBoard = bsig; rec.board.src = matUrl(colorIdx, s.points >= 1); }

      const ring = ringFor(s, v);
      rec.ring.hidden = !ring;
      rec.ring.classList.toggle('gk-tb-red', ring === 'red');
      // 도전 실패 판정이 났을 때 도전자 판이 움찔
      rec.seat.classList.toggle('gk-tb-flinch', !!(s.isChallenger && v.step === 'reveal' && v.outcome && !v.outcome.ok));

      if (lobby) { rec.sigPile = ''; rec.pile.replaceChildren(); } else drawPile(rec, s, (hold.shown && hold.shown[s.id]) || 0, L, q, colorIdx);

      // 이름표
      rec.tag.style.left = px(q.lx);
      rec.tag.style.top = px(q.ly);
      rec.tag.classList.toggle('gk-tb-on', ring === 'gold');
      rec.tag.classList.toggle('gk-tb-red', ring === 'red');
      rec.tag.classList.toggle('gk-tb-out', !!s.out);
      const face = ctx.face ? ctx.face(s.id) : null;
      const asig = `${colorIdx}|${face ? face.length : 0}|${face ? face.slice(-24) : ''}`;
      if (asig !== rec.sigAv) { rec.sigAv = asig; rec.av.src = face || discSkullUrl(colorIdx); }
      rec.av.style.boxShadow = `0 0 0 1.5px ${tintOf(s.color)}`;
      rec.nmText.textContent = s.isMe ? `${s.name} (나)` : s.name;
      rec.dot.style.background = tintOf(s.color);
      rec.dot.hidden = s.color == null;
      const chip = lobby ? null : chipFor(s, v);
      rec.chip.hidden = !chip;
      if (chip) {
        rec.chip.textContent = chip.text;
        rec.chip.className = 'gk-tb-chip' + (chip.kind ? ` gk-tb-${chip.kind}` : '');
      }
      rec.pip1.hidden = rec.pip2.hidden = rec.icon.hidden = rec.discs.hidden = lobby;
      rec.pick.hidden = !lobby;
      rec.pick.textContent = s.color == null ? '색 고르는 중' : COLORS[s.color].name;
      rec.pip1.classList.toggle('gk-tb-on', s.points >= 1);
      rec.pip2.classList.toggle('gk-tb-on', s.points >= 2);
      rec.discs.textContent = String(s.discs);
    });
    for (const [id, rec] of seats) {
      if (keep.has(id)) continue;
      rec.seat.remove();
      rec.tag.remove();
      seats.delete(id);
    }

    drawCenter(v, L, hold);
    drawPicks(v, list, geoms, L, hold);
  }

  function drawCenter(v, L, hold) {
    const flipping = isFlipStep(v);
    if (!flipping) row = [];
    else row = reconcileRow(row, v.seats, (v.seats.find((s) => s.isChallenger) || {}).id);
    const holdRow = Math.min(hold.row | 0, row.length);
    const m = midModel(v, { holdRow, need: v.progress ? v.progress.need : 0 });

    mid.classList.toggle('gk-tb-flip', m.mode === 'flip');
    cap.textContent = m.cap;
    cap.hidden = !m.cap;
    numRow.hidden = m.num == null;
    const numText = m.num == null ? '' : `${m.num}|${m.small || ''}`;
    num.textContent = m.num == null ? '' : String(m.num);
    if (m.small) num.append(el('small', null, ` ${m.small}`));
    // 숫자가 바뀌면 톡 튄다(처음 그릴 때는 제외)
    if (numText && lastNum && numText !== lastNum) {
      num.classList.remove('gk-tb-pop');
      void num.offsetWidth;
      num.classList.add('gk-tb-pop');
    }
    lastNum = numText;
    host.hidden = m.mode === 'flip';
    say.textContent = m.say;
    sub.textContent = m.sub;
    sub.hidden = !m.sub;

    // 펼친 줄
    const need = v.progress ? v.progress.need : 0;
    const total = m.mode === 'flip' ? Math.max(need, row.length) : 0;
    const rl = rowLayout(total, L);
    const F = L.flip;
    if (m.mode === 'flip') {
      mid.style.left = px(L.G.cx);
      mid.style.top = px(F.capTop);
      sayBox.style.top = px(rl.sayTop - F.capTop);
    } else {
      mid.style.left = px(L.mid.x);
      mid.style.top = px(L.mid.y);
      sayBox.style.top = '';
    }
    rowBox.hidden = m.mode !== 'flip';
    // 줄 상자는 칸들을 감싸는 보이지 않는 틀(연출이 줄 위치를 잴 때)
    if (rl.n) {
      const xs = rl.slots.map((p) => p.x), ys = rl.slots.map((p) => p.y);
      const x0 = Math.min(...xs) - rl.ss / 2, x1 = Math.max(...xs) + rl.ss / 2;
      const y0 = Math.min(...ys) - rl.ss / 2, y1 = Math.max(...ys) + rl.ss / 2;
      rowBox.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
      while (slotEls.length < rl.n) { const s = el('div', 'gk-tb-slot'); rowBox.append(s); slotEls.push(s); }
      while (slotEls.length > rl.n) slotEls.pop().remove();
      const shownCount = row.length - holdRow;
      const rem = need - Math.max(0, shownCount);
      rl.slots.forEach((p, i) => {
        const s = slotEls[i];
        s.style.left = px(p.x - x0 - rl.ss / 2);
        s.style.top = px(p.y - y0 - rl.ss / 2);
        s.style.width = s.style.height = px(rl.ss);
        const filled = i < row.length;
        const hidden = filled && i >= row.length - holdRow;
        s.classList.toggle('gk-tb-on', filled && !hidden);
        s.classList.toggle('gk-tb-edge', !filled && v.step === 'flip' && rem === 1 && i === shownCount + holdRow);
        s.style.visibility = '';
        s.replaceChildren();
        if (filled) {
          const owner = v.seats.find((q) => q.id === row[i]);
          const img = el('img');
          img.alt = '';
          img.draggable = false;
          img.src = discFlowerUrl(owner && owner.color != null ? owner.color : 0);
          if (hidden) img.style.visibility = 'hidden';
          s.append(img);
        }
      });
    } else {
      while (slotEls.length) slotEls.pop().remove();
    }
  }

  function drawPicks(v, list, geoms, L, hold) {
    pickLayer.replaceChildren();
    if (ctx.busy && ctx.busy()) return;
    for (const a of v.actions || []) {
      if (a.a !== 'flip') continue;
      const i = list.findIndex((s) => s.id === a.p);
      if (i < 0) continue;
      const q = geoms[i];
      const m = pileModel(list[i], (hold.shown && hold.shown[a.p]) || 0, L);
      const b = el('button', 'gk-tb-pick');
      b.type = 'button';
      b.dataset.gk = a.key;
      b.setAttribute('aria-label', `${list[i].name} 님 더미 뒤집기`);
      b.style.left = px(q.x);
      b.style.top = px(q.y - ((m.count || 1) - 1) * L.STEP / 2);
      b.addEventListener('click', () => {
        if (disposed || (ctx.busy && ctx.busy())) return;
        const req = requestFor(a);
        if (req) ctx.send(req);
      });
      pickLayer.append(b);
    }
  }

  function anchor(kind, id) {
    switch (kind) {
      case 'mat': return (seats.get(id) || {}).board || null;
      case 'stack': { const r = seats.get(id); return r ? (r.pileBox || r.board) : null; }
      case 'tag': return (seats.get(id) || {}).tag || null;
      case 'center': return mid;
      case 'row': return rowBox.hidden ? null : rowBox;
      case 'rowSlot': return slotEls[id | 0] || null;
      case 'handDock': return dock;
      default: return null;
    }
  }

  return {
    el: root,
    update,
    event() {},
    anchor,
    redraw() { if (lastView) update(lastView); },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  };
}
