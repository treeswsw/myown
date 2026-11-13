// 요트다이스 판의 2D 그림(?nogl=1, WebGL 실패 때). 약속: docs/YACHT-PLAN.md 3-2 createDiceView.
// 트레이(검은 계단 테두리·빨간 펠트·보관 칸 5개)와 주사위·컵을 위에서 본 모습으로 그린다. 눈은 서버 값만 쓴다. Math.random 금지.
// 트레이 네모의 자리·크기는 board 가 host 의 CSS 변수(--tx --ty --t, px)로 정한다. 여기서는 곱하기만 한다.
// 맨 위에서는 document·window 를 만지지 않는다.

const PIP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

// 트레이 단위(한 변 10, 가운데 0,0, x 오른쪽, z 아래쪽) → 트레이 한 변을 1 로 본 비율.
const K = 0.068;            // 1 단위 = 트레이 한 변의 6.8%. |x|,|z| ≤ 4 이 펠트 안에 들어간다
const FELT_CX = 0.5;
const FELT_CY = 0.593;
const DIE = 0.11;           // 트레이 위 주사위 한 변
const SLOT_DIE = 0.12;      // 보관 칸 안 주사위 한 변
const CUP = { x: 0.74, y: 0.51 };
// 컵 안 주사위 자리(컵 가운데에서의 차이, 트레이 한 변 기준)와 기울기(도)
const IN_CUP = [[-0.09, -0.09, -18], [0.09, -0.1, 24], [0.0, 0.0, 12], [-0.1, 0.09, -32], [0.1, 0.08, 40]];

export const unitToFrac = (x, z) => ({ cx: FELT_CX + x * K, cy: FELT_CY + z * K });
export const slotCenter = (i) => ({ cx: 0.08 + i * (0.1552 + 0.016) + 0.0776, cy: 0.08 + 0.081 });

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const f3 = (n) => (Number.isFinite(n) ? n : 0).toFixed(3);

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function makeDie() {
  const d = el('div', 'yt-bd-die');
  for (let k = 0; k < 9; k++) d.appendChild(el('i'));
  return d;
}

export function createDiceView({ host, stage } = {}) {
  const fast = typeof location !== 'undefined' && /[?&]nogl=1/.test(location.search || '');
  const ROLL_S = fast ? 0.15 : 0.5;
  const KEEP_S = 0.15;

  const root = el('div', 'yt-bd-view');
  const tray = el('div', 'yt-bd-tray');
  const slotsBox = el('div', 'yt-bd-slots');
  const slotEls = [];
  for (let i = 0; i < 5; i++) { const s = el('div', 'yt-bd-slot'); s.setAttribute('data-yt', `slot-${i}`); slotsBox.appendChild(s); slotEls.push(s); }
  const felt = el('div', 'yt-bd-felt');
  const cupTop = el('div', 'yt-bd-cup');            // 위에서 본 컵(주사위가 들어 있을 때)
  const cupSide = el('div', 'yt-bd-cupside');       // 옆으로 누운 컵(쉬는 모습)
  tray.append(slotsBox, felt, cupSide, cupTop);
  const dieEls = [0, 1, 2, 3, 4].map(() => makeDie());
  dieEls.forEach((d, i) => { d.setAttribute('data-yt', `dv-${i}`); tray.appendChild(d); });
  root.appendChild(tray);
  host.appendChild(root);

  // 주사위마다 지금 모습(cx, cy: 트레이 비율, rot: 라디안, sz: 한 변 비율)
  const cur = [0, 1, 2, 3, 4].map(() => ({ cx: 0.5, cy: 0.5, rot: 0, sz: DIE, v: 1, inCup: false }));
  let anims = [];                 // { i, from, to, t, dur, done }
  let waiters = [];               // { resolve, pending:Set }
  let shaking = false;
  let last = { dice: null, shaking: false, cupHasDice: true };
  let cupFull = true;
  let cupFlip = null;             // { at: 초, left: 초 }
  let shakeT = 0;
  let dead = false;

  const target = (i, d, held) => {
    if (!d) return { ...cupSpot(i), sz: DIE, inCup: true };
    if (d.slot != null) return { ...slotCenter(d.slot), rot: 0, sz: SLOT_DIE, inCup: false };
    if (held) return { ...cupSpot(i), sz: DIE, inCup: true };
    const p = unitToFrac(d.x, d.z);
    return { cx: p.cx, cy: p.cy, rot: d.yaw || 0, sz: DIE, inCup: false };
  };
  function cupSpot(i) {
    const o = IN_CUP[i];
    return { cx: CUP.x + o[0], cy: CUP.y + o[1], rot: (o[2] * Math.PI) / 180 };
  }

  function paintDie(i) {
    const m = cur[i], e = dieEls[i];
    let { cx, cy } = m;
    if (m.inCup && shaking) { cx += Math.sin(shakeT * 31 + i * 1.7) * 0.012; cy += Math.cos(shakeT * 27 + i * 2.3) * 0.012; }
    e.style.left = (cx * 100).toFixed(3) + '%';
    e.style.top = (cy * 100).toFixed(3) + '%';
    e.style.width = e.style.height = `calc(var(--t, 300px) * ${m.sz})`;
    e.style.padding = `calc(var(--t, 300px) * ${(m.sz * 0.13).toFixed(4)})`;
    e.style.transform = `translate(-50%, -50%) rotate(${m.rot.toFixed(4)}rad)`;
    e.style.zIndex = m.inCup ? '4' : (m.sz === SLOT_DIE ? '2' : '1');
    e.classList.toggle('yt-bd-incup', m.inCup);
    const pips = PIP[m.v] || [];
    for (let k = 0; k < 9; k++) dieEls[i].children[k].className = pips.indexOf(k) < 0 ? 'yt-bd-x' : '';
    e.setAttribute('aria-label', '주사위 ' + m.v);
  }
  function paintCup() {
    cupTop.style.display = cupFull ? '' : 'none';
    cupSide.style.display = cupFull ? 'none' : '';
    cupTop.style.transform = cupFull && shaking ? `translate(${(-50 + Math.sin(shakeT * 31) * 2.5).toFixed(2)}%, -50%)` : '';
  }
  function paintAll() { for (let i = 0; i < 5; i++) paintDie(i); paintCup(); }

  function setData(i, d) {
    const e = dieEls[i];
    if (!d) { e.removeAttribute('data-v'); e.removeAttribute('data-x'); e.removeAttribute('data-z'); e.removeAttribute('data-slot'); return; }
    e.setAttribute('data-v', String(d.v));
    e.setAttribute('data-x', f3(d.x));
    e.setAttribute('data-z', f3(d.z));
    e.setAttribute('data-slot', d.slot == null ? '' : String(d.slot));
  }
  function setSlotMarks(dice) {
    slotEls.forEach((s) => { s.removeAttribute('data-v'); });
    if (!dice) return;
    dice.forEach((d) => { if (d && d.slot != null && slotEls[d.slot]) slotEls[d.slot].setAttribute('data-v', String(d.v)); });
  }

  function finishAll() {
    for (const a of anims) { Object.assign(cur[a.i], a.to); }
    anims = [];
    if (cupFlip) { cupFull = false; cupFlip = null; }
    const ws = waiters; waiters = [];
    ws.forEach((w) => w.resolve());
    paintAll();
  }

  function applyDraw(a) {
    last = { dice: a.dice ?? null, shaking: !!a.shaking, cupHasDice: !!a.cupHasDice };
    shaking = last.shaking;
    const held = shaking || last.cupHasDice;
    let any = !a.dice;
    for (let i = 0; i < 5; i++) {
      const d = a.dice ? a.dice[i] : null;
      const t = target(i, d, held && !(d && d.slot != null));
      Object.assign(cur[i], t, { v: d ? d.v : (cur[i].v || 1) });
      if (t.inCup) any = true;
      setData(i, d);
    }
    cupFull = any;
    setSlotMarks(a.dice);
    paintAll();
  }

  function draw(a = {}) {
    finishAll();
    applyDraw(a);
  }

  function addAnim(i, to, dur) {
    anims = anims.filter((x) => x.i !== i);
    anims.push({ i, from: { cx: cur[i].cx, cy: cur[i].cy, rot: cur[i].rot, sz: cur[i].sz }, to, t: 0, dur });
  }
  function wait() {
    return new Promise((resolve) => { waiters.push({ resolve }); });
  }

  function playRoll({ seed = 0, thrown = [], dice = [] } = {}) {
    finishAll();
    shaking = false;
    last = { dice, shaking: false, cupHasDice: false };
    const set = new Set(thrown);
    for (let i = 0; i < 5; i++) {
      const d = dice[i];
      if (!d) continue;
      setData(i, d);
      if (set.has(i) || d.slot == null) {
        // 컵 안에서 시작해 멈출 자리로 미끄러진다(굴러서 도는 각도는 seed 로 정한다: 모든 기기가 같다)
        const spin = ((((seed >>> 0) >> (i * 3)) & 7) - 3) * 0.9 + 2.4;
        Object.assign(cur[i], cupSpot(i), { v: d.v, sz: DIE, inCup: true });
        addAnim(i, { cx: unitToFrac(d.x, d.z).cx, cy: unitToFrac(d.x, d.z).cy, rot: (d.yaw || 0), sz: DIE, inCup: false }, ROLL_S);
        anims[anims.length - 1].from.rot = (d.yaw || 0) + spin;
      } else {
        Object.assign(cur[i], target(i, d, false), { v: d.v });
      }
    }
    setSlotMarks(dice);
    cupFull = true;
    cupFlip = { left: ROLL_S * 0.4 };
    paintAll();
    return wait();
  }

  function playKeep({ i, on, slot, x, z, yaw } = {}) {
    if (i == null || !cur[i]) return Promise.resolve();
    // 이미 움직이는 것이 있으면 먼저 끝낸다
    finishAll();
    const to = on
      ? { ...slotCenter(slot ?? 0), rot: 0, sz: SLOT_DIE, inCup: false }
      : { ...unitToFrac(x || 0, z || 0), rot: yaw || 0, sz: DIE, inCup: false };
    cur[i].inCup = false;
    addAnim(i, to, KEEP_S);
    const dd = last.dice && last.dice[i];
    if (dd) {
      dd.slot = on ? (slot ?? 0) : null;
      if (!on) { dd.x = x; dd.z = z; dd.yaw = yaw; }
      setData(i, dd);
      setSlotMarks(last.dice);
    }
    return wait();
  }

  function setShaking(b) {
    b = !!b;
    if (b === shaking) return;
    finishAll();
    applyDraw({ ...last, shaking: b });
  }

  function hitOf(i) {
    const m = cur[i];
    if (!m || m.inCup || !last.dice || !last.dice[i]) return null;
    const hr = host.getBoundingClientRect();
    const r = dieEls[i].getBoundingClientRect();
    const t = tray.getBoundingClientRect().width;
    const d = Math.max(r.width, t * m.sz * 0.9);
    const w = Math.max(d, 38);
    const cx = r.left + r.width / 2 - hr.left, cy = r.top + r.height / 2 - hr.top;
    return { x: cx - w / 2, y: cy - w / 2, w, h: w };
  }

  function frame(dt = 0) {
    if (dead) return;
    shakeT += dt;
    let moved = false;
    if (anims.length) {
      for (const a of anims) {
        a.t += dt;
        const k = a.dur <= 0 ? 1 : Math.min(1, a.t / a.dur);
        const e = easeOut(k);
        const m = cur[a.i];
        m.cx = a.from.cx + (a.to.cx - a.from.cx) * e;
        m.cy = a.from.cy + (a.to.cy - a.from.cy) * e;
        m.rot = a.from.rot + (a.to.rot - a.from.rot) * e;
        m.sz = a.from.sz + (a.to.sz - a.from.sz) * e;
        if (k >= 1) { Object.assign(m, a.to); a.done = true; }
        paintDie(a.i);
      }
      anims = anims.filter((a) => !a.done);
      moved = true;
      if (!anims.length) {
        if (cupFlip) { cupFull = false; cupFlip = null; paintCup(); }
        const ws = waiters; waiters = [];
        ws.forEach((w) => w.resolve());
      }
    }
    if (cupFlip && cupFlip.left != null) {
      cupFlip.left -= dt;
      if (cupFlip.left <= 0) { cupFull = false; cupFlip = anims.length ? { left: null } : null; paintCup(); }
    }
    if (!moved && shaking) paintAll();
  }

  function resize() { paintAll(); }
  function skip() { finishAll(); }
  function dispose() {
    dead = true;
    const ws = waiters; waiters = []; ws.forEach((w) => w.resolve());
    root.remove();
  }
  const dieEl = (i) => dieEls[i];
  const isAnimating = () => anims.length > 0;

  applyDraw({ dice: null, shaking: false, cupHasDice: true });
  return { draw, playRoll, playKeep, setShaking, hitOf, skip, frame, resize, dispose, dieEl, isAnimating };
}
