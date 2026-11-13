// 투표 화살표: 찍은 사람 자리 → 찍힌 사람 자리, 테이블 위의 리본. 시안 buildArrow·stepArrows·arrowOutline 을 옮김.
// 계산(어디서 어디로)은 layout.js 의 arrowPlan. 여기는 모양과 자라나는 움직임만.
import * as THREE from 'three';
import { TABLE_HEIGHT } from './mannequins.js';
import { arrowPlan } from './layout.js';

const SEG = 26, HEAD = 0.15, HEAD_W = 0.062, W0 = 0.016, W1 = 0.03;
const GROW_SEC = 0.32;
const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const ribbonMat = (color, opacity, extra = {}) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, ...extra,
});

// 곡선(2차 베지어)의 앞쪽 frac 만큼을 리본 윤곽으로
function outline(ar, frac, scale = 1) {
  const [ax, az] = ar.a, [bx, bz] = ar.b, [cx, cz] = ar.c;
  const pts = [], len = [0];
  for (let i = 0; i <= SEG; i++) {
    const u = (frac * i) / SEG, v = 1 - u;
    pts.push([v * v * ax + 2 * v * u * cx + u * u * bx, v * v * az + 2 * v * u * cz + u * u * bz]);
    if (i) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = len[SEG] || 1e-6;
  const head = Math.min(HEAD, total);
  const bodyLen = total - head;
  const body = [];
  for (let i = 0; i <= SEG && len[i] < bodyLen; i++) body.push(pts[i]);
  let j = 1;
  while (j < SEG && len[j] < bodyLen) j++;
  const f = (bodyLen - len[j - 1]) / Math.max(len[j] - len[j - 1], 1e-6);
  const end = [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f];
  body.push(end);
  const tip = pts[SEG];
  const left = [], right = [];
  let done = 0;
  body.forEach((p, i) => {
    const q0 = body[Math.max(i - 1, 0)], q1 = i === body.length - 1 ? tip : body[i + 1];
    let tx = q1[0] - q0[0], tz = q1[1] - q0[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i) done += Math.hypot(p[0] - body[i - 1][0], p[1] - body[i - 1][1]);
    const w = (W0 + (W1 - W0) * (bodyLen > 0 ? done / bodyLen : 1)) * scale;
    left.push([p[0] - tz * w, p[1] + tx * w]);
    right.push([p[0] + tz * w, p[1] - tx * w]);
  });
  let hx = tip[0] - end[0], hz = tip[1] - end[1];
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl; hz /= hl;
  const hw = HEAD_W * (head / HEAD) * (0.6 + 0.4 * scale);
  const grow = (scale - 1) * 0.02;
  return {
    left, right,
    hl: [end[0] - hz * hw - hx * grow, end[1] + hx * hw - hz * grow],
    hr: [end[0] + hz * hw - hx * grow, end[1] - hx * hw - hz * grow],
    tip: [tip[0] + hx * grow * 1.5, tip[1] + hz * grow * 1.5],
  };
}
function outlineGeometry(o, y, geo) {
  const n = o.left.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) pos.push(o.left[i][0], y, o.left[i][1], o.right[i][0], y, o.right[i][1]);
  for (let i = 0; i < n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  pos.push(o.hl[0], y, o.hl[1], o.hr[0], y, o.hr[1], o.tip[0], y, o.tip[1]);
  idx.push(2 * n, 2 * n + 1, 2 * n + 2);
  geo.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// seatOf(id) → {edge, n, k} | null ; colorOf(id) → '#rrggbb'
export function createArrows({ parent, seatOf, colorOf }) {
  const group = new THREE.Group();
  group.name = 'liar-arrows';
  parent.add(group);
  const arrows = new Map();   // 찍은 사람 id → { to, sig, grow, y, a, b, c, glow, edge, core }
  let votes = {};
  let disposed = false;

  function build(ar) {
    // 아래부터: 빛 번짐(더하기 섞기) → 어두운 테두리 → 그 사람 색 몸통
    [[ar.glow, 2.4, -0.004], [ar.edge, 1.45, -0.001], [ar.core, 1, 0]].forEach(([m, scale, dy]) => {
      m.geometry = outlineGeometry(outline(ar, ar.grow, scale), ar.y + dy, m.geometry);
    });
  }
  function make(voter) {
    const color = colorOf(voter) || '#ffffff';
    const ar = { grow: 1 };
    const add = (mat, order) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.renderOrder = order; m.frustumCulled = false;
      group.add(m);
      return m;
    };
    const k = seatOf(voter)?.k || 0;
    ar.glow = add(ribbonMat(color, 0.2, { blending: THREE.AdditiveBlending }), 8);
    ar.edge = add(ribbonMat(0x070608, 0.6), 10 + k * 2);
    ar.core = add(ribbonMat(color, 0.96), 11 + k * 2);
    return ar;
  }
  function drop(ar) {
    [ar.glow, ar.edge, ar.core].forEach((m) => { m.geometry.dispose(); m.material.dispose(); group.remove(m); });
  }

  function plan() {
    const list = arrowPlan(votes, seatOf);
    const keep = new Set();
    for (const p of list) {
      keep.add(p.from);
      const sig = [...p.a, ...p.b, ...p.c].map((n) => n.toFixed(4)).join(',');
      let ar = arrows.get(p.from);
      if (ar && ar.to === p.to && ar.sig === sig) continue;   // 달라진 것만 다시 그린다
      const isNew = !ar || ar.to !== p.to;
      if (!ar) { ar = make(p.from); arrows.set(p.from, ar); }
      ar.to = p.to; ar.sig = sig;
      ar.a = p.a; ar.b = p.b; ar.c = p.c;
      ar.y = TABLE_HEIGHT + 0.024 + p.layer * 0.004;
      if (isNew) ar.grow = reduce() ? 1 : 0.02;   // 새로 생기거나 대상이 바뀐 화살표는 꼬리부터 자란다
      build(ar);
    }
    for (const [voter, ar] of arrows) {
      if (keep.has(voter)) continue;
      drop(ar);
      arrows.delete(voter);
    }
  }

  return {
    setVotes(v) {
      if (disposed) return;
      votes = v && typeof v === 'object' ? { ...v } : {};
      plan();
    },
    refresh() { if (!disposed) plan(); },   // 자리·색이 바뀌었을 때 다시 놓는다
    step(dt) {
      if (disposed) return;
      for (const ar of arrows.values()) {
        if (ar.grow >= 1) continue;
        ar.grow = Math.min(1, ar.grow + dt / GROW_SEC);
        build(ar);
      }
    },
    get count() { return arrows.size; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const ar of arrows.values()) drop(ar);
      arrows.clear();
      parent.remove(group);
    },
  };
}
