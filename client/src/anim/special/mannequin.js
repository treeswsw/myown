// A suited mannequin that hangs from a neck anchor directly under a player's profile photo.
// Local space: origin = neck base, +y up, +z toward the table, the figure's right hand on -x.
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const DIM = {
  upper: 0.32, fore: 0.3, thigh: 0.46, shin: 0.46,
  shoulderX: 0.2, shoulderY: -0.115, hipX: 0.095, hipY: -0.7,
};
export const REACH = DIM.upper + DIM.fore;
export const REST = { R: v(-0.255, -0.725, 0.05), L: v(0.255, -0.725, 0.05) };

/** Shared materials and a geometry cache, owned by one FX instance and disposed with it. */
export function createKit() {
  const mat = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mats = {
    suit: mat(0x16171b, 0.84), shirt: mat(0xe9e6df, 0.7), tie: mat(0x5c1016, 0.6),
    skin: mat(0xc49878, 0.62), shoe: mat(0x0b0b0c, 0.32), button: mat(0x2d2f36, 0.5),
    metal: mat(0x30343a, 0.34, 0.85), wood: mat(0x4b2d18, 0.55), hole: mat(0x08090a, 0.9),
  };
  const geos = new Map();
  return {
    mats,
    geo(key, make) { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); },
    dispose() { geos.forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); },
  };
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A capsule whose base sits on the group origin and points along +y, so `aim` can stretch it between two joints.
function limb(kit, radius, len, material) {
  const g = kit.geo(`limb:${radius}:${len}`, () => new THREE.CapsuleGeometry(radius, len - 2 * radius, 6, 14).translate(0, len / 2, 0));
  const group = new THREE.Group();
  group.add(mesh(g, material));
  group.userData.len = len;
  return group;
}

const _d = v(0, 0, 0);
function aim(group, from, to) {
  _d.subVectors(to, from);
  const len = _d.length() || 1e-4;
  group.position.copy(from);
  group.scale.y = len / group.userData.len;
  group.quaternion.setFromUnitVectors(Y, _d.divideScalar(len));
}

function buildHand(kit, side) {
  const { skin } = kit.mats;
  const hand = new THREE.Group();
  hand.add(mesh(kit.geo('palm', () => new THREE.BoxGeometry(0.084, 0.096, 0.03)), skin, 0, 0.048, 0));
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const base = limb(kit, 0.0108, 0.048, skin);
    base.position.set((i - 1.5) * 0.0215, 0.092, 0);
    const tip = limb(kit, 0.0098, 0.042, skin);
    tip.position.y = 0.044;
    base.add(tip);
    hand.add(base);
    fingers.push({ base, tip, splay: (i - 1.5) * 0.13 });
  }
  const thumb = limb(kit, 0.0125, 0.052, skin);
  thumb.position.set(side * 0.04, 0.018, 0.006);
  const thumbTip = limb(kit, 0.0112, 0.038, skin);
  thumbTip.position.y = 0.047;
  thumb.add(thumbTip);
  hand.add(thumb);
  hand.userData.setCurl = (curl, spread = 0) => {
    for (const f of fingers) {
      f.base.rotation.set(curl * 1.25, 0, -f.splay * (0.35 + spread));
      f.tip.rotation.x = curl * 1.35;
    }
    thumb.rotation.set(curl * 0.5, 0, -side * (0.95 - curl * 0.45));
    thumbTip.rotation.x = curl * 0.8;
  };
  return hand;
}

function buildTorso(kit) {
  const { suit, shirt, tie, skin, button } = kit.mats;
  const torso = new THREE.Group();
  const cyl = (key, rt, rb, h) => kit.geo(key, () => new THREE.CylinderGeometry(rt, rb, h, 24));
  torso.add(mesh(cyl('neck', 0.046, 0.05, 0.12), skin, 0, 0.035, 0));
  torso.add(mesh(cyl('collar', 0.058, 0.07, 0.04), shirt, 0, -0.012, 0));
  const yoke = mesh(kit.geo('yoke', () => new THREE.CapsuleGeometry(0.079, 0.25, 6, 16)), suit, 0, DIM.shoulderY, 0);
  yoke.rotation.z = Math.PI / 2;
  torso.add(yoke);
  const chest = mesh(cyl('chest', 0.218, 0.172, 0.37), suit, 0, -0.29, 0);
  chest.scale.z = 0.57;
  const skirt = mesh(cyl('skirt', 0.172, 0.186, 0.31), suit, 0, -0.61, 0);
  skirt.scale.z = 0.59;
  torso.add(chest, skirt);
  // Shirt V, tie and buttons sit just proud of the jacket front so they read from the game camera.
  const vShape = kit.geo('shirtV', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.062, 0); s.lineTo(0.062, 0); s.lineTo(0, -0.23); s.closePath();
    return new THREE.ShapeGeometry(s);
  });
  const shirtV = mesh(vShape, shirt, 0, -0.085, 0.119);
  shirtV.rotation.x = -0.1;
  torso.add(shirtV);
  torso.add(mesh(kit.geo('knot', () => new THREE.BoxGeometry(0.04, 0.032, 0.014)), tie, 0, -0.1, 0.123));
  const blade = mesh(kit.geo('tie', () => new THREE.BoxGeometry(0.034, 0.17, 0.008)), tie, 0, -0.2, 0.121);
  blade.rotation.x = -0.1;
  torso.add(blade);
  const btn = kit.geo('button', () => new THREE.SphereGeometry(0.011, 10, 8));
  torso.add(mesh(btn, button, 0, -0.39, 0.104), mesh(btn, button, 0, -0.47, 0.1));
  return torso;
}

/**
 * Builds the rig. `feet` are the two foot targets in rig-local space (null hides the legs,
 * used when the neck anchor is too close to the floor for legs to make sense).
 */
export function buildMannequin(kit, feet) {
  const { suit, shirt, shoe } = kit.mats;
  const rig = new THREE.Group();       // placed and uniformly scaled by the caller
  const body = new THREE.Group();      // squashed toward the neck while growing / retracting
  const torso = buildTorso(kit);
  rig.add(body);
  body.add(torso);

  const arms = [-1, 1].map((side) => {
    const upper = limb(kit, 0.053, DIM.upper, suit);
    const fore = limb(kit, 0.044, DIM.fore, suit);
    fore.add(mesh(kit.geo('cuff', () => new THREE.CylinderGeometry(0.047, 0.047, 0.032, 16)), shirt, 0, DIM.fore - 0.012, 0));
    const hand = buildHand(kit, side);
    body.add(upper, fore, hand);
    return { side, upper, fore, hand };
  });
  const legs = feet && [-1, 1].map((side, i) => {
    const thigh = limb(kit, 0.075, DIM.thigh, suit);
    const shin = limb(kit, 0.056, DIM.shin, suit);
    const foot = mesh(kit.geo('shoe', () => new THREE.CapsuleGeometry(0.046, 0.17, 4, 10).rotateX(Math.PI / 2)), shoe);
    body.add(thigh, shin, foot);
    return { side, thigh, shin, foot, target: feet[i] };
  });

  const m = new THREE.Matrix4();
  const S = v(0, 0, 0), E = v(0, 0, 0), W = v(0, 0, 0), dir = v(0, 0, 0), perp = v(0, 0, 0);
  const bx = v(0, 0, 0), by = v(0, 0, 0), bz = v(0, 0, 0);

  // Analytic two-bone IK: places the elbow/knee on the side `pole` points to. Bones may stretch up to `maxStretch`.
  function solve(target, l1, l2, pole, maxStretch) {
    dir.subVectors(target, S);
    let dist = dir.length() || 1e-4;
    dir.divideScalar(dist);
    const stretch = Math.min(Math.max(dist / ((l1 + l2) * 0.995), 1), maxStretch);
    const a = l1 * stretch, b = l2 * stretch;
    dist = Math.min(dist, (a + b) * 0.995);
    const along = (a * a - b * b + dist * dist) / (2 * dist);
    const height = Math.sqrt(Math.max(a * a - along * along, 0));
    perp.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1);
    perp.normalize();
    E.copy(S).addScaledVector(dir, along).addScaledVector(perp, height);
    W.copy(S).addScaledVector(dir, dist);
  }

  /**
   * pose: { growX, growY, lean, twist, roll, shrug, stretch,
   *         R: { pos, pole, dir?, normal?, curl, spread? }, L: {...} }   (vectors in rig-local space)
   */
  rig.userData.apply = (pose) => {
    body.visible = pose.growY > 0.004;
    if (!body.visible) return;
    const gx = 0.3 + 0.7 * pose.growX;
    body.scale.set(gx, pose.growY, gx);
    torso.rotation.set(pose.lean || 0, pose.twist || 0, pose.roll || 0, 'YXZ');
    torso.updateMatrix();

    for (const arm of arms) {
      const p = arm.side < 0 ? pose.R : pose.L;
      S.set(arm.side * DIM.shoulderX, DIM.shoulderY - (pose.shrug || 0), 0).applyMatrix4(torso.matrix);
      solve(p.pos, DIM.upper, DIM.fore, p.pole, pose.stretch || 1);
      aim(arm.upper, S, E);
      aim(arm.fore, E, W);
      // Hand frame: +y along the fingers, +z out of the palm.
      by.copy(p.dir || dir.subVectors(W, E)).normalize();
      bz.copy(p.normal || bx.set(-arm.side, 0, 0));
      bz.addScaledVector(by, -bz.dot(by));
      if (bz.lengthSq() < 1e-6) bz.set(0, 0, 1).addScaledVector(by, -by.z);
      bz.normalize();
      bx.crossVectors(by, bz);
      arm.hand.position.copy(W);
      arm.hand.quaternion.setFromRotationMatrix(m.makeBasis(bx, by, bz));
      arm.hand.userData.setCurl(p.curl ?? 0.25, p.spread ?? 0);
    }
    if (legs) {
      for (const leg of legs) {
        S.set(leg.side * DIM.hipX, DIM.hipY, 0).applyMatrix4(torso.matrix);
        solve(leg.target, DIM.thigh, DIM.shin, perp.set(leg.side * 0.35, 0.15, 1), 1);
        aim(leg.thigh, S, E);
        aim(leg.shin, E, W);
        leg.foot.position.copy(W).add(bx.set(0, -0.01, 0.07));
      }
    }
  };
  rig.userData.arms = arms;
  return rig;
}
