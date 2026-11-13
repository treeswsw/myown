// 트레이(실물 판 그대로): 검은 플라스틱, 여러 겹 계단 모양 테두리, 빨간 펠트 바닥, 위쪽 변 보관 칸 5개. 그리고 나무 탁자.
// 좌표는 트레이 단위(docs/yacht/GDD.md 4절): 펠트 바닥은 한 변 10, 가운데 (0, 0), 바닥 높이 y = 0, x 오른쪽, z 보는 사람 쪽.
import * as THREE from 'three';
import { LEVELS, rng } from './quality.js';

export const FLOOR = 10;                 // 펠트 한 변
const HALF = FLOOR / 2;
const RIM_TB = 1.05, RIM_SIDE = 2.0;     // 테두리 폭: 위·아래 / 왼쪽·오른쪽 (바깥 모양을 정사각형으로 맞추려고 옆이 더 넓다)
const WALL_GAP = 0.25, SLOT_DEPTH = 1.65, SLOT_GAP = 0.2;   // 펠트와 보관 칸 사이 벽, 보관 칸 깊이, 칸 사이 벽
export const OUTER = FLOOR + RIM_SIDE * 2;                 // 바깥 한 변 14 (가로 = 세로)
export const X0 = -OUTER / 2, X1 = OUTER / 2;
export const Z0 = -HALF - WALL_GAP - SLOT_DEPTH - RIM_TB, Z1 = HALF + RIM_TB;   // -7.95 .. 6.05
export const RIM_Y = 2.4;                // 테두리 맨 위 높이(화면 맞춤의 기준 면)
export const WALL_Y = 1.0;               // 펠트 둘레 안쪽 벽 높이
export const BASE_Y = -0.35;             // 탁자 면
const STEPS = 4, STEP_RISE = (RIM_Y - WALL_Y) / STEPS, LIP = 0.25, TREAD = (RIM_TB - LIP) / STEPS, CH = 0.045, R_OUT = 1.3;
const SLOT_W = (FLOOR - SLOT_GAP * 4) / 5;
const SLOT_Z = -HALF - WALL_GAP - SLOT_DEPTH / 2;

/** 보관 칸 i(0~4, 왼쪽부터)의 가운데 [x, z]. */
export const slotPos = (i) => [-HALF + SLOT_W / 2 + i * (SLOT_W + SLOT_GAP), SLOT_Z];

// 테두리 단면: [위·아래 쪽 안으로 들어간 거리, 높이]. 바깥 아래에서 시작해 위로, 그다음 계단을 내려가 펠트까지.
function profile() {
  const p = [[0, BASE_Y], [0, RIM_Y - CH], [CH, RIM_Y]];
  let x = LIP, y = RIM_Y;
  for (let k = 0; k < STEPS; k++) {
    p.push([x - CH, y], [x, y - CH]);
    y -= STEP_RISE;
    p.push([x, y]);
    x += TREAD;
  }
  p.push([x - CH, y], [x, y - CH], [x, -0.03]);
  return p;
}

// 단면을 둥근 네모 길을 따라 한 바퀴 돌려 면을 만든다. 단면의 꺾이는 곳은 날카롭게, 길 방향으로는 매끈하게.
function buildRim(arc) {
  const P = profile(), M = 4 * (arc + 1);
  const sign = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const ring = (tb, y, j) => {
    const c = Math.floor(j / (arc + 1)), k = j % (arc + 1), th = (c + k / arc) * Math.PI / 2;
    const side = tb * (RIM_SIDE / RIM_TB), r = Math.max(R_OUT - tb, 0.12);
    const cx = sign[c][0] * (OUTER / 2 - side - r);
    const cz = sign[c][1] > 0 ? Z1 - tb - r : Z0 + tb + r;
    return [cx + r * Math.cos(th), y, cz + r * Math.sin(th), Math.cos(th), Math.sin(th)];
  };
  const pos = [], nor = [], idx = [];
  for (let s = 0; s < P.length - 1; s++) {
    const [d0, y0] = P[s], [d1, y1] = P[s + 1];
    const nIn = -(y1 - y0), nUp = d1 - d0, len = Math.hypot(nIn, nUp);
    const base = pos.length / 3;
    for (let j = 0; j < M; j++) {
      const a = ring(d0, y0, j), b = ring(d1, y1, j);
      const n = [(-a[3] * nIn) / len, nUp / len, (-a[4] * nIn) / len];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      nor.push(...n, ...n);
    }
    for (let j = 0; j < M; j++) {
      const a = base + j * 2, b = a + 1, c = base + ((j + 1) % M) * 2, d = c + 1;
      // 면의 앞쪽이 법선 쪽을 보도록 감는 방향을 맞춘다
      const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
      const e2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
      const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const front = g[0] * nor[a * 3] + g[1] * nor[a * 3 + 1] + g[2] * nor[a * 3 + 2] >= 0;
      if (front) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function feltTexture(size) {
  const c = canvas(size), g = c.getContext('2d'), r = rng(0x79ac47);
  g.fillStyle = '#b1141b'; g.fillRect(0, 0, size, size);
  // 가운데가 조금 밝다(위 조명)
  const glow = g.createRadialGradient(size * 0.46, size * 0.44, size * 0.05, size * 0.5, size * 0.5, size * 0.72);
  glow.addColorStop(0, 'rgba(255,96,84,0.2)'); glow.addColorStop(1, 'rgba(60,0,4,0.22)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  // 짧은 섬유 결
  const n = Math.round(size * size * 0.09);
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = 1 + r() * 2.2;
    g.strokeStyle = r() < 0.5 ? `rgba(255,150,140,${0.03 + r() * 0.06})` : `rgba(40,0,0,${0.04 + r() * 0.08})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // 벽 아래 그늘
  const e = size * 0.07;
  for (const [x0, y0, x1, y1, rect] of [[0, 0, 0, e, [0, 0, size, e]], [0, size, 0, size - e, [0, size - e, size, e]], [0, 0, e, 0, [0, 0, e, size]], [size, 0, size - e, 0, [size - e, 0, e, size]]]) {
    const sh = g.createLinearGradient(x0, y0, x1, y1);
    sh.addColorStop(0, 'rgba(20,0,0,0.42)'); sh.addColorStop(1, 'rgba(20,0,0,0)');
    g.fillStyle = sh; g.fillRect(...rect);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function fuzzTexture(size) {
  const c = canvas(size), g = c.getContext('2d'), r = rng(0x51f0e3), d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) { const v = 96 + Math.floor(r() * 128); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5);
  return t;
}

function woodTexture(size) {
  const c = canvas(size), g = c.getContext('2d'), r = rng(0x9e3779), planks = 4, pw = size / planks;
  for (let p = 0; p < planks; p++) {
    const tone = 0.82 + r() * 0.3;
    g.fillStyle = `rgb(${Math.round(70 * tone)},${Math.round(44 * tone)},${Math.round(29 * tone)})`;
    g.fillRect(p * pw, 0, pw, size);
    // 나뭇결: 널 방향(세로)으로 가늘게 흔들리는 줄
    for (let i = 0; i < 90; i++) {
      const x = p * pw + r() * pw, wob = 2 + r() * 5, ph = r() * 6.28, f = 1 + Math.floor(r() * 3);
      g.strokeStyle = r() < 0.6 ? `rgba(20,10,5,${0.05 + r() * 0.12})` : `rgba(160,110,70,${0.03 + r() * 0.06})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      for (let y = 0; y <= size; y += size / 32) {
        const xx = Math.max(p * pw + 1, Math.min((p + 1) * pw - 1, x + Math.sin(ph + (y / size) * 6.2832 * f) * wob));   // 위아래 끝이 이어지게
        if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
      }
      g.stroke();
    }
    // 널 사이 이음매
    g.fillStyle = 'rgba(8,4,2,0.75)'; g.fillRect(p * pw - 1.5, 0, 3, size);
    g.fillStyle = 'rgba(190,140,95,0.1)'; g.fillRect(p * pw + 1.5, 0, 1.5, size);
    const cut = Math.floor(r() * size);
    g.fillStyle = 'rgba(8,4,2,0.7)'; g.fillRect(p * pw, cut, pw, 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// 탁자 위에 덮는 어둠: 트레이 둘레만 밝고 바깥으로 갈수록 어두워진다
function shadeTexture() {
  const c = canvas(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 14, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createTray({ q, track }) {
  const L = LEVELS[q];
  const group = new THREE.Group(); group.name = 'yt-tray';
  let tris = 0;
  const add = (geo, mat, name, { cast = false, receive = true, count = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = cast; m.receiveShadow = receive;
    if (count) tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    group.add(m);
    return m;
  };

  // 검은 플라스틱
  const plastic = track.add(!L.fine ? new THREE.MeshLambertMaterial({ color: 0x242424 })
    : L.physical ? new THREE.MeshPhysicalMaterial({ color: 0x1f1f1f, roughness: 0.4, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.4 })
      : new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.4, metalness: 0, envMapIntensity: 0.4 }));
  const pit = track.add(!L.fine ? new THREE.MeshLambertMaterial({ color: 0x131313 }) : new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.78, metalness: 0, envMapIntensity: 0.2 }));

  add(track.add(buildRim(L.arc)), plastic, 'yt-rim', { cast: true });

  // 우묵한 곳 전체의 검은 바닥(보관 칸 바닥이 된다) + 그 위 펠트
  const wellD = Z1 - RIM_TB - (Z0 + RIM_TB);
  const well = add(track.add(new THREE.PlaneGeometry(FLOOR, wellD).rotateX(-Math.PI / 2)), pit, 'yt-well');
  well.position.set(0, -0.012, (Z0 + Z1) / 2);

  const feltMap = track.add(feltTexture(L.fine ? 512 : 256));
  let feltMat;
  if (!L.fine) feltMat = new THREE.MeshLambertMaterial({ map: feltMap });
  else {
    const bump = track.add(fuzzTexture(256));
    feltMat = L.physical
      ? new THREE.MeshPhysicalMaterial({ map: feltMap, bumpMap: bump, bumpScale: 0.3, roughness: 0.96, metalness: 0, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xff5a4e), envMapIntensity: 0.08 })
      : new THREE.MeshStandardMaterial({ map: feltMap, bumpMap: bump, bumpScale: 0.3, roughness: 0.96, metalness: 0, envMapIntensity: 0.08 });
  }
  track.add(feltMat);
  add(track.add(new THREE.PlaneGeometry(FLOOR, FLOOR).rotateX(-Math.PI / 2)), feltMat, 'yt-felt');

  // 펠트와 보관 칸 사이 벽, 보관 칸 사이 벽 4개
  const wallGeo = track.add(new THREE.BoxGeometry(FLOOR, WALL_Y, WALL_GAP));
  add(wallGeo, plastic, 'yt-wall', { cast: true }).position.set(0, WALL_Y / 2, -HALF - WALL_GAP / 2);
  const divGeo = track.add(new THREE.BoxGeometry(SLOT_GAP, WALL_Y, SLOT_DEPTH));
  for (let i = 0; i < 4; i++) {
    add(divGeo, plastic, `yt-div-${i}`, { cast: true }).position.set(slotPos(i)[0] + SLOT_W / 2 + SLOT_GAP / 2, WALL_Y / 2, SLOT_Z);
  }

  // 나무 탁자(삼각형 수 제한에는 넣지 않는다: 2개)
  const woodMap = track.add(woodTexture(L.fine ? 1024 : 512));
  const TABLE = 360, TILE = 18;
  woodMap.repeat.set(TABLE / TILE, TABLE / TILE);
  const wood = track.add(!L.fine ? new THREE.MeshLambertMaterial({ map: woodMap }) : new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.62, metalness: 0, envMapIntensity: 0.15 }));
  add(track.add(new THREE.PlaneGeometry(TABLE, TABLE).rotateX(-Math.PI / 2)), wood, 'yt-table', { count: false }).position.y = BASE_Y;
  const shade = add(track.add(new THREE.PlaneGeometry(TABLE / 2, TABLE / 2).rotateX(-Math.PI / 2)),
    track.add(new THREE.MeshBasicMaterial({ map: track.add(shadeTexture()), transparent: true, depthWrite: false })), 'yt-shade', { receive: false, count: false });
  shade.position.set(0, BASE_Y + 0.01, (Z0 + Z1) / 2); shade.renderOrder = 1;

  return { group, tris };
}
