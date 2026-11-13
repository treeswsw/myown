// 요트다이스 굴림 계산기 (GDD 4절, YACHT-PLAN 3-1). 서버와 화면이 함께 쓰는 순수 함수.
// seed 하나와 굴린 주사위 번호 목록만으로 컵에서 쏟아져 구르고 멈추는 경로를 계산한다.
// 같은 입력이면 어느 기기에서도 비트 단위로 같은 결과가 나오도록:
//   - 경로 계산은 + − × ÷ 와 Math.sqrt 만 쓴다(IEEE 754 에서 결과가 하나로 정해진 연산).
//     Math.sin·cos 등은 쓰지 않는다. 마지막 yaw 숫자 하나에만 Math.atan2 를 쓴다(경로에는 영향 없음).
//   - 난수는 아래 prng(정수 연산만)뿐이다. 눈(1~6)은 정하지 않는다(서버 난수).
//
// 좌표(트레이 단위): 바닥은 한 변 TRAY 인 정사각형, 가운데 (0,0), x 오른쪽, z 보는 사람 쪽, y 위. 주사위 한 변 DIE.
// 자세는 쿼터니언 [qx, qy, qz, qw] (몸 → 세계, three.js 와 같은 곱 순서).
// 기본 번호 배치(면 → 눈): +y 1, −y 6, +x 3, −x 4, +z 2, −z 5.
//
// frames: 프레임 k(0..steps−1)는 시각 k × STEP_MS 의 자세. 프레임마다 굴린 순서대로 주사위당 7개
//   (x, y, z, qx, qy, qz, qw). 프레임 0 = 컵에서 나오는 순간, 마지막 프레임 = 멈춘 자세. ms = (steps − 1) × STEP_MS.
//
// 계산 방식(물리 라이브러리 없음): 1/120초 고정 간격. 중력, 바닥·네 벽(±5)과 주사위 꼭짓점 8개의 충돌(튕김·마찰,
//   반복 충격량 풀이 + 겹친 만큼 밀어내기), 주사위끼리는 구(반지름 0.9) 충돌. 느려지면 펠트가 붙잡고(감쇠),
//   기울어 있으면 가까운 면으로 넘어가며, 벽·이웃에 너무 가까우면 마지막 미끄러짐 방향을 살짝 바깥으로 튼다.
//   모두 잠들면(최소 0.7초) 마지막 0.2초 동안 가장 가까운 평평한 자세로 맞춘다.
//   멈춘 자리가 조건(|x|,|z| ≤ 4, 사이 2.1 이상, 주사위마다 2번 이상 튕김, 2.5초 안)을 못 맞추면 seed+1 … 최대 8번,
//   그래도 안 되면 격자 자리로 미끄러지는 경로(시험에서 seed 10,000개 중 0번).

export const TRAY = 10, DIE = 1.4, STEP_MS = 1000 / 120, MAX_MS = 2500, CUP = { x: 3.4, z: 2.4 };

const HALF = DIE / 2;            // 0.7
const WALL = TRAY / 2;           // 안쪽 벽 x, z = ±5
const LIMIT = 4.0;               // 멈춘 중심 |x|,|z| 한계
const GAP = 2.1;                 // 멈춘 주사위 중심 사이 최소 거리
const DT = 1 / 120;
const MAX_STEPS = Math.floor(MAX_MS / STEP_MS + 1e-9);   // 300 간격(= 301 프레임)
const SETTLE = 24;               // 마지막 0.2초: 평평한 자세로 맞추기
const MIN_STOP = 84;             // 0.7초 전에는 다 멈췄다고 치지 않는다(+ 0.2초 = 최소 0.9초)
const TRIES = 8;

// 물리 값(트레이 단위/초). 주사위 한 변 1.4 ≈ 16mm 로 보면 실제 중력의 약 1/10 — 화면에서 잘 보이는 속도.
// 값을 바꾸면 경로가 바뀐다(모든 기기가 같은 sim.js 를 쓰므로 문제는 없지만, 서버·화면 배포가 같이 나가야 한다).
const MASS = 1, INV_M = 1 / MASS;
const INV_I = 6 / (MASS * DIE * DIE);   // 정육면체 관성은 모든 축이 같다(m s²/6)
const T = Object.freeze({
  G: 90,
  E_FLOOR: 0.4, E_WALL: 0.5, E_DICE: 0.45,       // 반발
  MU_FLOOR: 0.7, MU_WALL: 0.2, MU_DICE: 0.15,    // 마찰(펠트는 잘 잡아서 미끄러지기보다 굴러 넘어간다)
  BOUNCE_V: 2.2,        // 바닥은 이보다 빠르게 부딪힐 때만 튕김 — 떨림 방지(한 걸음 중력 0.75 보다 충분히 크게)
  WALL_BOUNCE_V: 0.4,   // 벽은 느려도 튕긴다(중력 떨림이 없다)
  ITERS: 6,             // 접촉 풀이 반복
  SLOP: 0.02,           // 이만큼 떠 있어도 닿은 것으로(바닥에 있는지 판단·미리 잡는 접촉)
  ANG_DAMP: 0.35,       // 공중 회전 감쇠(/초)
  FLOOR_LIN_DAMP: 0.1,  // 바닥에 닿아 있을 때 굴림 저항(/초)
  FLOOR_ANG_DAMP: 0.3,
  SLOW_V: 1.2, SLOW_W: 3.5, SLOW_DAMP: 7,          // 느려지면 펠트가 붙잡는다(흔들림이 끝없이 이어지지 않게)
  CALM_V: 0.5, CALM_W: 1.4, CALM_FLAT: 0.996, CALM_STEPS: 10,   // 잠들기
  TIP: 60,              // 느릴 때 기울어 있으면 가까운 면으로 넘어가는 힘(rad/s²)
  HIT_V: 2.0,           // 이보다 빠른 바닥 충돌 = "튕김" 1번
  BALL: 0.9,            // 주사위끼리 충돌용 구 반지름
  EDGE: 3.9, NEAR: 2.2, NUDGE: 0.8, NUDGE_KEEP: 0.7, TURN: 2, CREEP: 48,   // 마지막 미끄러짐 돌리기(nudge)
  ROLL: 1, ROLL_R: 0.4, SPIN: 6, SPIN_R: 10,      // 처음 회전: 앞구름(× v / 반지름) + 아무 방향
  SPEED: 9, SPEED_R: 4, LIFT: 2, LIFT_R: 3, FAN: 0.35, AIM: 1.3,   // 쏟는 속력·위로 뜨는 속력·퍼짐·노리는 곳
});

// 기본 번호 배치의 면 법선(몸 좌표). FACE[v] = 눈 v 의 면.
const FACE = [null, [0, 1, 0], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 0, -1], [0, -1, 0]];
const S2 = Math.sqrt(0.5);
// BASE[v] = 눈 v 가 위(+y)를 보는 기준 자세(yaw 0). restQuat(v, yaw) = Ry(yaw) × BASE[v].
const BASE = [null,
  [0, 0, 0, 1],          // 1: 그대로
  [-S2, 0, 0, S2],       // 2: +z → +y (x 축 −90°)
  [0, 0, S2, S2],        // 3: +x → +y (z 축 +90°)
  [0, 0, -S2, S2],       // 4: −x → +y (z 축 −90°)
  [S2, 0, 0, S2],        // 5: −z → +y (x 축 +90°)
  [1, 0, 0, 0],          // 6: −y → +y (x 축 180°)
];
const CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORNERS.push([sx * HALF, sy * HALF, sz * HALF]);

// ---------- 난수 (mulberry32, 정수 연산만) ----------
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 쿼터니언 ----------
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qnorm(q) {
  const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
// 몸 좌표 벡터 b 를 세계로
function rot(q, b) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * b[2] - z * b[1]), ty = 2 * (z * b[0] - x * b[2]), tz = 2 * (x * b[1] - y * b[0]);
  return [b[0] + w * tx + (y * tz - z * ty), b[1] + w * ty + (z * tx - x * tz), b[2] + w * tz + (x * ty - y * tx)];
}

// 지금 자세에서 위를 가장 많이 보는 면의 눈과 그 면 법선(세계)
function upFace(q) {
  let best = 1, by = -2, dir = null;
  for (let v = 1; v <= 6; v++) {
    const n = rot(q, FACE[v]);
    if (n[1] > by) { by = n[1]; best = v; dir = n; }
  }
  return { up: best, dir, cos: by };
}

// 가장 가까운 평평한 자세: 위를 가장 많이 보는 면을 정확히 +y 로 돌리고, 남는 것은 세로축 회전(yaw)만.
// 돌려주는 q = Ry × BASE[up] (사칙연산과 sqrt 만).
function flatOf(q) {
  const { up, dir } = upFace(q);
  // dir → +y 로 가는 가장 짧은 회전: [dir × y, 1 + dir·y] 정규화
  const align = qnorm([-dir[2], 0, dir[0], 1 + dir[1]]);
  const f = qmul(align, q);
  let r = qmul(f, qconj(BASE[up]));   // 이론상 [0, s, 0, c]
  let s = r[1], c = r[3];
  if (c < 0 || (c === 0 && s < 0)) { s = -s; c = -c; }
  const l = Math.sqrt(s * s + c * c);
  const ry = [0, s / l, 0, c / l];
  return { up, q: qmul(ry, BASE[up]), ry };
}

function yawOf(ry) {
  // ry = [0, sin(yaw/2), 0, cos(yaw/2)], cos ≥ 0 → yaw ∈ [−π, π]
  return 2 * Math.atan2(ry[1], ry[3]);
}

/** "눈 v 가 위, 세로축으로 yaw 만큼 돈" 자세. 멈춘 주사위를 바로 그릴 때(그리기 전용, 삼각함수 사용). */
export function restQuat(v, yaw) {
  const h = (+yaw || 0) / 2;
  return qmul([0, Math.sin(h), 0, Math.cos(h)], BASE[v]);
}

/** 주사위 그림에 먼저 적용할 회전. 경로 자세 × faceFix(up, v) = 끝에서 restQuat(v, yaw). */
export function faceFix(up, v) {
  return qmul(qconj(BASE[up]), BASE[v]);
}

// ---------- 빈자리 ----------
const SPOTS = [];
for (let iz = -8; iz <= 8; iz++) for (let ix = -8; ix <= 8; ix++) SPOTS.push([ix / 2, iz / 2]);

function clearOf(others, x, z) {
  if (!(Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT)) return false;
  for (const o of others) {
    const dx = o.x - x, dz = o.z - z;
    if (dx * dx + dz * dz < GAP * GAP) return false;
  }
  return true;
}

/** 뺀 주사위가 돌아갈 자리. prefer 가 비어 있으면 그대로, 아니면 정해진 후보(0.5 간격 격자)를
 *  prefer 에서 가까운 순(같으면 목록 순)으로 보아 첫 빈자리. 빈자리가 없으면 다른 주사위와 가장 먼 후보. */
export function freeSpot(others, prefer) {
  const list = (others || []).filter((o) => o && Number.isFinite(o.x) && Number.isFinite(o.z));
  const px = Number.isFinite(prefer?.x) ? prefer.x : 0;
  const pz = Number.isFinite(prefer?.z) ? prefer.z : 0;
  const yaw = Number.isFinite(prefer?.yaw) ? prefer.yaw : 0;
  if (clearOf(list, px, pz)) return { x: px, z: pz, yaw };
  let best = null, bestD = Infinity;
  for (let k = 0; k < SPOTS.length; k++) {
    const [x, z] = SPOTS[k];
    if (!clearOf(list, x, z)) continue;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < bestD) { bestD = d; best = [x, z]; }
  }
  if (!best) {
    let far = -1;
    for (const [x, z] of SPOTS) {
      let m = Infinity;
      for (const o of list) m = Math.min(m, (o.x - x) * (o.x - x) + (o.z - z) * (o.z - z));
      if (m > far) { far = m; best = [x, z]; }
    }
  }
  return { x: best[0], z: best[1], yaw };
}

// ---------- 시작 상태 ----------
// 컵 안의 자리(쏟는 방향 u, 옆 w, 높이 y). 구끼리 1.85 이상 떨어져 있다.
const SLOTS = [
  [0.0, 1.45, -0.95], [0.0, 1.45, 0.95], [1.9, 1.45, 0.0], [0.95, 3.1, -0.95], [0.95, 3.1, 0.95],
];

function unit3(rnd) {
  for (;;) {
    const x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
    const l2 = x * x + y * y + z * z;
    if (l2 > 0.01 && l2 <= 1) { const l = Math.sqrt(l2); return [x / l, y / l, z / l]; }
  }
}
function unitQuat(rnd) {
  for (;;) {
    const q = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    const l2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
    if (l2 > 0.01 && l2 <= 1) return qnorm(q);
  }
}
const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v);

function spawn(seed, n) {
  const rnd = prng(seed);
  // 노릴 곳: 트레이 가운데 근처
  const tx = (rnd() * 2 - 1) * T.AIM, tz = (rnd() * 2 - 1) * T.AIM;
  let ux = tx - CUP.x, uz = tz - CUP.z;
  const ul = Math.sqrt(ux * ux + uz * uz); ux /= ul; uz /= ul;
  const wx = -uz, wz = ux;
  const bx = CUP.x + ux * 0.55, bz = CUP.z + uz * 0.55;
  const speed = T.SPEED + rnd() * T.SPEED_R, lift = T.LIFT + rnd() * T.LIFT_R;
  // 자리 섞기(피셔-예이츠)
  const order = [0, 1, 2, 3, 4];
  for (let k = 4; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
  const dice = [];
  for (let j = 0; j < n; j++) {
    const [su, sy, sw] = SLOTS[order[j]];
    const px = clampAbs(bx + ux * su + wx * sw, WALL - 1.25);
    const pz = clampAbs(bz + uz * su + wz * sw, WALL - 1.25);
    const jit = unit3(rnd);
    // 부채꼴로 퍼진다: 옆에 있던 주사위는 그쪽으로, 앞에 있던 주사위는 조금 더 멀리
    const side = sw * T.FAN + (rnd() * 2 - 1) * 0.25;
    let dx = ux + wx * side, dz = uz + wz * side;
    const dl = Math.sqrt(dx * dx + dz * dz); dx /= dl; dz /= dl;
    const sp = speed * (0.8 + su * 0.1 + rnd() * 0.25);
    const vx = dx * sp + jit[0] * 0.6, vz = dz * sp + jit[2] * 0.6, vy = lift + jit[1] * 0.8;
    // 회전: 앞으로 구르는 회전 + 아무 방향 회전
    const roll = (T.ROLL + rnd() * T.ROLL_R) / HALF;   // 앞구름 세기(굴러가는 속력에 맞는 회전 = v / 반지름)
    const a = unit3(rnd), am = T.SPIN + rnd() * T.SPIN_R;
    const w = [vz * roll + a[0] * am, a[1] * am, -vx * roll + a[2] * am];   // (v × y)/r = 앞으로 구름 + 무작위
    const q = unitQuat(rnd);
    dice.push({
      p: [px, sy, pz], v: [vx, vy, vz], w, q,
      sleep: false, calm: 0, hits: 0, lastHit: 0, slow: 0, push: false,
    });
  }
  return dice;
}

// ---------- 한 걸음 ----------
// 움직이지 않는 평면: 바닥(+y), 네 벽. [nx, ny, nz, d] — 꼭짓점 p 는 n·p ≥ d 여야 한다
const PLANES = [[0, 1, 0, 0], [-1, 0, 0, -WALL], [1, 0, 0, -WALL], [0, 0, -1, -WALL], [0, 0, 1, -WALL]];

function applyImpulse(d, r, jx, jy, jz) {
  d.v[0] += jx * INV_M; d.v[1] += jy * INV_M; d.v[2] += jz * INV_M;
  d.w[0] += (r[1] * jz - r[2] * jy) * INV_I;
  d.w[1] += (r[2] * jx - r[0] * jz) * INV_I;
  d.w[2] += (r[0] * jy - r[1] * jx) * INV_I;
}
function pointVel(d, r) {
  const w = d.w;
  return [d.v[0] + w[1] * r[2] - w[2] * r[1], d.v[1] + w[2] * r[0] - w[0] * r[2], d.v[2] + w[0] * r[1] - w[1] * r[0]];
}
function effMass(r, n) {
  const cx = r[1] * n[2] - r[2] * n[1], cy = r[2] * n[0] - r[0] * n[2], cz = r[0] * n[1] - r[1] * n[0];
  return INV_M + (cx * cx + cy * cy + cz * cz) * INV_I;
}

function planeContacts(d) {
  const out = [];
  let floorHit = 0;
  for (const c of CORNERS) {
    const r = rot(d.q, c);
    const wx = d.p[0] + r[0], wy = d.p[1] + r[1], wz = d.p[2] + r[2];
    for (const P of PLANES) {
      const sep = P[0] * wx + P[1] * wy + P[2] * wz - P[3];
      if (sep > T.SLOP) continue;
      const n = [P[0], P[1], P[2]];
      const vp = pointVel(d, r);
      const vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
      if (P[1] === 1 && -vn > floorHit) floorHit = -vn;
      // 떠 있으면 그 틈만큼은 다가가도 된다(미리 잡는 접촉). 닿아 있으면 빠를 때만 튕긴다.
      const floor = P[1] === 1, e = floor ? T.E_FLOOR : T.E_WALL;
      const target = sep > 0 ? -sep / DT : vn < -(floor ? T.BOUNCE_V : T.WALL_BOUNCE_V) ? -e * vn : 0;
      out.push({ r, n, mu: floor ? T.MU_FLOOR : T.MU_WALL, k: effMass(r, n), target, jn: 0, jt: 0 });
    }
  }
  return { list: out, floorHit };
}

function solvePlanes(d, list) {
  for (let it = 0; it < T.ITERS; it++) {
    for (const c of list) {
      const { r, n } = c;
      let vp = pointVel(d, r);
      const vn = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
      let dj = (c.target - vn) / c.k;
      const old = c.jn; c.jn = old + dj; if (c.jn < 0) c.jn = 0; dj = c.jn - old;
      if (dj !== 0) applyImpulse(d, r, n[0] * dj, n[1] * dj, n[2] * dj);
      // 마찰
      vp = pointVel(d, r);
      const vn2 = vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2];
      const tx = vp[0] - vn2 * n[0], ty = vp[1] - vn2 * n[1], tz = vp[2] - vn2 * n[2];
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (tl > 1e-9) {
        const t = [tx / tl, ty / tl, tz / tl];
        let jt = -tl / effMass(r, t);
        const max = c.mu * c.jn;
        const prev = c.jt; let acc = prev + jt;
        if (acc < -max) acc = -max;
        // 마찰 누적은 크기만 제한(방향이 바뀌는 것은 무시해도 충분)
        jt = acc - prev; c.jt = acc;
        if (jt !== 0) applyImpulse(d, r, t[0] * jt, t[1] * jt, t[2] * jt);
      }
    }
  }
}

function lowest(d) {
  // 바닥·벽 쪽으로 가장 많이 나간 거리(몸 꼭짓점 기준)
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of CORNERS) {
    const r = rot(d.q, c);
    if (r[1] < minY) minY = r[1];
    if (r[0] < minX) minX = r[0]; if (r[0] > maxX) maxX = r[0];
    if (r[2] < minZ) minZ = r[2]; if (r[2] > maxZ) maxZ = r[2];
  }
  return { minY, minX, maxX, minZ, maxZ };
}

function project(d) {
  const e = lowest(d);
  if (d.p[1] + e.minY < 0) d.p[1] = -e.minY;
  if (d.p[0] + e.maxX > WALL) d.p[0] = WALL - e.maxX;
  if (d.p[0] + e.minX < -WALL) d.p[0] = -WALL - e.minX;
  if (d.p[2] + e.maxZ > WALL) d.p[2] = WALL - e.maxZ;
  if (d.p[2] + e.minZ < -WALL) d.p[2] = -WALL - e.minZ;
}

function diceContacts(dice) {
  const n = dice.length, R2 = 2 * T.BALL;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = dice[a], B = dice[b];
    const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], dz = B.p[2] - A.p[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 >= R2 * R2 || l2 < 1e-12) continue;
    const l = Math.sqrt(l2);
    const nn = [dx / l, dy / l, dz / l];
    const rA = [nn[0] * T.BALL, nn[1] * T.BALL, nn[2] * T.BALL], rB = [-rA[0], -rA[1], -rA[2]];
    const va = pointVel(A, rA), vb = pointVel(B, rB);
    const rx = vb[0] - va[0], ry = vb[1] - va[1], rz = vb[2] - va[2];
    const vn = rx * nn[0] + ry * nn[1] + rz * nn[2];
    if (vn < 0) {
      if (A.sleep || B.sleep) {
        if (-vn < 0.4) { /* 살짝 닿음: 깨우지 않고 밀기만 */ } else { A.sleep = false; B.sleep = false; A.calm = 0; B.calm = 0; }
      }
      const kA = A.sleep ? 0 : INV_M, kB = B.sleep ? 0 : INV_M;
      if (kA + kB > 0) {
        const j = -(1 + (-vn > T.BOUNCE_V ? T.E_DICE : 0)) * vn / (kA + kB);
        if (kA) applyImpulse(A, rA, -nn[0] * j, -nn[1] * j, -nn[2] * j);
        if (kB) applyImpulse(B, rB, nn[0] * j, nn[1] * j, nn[2] * j);
        const tx = rx - vn * nn[0], ty = ry - vn * nn[1], tz = rz - vn * nn[2];
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl > 1e-9) {
          const t = [tx / tl, ty / tl, tz / tl];
          const kt = (kA ? effMass(rA, t) : 0) + (kB ? effMass(rB, t) : 0);
          let jt = tl / kt; const max = T.MU_DICE * j; if (jt > max) jt = max;
          if (kA) applyImpulse(A, rA, t[0] * jt, t[1] * jt, t[2] * jt);
          if (kB) applyImpulse(B, rB, -t[0] * jt, -t[1] * jt, -t[2] * jt);
        }
      }
    }
    // 겹친 만큼 떼기(잠든 쪽은 움직이지 않는다)
    const over = R2 - l;
    const sA = A.sleep ? 0 : 1, sB = B.sleep ? 0 : 1;
    if (sA + sB > 0) {
      const ma = over * sA / (sA + sB), mb = over * sB / (sA + sB);
      A.p[0] -= nn[0] * ma; A.p[1] -= nn[1] * ma; A.p[2] -= nn[2] * ma;
      B.p[0] += nn[0] * mb; B.p[1] += nn[1] * mb; B.p[2] += nn[2] * mb;
    }
  }
}

// 거의 멈춘 주사위가 벽에 붙거나 다른 주사위와 너무 가까우면 마지막 미끄러짐을 살짝 바깥쪽으로 돌린다.
// (펠트 가장자리가 조금 솟아 있고 주사위끼리 살짝 밀어내는 정도. 멈춘 자리 조건을 맞추려는 것)
function nudge(d, dice) {
  let px = 0, pz = 0;
  const x = d.p[0], z = d.p[2];
  if (x > T.EDGE) px -= x - T.EDGE; else if (x < -T.EDGE) px += -T.EDGE - x;
  if (z > T.EDGE) pz -= z - T.EDGE; else if (z < -T.EDGE) pz += -T.EDGE - z;
  for (const o of dice) {
    if (o === d) continue;
    const dx = x - o.p[0], dz = z - o.p[2];
    const l2 = dx * dx + dz * dz;
    if (l2 >= T.NEAR * T.NEAR || l2 < 1e-12) continue;
    const l = Math.sqrt(l2), f = (T.NEAR - l) / l;
    px += dx * f; pz += dz * f;
  }
  const pl = Math.sqrt(px * px + pz * pz);
  if (pl < 1e-9) return false;
  const ux = px / pl, uz = pz / pl;
  // 속력은 (거의) 그대로 두고 방향만 바깥쪽으로 튼다. 다 멈춘 주사위를 새로 밀지는 않는다.
  const vx = d.v[0], vz = d.v[2];
  const sp = Math.sqrt(vx * vx + vz * vz);
  const keep = d.slow < T.CREEP ? T.NUDGE_KEEP : 0;   // 느려진 직후 잠깐만 최소 속력을 남긴다
  const target = sp > T.NUDGE ? sp : T.NUDGE * (sp / T.NUDGE + (1 - sp / T.NUDGE) * keep);
  let nx = (sp > 1e-9 ? vx / sp : 0) + ux * T.TURN, nz = (sp > 1e-9 ? vz / sp : 0) + uz * T.TURN;
  const nl = Math.sqrt(nx * nx + nz * nz);
  if (nl < 1e-9) { nx = ux; nz = uz; } else { nx /= nl; nz /= nl; }
  d.v[0] = nx * target; d.v[2] = nz * target;
  return true;
}

function step(dice) {
  for (const d of dice) {
    if (d.sleep) continue;
    d.v[1] -= T.G * DT;
    const { list, floorHit } = planeContacts(d);
    const onFloor = list.some((c) => c.n[1] === 1);
    if (floorHit > T.HIT_V && d.lastHit <= T.HIT_V) d.hits++;   // 세게 부딪힌 순간 = 튕김 1번
    d.lastHit = floorHit;
    if (list.length) solvePlanes(d, list);
    // 감쇠(곱셈만)
    const ad = 1 - (onFloor ? T.FLOOR_ANG_DAMP : T.ANG_DAMP) * DT;
    d.w[0] *= ad; d.w[1] *= ad; d.w[2] *= ad;
    if (onFloor) {
      const ld = 1 - T.FLOOR_LIN_DAMP * DT; d.v[0] *= ld; d.v[2] *= ld;
      // 느려지면 펠트가 붙잡는다(흔들림이 끝없이 이어지지 않게)
      const v2 = d.v[0] * d.v[0] + d.v[1] * d.v[1] + d.v[2] * d.v[2];
      const w2 = d.w[0] * d.w[0] + d.w[1] * d.w[1] + d.w[2] * d.w[2];
      if (v2 < T.SLOW_V * T.SLOW_V && w2 < T.SLOW_W * T.SLOW_W) {
        const k = 1 - T.SLOW_DAMP * DT;
        d.v[0] *= k; d.v[2] *= k; d.w[0] *= k; d.w[1] *= k; d.w[2] *= k;
        // 모서리로 서거나 벽·다른 주사위에 기대 멈추지 않게, 가까운 면 쪽으로 넘어가게 한다
        const u = upFace(d.q);
        if (u.cos < T.CALM_FLAT) {
          const ax = -u.dir[2], az = u.dir[0], al = Math.sqrt(ax * ax + az * az);
          if (al > 1e-9) { const a = T.TIP * DT / al; d.w[0] += ax * a; d.w[2] += az * a; }
        }
        d.push = nudge(d, dice);
        d.slow++;
      } else { d.push = false; d.slow = 0; }
    } else { d.push = false; d.slow = 0; }
    d.onFloor = onFloor;
  }
  diceContacts(dice);
  for (const d of dice) {
    if (d.sleep) continue;
    d.p[0] += d.v[0] * DT; d.p[1] += d.v[1] * DT; d.p[2] += d.v[2] * DT;
    const w = d.w, q = d.q, h = 0.5 * DT;
    d.q = qnorm([
      q[0] + h * (w[0] * q[3] + w[1] * q[2] - w[2] * q[1]),
      q[1] + h * (w[1] * q[3] + w[2] * q[0] - w[0] * q[2]),
      q[2] + h * (w[2] * q[3] + w[0] * q[1] - w[1] * q[0]),
      q[3] - h * (w[0] * q[0] + w[1] * q[1] + w[2] * q[2]),
    ]);
    project(d);
    // 잠들기: 느리고 평평하게 바닥에 있으면
    const v2 = d.v[0] * d.v[0] + d.v[1] * d.v[1] + d.v[2] * d.v[2];
    const w2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2];
    if (d.onFloor && (!d.push || d.slow >= T.CREEP) && v2 < T.CALM_V * T.CALM_V && w2 < T.CALM_W * T.CALM_W && upFace(d.q).cos > T.CALM_FLAT) d.calm++;
    else d.calm = 0;
    if (d.calm >= T.CALM_STEPS) { d.sleep = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; }
  }
}

function writeFrame(buf, k, dice) {
  if (!buf) return;
  let o = k * dice.length * 7;
  for (const d of dice) {
    buf[o++] = d.p[0]; buf[o++] = d.p[1]; buf[o++] = d.p[2];
    buf[o++] = d.q[0]; buf[o++] = d.q[1]; buf[o++] = d.q[2]; buf[o++] = d.q[3];
  }
}

// q 를 t 비율로 target 쪽으로(짧은 쪽, nlerp)
function nlerp(a, b, t) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = dot < 0 ? -1 : 1;
  return qnorm([a[0] + (s * b[0] - a[0]) * t, a[1] + (s * b[1] - a[1]) * t, a[2] + (s * b[2] - a[2]) * t, a[3] + (s * b[3] - a[3]) * t]);
}
const ease = (t) => t * t * (3 - 2 * t);

// 마지막 0.2초: 지금 자세 → 가장 가까운 평평한 자세. 주사위가 바닥 아래로 내려가지 않게 높이는 꼭짓점 기준.
function settle(dice, buf, k0) {
  const from = dice.map((d) => ({ p: d.p.slice(), q: d.q.slice(), v: d.v.slice(), flat: flatOf(d.q) }));
  for (let s = 1; s <= SETTLE; s++) {
    const t = ease(s / SETTLE);
    const g = s / SETTLE, slide = g * (1 - g / 2) * (SETTLE * DT);   // 남은 속도를 줄이며 조금 미끄러짐
    for (let j = 0; j < dice.length; j++) {
      const d = dice[j], f = from[j];
      if (s === SETTLE) {
        d.q = f.flat.q;
        d.p = [d.p[0], HALF, d.p[2]];
        continue;
      }
      d.q = nlerp(f.q, f.flat.q, t);
      d.p[0] = f.p[0] + f.v[0] * slide; d.p[2] = f.p[2] + f.v[2] * slide;
      const yy = f.p[1] + (HALF - f.p[1]) * t;
      d.p[1] = yy;
      project(d);
    }
    writeFrame(buf, k0 + s, dice);
  }
  return from.map((f) => f.flat);
}

function validRest(rest) {
  for (let a = 0; a < rest.length; a++) {
    const A = rest[a];
    if (!(Math.abs(A.x) <= LIMIT && Math.abs(A.z) <= LIMIT)) return 'wall';
    for (let b = a + 1; b < rest.length; b++) {
      const dx = rest[b].x - A.x, dz = rest[b].z - A.z;
      if (dx * dx + dz * dz < GAP * GAP) return 'gap';
    }
  }
  return '';
}

function attempt(seed, thrown, buf) {
  const n = thrown.length;
  const dice = spawn(seed, n);
  writeFrame(buf, 0, dice);
  let k = 0;
  for (;;) {
    if (k >= MAX_STEPS - SETTLE) return { fail: 'slow' };   // 2.3초 안에 다 멈추지 않음
    step(dice);
    k++;
    writeFrame(buf, k, dice);
    if (k >= MIN_STOP && dice.every((d) => d.sleep)) break;
  }
  if (dice.some((d) => d.hits < 2)) return { fail: 'hits' };
  const flats = settle(dice, buf, k);
  const steps = k + SETTLE + 1;
  const rest = dice.map((d, j) => ({ i: thrown[j], x: d.p[0], z: d.p[2], yaw: yawOf(flats[j].ry), up: flats[j].up }));
  const bad = validRest(rest);
  if (bad) return { fail: bad };
  return { steps, rest };
}

// 정해진 격자 자리로 미끄러져 멈추는 경로(항상 성공). 컵 자리에서 떨어지며 각 자리로 간다.
const GRID = [[-2.2, -0.6], [0, -0.6], [2.2, -0.6], [-1.1, 1.4], [1.1, 1.4]];
const FALL_STEPS = 132;   // 1.1초
function fallback(seed, thrown, buf) {
  const n = thrown.length;
  const dice = spawn(seed, n);
  const rnd = prng((seed ^ 0x5bd1e995) >>> 0);
  const from = dice.map((d) => ({ p: d.p.slice(), q: d.q.slice() }));
  const to = dice.map((d, j) => {
    const up = upFace(d.q).up;
    let c = 1, s = 0;
    for (;;) { const a = rnd() * 2 - 1, b = rnd() * 2 - 1; const l2 = a * a + b * b; if (l2 > 0.01 && l2 <= 1) { const l = Math.sqrt(l2); s = (a / l) * 0.2; break; } }
    c = Math.sqrt(1 - s * s);
    const ry = [0, s, 0, c];
    return { x: GRID[j][0], z: GRID[j][1], up, ry, q: qmul(ry, BASE[up]) };
  });
  writeFrame(buf, 0, dice);
  const total = FALL_STEPS + SETTLE;
  for (let k = 1; k <= total; k++) {
    const t = k / total, e = 1 - (1 - t) * (1 - t) * (1 - t);   // 빠르게 나와 천천히 멈춤
    for (let j = 0; j < n; j++) {
      const d = dice[j], f = from[j], g = to[j];
      d.p[0] = f.p[0] + (g.x - f.p[0]) * e;
      d.p[2] = f.p[2] + (g.z - f.p[2]) * e;
      const fall = k < 30 ? (k / 30) : 1;
      d.p[1] = f.p[1] + (HALF - f.p[1]) * (1 - (1 - fall) * (1 - fall));
      d.q = k === total ? g.q : nlerp(f.q, g.q, e);
      if (k === total) d.p = [g.x, HALF, g.z];
      else project(d);
    }
    writeFrame(buf, k, dice);
  }
  return {
    steps: total + 1,
    rest: to.map((g, j) => ({ i: thrown[j], x: g.x, z: g.z, yaw: yawOf(g.ry), up: g.up })),
  };
}

/**
 * seed(0..2³²−1 정수)와 굴린 주사위 번호 목록으로 경로를 계산한다.
 * 결과가 유효하지 않으면 seed+1, +2 … 로 최대 8번, 그래도 안 되면 격자 자리 경로.
 * @returns {{ms:number, steps:number, frames:Float32Array|null, rest:{i:number,x:number,z:number,yaw:number,up:number}[]}}
 */
export function simulateRoll(seed, thrown, { frames = true } = {}) {
  const list = Array.isArray(thrown) ? thrown.slice(0, 5) : [];
  const n = list.length;
  if (!n) return { ms: 0, steps: 0, frames: frames ? new Float32Array(0) : null, rest: [] };
  const buf = frames ? new Float32Array((MAX_STEPS + 1) * n * 7) : null;
  const s0 = (Number(seed) >>> 0);
  let res = null;
  for (let k = 0; k < TRIES && !(res && res.steps); k++) res = attempt((s0 + k) >>> 0, list, buf);
  if (!res.steps) res = fallback(s0, list, buf);
  return {
    ms: (res.steps - 1) * STEP_MS,
    steps: res.steps,
    frames: buf ? buf.slice(0, res.steps * n * 7) : null,
    rest: res.rest,
  };
}

// 시험용(화면·서버는 쓰지 않는다): 한 번 시도 / 격자 자리 경로
export const _test = { attempt, fallback };
