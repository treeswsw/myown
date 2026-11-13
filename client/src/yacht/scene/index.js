// 요트다이스 3D 장면: 트레이·컵·주사위. 움직임은 계산하지 않고 받아서 그리기만 한다(docs/YACHT-PLAN.md Y4C).
// 렌더러는 만들지 않는다. 쓰는 쪽이 stage.use(scene, camera) 로 건다.
// 단위는 트레이 단위 그대로(docs/yacht/GDD.md 4절): 펠트 한 변 10, 가운데 (0, 0), 바닥 y = 0, 주사위 한 변 1.4.
import * as THREE from 'three';
import { LEVELS, clampLevel, startLevel, createQualityWatch, createTracker } from './quality.js';
import { createTray, slotPos, OUTER, X0, Z0, Z1, RIM_Y } from './tray.js';
import { createDiceKit, upQuat, DIE } from './die.js';
import { createCup, CUP } from './cup.js';

export { CUP, slotPos, upQuat };
/** 트레이 바깥 네 귀퉁이(테두리 맨 위 높이). setRect 의 네모 네 귀퉁이에 꼭 맞는 점들: 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래. */
export const TRAY_CORNERS = [[X0, RIM_Y, Z0], [-X0, RIM_Y, Z0], [-X0, RIM_Y, Z1], [X0, RIM_Y, Z1]];

// 카메라: 움직이지 않는다. 화면 면이 트레이와 나란한 채로 눈만 앞쪽(보는 사람 쪽) 위에 둔다.
// → 트레이 바깥 네모가 화면에서도 반듯한 네모라 어떤 기기에서도 같은 모습이고, 주사위 앞면·안쪽 계단 벽이 살짝 보인다(조금 기울여 본 느낌).
const EYE = [0, 42, 12], NEAR = 8, FAR = 60;
const N_DICE = 5, REST_Y = DIE / 2;

export function createYachtScene({ stage, quality } = {}) {
  const scene = new THREE.Scene();
  scene.name = 'yacht';
  scene.background = new THREE.Color(0x140d08);
  const camera = new THREE.PerspectiveCamera(30, 1, NEAR, FAR);
  camera.position.set(EYE[0], EYE[1], EYE[2]);
  camera.up.set(0, 0, -1);
  camera.lookAt(EYE[0], 0, EYE[2]);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix = () => fit();      // 누가 불러도 치우친 투영이 풀리지 않게

  // 조명: 왼쪽 앞 위의 큰 빛(그림자) + 오른쪽 뒤의 약한 빛 + 주변광
  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x3b2a20, 1.1);
  const key = new THREE.DirectionalLight(0xfff6ea, 1.8);
  key.position.set(-9, 30, 6.5); key.target.position.set(0, 0, -1);
  const sc = key.shadow.camera;
  sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 4; sc.far = 60;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.035; key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(12, 22, -9); fill.target.position.set(0, 0, 0);
  scene.add(hemi, key, key.target, fill, fill.target);

  let q = clampLevel(quality ?? startLevel(stage));
  let track = null, parts = null, disposed = false;
  let rect = null, viewport = null;
  const view = { w: 1, h: 1 };
  const dice = Array.from({ length: N_DICE }, () => ({ pos: new THREE.Vector3(0, REST_Y, 0), quat: new THREE.Quaternion(), hidden: true }));
  let cupState = { mode: 'hidden', t: 0, dice: 0 };
  const qt = new THREE.Quaternion(), v3 = new THREE.Vector3();

  function applyDie(i) {
    if (!parts) return;
    const d = dice[i], m = parts.dice[i], b = parts.blobs[i];
    m.position.copy(d.pos); m.quaternion.copy(d.quat); m.visible = !d.hidden;
    if (b) {
      const lift = Math.max(0, d.pos.y - REST_Y);
      b.visible = !d.hidden && lift < 5;
      b.position.set(d.pos.x + 0.1 + lift * 0.12, 0.02, d.pos.z - 0.06 - lift * 0.05);
      b.material.opacity = Math.max(0, 1 - lift / 5);
      b.scale.setScalar(1 + lift * 0.12);
    }
  }

  function build() {
    track = createTracker();
    const L = LEVELS[q];
    const tray = createTray({ q, track });
    const kit = createDiceKit({ q, track });
    const cup = createCup({ q, track, kit });
    const group = new THREE.Group(); group.name = 'yt-parts';
    const meshes = [], blobs = [];
    for (let i = 0; i < N_DICE; i++) {
      const m = kit.mesh(`yt-die-${i}`); meshes.push(m); group.add(m);
      const b = kit.blob(`yt-blob-${i}`); blobs.push(b); if (b) group.add(b);
    }
    group.add(tray.group, cup.group);
    scene.add(group);
    key.castShadow = L.shadow > 0;
    if (L.shadow && key.shadow.mapSize.x !== L.shadow) {
      key.shadow.mapSize.set(L.shadow, L.shadow);
      key.shadow.map?.dispose(); key.shadow.map = null;      // 다음 프레임에 새 크기로 다시 만든다
    }
    parts = { group, tray, cup, dice: meshes, blobs, tris: tray.tris + cup.tris + N_DICE * kit.tris };
    for (let i = 0; i < N_DICE; i++) applyDie(i);
    cup.set(cupState);
  }

  function unbuild() {
    if (!parts) return;
    scene.remove(parts.group);
    parts.group.clear();
    track.dispose();
    parts = null; track = null;
  }

  // 트레이 바깥 네모(테두리 맨 위 면)가 화면의 rect 에 꼭 맞도록 투영을 정한다. 한쪽으로 치우친 원근 투영이라 카메라 자리·방향은 그대로다.
  function fit() {
    view.w = Math.max(1, viewport?.w ?? stage?.size?.w ?? globalThis.innerWidth ?? 1);
    view.h = Math.max(1, viewport?.h ?? stage?.size?.h ?? globalThis.innerHeight ?? 1);
    const r = rect ?? { x: 0, y: 0, w: view.w, h: view.h };
    const side = Math.max(1, Math.min(r.w, r.h));             // 정사각형이 아니면 가운데에 가장 큰 정사각형
    const px = r.x + (r.w - side) / 2, py = r.y + (r.h - side) / 2;
    const s = side / OUTER;                                    // px / 트레이 단위 (테두리 맨 위 면에서)
    const xl = X0 - px / s, xr = xl + view.w / s, zt = Z0 - py / s, zb = zt + view.h / s;
    const k = NEAR / (EYE[1] - RIM_Y);
    camera.projectionMatrix.makePerspective((xl - EYE[0]) * k, (xr - EYE[0]) * k, (EYE[2] - zt) * k, (EYE[2] - zb) * k, NEAR, FAR);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  const watch = createQualityWatch({ get: () => q, lower: () => api.setQuality(q - 1) });
  const offFrame = stage?.onFrame?.((dt) => {
    if (disposed) return;
    // 포커 방이 불러 둔 주변 반사 그림을 같이 쓴다(플라스틱 광택). 없으면 조명만으로 그린다. 우리 것이 아니므로 버리지 않는다.
    if (!scene.environment && stage.scene?.environment) scene.environment = stage.scene.environment;
    if (!stage.nogl) watch.tick(dt);                           // 그리지 않는 시험 모드에서는 속도를 재지 않는다
  });

  const api = {
    scene, camera,
    setRect(r, vp) {
      if (disposed) return;
      rect = r ? { x: +r.x || 0, y: +r.y || 0, w: +r.w || 0, h: +r.h || 0 } : null;
      if (vp) viewport = { w: +vp.w || 0, h: +vp.h || 0 };
      fit();
    },
    setDie(i, { pos, quat, fix } = {}) {
      const d = dice[i];
      if (disposed || !d) return;
      if (pos) d.pos.set(pos[0], pos[1], pos[2]);
      if (quat) d.quat.set(quat[0], quat[1], quat[2], quat[3]);
      if (fix) d.quat.multiply(qt.set(fix[0], fix[1], fix[2], fix[3]));    // 경로 자세 × 면 배치 회전
      if (quat || fix) d.quat.normalize();
      d.hidden = false;
      applyDie(i);
    },
    setDieSlot(i, slot, v) {
      const d = dice[i];
      if (disposed || !d || !(slot >= 0 && slot < 5)) return;
      const [x, z] = slotPos(slot), u = upQuat(v);
      d.pos.set(x, REST_Y, z);
      d.quat.set(u[0], u[1], u[2], u[3]);
      d.hidden = false;
      applyDie(i);
    },
    setDieHidden(i, hidden) {
      const d = dice[i];
      if (disposed || !d) return;
      d.hidden = !!hidden;
      applyDie(i);
    },
    setCup(c = {}) {
      if (disposed) return;
      cupState = { mode: ['rest', 'shake', 'pour'].includes(c.mode) ? c.mode : 'hidden', t: +c.t || 0, dice: +c.dice || 0 };
      parts.cup.set(cupState);
    },
    project(p) {
      if (disposed) return null;
      v3.set(p[0], p[1], p[2]).project(camera);
      return { x: (v3.x * 0.5 + 0.5) * view.w, y: (-v3.y * 0.5 + 0.5) * view.h };
    },
    setQuality(n) {
      const next = clampLevel(n);
      if (disposed || next === q) return;
      unbuild(); q = next; build();
      watch.reset();
    },
    quality: () => q,
    /** 화면 크기가 바뀌면 부른다(같은 네모로 다시 맞춘다. 네모가 바뀌었으면 setRect). */
    resize() { if (!disposed) fit(); },
    /** 시험·점검용: 삼각형 수(주사위 5 + 트레이 + 컵)와 살아 있는 자원 수. */
    stats() {
      return { quality: q, tris: parts ? parts.tris : 0, geometries: track ? track.count('isBufferGeometry') : 0,
        materials: track ? track.count('isMaterial') : 0, textures: track ? track.count('isTexture') : 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offFrame?.();
      unbuild();
      key.shadow.map?.dispose(); key.shadow.map = null;
      key.dispose(); fill.dispose(); hemi.dispose();
      scene.environment = null;
      scene.clear();
    },
  };

  build();
  fit();
  return api;
}
