import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const TY = 0.78; // table top height
export const L = 1.25; // half length of the straight part
export const R = 0.98; // end radius
const AS = `${import.meta.env.BASE_URL}assets/`;

const stadium = (l, r) => {
  const s = new THREE.Shape();
  s.moveTo(-l, -r); s.lineTo(l, -r);
  s.absarc(l, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-l, r);
  s.absarc(-l, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
};
const flat = (g) => { g.rotateX(-Math.PI / 2); return g; };
const std = (o) => new THREE.MeshStandardMaterial(o);

// Ported from design/v3.html. Returns a promise for the assets and a mode switcher (felt colour, line, chairs).
export function buildRoom(scene, renderer, shadowSize) {
  const mgr = new THREE.LoadingManager();
  const texLoader = new THREE.TextureLoader(mgr);
  const gltf = new GLTFLoader(mgr);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (n, m, rep, srgb) => {
    const t = texLoader.load(`${AS}tex/${n}_${m}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  const pbr = (n, rep, { nomap, extra } = {}) => new THREE.MeshStandardMaterial({
    map: nomap ? null : tex(n, 'Diffuse', rep, true), normalMap: tex(n, 'nor_gl', rep), roughnessMap: tex(n, 'Rough', rep), ...extra,
  });
  new RGBELoader(mgr).load(`${AS}hdri/billiard_hall_1k.hdr`, (t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = t;
    scene.environmentIntensity = 0.22;
  });

  const add = (mesh, shadow = false) => { mesh.receiveShadow = true; mesh.castShadow = shadow; scene.add(mesh); return mesh; };

  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(40, 40), pbr('slate_floor_02', 14, { extra: { color: 0x9aa0a6, roughness: 0.7 } })));
  floor.rotation.x = -Math.PI / 2;
  const rug = add(new THREE.Mesh(new THREE.CircleGeometry(1, 96), pbr('dirty_carpet', 5, { extra: { color: 0x8a8468 } })));
  rug.rotation.x = -Math.PI / 2; rug.scale.set(4.6, 3.3, 1); rug.position.y = 0.012;
  const rugB = new THREE.Mesh(new THREE.RingGeometry(0.93, 0.96, 96), std({ color: 0x1a1814, roughness: 1 }));
  rugB.rotation.x = -Math.PI / 2; rugB.scale.set(4.6, 3.3, 1); rugB.position.y = 0.016;
  scene.add(rugB);

  const stepM = pbr('marble_tiles', 9, { extra: { color: 0xb8bcc0, roughness: 0.35 } });
  [[-6.2, 0.4, 5], [-7.2, 0.8, 3]].forEach(([z, hh, d]) => {
    const s = add(new THREE.Mesh(new THREE.BoxGeometry(22, hh, d), stepM), true);
    s.position.set(0, hh / 2, z);
  });
  const brick = () => pbr('brick_wall_10', 9, { extra: { color: 0x6a5a52 } });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), brick());
  wall.position.set(0, 3.5, -9);
  const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 7), brick());
  wall2.rotation.y = -Math.PI / 2; wall2.position.set(9, 3.5, 0);
  scene.add(wall, wall2, new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.25));

  const key = new THREE.SpotLight(0xfff0d8, 40, 0, 0.72, 0.6, 1.5);
  key.position.set(0, 4.6, 0.4); key.target.position.set(0, TY, 0);
  key.castShadow = shadowSize > 0;
  key.shadow.mapSize.set(shadowSize || 1, shadowSize || 1);
  key.shadow.bias = -0.0004; key.shadow.radius = 5;
  scene.add(key, key.target);
  [[-6, 3, -6, 0x9fc4ff, 22], [6, 3, -6.5, 0xffb070, 22], [-5, 2.5, 3, 0xffd0a0, 8]].forEach(([x, y, z, c, i]) => {
    const l = new THREE.PointLight(c, i, 14, 2);
    l.position.set(x, y, z);
    scene.add(l);
  });

  /* table */
  const feltM = pbr('velour_velvet', 6, { nomap: true, extra: { roughness: 0.95, envMapIntensity: 0.2 } });
  const felt = add(new THREE.Mesh(flat(new THREE.ShapeGeometry(stadium(L, R - 0.1), 64)), feltM));
  felt.position.y = TY;
  const rs = stadium(L, R);
  rs.holes.push(stadium(L, R - 0.13));
  const rail = add(new THREE.Mesh(flat(new THREE.ExtrudeGeometry(rs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 8, curveSegments: 48 })),
    pbr('fabric_leather_02', 5, { nomap: true, extra: { color: 0x0e0e10, roughness: 0.5 } })), true);
  rail.position.y = TY - 0.02;
  const body = add(new THREE.Mesh(flat(new THREE.ExtrudeGeometry(stadium(L, R - 0.03), { depth: 0.13, bevelEnabled: false, curveSegments: 48 })), std({ color: 0x0b0b0c, roughness: 0.35, metalness: 0.3 })), true);
  body.position.y = TY - 0.16;
  const trim = new THREE.Mesh(flat(new THREE.ExtrudeGeometry(stadium(L, R - 0.015), { depth: 0.012, bevelEnabled: false, curveSegments: 48 })), std({ color: 0xc8ccd0, roughness: 0.2, metalness: 1 }));
  trim.position.y = TY - 0.165;
  scene.add(trim);
  [-1.15, 1.15].forEach((x) => {
    const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.62, 48), std({ color: 0x0b0b0c, roughness: 0.35, metalness: 0.4 })), true);
    p.position.set(x, 0.31, 0);
  });
  const lineMat = std({ transparent: true, opacity: 0.5, roughness: 1 });
  const ln = stadium(L * 0.82, R * 0.62);
  ln.holes.push(stadium(L * 0.82, R * 0.62 - 0.012));
  const line = new THREE.Mesh(flat(new THREE.ShapeGeometry(ln, 64)), lineMat);
  line.position.y = TY + 0.001;
  scene.add(line);

  /* models */
  const place = (name, fn) => gltf.load(`${AS}models/${name}/${name}.gltf`, (g) => {
    g.scene.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    fn(g.scene);
  });
  const fit = (o, hh) => {
    const b = new THREE.Box3().setFromObject(o);
    o.scale.setScalar(hh / (b.max.y - b.min.y));
    o.position.y -= new THREE.Box3().setFromObject(o).min.y;
    return o;
  };
  const copies = (o, list, lift = 0) => list.forEach(([x, z, r = 0]) => {
    const c = o.clone();
    c.position.set(x, c.position.y + lift, z);
    c.rotation.y = r;
    scene.add(c);
  });
  place('modern_arm_chair_01', (o) => copies(fit(o, 0.92), [[-3.6, -2.2, 0.9], [3.9, 1.6, -2.2], [4.4, -1.2, -1.4]]));
  place('sofa_02', (o) => copies(fit(o, 0.85), [[-4.5, -6], [3, -6.3]], 0.4));
  place('potted_plant_01', (o) => copies(fit(o, 1.5), [[-7.5, -5.2], [7, -5.4], [-0.6, -6.8]], 0.4));
  place('wine_bottles_01', (o) => { fit(o, 0.2); o.position.set(-1.85, TY + o.position.y, 0.25); scene.add(o); });

  /* chairs for the far seats only */
  const chairs = new THREE.Group();
  scene.add(chairs);
  const seatM = std({ color: 0x0c0c0d, roughness: 0.6 });
  const setMode = (mode, farX) => {
    const bluff = mode === 'bluff';
    feltM.color.set(bluff ? 0x23262b : 0x8e1313);
    lineMat.color.set(bluff ? 0xe6c15a : 0xffe9d8);
    chairs.clear();
    farX.forEach((x) => {
      const g = new THREE.Group();
      const a = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.46, 4, 0.03), seatM); a.position.y = 0.46;
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.07, 4, 0.03), seatM); b.position.set(0, 0.76, -0.22);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 0.44, 16), seatM); l.position.y = 0.22;
      g.add(a, b, l);
      g.position.set(x, 0, -(R + 0.45));
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      chairs.add(g);
    });
  };

  return {
    setMode,
    ready: new Promise((resolve) => {
      mgr.onError = (u) => console.error('asset failed', u);
      mgr.onLoad = resolve;
    }),
  };
}
