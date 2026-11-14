// 수박 게임 엔진 (docs/solo/PLAN.md 7절). 원(圓) 전용 고정 간격 물리: 1걸음 = 1/60초.
// 결정성: + − × ÷ Math.sqrt 만 쓴다(삼각함수 금지). 배열 순서대로만 돈다. 회전각 a 는 그림 전용(충돌에 안 씀).
import { makeRng } from './rng.js';

export const W = 360;            // 통 안쪽 폭
export const H = 520;            // 통 바닥 y (위가 0)
export const LINE = 90;          // 끝 선 y
export const SPAWN_Y = 45;       // 떨어뜨리는 과일의 처음 높이
export const RADII = [12, 17, 23, 28, 36, 45, 52, 62, 72, 86, 100];
export const TRI = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
export const COOL = 30;          // 떨어뜨린 뒤 다음 입력까지 걸음
export const NEW_KINDS = 5;      // 떨어뜨리는 과일은 단계 0~4

// 손맛 숫자 (바꾸면 test/solo/golden/suika.json 을 다시 기록)
const G = 0.45;          // 중력 (px/걸음²)
const VMAX = 14;         // 속도 상한 (작은 과일끼리 뚫고 지나가지 않게)
const AIR = 0.999;       // 걸음마다 속도 감쇠
const REST = 0.16;       // 반발 계수
const REST_V = 1.2;      // 이보다 느린 부딪힘은 반발 없음(떨림 방지)
const MU = 0.3;          // 마찰
const FLOOR_FR = 0.9;    // 바닥에 닿은 걸음의 가로 속도 배율(굴림 감쇠)
const WALL_FR = 0.96;
const ITER = 8;          // 겹침 풀기 반복
const POS_K = 0.85;      // 한 번에 푸는 겹침 비율
const SLOP = 0.02;
const SLEEP_V = 0.5;     // 이 속도 아래가 SLEEP_N 걸음 이어지면 잠든다
const SLEEP_N = 30;
const STILL_V = 0.7;     // 이보다 느린 상태가 STILL_N 걸음 이어지면 속도 0(정지 마찰: 더미가 스멀스멀 기지 않게)
const STILL_N = 20;
const AWAKE_MAX = 900;   // 입력 뒤 이만큼 걸음이 지나도 못 잠들면 억지로 재운다(끼인 더미의 떨림)
const LINE_AGE = 60;     // 떨어뜨린 지 이만큼 지난 과일만 선 판정
const LINE_N = 120;      // 윗끝이 선 위에 이만큼 이어지면 끝
const MAX_STEPS = 200000;
const MERGE_GAP = 0.5;
const ROLL = 0.5;        // 굴러가는 그림 회전 비율

export default {
  id: 'suika', name: '수박 게임', desc: '같은 과일을 붙여 수박까지 · 선을 넘으면 끝',
  limitMs: null, maxMs: 3600000, tick: true, rate: 3, maxV: 360,
  coin: [300, 700, 1200, 1800, 2400, 3000, 3600, 4500],

  create(seed) {
    const rng = makeRng(seed);
    const cur = rng.int(NEW_KINDS);
    const next = rng.int(NEW_KINDS);
    return { rng, fruits: [], nextId: 1, cur, next, cool: 0, steps: 0, score: 0, asleep: true, still: 0, lineT: 0, awake: 0, done: false, ev: [] };
  },

  // v = 떨어뜨릴 x(0~360). 벽 안으로 자른다.
  input(s, v) {
    if (s.done || s.cool > 0) return false;
    const r = RADII[s.cur];
    const x = v < r ? r : v > W - r ? W - r : v;
    s.fruits.push({ id: s.nextId++, k: s.cur, x, y: SPAWN_Y, vx: 0, vy: 0, a: 0, age: 0, rest: 0 });
    s.ev.push({ k: 'drop', x, kind: s.cur });
    s.cur = s.next;
    s.next = s.rng.int(NEW_KINDS);
    s.cool = COOL;
    s.asleep = false;
    s.still = 0;
    s.awake = 0;
    return true;
  },

  step(s) {
    if (s.asleep || s.done) return;
    s.steps++;
    if (s.cool > 0) s.cool--;
    const f = s.fruits;
    let n = f.length;
    // 1. 적분 (반-암시적 오일러)
    for (let i = 0; i < n; i++) {
      const p = f[i];
      p.age++;
      let vx = p.vx * AIR;
      let vy = p.vy * AIR + G;
      if (vx > VMAX) vx = VMAX; else if (vx < -VMAX) vx = -VMAX;
      if (vy > VMAX) vy = VMAX; else if (vy < -VMAX) vy = -VMAX;
      p.vx = vx; p.vy = vy;
      p.x += vx; p.y += vy;
      p.a += vx / RADII[p.k] * ROLL;
    }
    // 2. 닿은 쌍 찾기 + 합치기
    let pairs = findPairs(f);
    if (merge(s, pairs)) { n = f.length; pairs = findPairs(f); }
    pairs = bottomFirst(f, pairs);
    // 3. 겹침 풀기
    for (let it = 0; it < ITER; it++) {
      for (let q = 0; q < pairs.length; q += 2) resolve(f[pairs[q]], f[pairs[q + 1]]);
      for (let i = 0; i < n; i++) wall(f[i], it === 0);
    }
    for (let i = 0; i < n; i++) wall(f[i], false);
    // 4. 잠들기·끝 판정
    let fast = 0, over = 0;
    for (let i = 0; i < n; i++) {
      const p = f[i];
      let v = p.vx * p.vx + p.vy * p.vy;
      if (v < STILL_V * STILL_V) {
        p.rest = (p.rest || 0) + 1;
        if (p.rest >= STILL_N) { p.vx = 0; p.vy = 0; v = 0; }
      } else p.rest = 0;
      if (v > fast) fast = v;
      if (p.age >= LINE_AGE && p.y - RADII[p.k] < LINE) over = 1;
    }
    s.lineT = over ? s.lineT + 1 : 0;
    if (s.lineT >= LINE_N || s.steps >= MAX_STEPS) { s.done = true; s.asleep = true; return; }
    s.still = fast < SLEEP_V * SLEEP_V ? s.still + 1 : 0;
    s.awake++;
    if ((s.still >= SLEEP_N || s.awake >= AWAKE_MAX) && s.cool === 0) {
      for (let i = 0; i < n; i++) { f[i].vx = 0; f[i].vy = 0; }
      relax(f);
      s.asleep = true;
      if (over) s.done = true;
    }
  },

  score: (s) => s.score,
  over: (s) => s.done,
};

// 거리가 (반지름 합 + 여유) 안인 쌍의 번호를 [i, j, i, j, ...] 로 (i < j, 번호 순)
function findPairs(f) {
  const out = [];
  const n = f.length;
  for (let i = 0; i < n; i++) {
    const a = f[i];
    const ra = RADII[a.k] + 4;
    for (let j = i + 1; j < n; j++) {
      const b = f[j];
      const dx = b.x - a.x;
      if (dx > ra + RADII[b.k] || dx < -(ra + RADII[b.k])) continue;
      const dy = b.y - a.y;
      const rr = ra + RADII[b.k];
      if (dx * dx + dy * dy < rr * rr) out.push(i, j);
    }
  }
  return out;
}

// 잠들기 직전: 속도 없이 위치만 겹침을 마저 푼다(더미 속에 끼어 남은 겹침 제거)
function relax(f) {
  const pairs = bottomFirst(f, findPairs(f));
  for (let it = 0; it < 150; it++) {
    let moved = false;
    for (let q = 0; q < pairs.length; q += 2) {
      const a = f[pairs[q]], b = f[pairs[q + 1]];
      const ra = RADII[a.k], rb = RADII[b.k], sum = ra + rb;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= (sum - 0.05) * (sum - 0.05)) continue;
      let d = Math.sqrt(d2);
      if (d < 0.0001) { dx = 1; dy = 0; d = 0; } else { dx /= d; dy /= d; }
      const wa = 1 / (ra * ra), wb = 1 / (rb * rb), c = (sum - d) / (wa + wb);
      a.x -= dx * c * wa; a.y -= dy * c * wa;
      b.x += dx * c * wb; b.y += dy * c * wb;
      moved = true;
    }
    for (let i = 0; i < f.length; i++) wall(f[i], false, true);
    if (!moved) break;
  }
}

// 아래쪽 쌍부터 풀면 쌓인 더미의 받침이 한 번에 위로 전달된다(반복 6회로도 안정)
function bottomFirst(f, pairs) {
  const m = pairs.length / 2;
  if (m < 2) return pairs;
  const ord = [];
  for (let q = 0; q < m; q++) ord.push(q);
  const low = (q) => { const a = f[pairs[q * 2]].y, b = f[pairs[q * 2 + 1]].y; return a > b ? a : b; };
  ord.sort((a, b) => { const d = low(b) - low(a); return d !== 0 ? d : a - b; });
  const out = [];
  for (let k = 0; k < m; k++) out.push(pairs[ord[k] * 2], pairs[ord[k] * 2 + 1]);
  return out;
}

// 같은 단계끼리 닿으면 합친다. 한 과일은 한 걸음에 한 번만. 합쳤으면 true.
function merge(s, pairs) {
  const f = s.fruits;
  let used = null;
  for (let q = 0; q < pairs.length; q += 2) {
    const i = pairs[q], j = pairs[q + 1];
    const a = f[i], b = f[j];
    if (a.k !== b.k || (used && (used[i] || used[j]))) continue;
    const sum = RADII[a.k] + RADII[b.k] + MERGE_GAP;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy > sum * sum) continue;
    if (!used) used = [];
    used[i] = 1; used[j] = 1;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    if (a.k === RADII.length - 1) {
      s.score += TRI[a.k] + 12; // 수박 둘은 사라지기만 한다(점수 78)
      s.ev.push({ k: 'merge', x, y, from: a.k, to: -1, id: 0 });
    } else {
      const k = a.k + 1;
      const id = s.nextId++;
      s.score += TRI[k];
      s.fruits.push({ id, k, x, y, vx: (a.vx + b.vx) / 2, vy: (a.vy + b.vy) / 2, a: a.a, age: a.age > b.age ? a.age : b.age, rest: 0 });
      s.ev.push({ k: 'merge', x, y, from: a.k, to: k, id });
    }
  }
  if (!used) return false;
  // 지운다: 새로 붙은 과일(끝)은 used 에 없으므로 그대로 남는다
  let w = 0;
  for (let i = 0; i < f.length; i++) if (!used[i]) f[w++] = f[i];
  f.length = w;
  return true;
}

function resolve(a, b) {
  const ra = RADII[a.k], rb = RADII[b.k];
  const sum = ra + rb;
  let dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= sum * sum) return;
  let d = Math.sqrt(d2);
  if (d < 0.0001) { dx = 1; dy = 0; d = 0; } else { dx /= d; dy /= d; }
  const wa = 1 / (ra * ra), wb = 1 / (rb * rb), tot = wa + wb;
  const over = sum - d - SLOP;
  if (over > 0) {
    const c = over * POS_K / tot;
    a.x -= dx * c * wa; a.y -= dy * c * wa;
    b.x += dx * c * wb; b.y += dy * c * wb;
  }
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * dx + rvy * dy;
  if (vn >= 0) return;
  const e = -vn < REST_V ? 0 : REST;
  const jn = -(1 + e) * vn / tot;
  a.vx -= jn * wa * dx; a.vy -= jn * wa * dy;
  b.vx += jn * wb * dx; b.vy += jn * wb * dy;
  // 마찰: 접선 방향
  const tx = -dy, ty = dx;
  const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  let jt = -vt / tot;
  const lim = MU * jn;
  if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
  a.vx -= jt * wa * tx; a.vy -= jt * wa * ty;
  b.vx += jt * wb * tx; b.vy += jt * wb * ty;
}

function wall(p, damp, still) {
  const r = RADII[p.k];
  if (still) { if (p.x < r) p.x = r; else if (p.x > W - r) p.x = W - r; if (p.y > H - r) p.y = H - r; return; }
  if (p.x < r) { p.x = r; if (p.vx < 0) p.vx = -p.vx * (-p.vx < REST_V ? 0 : REST); if (damp) p.vy *= WALL_FR; }
  else if (p.x > W - r) { p.x = W - r; if (p.vx > 0) p.vx = -p.vx * (p.vx < REST_V ? 0 : REST); if (damp) p.vy *= WALL_FR; }
  if (p.y > H - r) {
    p.y = H - r;
    if (p.vy > 0) p.vy = -p.vy * (p.vy < REST_V ? 0 : REST);
    if (damp) p.vx *= FLOOR_FR;
  }
}
