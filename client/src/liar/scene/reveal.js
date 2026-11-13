// 정체 공개: 장면을 어둡게 하고 한 사람 위에 빨간(또는 하얀) 빛기둥. 시안 rvLook·stepReveal 과 빛기둥(rvBeam·rvCones)을 옮김.
// 카메라 클로즈업은 camera.js 의 'liar' 구도. 여기는 조명과 기둥만.
import * as THREE from 'three';

const RV_H = 3.6;
const RED = 0xff2a22, WHITE = 0xffffff;
const COLORS = { red: RED, white: WHITE };
const FACE_DIM = 0.02, FACE_LIT = 0.5;

// ctx: { scene, spot, hemi (table.js 의 조명), seats }
export function createReveal({ scene, spot, hemi, seats }) {
  const light = new THREE.SpotLight(RED, 0, 0, 0.26, 0.6, 2);
  scene.add(light, light.target);
  const beam = new THREE.Group();
  beam.name = 'liar-beam';
  beam.visible = false;
  scene.add(beam);
  const cones = [[0.42, 1], [0.7, 0.55]].map(([r, w]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, RV_H, 28, 1, true), new THREE.MeshBasicMaterial({
      color: RED, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    m.position.y = RV_H / 2;
    m.renderOrder = 5;
    m.userData.w = w;
    beam.add(m);
    return m;
  });
  const base = { spot: spot.intensity, hemi: hemi.intensity };
  const faceBase = new WeakMap();   // 얼굴 재질 → 원래 밝기
  let on = false;
  let target = null;                // 기둥이 선 사람 id
  let goal = { spot: base.spot, hemi: base.hemi, light: 0, cone: 0, rate: 2.2 };
  let disposed = false;
  let hue = 'red';                  // 지금 목표 색 이름
  const goalColor = new THREE.Color(RED);

  const faceMat = (e) => e.body.userData.face?.material || null;
  function settled() {
    return Math.abs(spot.intensity - goal.spot) < 0.01 && Math.abs(hemi.intensity - goal.hemi) < 0.01
      && light.intensity < 0.05 && cones.every((m) => m.material.opacity < 0.001);
  }

  return {
    // 켜기. 없는 id 면 false (아무것도 바꾸지 않는다)
    // color: 'red'(기본) | 'white'. 이미 켜져 있으면 같은 자리에서 색만 천천히 바뀐다(빨강→하양)
    look(id, color = 'red') {
      if (disposed) return false;
      const e = seats.get(id);
      if (!e) return false;
      const fwd = e.fwd;
      beam.position.set(e.slot.x + fwd.x * 0.08, 0, e.slot.z + fwd.z * 0.08);
      light.position.set(e.slot.x + fwd.x * 0.45, RV_H - 0.3, e.slot.z + fwd.z * 0.45);
      light.target.position.set(e.slot.x, 1.0, e.slot.z);
      beam.visible = true;
      on = true; target = id;
      hue = color === 'white' ? 'white' : 'red';
      goalColor.setHex(COLORS[hue]);
      goal = { spot: 0.5, hemi: 0.07, light: 90, cone: 0.2, rate: 9 };   // 빛은 탁 켜지고
      return true;
    },
    // 끄기: 조명을 원래대로 천천히 되돌린다
    off() {
      if (disposed || !on) return;
      on = false; target = null; hue = 'red';
      goal = { spot: base.spot, hemi: base.hemi, light: 0, cone: 0, rate: 2.2 };
    },
    step(dt) {
      if (disposed || (!on && !beam.visible)) return;
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const a = reduce ? 1 : 1 - Math.exp(-dt * goal.rate);
      spot.intensity += (goal.spot - spot.intensity) * a;
      hemi.intensity += (goal.hemi - hemi.intensity) * a;
      light.intensity += (goal.light - light.intensity) * a;
      if (on) {   // 색은 켜진 동안만 따라간다(끌 때는 어두워지며 사라지므로 색을 건드리지 않는다)
        const ac = reduce ? 1 : 1 - Math.exp(-dt * 3);
        light.color.lerp(goalColor, ac);
        cones.forEach((m) => m.material.color.lerp(goalColor, ac));
      }
      cones.forEach((m) => { m.material.opacity += (goal.cone * m.userData.w - m.material.opacity) * a; });
      for (const id of seats.order) {
        const e = seats.get(id), m = e && faceMat(e);
        if (!m) continue;
        if (!faceBase.has(m)) faceBase.set(m, m.emissiveIntensity);
        const to = on ? (id === target ? FACE_LIT : FACE_DIM) : faceBase.get(m);
        m.emissiveIntensity += (to - m.emissiveIntensity) * a;
      }
      if (!on && settled()) {
        beam.visible = false;
        spot.intensity = base.spot; hemi.intensity = base.hemi; light.intensity = 0;
        light.color.setHex(RED); cones.forEach((m) => m.material.color.setHex(RED));
        for (const id of seats.order) { const m = seats.get(id) && faceMat(seats.get(id)); if (m && faceBase.has(m)) m.emissiveIntensity = faceBase.get(m); }
      }
    },
    get active() { return on; },
    get hue() { return on ? hue : null; },                 // 목표 색 이름(시험용)
    get lightHex() { return light.color.getHex(); },       // 지금 실제 색(시험용)
    get beamVisible() { return beam.visible; },
    dispose() {
      if (disposed) return;
      disposed = true;
      spot.intensity = base.spot; hemi.intensity = base.hemi;
      for (const id of seats.order) { const e = seats.get(id), m = e && faceMat(e); if (m && faceBase.has(m)) m.emissiveIntensity = faceBase.get(m); }
      cones.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      light.dispose?.();
      scene.remove(light, light.target, beam);
    },
  };
}
