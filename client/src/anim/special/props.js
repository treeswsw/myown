// Guns and short-lived effects. Guns are modelled with the barrel along +z and the grip hanging toward -y.
import * as THREE from 'three';

function part(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function grip(kit, group, z) {
  const g = part(kit.geo('grip', () => new THREE.BoxGeometry(0.026, 0.1, 0.042)), kit.mats.wood, 0, -0.058, z);
  g.rotation.x = 0.28;
  const guard = part(kit.geo('guard', () => new THREE.TorusGeometry(0.019, 0.0035, 6, 16, Math.PI)), kit.mats.metal, 0, -0.018, z + 0.045);
  guard.rotation.set(0, Math.PI / 2, Math.PI);
  group.add(g, guard);
}

/** Semi-automatic pistol for the poker bust. `userData.muzzle` is the barrel tip in gun space. */
export function buildPistol(kit) {
  const { metal } = kit.mats;
  const gun = new THREE.Group();
  gun.add(part(kit.geo('slide', () => new THREE.BoxGeometry(0.03, 0.036, 0.19)), metal, 0, 0, 0.06));
  gun.add(part(kit.geo('muzzleRing', () => new THREE.CylinderGeometry(0.009, 0.009, 0.02, 12).rotateX(Math.PI / 2)), kit.mats.hole, 0, 0.002, 0.158));
  gun.add(part(kit.geo('sight', () => new THREE.BoxGeometry(0.006, 0.008, 0.012)), metal, 0, 0.022, 0.14));
  grip(kit, gun, -0.018);
  gun.userData.muzzle = new THREE.Vector3(0, 0.002, 0.17);
  return gun;
}

/** Six-shot revolver. `userData.cylinder` spins about the barrel axis. */
export function buildRevolver(kit) {
  const { metal, hole } = kit.mats;
  const gun = new THREE.Group();
  gun.add(part(kit.geo('revBarrel', () => new THREE.CylinderGeometry(0.0105, 0.0115, 0.14, 14).rotateX(Math.PI / 2)), metal, 0, 0.012, 0.115));
  gun.add(part(kit.geo('revRib', () => new THREE.BoxGeometry(0.008, 0.01, 0.12)), metal, 0, -0.004, 0.105));
  gun.add(part(kit.geo('revFrame', () => new THREE.BoxGeometry(0.02, 0.05, 0.03)), metal, 0, 0, -0.03));
  gun.add(part(kit.geo('revTop', () => new THREE.BoxGeometry(0.012, 0.008, 0.075)), metal, 0, 0.03, 0.005));
  gun.add(part(kit.geo('hammer', () => new THREE.BoxGeometry(0.008, 0.026, 0.012)), metal, 0, 0.034, -0.046));
  const cylinder = new THREE.Group();
  cylinder.position.set(0, 0, 0.012);
  cylinder.add(part(kit.geo('revCyl', () => new THREE.CylinderGeometry(0.03, 0.03, 0.05, 24).rotateX(Math.PI / 2)), metal, 0, 0, 0));
  const chamber = kit.geo('chamber', () => new THREE.CylinderGeometry(0.0072, 0.0072, 0.052, 10).rotateX(Math.PI / 2));
  const flute = kit.geo('flute', () => new THREE.BoxGeometry(0.008, 0.006, 0.034));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cylinder.add(part(chamber, hole, Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0.0008));
    const f = part(flute, hole, Math.cos(a + Math.PI / 6) * 0.0295, Math.sin(a + Math.PI / 6) * 0.0295, 0.006);
    f.rotation.z = a + Math.PI / 6 + Math.PI / 2;
    cylinder.add(f);
  }
  gun.add(cylinder);
  grip(kit, gun, -0.045);
  gun.userData.cylinder = cylinder;
  gun.userData.muzzle = new THREE.Vector3(0, 0.012, 0.19);
  return gun;
}

/** Additive muzzle flash; scale it up from zero for a few frames. Owns its own material. */
export function buildFlash(kit) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Group();
  const cone = kit.geo('flashCone', () => new THREE.ConeGeometry(0.045, 0.24, 10).rotateX(Math.PI / 2).translate(0, 0, 0.12));
  const spike = kit.geo('flashSpike', () => new THREE.ConeGeometry(0.02, 0.15, 6).translate(0, 0.075, 0));
  flash.add(new THREE.Mesh(cone, material));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(spike, material);
    s.rotation.z = (i / 6) * Math.PI * 2;
    s.rotation.x = 0.5;
    flash.add(s);
  }
  flash.add(new THREE.Mesh(kit.geo('flashCore', () => new THREE.SphereGeometry(0.035, 10, 8)), material));
  const light = new THREE.PointLight(0xffc56a, 0, 4, 2);
  flash.add(light);
  flash.userData = { light, dispose: () => material.dispose() };
  return flash;
}

/** A thin wisp of smoke: `set(age, drift)` positions and fades the puffs deterministically from the age in seconds. */
export function buildSmoke(kit) {
  const smoke = new THREE.Group();
  const geo = kit.geo('puff', () => new THREE.SphereGeometry(0.02, 8, 6));
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xd9d6cf, transparent: true, opacity: 0, depthWrite: false });
    const p = new THREE.Mesh(geo, material);
    smoke.add(p);
    puffs.push(p);
  }
  smoke.userData = {
    set(age, drift) {
      puffs.forEach((p, i) => {
        const a = age - i * 0.11;
        const live = a > 0 && a < 1.1;
        p.visible = live;
        if (!live) return;
        const k = a / 1.1;
        p.position.set(Math.sin(a * 5 + i) * 0.018 + drift * k * k, a * 0.2, Math.cos(a * 4 + i * 2) * 0.012);
        p.scale.setScalar(0.6 + k * 2.4);
        p.material.opacity = 0.36 * Math.sin(Math.PI * Math.min(1, k * 1.15));
      });
    },
    dispose: () => puffs.forEach((p) => p.material.dispose()),
  };
  return smoke;
}
