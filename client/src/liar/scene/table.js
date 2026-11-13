// 어두운 방 · 타원 테이블 · 조명 · 소품 (시안 design/mockup-table.html 값 그대로)
import * as THREE from 'three';
import { TABLE_HEIGHT } from './mannequins.js';
import { TA, TB } from './layout.js';

export const LAMP_Y = 3.0;
const LAMP_POWER = 58;
const BG = 0x070608;

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (parent, geo, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};

export function createTable(scene) {
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.075);
  const root = new THREE.Group();
  root.name = 'liar-table';
  scene.add(root);

  const floor = mesh(root, new THREE.CircleGeometry(9, 40), flat(0x2a211c), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  mesh(root, new THREE.CylinderGeometry(7.5, 7.5, 5, 24, 1, true), flat(0x1a1719, { side: THREE.BackSide }), 0, 2.5, 0);

  const tableGroup = new THREE.Group();
  root.add(tableGroup);
  const top = mesh(tableGroup, new THREE.CylinderGeometry(1, 1, 0.06, 40), flat(0x3a261a), 0, TABLE_HEIGHT - 0.03, 0);
  top.scale.set(TA, 1, TB);
  top.castShadow = true; top.receiveShadow = true;
  const felt = mesh(tableGroup, new THREE.CylinderGeometry(1, 1, 0.012, 40), flat(0x5a1a1e), 0, TABLE_HEIGHT + 0.001, 0);
  felt.scale.set(TA - 0.07, 1, TB - 0.07);
  felt.receiveShadow = true;
  mesh(tableGroup, new THREE.CylinderGeometry(0.14, 0.2, TABLE_HEIGHT - 0.06, 8), flat(0x241710), 0, (TABLE_HEIGHT - 0.06) / 2, 0);
  const base = mesh(tableGroup, new THREE.CylinderGeometry(0.42, 0.5, 0.05, 12), flat(0x241710), 0, 0.025, 0);
  base.scale.x = 1.6;

  // 조명: 테이블 위 등 하나
  const spot = new THREE.SpotLight(0xffd3a1, LAMP_POWER, 0, 1.0, 0.75, 2);
  spot.position.set(0, LAMP_Y - 0.1, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 6;
  spot.shadow.bias = -0.002;
  root.add(spot, spot.target);
  const hemi = new THREE.HemisphereLight(0x46507a, 0x150e0b, 1.3);
  root.add(hemi);

  const lampGroup = new THREE.Group();
  root.add(lampGroup);
  mesh(lampGroup, new THREE.CylinderGeometry(0.008, 0.008, 4, 4), flat(0x0c0a0a), 0, LAMP_Y + 2.2, 0);
  mesh(lampGroup, new THREE.ConeGeometry(0.42, 0.26, 12, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x1b1716, flatShading: true, side: THREE.DoubleSide, emissive: 0x2a1a0c }),
    0, LAMP_Y + 0.08, 0);
  mesh(lampGroup, new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe6bd, fog: false }), 0, LAMP_Y - 0.02, 0);
  const h = LAMP_Y - 0.02;
  for (const [r, o] of [[1.25, 0.05], [1.95, 0.035]]) {
    mesh(lampGroup, new THREE.ConeGeometry(r, h, 28, 1, true), new THREE.MeshBasicMaterial({
      color: 0xffc98a, transparent: true, opacity: o, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    }), 0, h / 2, 0).renderOrder = 5;
  }

  // 가운데 소품(모래시계·카드 더미): 발언 클로즈업 때는 카메라를 가리므로 숨긴다
  const centerProps = new THREE.Group();
  tableGroup.add(centerProps);
  const brass = flat(0xb08a45);
  const hg = new THREE.Group();
  hg.position.set(0, TABLE_HEIGHT + 0.008, 0);
  centerProps.add(hg);
  mesh(hg, new THREE.CylinderGeometry(0.07, 0.07, 0.014, 8), brass, 0, 0.007, 0);
  mesh(hg, new THREE.CylinderGeometry(0.07, 0.07, 0.014, 8), brass, 0, 0.233, 0);
  mesh(hg, new THREE.ConeGeometry(0.052, 0.105, 8), flat(0xcfc3a8), 0, 0.066, 0);
  mesh(hg, new THREE.ConeGeometry(0.052, 0.105, 8), flat(0x6c7f86), 0, 0.174, 0).rotation.x = Math.PI;
  for (const a of [0.5, 2.6, 4.7]) {
    mesh(hg, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 4), brass, Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06);
  }
  hg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const deck = mesh(centerProps, new THREE.BoxGeometry(0.09, 0.03, 0.13), flat(0x1c2733), 0.34, TABLE_HEIGHT + 0.022, 0.2);
  deck.rotation.y = 0.5; deck.castShadow = true;

  // 자리 앞 소품(종이·컵·펜): 자리 수에 맞춰 다시 놓는다
  const seatProps = new THREE.Group();
  tableGroup.add(seatProps);
  const paper = flat(0xd8d0c0), cup = flat(0x2b3a40), dark = flat(0x15110f);
  const disposeProps = () => {
    seatProps.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    seatProps.clear();
  };
  function setSlots(slots) {
    disposeProps();
    slots.forEach((s, k) => {
      const n = new THREE.Vector3(s.n.x, 0, s.n.z);
      const edge = new THREE.Vector3(s.edge.x, 0, s.edge.z);
      const side = new THREE.Vector3(-n.z, 0, n.x);
      const at = (inward, sideways) => edge.clone().addScaledVector(n, -inward).addScaledVector(side, sideways);
      const p = at(0.4, k % 2 ? 0.05 : -0.05);
      const sheet = mesh(seatProps, new THREE.BoxGeometry(0.15, 0.004, 0.21), paper, p.x, TABLE_HEIGHT + 0.01, p.z);
      sheet.rotation.y = s.yaw + (k % 3 - 1) * 0.3;
      sheet.receiveShadow = true;
      if (k % 2 === 0) {
        const c = at(0.24, 0.24);
        mesh(seatProps, new THREE.CylinderGeometry(0.036, 0.028, 0.085, 8), cup, c.x, TABLE_HEIGHT + 0.05, c.z).castShadow = true;
      } else {
        const c = at(0.3, -0.2);
        const pen = mesh(seatProps, new THREE.CylinderGeometry(0.006, 0.006, 0.14, 5), dark, c.x, TABLE_HEIGHT + 0.014, c.z);
        pen.rotation.set(Math.PI / 2, 0, s.yaw + 0.7);
      }
    });
  }

  function dispose() {
    disposeProps();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    scene.remove(root);
    scene.background = null;
    scene.fog = null;
  }
  return { root, tableGroup, centerProps, spot, hemi, setSlots, setCenterVisible(v) { centerProps.visible = !!v; }, dispose };
}
