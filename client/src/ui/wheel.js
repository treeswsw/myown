import { h, svg, fmt, fmtShort } from './dom.js';
import { LINE, TOP } from './icons.js';

const STEP = 100;
const NS = 'http://www.w3.org/2000/svg';

const segPath = (a0, a1, icon) => {
  const R0 = 75;
  const p = (a, r) => [R0 + r * Math.cos(a), R0 + r * Math.sin(a)];
  const [x0, y0] = p(a0, 66);
  const [x1, y1] = p(a1, 66);
  const [ix, iy] = p((a0 + a1) / 2, 40);
  const [ax, ay] = p(a0 + 0.08, 71);
  const [bx, by] = p(a1 - 0.08, 71);
  return `<path class="bg" d="M${R0} ${R0}L${x0} ${y0}A66 66 0 0 1 ${x1} ${y1}z"/><path class="arc" d="M${ax} ${ay}A71 71 0 0 1 ${bx} ${by}"/>`
    + `<g transform="translate(${ix - 17} ${iy - 17}) scale(1.42)">${icon}</g>`;
};

// Action wheel (call/check, raise, fold) that turns into the raise dial.
export function createWheel(ui, send) {
  const root = h('div', 'act');
  ui.append(root);
  root.style.display = 'none';
  let mode = 'wheel';
  let hl = 1;
  let amount = 0;
  let ctx = null; // { min, max, pot, toCall, canRaise }
  let key = '';

  const act = (a, extra) => { send({ t: 'act', a, ...extra }); hide(); };
  const hide = () => { root.style.display = 'none'; key = ''; mode = 'wheel'; };

  // The wheel is built once per turn; hover/press only toggles classes. Rebuilding the nodes on
  // pointerenter would detach the element before the tap's click arrives on touch screens.
  function drawWheel() {
    const segs = [
      { icon: LINE.call, name: ctx.toCall > 0 ? '콜' : '체크', val: ctx.toCall > 0 ? fmt(ctx.toCall) : '', on: true, run: () => act(ctx.toCall > 0 ? 'call' : 'check') },
      { icon: LINE.raise, name: '레이즈', val: '', on: ctx.canRaise, run: () => { mode = 'dial'; amount = ctx.min; draw(); } },
      { icon: LINE.fold, name: '폴드', val: '', on: true, run: () => act('fold') },
    ];
    const s = svg('', '0 0 150 150');
    s.classList.add('wheel');
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    const nameEl = h('span', 'ko');
    const valEl = h('span', 'num');
    const nodes = segs.map((g, i) => {
      const a0 = (Math.PI * 5) / 6 + (i * 2 * Math.PI) / 3;
      const node = document.createElementNS(NS, 'g');
      node.setAttribute('class', `wseg ${g.on ? '' : 'off'}`);
      node.innerHTML = segPath(a0, a0 + (2 * Math.PI) / 3, g.icon);
      s.append(node);
      return node;
    });
    const highlight = (i) => {
      hl = i;
      nodes.forEach((n, k) => n.classList.toggle('hl', k === i));
      nameEl.textContent = segs[i].name;
      valEl.textContent = segs[i].val;
    };
    nodes.forEach((node, i) => {
      node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && segs[i].on) highlight(i); });
      node.addEventListener('click', () => { if (segs[i].on) { highlight(i); segs[i].run(); } });
    });
    s.insertAdjacentHTML('beforeend', '<circle cx="75" cy="75" r="9" fill="#0a0806" stroke="#cfc9bd" stroke-width="1.5"/>');
    root.replaceChildren(h('div', 'wl', nameEl, valEl), s);
    highlight(hl);
  }

  /* dial: gauge from 135deg clockwise to 405deg */
  const A0 = Math.PI * 0.75;
  const A1 = Math.PI * 2.25;
  const pt = (a, r = 82) => [95 + r * Math.cos(a), 95 + r * Math.sin(a)];
  const arc = (x, y, col) => `<path d="M${pt(x)}A82 82 0 ${y - x > Math.PI ? 1 : 0} 1 ${pt(y)}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"/>`;
  const frac = () => (ctx.max > ctx.min ? (amount - ctx.min) / (ctx.max - ctx.min) : 1);
  const clamp = (v) => Math.max(ctx.min, Math.min(ctx.max, v));
  const potText = () => {
    const r = amount / Math.max(1, ctx.pot);
    const near = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '1'], [2, '2']].find(([v]) => Math.abs(r - v) < 0.03);
    return `팟의 ${near ? near[1] : `${Math.round(r * 100)}%`}`;
  };

  let dialSvg;
  let numEl;
  let subEl;
  const paintDial = () => {
    const a = A0 + (A1 - A0) * frac();
    const [kx, ky] = pt(a);
    dialSvg.innerHTML = `<circle cx="95" cy="95" r="93" fill="rgba(18,16,14,.95)" stroke="#0a0806" stroke-width="3"/>${arc(A0, A1, 'rgba(255,255,255,.2)')}${frac() > 0 ? arc(A0, a, '#ffc62a') : ''}<circle cx="${kx}" cy="${ky}" r="9" fill="#fff" stroke="#0a0806" stroke-width="2.5"/>`;
    numEl.textContent = fmt(amount);
    subEl.textContent = potText();
  };
  const setAmount = (v) => { amount = clamp(v); paintDial(); };

  function stepper(dir, icon) {
    const b = h('button');
    b.type = 'button';
    b.append(svg(icon, '0 0 14 14'));
    let timer;
    const stop = () => { clearTimeout(timer); clearInterval(timer); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      setAmount(amount + dir * STEP);
      let n = 0;
      timer = setTimeout(() => { timer = setInterval(() => { n++; setAmount(amount + dir * STEP * (n > 12 ? 5 : 1)); }, 70); }, 350);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => b.addEventListener(t, stop));
    return b;
  }

  function drawDial() {
    dialSvg = svg('', '0 0 190 190');
    numEl = h('div', 'num');
    subEl = h('small');
    const box = h('div', 'dialbox', dialSvg,
      h('div', 'mid', h('small', '', '레이즈 금액'), numEl, subEl, h('div', 'ar', stepper(-1, TOP.arrowL), stepper(1, TOP.arrowR))),
      h('span', 'lim', fmtShort(ctx.min)), h('span', 'lim', fmtShort(ctx.max)));
    box.children[2].style.left = '20px';
    box.children[3].style.right = '14px';
    const fromPointer = (e) => {
      const r = dialSvg.getBoundingClientRect();
      let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
      if (a < A0 - Math.PI * 2) a += Math.PI * 2;
      if (a < A0) a += Math.PI * 2;
      if (a > A1) a = a - A1 < (A0 + Math.PI * 2 - a) ? A1 : A0; // dead zone at the bottom snaps to the nearer end
      const raw = ctx.min + (ctx.max - ctx.min) * ((a - A0) / (A1 - A0));
      setAmount(raw >= ctx.max - STEP / 2 ? ctx.max : Math.round(raw / STEP) * STEP);
    };
    dialSvg.addEventListener('pointerdown', (e) => {
      const r = dialSvg.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 190);
      if (d < 55) return;
      dialSvg.setPointerCapture(e.pointerId);
      fromPointer(e);
      dialSvg.onpointermove = fromPointer;
    });
    dialSvg.addEventListener('pointerup', () => { dialSvg.onpointermove = null; });

    const btn = (icon, label, fn, off) => {
      const b = h('button');
      b.type = 'button';
      b.disabled = Boolean(off);
      b.append(svg(icon), label);
      b.onclick = fn;
      return b;
    };
    const keys = h('div', 'keys',
      btn(LINE.raise, '올인', () => act('allin')),
      btn(LINE.fold, '취소', () => { mode = 'wheel'; draw(); }),
      btn(LINE.call, '레이즈 확정', () => act('raise', { amount })));
    root.replaceChildren(box, keys);
    paintDial();
  }

  function draw() { if (mode === 'dial') drawDial(); else drawWheel(); }

  return {
    update(room, me, visible) {
      if (!visible) { hide(); return; }
      const canRaise = room.maxRaiseTo > 0;
      const next = { min: room.minRaiseTo, max: room.maxRaiseTo, pot: room.pot, toCall: room.toCall, canRaise };
      const k = `${room.turn}|${room.toCall}|${room.minRaiseTo}|${room.maxRaiseTo}|${me.stack}`;
      ctx = next;
      root.style.display = '';
      if (k === key) return;
      key = k;
      mode = 'wheel';
      hl = canRaise ? 1 : 0;
      draw();
    },
  };
}
