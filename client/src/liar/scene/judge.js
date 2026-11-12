// 찬반 조명: 사람마다 'yes'(맞다 = 빨강) / 'no'(아니다 = 흰 종이빛) 표시. 안 고른 사람은 없음.
// 시안의 찬반 색(--red #ea3a3d, --ink #efe6d8)을 따른다. 테이블 가장자리 바닥의 빛 번짐 + 머리 위로 서는 가는 빛기둥.
import * as THREE from 'three';

const COLORS = { yes: 0xea3a3d, no: 0xefe6d8 };
const H = 1.7;

export function createJudge({ scene, seats }) {
  const group = new THREE.Group();
  group.name = 'liar-judge';
  scene.add(group);
  const marks = new Map();   // id → { v, root, discMat, coneMat, pos }
  const discGeo = new THREE.CircleGeometry(0.2, 24);
  const coneGeo = new THREE.ConeGeometry(0.16, H, 16, 1, true);
  let picks = {};
  let disposed = false;

  function additive(color, opacity) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false });
  }
  function make(id, v) {
    const root = new THREE.Group();
    const discMat = additive(COLORS[v], 0.0);
    const coneMat = additive(COLORS[v], 0.0);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.02; disc.renderOrder = 6;
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.y = H / 2; cone.renderOrder = 6;
    root.add(disc, cone);
    group.add(root);
    return { v, root, discMat, coneMat, k: 0 };
  }
  function drop(m) { m.discMat.dispose(); m.coneMat.dispose(); group.remove(m.root); }
  function place() {
    for (const [id, m] of marks) {
      const e = seats.get(id);
      m.root.visible = !!e;
      if (e) m.root.position.set(e.slot.x, 0, e.slot.z);
    }
  }
  function apply() {
    const want = new Map();
    for (const id of Object.keys(picks || {})) {
      const v = picks[id];
      if ((v === 'yes' || v === 'no') && seats.get(id)) want.set(id, v);
    }
    for (const [id, m] of marks) if (want.get(id) !== m.v) { drop(m); marks.delete(id); }
    for (const [id, v] of want) if (!marks.has(id)) marks.set(id, make(id, v));
    place();
  }

  return {
    set(p) { if (disposed) return; picks = p && typeof p === 'object' ? { ...p } : {}; apply(); },
    refresh() { if (!disposed) apply(); },
    step(dt) {   // 켜질 때 부드럽게 밝아진다
      if (disposed) return;
      const a = 1 - Math.exp(-dt * 8);
      for (const m of marks.values()) {
        m.k += (1 - m.k) * a;
        m.discMat.opacity = 0.55 * m.k;
        m.coneMat.opacity = 0.14 * m.k;
      }
    },
    get count() { return marks.size; },
    get yes() { return [...marks].filter(([, m]) => m.v === 'yes').length; },
    get no() { return [...marks].filter(([, m]) => m.v === 'no').length; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of marks.values()) drop(m);
      marks.clear();
      discGeo.dispose(); coneGeo.dispose();
      scene.remove(group);
    },
  };
}
