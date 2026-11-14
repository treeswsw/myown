// 수박 게임 판 화면 (docs/solo/PLAN.md 1-5·6-4). canvas 2D. 규칙·물리는 shared/solo/suika.js, 여기는 그리기와 조작만.
// 약속: mountBoard(el, api) → { reset(state), apply(evs), frame(dt), lock(on), unmount() }
// 조작은 api.input(떨어뜨릴 x) 하나. 점수·시간·버튼은 틀이 그린다. 걸음은 틀이 돌린다(판은 돌리지 않는다).
import './suika.css';
import { W, H, LINE, SPAWN_Y, RADII, TRI, COOL } from '../../../../shared/solo/suika.js';
import { makeSprites, drawFruit, NAMES, GLOW } from './fruits.js';

const PAD = 12;                 // 나무 테두리 두께
const BW = W + PAD * 2;         // 통 그림 폭(논리 px)
const BH = H + PAD;             // 통 그림 높이(위는 열려 있다)
const SW = 120;                 // 옆 칸 폭
const GAP = 14;
const TW = BW + GAP + SW;       // 전체 논리 폭
const TH = BH;                  // 전체 논리 높이
const KEY_SPEED = 280;          // 키로 옮기는 속도(px/초)
const TAU = 6.2832;

const el_ = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
const easeBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; const u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };

function fit(canvas, lw, lh, S) {
  canvas.width = Math.ceil(lw * S);
  canvas.height = Math.ceil(lh * S);
  canvas.style.width = lw + 'px';
  canvas.style.height = lh + 'px';
  const c = canvas.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  return c;
}

// 나무 테두리 + 유리 통 배경 (크기가 바뀔 때만 다시 그린다)
function makeBg(S) {
  const cv = document.createElement('canvas');
  const c = fit(cv, BW, BH, S);
  // 나무
  let g = c.createLinearGradient(0, 0, BW, 0);
  g.addColorStop(0, '#6f4424'); g.addColorStop(0.5, '#a8733d'); g.addColorStop(1, '#6f4424');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(BW, 0); c.lineTo(BW, BH - 16); c.quadraticCurveTo(BW, BH, BW - 16, BH);
  c.lineTo(16, BH); c.quadraticCurveTo(0, BH, 0, BH - 16); c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(40,20,8,.35)'; c.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const y = i * (BH / 18) + 3;
    c.beginPath();
    for (let x = 0; x <= BW; x += 8) { const yy = y + Math.sin(x * 0.05 + i) * 2; if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy); }
    c.stroke();
  }
  // 통 안쪽(유리 느낌의 푸른 어둠)
  g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3b566e'); g.addColorStop(1, '#1d2b38');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(PAD, 0); c.lineTo(PAD + W, 0); c.lineTo(PAD + W, H - 6); c.quadraticCurveTo(PAD + W, H, PAD + W - 6, H);
  c.lineTo(PAD + 6, H); c.quadraticCurveTo(PAD, H, PAD, H - 6); c.closePath();
  c.fill();
  // 선 위쪽(과일을 쥐고 있는 칸)은 살짝 밝게
  c.fillStyle = 'rgba(255,255,255,.05)';
  c.fillRect(PAD, 0, W, LINE);
  // 유리 반사 띠
  g = c.createLinearGradient(PAD, 0, PAD + 60, 0);
  g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(PAD, 0, 60, H);
  // 안쪽 그림자
  for (const [x0, x1] of [[PAD, PAD + 14], [PAD + W, PAD + W - 14]]) {
    g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(Math.min(x0, x1), 0, 14, H);
  }
  g = c.createLinearGradient(0, H, 0, H - 14);
  g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(PAD, H - 14, W, 14);
  // 테두리 윤곽
  c.strokeStyle = 'rgba(255,224,170,.45)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(PAD - 0.5, 0); c.lineTo(PAD - 0.5, H); c.lineTo(PAD + W + 0.5, H); c.lineTo(PAD + W + 0.5, 0); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.45)';
  c.beginPath(); c.moveTo(0.5, 0); c.lineTo(0.5, BH - 8); c.moveTo(BW - 0.5, 0); c.lineTo(BW - 0.5, BH - 8); c.stroke();
  return cv;
}

export function mountBoard(el, api) {
  const root = el_('div', 'so-sk-root', el);
  const boardCv = el_('canvas', 'so-sk-board', root);
  const side = el_('div', 'so-sk-side', root);
  const nextCard = el_('div', 'so-sk-card', side);
  el_('div', 'so-sk-lbl', nextCard, '다음 과일');
  const nextCv = el_('canvas', 'so-sk-next', nextCard);
  const evoCard = el_('div', 'so-sk-card', side);
  el_('div', 'so-sk-lbl', evoCard, '합치는 순서');
  const ringCv = el_('canvas', 'so-sk-ring', evoCard);
  const bestTxt = el_('div', 'so-sk-best', evoCard, '');

  let S = 0, k = 1, sprites = null, bg = null;
  let bctx = null, nctx = null, rctx = null;
  let aimX = W / 2;
  let locked = false;
  let st = null;                 // 마지막으로 받은 엔진 상태
  let maxK = -1;                 // 판에서 만든 가장 큰 단계
  let lastNext = -2, ringDirty = true;
  let lastLine = 0;
  let last = performance.now();
  let ptr = null;                // 눌러 끌고 있는 손가락/펜의 pointerId
  const keys = { l: false, r: false };
  const born = new Map();        // 과일 id → 생긴 시각(합쳐질 때 톡 커지는 연출)
  let parts = [], rings = [], pops = [];

  const reduced = () => !!api.reduced;

  // ----- 크기 -----
  function layout() {
    const w = el.clientWidth || TW, h = el.clientHeight || TH;
    k = Math.max(0.2, Math.min(2, Math.min(w / TW, h / TH)));
    root.style.setProperty('--sk', String(k));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const nS = Math.max(0.5, Math.round(k * dpr * 20) / 20);
    if (Math.abs(nS - S) / (S || 1) < 0.02 && sprites) return;
    S = nS;
    sprites = makeSprites(S);
    bg = makeBg(S);
    bctx = fit(boardCv, BW, BH, S);
    nctx = fit(nextCv, 96, 76, S);
    rctx = fit(ringCv, 108, 108, S);
    lastNext = -2; ringDirty = true;
  }

  // ----- 옆 칸 -----
  function drawNext() {
    const n = st ? st.next : -1;
    if (n === lastNext) return;
    lastNext = n;
    nctx.clearRect(0, 0, 96, 76);
    if (n < 0) return;
    const r = Math.min(34, RADII[n] * 0.95);
    drawFruit(nctx, sprites, n, 48, 38, 0, r / RADII[n]);
  }
  function drawRing() {
    if (!ringDirty) return;
    ringDirty = false;
    rctx.clearRect(0, 0, 108, 108);
    const cx = 54, cy = 54, R = 40, n = RADII.length;
    rctx.strokeStyle = 'rgba(255,230,180,.28)'; rctx.lineWidth = 2;
    rctx.beginPath(); rctx.arc(cx, cy, R, 0, TAU); rctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = -1.5708 + (i / n) * TAU;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      const rr = 4.5 + RADII[i] * 0.085;
      if (i <= maxK) {
        rctx.fillStyle = 'rgba(255,214,90,.85)';
        rctx.beginPath(); rctx.arc(x, y, rr + 2.2, 0, TAU); rctx.fill();
      }
      drawFruit(rctx, sprites, i, x, y, 0, rr / RADII[i]);
      // 다음 칸으로 가는 작은 화살표
      const m = a + (0.5 / n) * TAU;
      const mx = cx + Math.cos(m) * R, my = cy + Math.sin(m) * R, d = m + 1.5708;
      rctx.fillStyle = 'rgba(255,240,200,.75)';
      rctx.beginPath();
      rctx.moveTo(mx + Math.cos(d) * 3.2, my + Math.sin(d) * 3.2);
      rctx.lineTo(mx + Math.cos(d + 2.4) * 2.6, my + Math.sin(d + 2.4) * 2.6);
      rctx.lineTo(mx + Math.cos(d - 2.4) * 2.6, my + Math.sin(d - 2.4) * 2.6);
      rctx.fill();
    }
    bestTxt.textContent = maxK >= 0 ? '최고 ' + NAMES[maxK] : '';
  }

  // ----- 그리기 -----
  function draw(now, dt) {
    if (!bctx || !st) return;
    const c = bctx;
    c.clearRect(0, 0, BW, BH);
    c.drawImage(bg, 0, 0, BW, BH);
    c.save();
    c.translate(PAD, 0);
    // 끝 선
    const warn = st.lineT > 0;
    c.lineWidth = 2;
    c.setLineDash([8, 7]);
    if (warn) {
      const a = 0.45 + 0.45 * (Math.floor(now / 160) % 2);
      c.strokeStyle = `rgba(255,70,60,${a})`;
    } else c.strokeStyle = 'rgba(255,255,255,.28)';
    c.beginPath(); c.moveTo(0, LINE); c.lineTo(W, LINE); c.stroke();
    c.setLineDash([]);
    if (warn) {
      c.fillStyle = `rgba(255,60,50,${0.05 + 0.06 * (Math.floor(now / 160) % 2)})`;
      c.fillRect(0, 0, W, LINE);
    }
    // 대기 과일 + 안내선
    if (!st.done) {
      const kind = st.cur, r = RADII[kind];
      const x = Math.max(r, Math.min(W - r, aimX));
      const ready = st.cool <= 0;
      const t = ready ? 1 : 1 - st.cool / COOL;
      if (ready && !locked) {
        c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2; c.setLineDash([3, 8]); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, SPAWN_Y + r); c.lineTo(x, H - 4); c.stroke();
        c.setLineDash([]);
      }
      drawFruit(c, sprites, kind, x, SPAWN_Y, 0, ready ? 1 : 0.3 + 0.7 * easeBack(t), ready ? 1 : 0.35 + 0.65 * t);
    }
    // 과일
    const f = st.fruits;
    for (let i = 0; i < f.length; i++) {
      const p = f[i];
      let grow = 1;
      const b = born.get(p.id);
      if (b !== undefined) {
        const t = (now - b) / 240;
        if (t >= 1 || reduced()) born.delete(p.id); else grow = 0.55 + 0.45 * easeBack(t);
      }
      drawFruit(c, sprites, p.k, p.x, p.y, p.a, grow);
    }
    // 퍼짐
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.t += dt;
      if (g.t >= g.max) { rings.splice(i, 1); continue; }
      const u = g.t / g.max;
      c.strokeStyle = g.col; c.globalAlpha = 1 - u; c.lineWidth = 3 * (1 - u) + 1;
      c.beginPath(); c.arc(g.x, g.y, g.r0 + (g.r1 - g.r0) * (1 - (1 - u) * (1 - u)), 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.t += dt;
      if (q.t >= q.max) { parts.splice(i, 1); continue; }
      q.vy += 380 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const u = q.t / q.max;
      c.globalAlpha = 1 - u; c.fillStyle = q.col;
      c.beginPath(); c.arc(q.x, q.y, q.r * (1 - u * 0.5), 0, TAU); c.fill();
      c.globalAlpha = 1;
    }
    if (pops.length) {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      for (let i = pops.length - 1; i >= 0; i--) {
        const q = pops[i];
        q.t += dt;
        if (q.t >= q.max) { pops.splice(i, 1); continue; }
        const u = q.t / q.max;
        c.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        c.font = `${q.size}px "Black Han Sans", "Noto Sans KR", sans-serif`;
        c.lineWidth = 5; c.strokeStyle = '#2a1608';
        const y = q.y - 26 * u;
        c.strokeText(q.text, q.x, y);
        c.fillStyle = '#ffe27a'; c.fillText(q.text, q.x, y);
        c.globalAlpha = 1;
      }
    }
    c.restore();
  }

  // ----- 조작 -----
  function worldX(clientX) {
    const r = boardCv.getBoundingClientRect();
    if (!r.width) return aimX;
    return (clientX - r.left) / r.width * BW - PAD;
  }
  function clampAim(x) {
    const r = st ? RADII[st.cur] : 12;
    return Math.max(r, Math.min(W - r, x));
  }
  function drop() {
    if (locked || !st || st.done) return;
    api.input(Math.round(clampAim(aimX)));
  }
  const onDown = (e) => {
    if (locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
    aimX = clampAim(worldX(e.clientX));
    if (e.pointerType === 'mouse') { drop(); return; }
    if (ptr !== null) return;
    ptr = e.pointerId;
    try { root.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
  };
  const onMove = (e) => {
    if (locked) return;
    if (e.pointerType === 'mouse' || e.pointerId === ptr) aimX = clampAim(worldX(e.clientX));
  };
  const onUp = (e) => {
    if (e.pointerId !== ptr) return;
    ptr = null;
    if (e.type === 'pointerup') { aimX = clampAim(worldX(e.clientX)); drop(); }
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const onKey = (e) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const down = e.type === 'keydown';
    const key = e.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { keys.l = down; e.preventDefault(); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { keys.r = down; e.preventDefault(); }
    else if (down && !e.repeat && (key === ' ' || key === 'Enter' || key === 'ArrowDown' || key === 's' || key === 'S')) { e.preventDefault(); drop(); }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const onBlur = () => { keys.l = keys.r = false; };
  window.addEventListener('blur', onBlur);

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(layout); ro.observe(el); } else window.addEventListener('resize', layout);
  layout();

  // ----- 연출 -----
  function burst(x, y, kind) {
    const col = GLOW[kind < 0 ? 10 : kind];
    const big = kind < 0 || kind >= 8;
    rings.push({ x, y, r0: 6, r1: (kind < 0 ? 90 : RADII[kind] * 1.5) + 10, t: 0, max: 0.28, col });
    if (reduced()) return;
    const n = big ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (i % 2) * 0.3, sp = 90 + (i % 3) * 55;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, r: 2.5 + (i % 3), t: 0, max: 0.35 + (i % 4) * 0.05, col: i % 3 ? col : '#fff6c8' });
    }
  }

  return {
    reset(state) {
      st = state;
      parts = []; rings = []; pops = []; born.clear();
      maxK = -1;
      for (const p of state.fruits) if (p.k > maxK) maxK = p.k;
      lastNext = -2; ringDirty = true; lastLine = 0;
      aimX = W / 2;
      last = performance.now();
      drawNext(); drawRing();
      draw(last, 0);
    },
    apply(evs) {
      if (!evs || !evs.length) return;
      st = api.state() || st;
      const now = performance.now();
      for (const ev of evs) {
        if (ev.k === 'drop') api.sfx('drop');
        else if (ev.k === 'merge') {
          const to = ev.to;
          api.sfx('merge', to < 0 ? RADII.length : to);
          burst(ev.x, ev.y, to);
          if (to >= 0) {
            born.set(ev.id, now);
            if (to > maxK) { maxK = to; ringDirty = true; }
          }
          const pts = to < 0 ? TRI[RADII.length - 1] + 12 : TRI[to];
          pops.push({ x: ev.x, y: ev.y, text: '+' + pts, size: to >= 8 || to < 0 ? 26 : 18, t: 0, max: 0.8 });
        }
      }
    },
    frame() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      st = api.state() || st;
      if (!st) return;
      if (!locked && (keys.l || keys.r)) aimX = clampAim(aimX + ((keys.r ? 1 : 0) - (keys.l ? 1 : 0)) * KEY_SPEED * dt);
      else aimX = clampAim(aimX);
      const lt = st.lineT > 0 ? 1 : 0;
      if (lt && !lastLine) api.sfx('warn');
      lastLine = lt;
      drawNext(); drawRing();
      draw(now, dt);
    },
    lock(on) {
      locked = !!on;
      root.classList.toggle('so-sk-lock', locked);
      if (locked) { keys.l = keys.r = false; ptr = null; }
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
      root.remove();
    },
  };
}
