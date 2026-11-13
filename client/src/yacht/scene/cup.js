// 컵(실물 그대로): 겉은 검은 플라스틱, 안은 빨강. 움직임은 받기만 한다 — set({ mode, t, dice }).
//   hidden            안 보임
//   rest  t 0..1      t = 0: 빈 컵을 트레이 오른쪽 테두리에 눕혀 둔 모습 / t = 1: 쏟는 자리 위에 바로 세워 든 모습(그 사이는 집어 드는 동작)
//   shake t 초         세워 든 채 흔들기. t = 0 은 rest 1 과 같은 모습
//   pour  t 0..1      세워 든 모습에서 트레이 가운데 쪽으로 기울여 쏟기
//   dice  0..5        컵 안에 보이는 주사위 수(장식. 눈은 뜻이 없다 — 굴리기 전이라 아직 정해지지 않은 눈)
import * as THREE from 'three';
import { LEVELS } from './quality.js';
import { RIM_Y } from './tray.js';

export const CUP = { x: 3.4, z: 2.4 };          // shared/yacht/sim.js 의 CUP 과 같은 값
const RB = 2.0, RM = 2.45, HC = 4.2, TH = 0.13, FLOOR_Y = 0.24;   // 바닥·입구 반지름, 높이, 벽 두께, 안쪽 바닥 높이

const Y = new THREE.Vector3(0, 1, 0);
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

// 자세 = 입구 가운데 자리 + 축 방향(바닥 → 입구)
const UP_MOUTH = new THREE.Vector3(CUP.x, RIM_Y + 0.35 + HC, CUP.z);
const UP_AXIS = new THREE.Vector3(-0.07, 1, -0.04).normalize();
// 눕힌 컵: 오른쪽 테두리(x 5~7) 위에 옆면이 닿게 걸쳐 두고, 입구가 펠트 쪽을 본다
const REST_MOUTH = new THREE.Vector3(4.6, RIM_Y + RM * 0.994 + 0.06, 0.2);
const REST_AXIS = new THREE.Vector3(-0.99, 0.107, 0.1).normalize();
const POUR_DIR = new THREE.Vector3(-CUP.x, 0, -CUP.z).normalize();      // 쏟는 방향: 트레이 가운데 쪽
const POUR_AXIS = new THREE.Vector3().crossVectors(Y, POUR_DIR).normalize();
const POUR_ANGLE = 2.2;                                                  // 약 126도

// 컵 안 장식 주사위 자리(컵 기준): 아래 셋, 위에 둘
const INSIDE = [
  [[0.0, 0.72, 1.02], [0.0, 0.5, 0.0]], [[-0.9, 0.72, -0.5], [1.5708, 0.9, 0.0]], [[0.92, 0.72, -0.48], [0.0, 2.2, 1.5708]],
  [[-0.38, 1.98, 0.3], [0.5, 1.1, 0.35]], [[0.62, 2.12, -0.3], [-0.4, 0.3, 1.9]],
];

export function createCup({ q, track, kit }) {
  const L = LEVELS[q];
  const group = new THREE.Group(); group.name = 'yt-cup';
  const V = (x, y) => new THREE.Vector2(x, y);
  // 겉(검정): 바닥 → 옆 → 둥근 입술. 안(빨강): 입술 → 안쪽 벽 → 바닥.
  const outer = track.add(new THREE.LatheGeometry([V(0.0001, 0), V(RB - 0.22, 0), V(RB - 0.07, 0.05), V(RB, 0.2), V(RM, HC - 0.1), V(RM - 0.035, HC - 0.03), V(RM - TH / 2, HC)], L.lathe));
  outer.normalizeNormals();
  const inner = track.add(new THREE.LatheGeometry([V(RM - TH / 2, HC), V(RM - TH + 0.02, HC - 0.04), V(RM - TH, HC - 0.12), V(RB - TH, FLOOR_Y + 0.22), V(RB - TH - 0.1, FLOOR_Y + 0.05), V(RB - TH - 0.3, FLOOR_Y), V(0.0001, FLOOR_Y)], L.lathe));
  inner.normalizeNormals();   // LatheGeometry 는 끝점 법선 길이를 맞추지 않는다
  const black = track.add(!L.fine ? new THREE.MeshLambertMaterial({ color: 0x232323 })
    : L.physical ? new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.46, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.4 })
      : new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.46, metalness: 0, envMapIntensity: 0.4 }));
  const red = track.add(!L.fine ? new THREE.MeshLambertMaterial({ color: 0xb5161d, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: 0xa81419, roughness: 0.7, metalness: 0, envMapIntensity: 0.12, side: THREE.DoubleSide }));
  const mo = new THREE.Mesh(outer, black), mi = new THREE.Mesh(inner, red);
  mo.name = 'yt-cup-out'; mi.name = 'yt-cup-in';
  mo.castShadow = true; mo.receiveShadow = true; mi.receiveShadow = true;
  group.add(mo, mi);

  const inside = INSIDE.map(([p, e], k) => {
    const m = kit.mesh(`yt-cup-die-${k}`);
    m.position.set(p[0], p[1] + FLOOR_Y, p[2]);
    m.rotation.set(e[0], e[1], e[2]);
    m.userData.home = m.position.clone();
    m.userData.spin = m.quaternion.clone();
    m.visible = false;
    group.add(m);
    return m;
  });

  const mouth = new THREE.Vector3(), axis = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const place = () => {            // 입구 자리(mouth)와 축(axis)에서 컵의 자리·회전을 정한다
    group.quaternion.setFromUnitVectors(Y, axis);
    group.position.copy(mouth).addScaledVector(axis, -HC);
  };

  function set({ mode = 'hidden', t = 0, dice = 0 } = {}) {
    const tt = Number.isFinite(t) ? t : 0;
    group.visible = mode !== 'hidden';
    if (!group.visible) return;
    const n = Math.max(0, Math.min(5, Math.floor(dice) || 0));
    let rattle = 0;
    if (mode === 'pour') {
      const e = smooth(tt);
      axis.copy(UP_AXIS).applyAxisAngle(POUR_AXIS, POUR_ANGLE * e);
      mouth.copy(UP_MOUTH).addScaledVector(POUR_DIR, 0.9 * e);
      mouth.y -= 2.3 * e;
      place();
    } else if (mode === 'shake') {
      // 초 단위 시간으로 정해지는 흔들림(모든 기기가 같은 t 면 같은 모습)
      const a = Math.min(1, tt / 0.12);
      axis.copy(UP_AXIS);
      mouth.copy(UP_MOUTH);
      mouth.x += Math.sin(tt * 31) * 0.42 * a; mouth.z += Math.cos(tt * 23 + 0.6) * 0.3 * a; mouth.y += Math.abs(Math.sin(tt * 27)) * 0.34 * a;
      place();
      qa.set(Math.sin(tt * 29) * 0.07 * a, 0, Math.cos(tt * 33) * 0.07 * a, 1).normalize();
      group.quaternion.multiply(qa);
      rattle = a;
    } else {                        // rest
      const e = smooth(tt);
      qa.setFromUnitVectors(Y, REST_AXIS); qb.setFromUnitVectors(Y, UP_AXIS);
      qa.slerp(qb, e);
      axis.copy(Y).applyQuaternion(qa);
      mouth.lerpVectors(REST_MOUTH, UP_MOUTH, e);
      mouth.y += Math.sin(Math.PI * e) * 1.1;      // 집어 들 때 살짝 떠올랐다 내려온다
      place();
    }
    inside.forEach((m, k) => {
      m.visible = k < n;
      if (!m.visible) return;
      m.position.copy(m.userData.home);
      m.quaternion.copy(m.userData.spin);
      if (rattle > 0) {
        m.position.x += Math.sin(tt * 37 + k * 1.7) * 0.16 * rattle;
        m.position.z += Math.cos(tt * 41 + k * 2.3) * 0.16 * rattle;
        m.position.y += Math.abs(Math.sin(tt * 27 + k)) * 0.3 * rattle;
        qb.set(Math.sin(tt * 19 + k) * 0.25 * rattle, Math.sin(tt * 23 + k * 2) * 0.25 * rattle, Math.cos(tt * 17 + k * 3) * 0.25 * rattle, 1).normalize();
        m.quaternion.multiply(qb);
      }
    });
  }

  set({ mode: 'hidden' });
  return { group, set, tris: (outer.index.count + inner.index.count) / 3 + 5 * kit.tris };
}
