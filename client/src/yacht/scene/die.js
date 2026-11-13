// 주사위: 모서리가 둥근 흰 정육면체, 파인 검은 눈(요철 지도). 한 변 1.4(트레이 단위).
// 번호 배치(면 → 눈): +y 1, −y 6, +x 3, −x 4, +z 2, −z 5 (docs/YACHT-PLAN.md 3-1)
import * as THREE from 'three';
import { LEVELS } from './quality.js';

export const DIE = 1.4;
const H = DIE / 2, R = 0.2;                     // 반 변, 모서리 둥글기
const PIP_R = 0.105, PIP_O = 0.235;            // 눈 반지름·간격(면 한 변 = 1)

// [법선, u축, v축, 눈]  (u × v = 법선)
const FACES = [
  [[0, 1, 0], [0, 0, 1], [1, 0, 0], 1],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1], 6],
  [[1, 0, 0], [0, 1, 0], [0, 0, 1], 3],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0], 4],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], 2],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0], 5],
];
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const S = Math.SQRT1_2;
const UP = { 1: [0, 0, 0, 1], 6: [1, 0, 0, 0], 3: [0, 0, S, S], 4: [0, 0, -S, S], 2: [-S, 0, 0, S], 5: [S, 0, 0, S] };
/** 눈 v 가 위(+y)를 보게 하는 회전 [x, y, z, w]. 보관 칸에 놓을 때 쓴다. */
export const upQuat = (v) => UP[v] || UP[1];

function buildGeometry(round) {
  // 면의 격자: 평평한 가운데 한 칸 + 양쪽 모서리 곡면 round 칸. 곡면 쪽은 각도가 고르게 나뉘도록 tan 으로 놓는다.
  const flat = H - R, line = [];
  for (let k = round; k >= 1; k--) line.push(-(flat + R * Math.tan((Math.PI / 4) * (k / round))));
  line.push(-flat, flat);
  for (let k = 1; k <= round; k++) line.push(flat + R * Math.tan((Math.PI / 4) * (k / round)));
  const n = line.length, pos = [], nor = [], uv = [], idx = [];
  const cl = (a) => Math.max(-flat, Math.min(flat, a));
  FACES.forEach(([N, U, V, value], f) => {
    const col = (value - 1) % 3, row = Math.floor((value - 1) / 3), base = f * n * n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = line[i], b = line[j];
      const p = [0, 1, 2].map((k) => U[k] * a + V[k] * b + N[k] * H);
      const q = p.map(cl);
      const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], len = Math.hypot(d[0], d[1], d[2]);
      pos.push(q[0] + (d[0] / len) * R, q[1] + (d[1] / len) * R, q[2] + (d[2] / len) * R);
      nor.push(d[0] / len, d[1] / len, d[2] / len);
      uv.push((col + a / DIE + 0.5) / 3, (row + b / DIE + 0.5) / 2);
    }
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v0 = base + j * n + i, v1 = v0 + 1, v2 = v0 + n, v3 = v2 + 1;
      idx.push(v0, v1, v3, v0, v3, v2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// 여섯 면을 한 장(가로 3 × 세로 2)에 그린다. 색 지도와, 눈이 파여 보이게 하는 법선 지도.
function buildTextures(cell, withNormal) {
  const W = cell * 3, Hh = cell * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#efece4'; g.fillRect(0, 0, W, Hh);
  let nd = null;
  if (withNormal) {
    nd = new ImageData(W, Hh);
    for (let i = 0; i < nd.data.length; i += 4) { nd.data[i] = 128; nd.data[i + 1] = 128; nd.data[i + 2] = 255; nd.data[i + 3] = 255; }
  }
  for (let value = 1; value <= 6; value++) {
    const col = (value - 1) % 3, row = Math.floor((value - 1) / 3);
    const ox = col * cell, oy = (1 - row) * cell;      // flipY: 아래 줄(row 0)이 캔버스 아래쪽
    // 면 가운데가 아주 조금 밝게(사출 플라스틱 느낌)
    const sh = g.createRadialGradient(ox + cell / 2, oy + cell / 2, cell * 0.1, ox + cell / 2, oy + cell / 2, cell * 0.72);
    sh.addColorStop(0, 'rgba(255,255,255,0.5)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(ox, oy, cell, cell);
    for (const [px, py] of PIPS[value]) {
      const cx = ox + (0.5 + px * PIP_O) * cell, cy = oy + (0.5 + py * PIP_O) * cell, r = PIP_R * cell;
      const pit = g.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
      pit.addColorStop(0, '#262626'); pit.addColorStop(0.75, '#0d0d0d'); pit.addColorStop(1, '#040404');
      g.fillStyle = pit; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      if (!nd) continue;
      const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1), y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= Hh) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dist = Math.hypot(dx, dy), d = dist / r;
        if (d >= 1.04 || dist < 1e-6) continue;
        // 그릇 모양으로 파인 면: 법선이 가운데 쪽으로 눕는다. 가장자리에서 가장 가파르다.
        const k = 1.5 * d * Math.min(1, (1.04 - d) / 0.1);
        const nx = (-dx / dist) * k, ny = (dy / dist) * k, inv = 1 / Math.hypot(nx, ny, 1);   // 캔버스 y 는 아래, 지도 v 는 위
        const o = (y * W + x) * 4;
        nd.data[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
        nd.data[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
        nd.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  let normalMap = null;
  if (nd) {
    const nc = document.createElement('canvas'); nc.width = W; nc.height = Hh;
    nc.getContext('2d').putImageData(nd, 0, 0);
    normalMap = new THREE.CanvasTexture(nc);
    normalMap.anisotropy = 4;
  }
  return { map, normalMap };
}

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** 주사위 부품 한 벌(모양·재질은 모든 주사위가 같이 쓴다). */
export function createDiceKit({ q, track }) {
  const L = LEVELS[q];
  const geometry = track.add(buildGeometry(L.round));
  const { map, normalMap } = buildTextures(L.tex, L.fine);
  track.add(map); if (normalMap) track.add(normalMap);
  let material;
  if (!L.fine) material = new THREE.MeshLambertMaterial({ map });
  else if (L.physical) {
    material = new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.34, metalness: 0,
      clearcoat: 0.55, clearcoatRoughness: 0.22, envMapIntensity: 0.25 });
  } else {
    material = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.32, metalness: 0, envMapIntensity: 0.25 });
  }
  track.add(material);

  // 낮음 단계: 실시간 그림자 대신 주사위 아래 둥근 그림자 판
  let blobGeo = null, blobMap = null;
  if (!L.shadow) {
    blobGeo = track.add(new THREE.PlaneGeometry(DIE * 1.75, DIE * 1.75).rotateX(-Math.PI / 2));
    blobMap = track.add(blobTexture());
  }
  return {
    geometry, material,
    tris: geometry.index.count / 3,
    mesh(name) {
      const m = new THREE.Mesh(geometry, material);
      m.name = name; m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    blob(name) {
      if (!blobGeo) return null;
      const m = new THREE.Mesh(blobGeo, track.add(new THREE.MeshBasicMaterial({ map: blobMap, transparent: true, depthWrite: false })));
      m.name = name; m.renderOrder = 2;
      return m;
    },
  };
}
