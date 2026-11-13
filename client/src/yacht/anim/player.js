// 요트다이스 굴림 재생기: 굴림 계산기(shared/yacht/sim.js)의 경로를 "시작 뒤 t초"의 모습으로 바꿔 준다.
// poseAt(t) 는 t 만의 함수다(앞 프레임에 기대지 않는다) → 프레임을 건너뛰어도, 어느 기기에서도 같은 시각에 같은 자리.
// 눈은 서버 값(dice[i].v)만 쓴다. three.js 를 쓰지 않는다. Math.random 금지.
import { simulateRoll, restQuat, faceFix, STEP_MS, DIE, CUP } from '../../../../shared/yacht/sim.js';

export const T_GATHER = 0.3;      // 굴릴 주사위가 컵으로
export const T_RELEASE = 0.45;    // 컵을 기울이는 도중 주사위가 나오는 시각(= 경로 프레임 0)
const T_POUR = 0.3;               // 컵 기울이기
const T_BACK = [0.65, 0.9, 1.25]; // 컵: 다시 세우기 시작 → 눕히기 시작 → 테두리에 눕힘
export const SNAP = 0.2;          // 마지막 0.2초: 서버 자리로 맞춤
export const REDUCED = 0.4;       // 줄인 연출: 마지막 0.4초만
const REST_Y = DIE / 2;
const CUP_IN = [CUP.x, 5.6, CUP.z];   // 세워 든 컵 속

const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const eye = (v) => (v >= 1 && v <= 6 ? v : 1);
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
/** 두 자세 사이(짧은 쪽으로, 길이 1 로). */
export function qmix(a, b, t) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = [0, 1, 2, 3].map((k) => a[k] + (s * b[k] - a[k]) * t);
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
export const vmix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** 멈춘 주사위의 모습(상태 그대로). */
export const restPose = (d) => ({ pos: [+d.x || 0, REST_Y, +d.z || 0], quat: restQuat(eye(d.v), +d.yaw || 0) });

/**
 * @param seed, thrown, dice  ytRoll 알림 그대로
 * @param start { lift: 0..1(컵이 들린 정도), shakeT: 흔드는 중이면 초 | null, dice: [{pos, quat, hidden}] ×5 } 시작할 때의 모습
 * @returns { duration, hits: [{t, power}], poseAt(t) -> { dice: [{i, hidden, pos, quat}], cup: {mode, t, dice} } }
 */
export function createRollPlayer({ seed, thrown = [], dice = [], start = {}, reduced = false } = {}) {
  const list = thrown.filter((i) => dice[i]);
  const n = list.length;
  const sim = simulateRoll(seed, list);
  const F = sim.frames, last = Math.max(0, sim.steps - 1);
  const simS = sim.ms / 1000;
  const fix = list.map((i, j) => faceFix(sim.rest[j].up, eye(dice[i].v)));
  const end = list.map((i) => restPose(dice[i]));
  const from = list.map((i) => (start.dice && start.dice[i]) || { hidden: true });
  const lift0 = Math.max(0, Math.min(1, +start.lift || 0));
  const shake0 = Number.isFinite(start.shakeT) ? start.shakeT : null;
  const allIn = from.every((f) => f.hidden);
  const lead = reduced ? 0 : T_RELEASE;
  const duration = !n ? 0 : reduced ? Math.min(REDUCED, simS) : T_RELEASE + simS;
  const simAt = (t) => (reduced ? simS - duration + t : t - T_RELEASE);     // 경로 안의 시각(초)

  function simPose(j, s) {
    const k = Math.max(0, Math.min(last, (s * 1000) / STEP_MS));
    const k0 = Math.floor(k), k1 = Math.min(last, k0 + 1), f = k - k0;
    const a = (k0 * n + j) * 7, b = (k1 * n + j) * 7;
    const pos = vmix([F[a], F[a + 1], F[a + 2]], [F[b], F[b + 1], F[b + 2]], f);
    const q = qmix([F[a + 3], F[a + 4], F[a + 5], F[a + 6]], [F[b + 3], F[b + 4], F[b + 5], F[b + 6]], f);
    return { pos, quat: qmul(q, fix[j]) };
  }

  // 튕기는 순간(소리용): 떨어지던 주사위의 세로 속도가 갑자기 위로 바뀐 프레임
  const hits = [];
  if (!reduced) {
    for (let j = 0; j < n; j++) {
      for (let k = 1; k < last; k++) {
        const y0 = F[((k - 1) * n + j) * 7 + 1], y1 = F[(k * n + j) * 7 + 1], y2 = F[((k + 1) * n + j) * 7 + 1];
        const jump = (y2 - y1) - (y1 - y0);
        if (y1 < y0 && jump > 0.03) hits.push({ t: T_RELEASE + (k * STEP_MS) / 1000, power: Math.min(1, jump / 0.12) });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    for (let k = hits.length - 1; k > 0; k--) if (hits[k].t - hits[k - 1].t < 0.05) hits.splice(k, 1);
  }

  function cupAt(t) {
    if (reduced || t >= T_BACK[2]) return { mode: 'rest', t: 0, dice: 0 };
    if (t < T_GATHER) {
      // 흔들던 컵: 끝 0.12초는 흔들림을 줄여 바로 선다
      if (shake0 != null) return { mode: 'shake', t: t < T_GATHER - 0.12 ? shake0 + t : T_GATHER - t, dice: n };
      return { mode: 'rest', t: lift0 + (1 - lift0) * smooth(t / T_GATHER), dice: allIn ? n : 0 };
    }
    const inCup = t < T_RELEASE ? n : 0;
    if (t < T_BACK[0]) return { mode: 'pour', t: Math.min(1, (t - T_GATHER) / T_POUR), dice: inCup };
    if (t < T_BACK[1]) return { mode: 'pour', t: 1 - (t - T_BACK[0]) / (T_BACK[1] - T_BACK[0]), dice: 0 };
    return { mode: 'rest', t: 1 - (t - T_BACK[1]) / (T_BACK[2] - T_BACK[1]), dice: 0 };
  }

  function poseAt(t) {
    t = Math.max(0, Math.min(duration, +t || 0));
    const out = [];
    for (let j = 0; j < n; j++) {
      const i = list[j];
      if (t >= duration) { out.push({ i, hidden: false, pos: end[j].pos.slice(), quat: end[j].quat.slice() }); continue; }
      if (t < lead) {
        const f = from[j];
        if (f.hidden || !f.pos || t >= T_GATHER) { out.push({ i, hidden: true }); continue; }
        const e = smooth(t / T_GATHER);
        const pos = vmix(f.pos, CUP_IN, e);
        pos[1] += Math.sin(Math.PI * e) * 1.5;
        out.push({ i, hidden: false, pos, quat: f.quat.slice() });
        continue;
      }
      const p = simPose(j, simAt(t));
      const w = smooth(1 - (duration - t) / SNAP);
      out.push({ i, hidden: false, pos: w > 0 ? vmix(p.pos, end[j].pos, w) : p.pos, quat: w > 0 ? qmix(p.quat, end[j].quat, w) : p.quat });
    }
    return { dice: out, cup: t >= duration ? { mode: 'rest', t: 0, dice: 0 } : cupAt(t) };
  }

  return { duration, hits, poseAt, rest: sim.rest };
}
