// 요트다이스 판의 3D 그림. dice2d.js 와 같은 모양(createDiceView, docs/YACHT-PLAN.md 3-2).
// 장면(scene/)에 자리·자세를 넘기기만 한다. 굴림은 anim/player.js 가 계산기 경로를 시각 t 의 모습으로 바꿔 준다.
// 시각은 시계(performance.now)에서 읽는다 → 프레임이 빠져도 같은 시각에 같은 자리, 끝은 서버 상태의 자리·눈.
// board.js 가 import() 로 따로 불러온다(2D 만 쓰는 기기는 받지 않는다). Math.random 금지.
import { createYachtScene, slotPos, upQuat } from '../scene/index.js';
import { createRollPlayer, restPose, qmix, vmix } from '../anim/player.js';
import { DIE, CUP } from '../../../../shared/yacht/sim.js';
import { ytSfx } from '../audio.js';

const REST_Y = DIE / 2;
const MOVE_S = 0.15;          // 보관·빼기
const CUP_S = 0.25;           // 컵 들기·눕히기, 주사위가 컵으로 들어가고 나오기
const CUP_IN = [CUP.x, 5.6, CUP.z];
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const f3 = (n) => (Number.isFinite(n) ? n : 0).toFixed(3);

export function createDiceView({ host, stage, clock, scene: givenScene, reduced } = {}) {
  const now = () => (clock ? clock() : performance.now()) / 1000;
  const sc = givenScene || createYachtScene({ stage });
  stage?.use?.(sc.scene, sc.camera);

  // 보관 칸 표식(시험·접근성용. 보이지 않고 눌리지 않는다)
  const root = document.createElement('div');
  root.setAttribute('data-yt', 'view3d');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  const slotEls = [0, 1, 2, 3, 4].map((i) => {
    const s = document.createElement('div');
    s.setAttribute('data-yt', `slot-${i}`);
    s.style.cssText = 'position:absolute;pointer-events:none;';
    root.appendChild(s);
    return s;
  });
  host.appendChild(root);

  // 주사위마다 지금 모습. hidden = 컵 안(장면에서는 숨김)
  const model = [0, 1, 2, 3, 4].map(() => ({ pos: [0, REST_Y, 0], quat: [0, 0, 0, 1], hidden: true }));
  let last = { dice: null, shaking: false, cupHasDice: true };
  let shaking = false, shakeT = 0;
  let lift = 1, liftTo = 1, cupDice = 5;
  let moves = [];               // { i, from, to, t0, dur, arc, hide }
  let waiters = [];
  let roll = null;              // { player, t0, at, resolve }
  let prev = now();
  let hostRect = null;
  let dead = false;

  function put(i, pos, quat) {
    const m = model[i];
    m.pos = pos; m.quat = quat; m.hidden = false;
    sc.setDie(i, { pos, quat });
  }
  function hide(i) { model[i].hidden = true; sc.setDieHidden(i, true); }
  const slotPose = (slot, v) => { const [x, z] = slotPos(slot); return { pos: [x, REST_Y, z], quat: upQuat(v).slice() }; };
  const poseOf = (d) => (d.slot != null ? slotPose(d.slot, d.v) : restPose(d));
  const inCupCount = () => (last.dice ? last.dice.filter((d) => d && d.slot == null).length : 5);

  function paintCup() {
    if (shaking && lift >= 1) sc.setCup({ mode: 'shake', t: shakeT, dice: cupDice });
    else sc.setCup({ mode: 'rest', t: lift, dice: cupDice });
  }
  function setMarks() {
    slotEls.forEach((s) => s.removeAttribute('data-v'));
    (last.dice || []).forEach((d) => { if (d && d.slot != null && slotEls[d.slot]) slotEls[d.slot].setAttribute('data-v', String(d.v)); });
  }

  // 연출 없이 지금 모습
  function place() {
    const dice = last.dice;
    const held = shaking || !dice;
    for (let i = 0; i < 5; i++) {
      const d = dice ? dice[i] : null;
      if (!d || (held && d.slot == null)) { hide(i); continue; }
      const p = poseOf(d);
      put(i, p.pos, p.quat);
    }
    liftTo = lift = held || last.cupHasDice ? 1 : 0;
    cupDice = held || last.cupHasDice ? inCupCount() : 0;
    paintCup();
    setMarks();
  }

  function finishRoll() {
    if (!roll) return;
    const r = roll; roll = null;
    apply(r.player.poseAt(r.player.duration));
    lift = liftTo = 0; cupDice = 0; shaking = false;
    paintCup();
    r.resolve();
  }
  function finishMoves() {
    for (const m of moves) { if (m.hide) hide(m.i); else put(m.i, m.to.pos, m.to.quat); if (m.done) m.done(); }
    moves = [];
    lift = liftTo;
    paintCup();
    const ws = waiters; waiters = [];
    ws.forEach((w) => w());
  }
  function finishAll() { finishRoll(); finishMoves(); }

  function apply(pose) {
    for (const d of pose.dice) { if (d.hidden) hide(d.i); else put(d.i, d.pos, d.quat); }
    sc.setCup(pose.cup);
  }

  function draw(a = {}) {
    finishAll();
    const was = shaking;
    last = { dice: a.dice ?? null, shaking: !!a.shaking, cupHasDice: !!a.cupHasDice };
    shaking = last.shaking;
    if (shaking && !was) shakeT = 0;
    place();
  }

  function addMove(i, to, dur, { arc = 0, hide: h = false, done } = {}) {
    moves = moves.filter((m) => m.i !== i);
    const m = model[i];
    moves.push({ i, from: { pos: m.pos.slice(), quat: m.quat.slice() }, to, t0: now(), dur, arc, hide: h, done });
    if (m.hidden) put(i, m.pos, m.quat);
  }

  function playRoll({ seed = 0, thrown = [], dice = [] } = {}) {
    finishMoves(); finishRoll();
    const start = { lift, shakeT: shaking && lift >= 1 ? shakeT : null, dice: model.map((m) => ({ pos: m.pos.slice(), quat: m.quat.slice(), hidden: m.hidden })) };
    last = { dice: dice.map((d) => (d ? { ...d } : d)), shaking: false, cupHasDice: false };
    shaking = false;
    const set = new Set(thrown);
    for (let i = 0; i < 5; i++) {       // 보관 주사위는 움직이지 않는다
      const d = dice[i];
      if (!d) hide(i);
      else if (!set.has(i)) { const p = poseOf(d); put(i, p.pos, p.quat); }
    }
    setMarks();
    const slow = reduced ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    let player;
    try { player = createRollPlayer({ seed, thrown, dice, start, reduced: !!slow }); }
    catch { draw({ dice }); return Promise.resolve(); }     // 재생기를 못 만들면 끝 모습으로 그리고 바로 끝낸다
    return new Promise((resolve) => {
      roll = { player, t0: now(), at: 0, resolve };
      apply(player.poseAt(0));
      if (player.duration <= 0) finishRoll();
    });
  }

  function playKeep({ i, on, slot, x, z, yaw } = {}) {
    const d = last.dice && last.dice[i];
    if (!d) return Promise.resolve();
    finishAll();
    d.slot = on ? (slot ?? 0) : null;
    if (!on) { d.x = x; d.z = z; d.yaw = yaw; }
    setMarks();
    addMove(i, poseOf(d), MOVE_S, { arc: 1.6 });      // 펠트와 보관 칸 사이 벽을 넘어간다
    return new Promise((resolve) => waiters.push(resolve));
  }

  function setShaking(b) {
    b = !!b;
    if (b === shaking) return;
    finishAll();
    shaking = b; last.shaking = b;
    const dice = last.dice;
    if (!dice) { place(); return; }
    liftTo = b || last.cupHasDice ? 1 : 0;
    if (b) {
      // 굴릴 주사위가 컵으로 들어간다
      shakeT = 0; cupDice = 0;
      const n = inCupCount();
      dice.forEach((d, i) => { if (d && d.slot == null && !model[i].hidden) addMove(i, { pos: CUP_IN, quat: model[i].quat }, CUP_S, { arc: 1.2, hide: true, done: () => { cupDice = n; } }); });
      if (!moves.length) cupDice = n;
    } else {
      // 굴리지 않고 끝남: 컵에서 제자리로
      cupDice = 0;
      dice.forEach((d, i) => { if (d && d.slot == null) { model[i].pos = CUP_IN.slice(); addMove(i, restPose(d), CUP_S, { arc: 1.2 }); } });
    }
    paintCup();
  }

  function hitOf(i) {
    const d = last.dice && last.dice[i], m = model[i];
    if (!d || !m || m.hidden || roll || moves.some((x) => x.i === i)) return null;
    const c = sc.project([m.pos[0], REST_Y, m.pos[2]]);
    const a = sc.project([m.pos[0] - REST_Y, DIE, m.pos[2]]), b = sc.project([m.pos[0] + REST_Y, DIE, m.pos[2]]);
    if (!c || !a || !b) return null;
    hostRect = hostRect || host.getBoundingClientRect();
    const w = Math.max(Math.abs(b.x - a.x), 38);
    return { x: c.x - hostRect.left - w / 2, y: c.y - hostRect.top - w / 2, w, h: w };
  }

  function frame() {
    if (dead) return;
    hostRect = null;
    const t = now(), dt = Math.max(0, Math.min(0.1, t - prev));
    prev = t;
    if (roll) {
      const r = roll, at = t - r.t0;
      for (const h of r.player.hits) if (h.t > r.at && h.t <= at && at - h.t < 0.15) ytSfx.hit(h.power);
      r.at = at;
      if (at >= r.player.duration) finishRoll();
      else apply(r.player.poseAt(at));
      return;
    }
    if (moves.length) {
      for (const m of moves) {
        const k = m.dur <= 0 ? 1 : Math.min(1, (t - m.t0) / m.dur), e = smooth(k);
        if (k >= 1) { m.end = true; if (m.hide) hide(m.i); else put(m.i, m.to.pos, m.to.quat); if (m.done) m.done(); continue; }
        const pos = vmix(m.from.pos, m.to.pos, e);
        pos[1] += Math.sin(Math.PI * e) * m.arc;
        put(m.i, pos, qmix(m.from.quat, m.to.quat, e));
      }
      moves = moves.filter((m) => !m.end);
      if (!moves.length) { const ws = waiters; waiters = []; ws.forEach((w) => w()); }
    }
    const moving = lift !== liftTo || shaking;
    if (lift !== liftTo) { const s = dt / CUP_S; lift = lift < liftTo ? Math.min(liftTo, lift + s) : Math.max(liftTo, lift - s); }
    if (shaking && lift >= 1) shakeT += dt;
    if (moving || moves.length) paintCup();
  }

  function resize() {
    hostRect = null;
    const hr = host.getBoundingClientRect();
    const cs = getComputedStyle(host);
    const px = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
    const t = px('--t', Math.min(hr.width, hr.height)), tx = px('--tx', 0), ty = px('--ty', 0);
    sc.setRect({ x: hr.left + tx, y: hr.top + ty, w: t, h: t }, { w: window.innerWidth, h: window.innerHeight });
    for (let i = 0; i < 5; i++) {
      const [x, z] = slotPos(i);
      const a = sc.project([x - REST_Y, 0, z - REST_Y]), b = sc.project([x + REST_Y, 0, z + REST_Y]);
      if (!a || !b) continue;
      Object.assign(slotEls[i].style, { left: (a.x - hr.left) + 'px', top: (a.y - hr.top) + 'px', width: (b.x - a.x) + 'px', height: (b.y - a.y) + 'px' });
    }
  }

  function skip() { finishAll(); }
  function dispose() {
    if (dead) return;
    finishAll();
    dead = true;
    stage?.use?.(null);
    if (!givenScene) sc.dispose();
    root.remove();
  }

  /** 시험용: 주사위 i 의 지금 모습과 상태 표식. */
  const peek = (i) => { const m = model[i], d = last.dice && last.dice[i]; return { hidden: m.hidden, pos: m.pos.slice(), quat: m.quat.slice(), x: d ? f3(d.x) : null, z: d ? f3(d.z) : null }; };

  place();
  resize();
  return { is3d: true, draw, playRoll, playKeep, setShaking, hitOf, skip, frame, resize, dispose, peek, scene: sc };
}
