// 사람 마네킹 8종 (고정 자산) — GDD 9절 "사람 마네킹 8종".
// 앉은 자세, 기본 도형만 사용(외부 모델 없음), 평면 음영.
// 머리 = 프로필(GDD 9절): 머리 앞면이 둥근 프로필 판이고, 둘레에 그 사람 색의 얇은 테가 있다.
// 좌표: 원점 = 의자 자리 중심의 바닥, +Z = 마네킹이 바라보는 쪽(테이블 쪽), 단위 m.
// 사용: createMannequin('bob-woman', { color: '#f78fb3', profile: 텍스처, name: '서아' }) -> THREE.Group
//         profile: THREE.Texture, canvas, img 중 하나. 없으면 이름 첫 글자 + 고유 색.
//       setMannequinProfile(group, 텍스처)  = 나중에 프로필 바꾸기
//       makeInitialAvatar('서아', '#f78fb3') = 사진이 없을 때 쓰는 첫 글자 그림(텍스처)
//       group.userData.tagY  = 이름표를 띄울 높이(머리·모자 위)
//       group.userData.headY / headZ = 머리 중심 높이 / 앞뒤 위치
//       group.userData.faceY / faceZ / faceR = 프로필 판 중심 높이 / 앞뒤 위치 / 반지름
//       group.userData.face  = 프로필 판 Mesh
import * as THREE from 'three';

export const SEAT_HEIGHT = 0.46;   // 의자 앉는 면 높이
export const TABLE_HEIGHT = 0.74;  // 자세가 가정하는 테이블 윗면 높이

const SKIN = 0xb7aea4;             // 마네킹 몸 색(모두 같음)
const UP = new THREE.Vector3(0, 1, 0);
const K8 = Math.cos(Math.PI / 8);
const FACE_SEGMENTS = 20;          // 프로필 판 둘레 조각 수(삼각형 약 100개)

const BASE = {
  torsoH: 0.5, shoulderW: 0.2, waistW: 0.15, hipW: 0.17, ratio: 0.62, waistAt: 0.4,
  lean: 0.05, neckH: 0.07, neckR: 0.045, headR: 0.105, headSX: 1, headSY: 1.18, headTilt: 0,
  armR: 0.045, sleeveFat: 1, legR: 0.065, thigh: 0.44, kneeX: 0.11, footZ: 0,
  pose: 'table', hair: 'short', hairColor: 0x1b1715,
  top: 0x3a3a40, sleeve: null, bareForearm: false, bottom: 0x23252b, shin: null, shoe: 0x121214,
  skirt: null, belly: null, collarUp: false, inner: null, innerW: 0.07, accent: 'tie',
};

// 8종. 여성 3명(단발, 긴 머리, 정장) 포함. label 은 화면에 그대로 쓸 수 있는 한국어 이름.
export const MANNEQUINS = [
  { id: 'slim-man', label: '마른 남성', gender: 'm',
    note: '키 크고 마른 몸, 셔츠와 넥타이, 두 손을 테이블에 모음',
    body: { torsoH: 0.57, shoulderW: 0.185, waistW: 0.135, hipW: 0.15, lean: 0.12, neckH: 0.09,
      neckR: 0.038, headR: 0.098, headSY: 1.26, armR: 0.036, legR: 0.05, thigh: 0.47, kneeX: 0.09,
      pose: 'table', hair: 'short', top: 0xbdb7aa, bottom: 0x23252b, accent: 'tie' } },
  { id: 'big-man', label: '체격 큰 남성', gender: 'm',
    note: '넓은 어깨와 굵은 목, 깃 세운 점퍼, 팔짱',
    body: { torsoH: 0.56, shoulderW: 0.29, waistW: 0.21, hipW: 0.2, ratio: 0.68, lean: -0.05,
      neckH: 0.04, neckR: 0.072, headR: 0.11, headSX: 1.06, headSY: 1.08, armR: 0.068,
      legR: 0.085, kneeX: 0.2, pose: 'crossed', hair: 'buzz', hairColor: 0x2a2725,
      top: 0x2d2723, bottom: 0x1c1d21, collarUp: true, inner: 0x5a5852, innerW: 0.13,
      accent: 'armband' } },
  { id: 'bob-woman', label: '단발 여성', gender: 'f',
    note: '작은 체구, 단발머리, 헐렁한 스웨터와 목도리, 턱을 괸 자세',
    body: { torsoH: 0.44, shoulderW: 0.165, waistW: 0.135, hipW: 0.16, lean: 0.14, neckH: 0.06,
      neckR: 0.034, headR: 0.1, headSY: 1.12, armR: 0.034, sleeveFat: 1.35, legR: 0.052,
      thigh: 0.4, kneeX: 0.08, pose: 'chin', hair: 'bob', hairColor: 0x191413,
      top: 0x6b5a3e, bottom: 0x2a2d35, accent: 'scarf' } },
  { id: 'long-hair-woman', label: '긴 머리 여성', gender: 'f',
    note: '등까지 내려오는 긴 머리, 잘록한 허리, 긴 원피스, 무릎 위에 손',
    body: { torsoH: 0.47, shoulderW: 0.16, waistW: 0.105, hipW: 0.17, lean: 0.02, neckH: 0.075,
      neckR: 0.032, headR: 0.1, headSY: 1.16, armR: 0.031, legR: 0.045, thigh: 0.42, kneeX: 0.06,
      pose: 'lap', hair: 'long', hairColor: 0x2c1b12, top: 0x30454d, bareForearm: true,
      bottom: 0x30454d, shin: SKIN, skirt: 'long', accent: 'hairband' } },
  { id: 'elder', label: '노인', gender: 'm',
    note: '굽은 등, 납작모자와 흰 수염, 조끼 카디건, 두꺼운 목도리',
    body: { torsoH: 0.42, shoulderW: 0.17, waistW: 0.155, hipW: 0.16, ratio: 0.7, lean: 0.34,
      headTilt: -0.3, neckH: 0.05, neckR: 0.036, headR: 0.1, headSY: 1.1, armR: 0.033,
      legR: 0.046, thigh: 0.4, kneeX: 0.1, footZ: -0.12, pose: 'table', hair: 'flatcap',
      hairColor: 0xc9c6c0, top: 0x4b4036, bottom: 0x2c2a28, inner: 0x8d877b, innerW: 0.08,
      accent: 'muffler' } },
  { id: 'hood-youth', label: '후드 쓴 청년', gender: 'm',
    note: '후드를 눌러쓰고 뒤로 기대앉음, 고개 숙임, 주머니에 손',
    body: { torsoH: 0.5, shoulderW: 0.21, waistW: 0.18, hipW: 0.17, ratio: 0.66, lean: -0.12,
      headTilt: 0.2, neckH: 0.05, headR: 0.102, headSY: 1.15, armR: 0.042, sleeveFat: 1.3,
      legR: 0.06, kneeX: 0.19, footZ: 0.16, pose: 'pocket', hair: 'hood',
      top: 0x30353c, bottom: 0x1b1c20, shoe: 0x8b8880, accent: 'stripe' } },
  { id: 'suit-woman', label: '정장 여성', gender: 'f',
    note: '올림머리, 각진 어깨의 재킷과 좁은 치마, 꼿꼿한 자세',
    body: { torsoH: 0.5, shoulderW: 0.195, waistW: 0.115, hipW: 0.165, lean: 0, neckH: 0.085,
      neckR: 0.033, headR: 0.097, headSY: 1.2, armR: 0.034, legR: 0.046, thigh: 0.43,
      kneeX: 0.05, pose: 'flat', hair: 'bun', hairColor: 0x141110, top: 0x1f2532,
      bottom: 0x1f2532, shin: 0x2b2624, skirt: 'pencil', inner: 0xb9b3a8, innerW: 0.06,
      accent: 'neckerchief' } },
  { id: 'heavy-man', label: '뚱뚱한 중년', gender: 'm',
    note: '둥근 배와 짧은 목, 중절모, 조끼, 나비넥타이',
    body: { torsoH: 0.5, shoulderW: 0.25, waistW: 0.27, hipW: 0.26, ratio: 0.8, lean: -0.02,
      neckH: 0.02, neckR: 0.075, headR: 0.115, headSX: 1.12, headSY: 1.0, armR: 0.06,
      legR: 0.085, thigh: 0.42, kneeX: 0.2, pose: 'wide', hair: 'fedora', hairColor: 0x2a2420,
      top: 0x3b2f29, sleeve: 0x8f887b, bottom: 0x25221f, belly: { r: 0.25, y: 0.21, z: 0.05 },
      accent: 'bowtie' } },
];

export function getMannequinDef(id) {
  if (typeof id === 'number') return MANNEQUINS[((id % 8) + 8) % 8];
  return MANNEQUINS.find((m) => m.id === id) || MANNEQUINS[0];
}

// 사진이 없을 때 쓰는 프로필: 고유 색 바탕에 이름 첫 글자. 화면이 없는 환경에서는 null.
export function makeInitialAvatar(name, color = '#b23a3a', size = 256) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.55);
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#' + base.getHexString());
  grad.addColorStop(1, '#' + dark.getHexString());
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const letter = Array.from(String(name ?? '').trim())[0] || '?';
  g.fillStyle = 'rgba(12, 9, 9, 0.86)';
  g.font = `900 ${Math.round(size * 0.56)}px "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, size / 2, size * 0.53);
  return toProfileTexture(c);
}

function toProfileTexture(src) {
  if (!src) return null;
  let tex = src;
  if (!src.isTexture) {
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement;
    tex = isCanvas ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    tex.needsUpdate = true;
    tex.userData.madeByMannequin = true;
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 마네킹의 프로필을 바꾼다. texture: THREE.Texture, canvas, img. null 이면 빈 판(몸 색).
export function setMannequinProfile(group, texture) {
  const face = group?.userData?.face;
  if (!face) return;
  const m = face.material;
  const old = m.map;
  const tex = toProfileTexture(texture);
  if (old && old !== tex && old.userData.madeByMannequin) old.dispose();
  m.map = tex;
  m.emissiveMap = tex;
  m.color.set(tex ? 0x909090 : SKIN);            // 조명을 받아도 그림이 하얗게 날아가지 않게
  m.emissive.set(tex ? 0xffffff : 0x000000);
  m.needsUpdate = true;
}

// 마네킹 하나를 만든다. id: 위 목록의 id 또는 0~7 번호.
// opts.color: 이름표 색(프로필 테와 강조 소품). opts.profile: 프로필 그림. opts.name: 사진이 없을 때 첫 글자.
export function createMannequin(id, opts = {}) {
  const def = getMannequinDef(id);
  const b = { ...BASE, ...def.body };
  const accentColor = new THREE.Color(opts.color ?? 0xb23a3a);
  const root = new THREE.Group();
  root.name = 'mannequin:' + def.id;

  const mats = new Map();
  const mat = (color, double = false) => {
    const key = (color.isColor ? color.getHex() : color) + (double ? 'd' : '');
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshLambertMaterial({
        color, flatShading: true, side: double ? THREE.DoubleSide : THREE.FrontSide,
      }));
    }
    return mats.get(key);
  };
  const mSkin = mat(SKIN);
  const mTop = mat(b.top);
  const mSleeve = mat(b.sleeve ?? b.top);
  const mBottom = mat(b.bottom);
  const mHair = mat(b.hairColor);
  const mAccent = mat(accentColor);

  const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (parent, w, h, d, x, y, z, material) =>
    add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const ball = (parent, r, x, y, z, material, detail = 0) =>
    add(parent, new THREE.IcosahedronGeometry(r, detail), material, x, y, z);
  const seg = (parent, a, c, rA, rC, material, radial = 6) => {
    const d = new THREE.Vector3().subVectors(c, a);
    const len = Math.max(d.length(), 0.001);
    const m = add(parent, new THREE.CylinderGeometry(rC, rA, len, radial, 1), material);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- 몸통 (엉덩이를 축으로 앞뒤로 기울어짐) ----
  const hipY = SEAT_HEIGHT + 0.09;
  const torso = new THREE.Group();
  torso.position.set(0, hipY, 0);
  torso.rotation.x = b.lean;
  root.add(torso);

  const waistY = b.torsoH * b.waistAt;
  const halfW = (y) => (y < waistY
    ? THREE.MathUtils.lerp(b.hipW, b.waistW, THREE.MathUtils.clamp(y / waistY, 0, 1))
    : THREE.MathUtils.lerp(b.waistW, b.shoulderW,
      THREE.MathUtils.clamp((y - waistY) / (b.torsoH - waistY), 0, 1)));
  const frontZ = (y) => halfW(y) * b.ratio;
  // 팔각 기둥 조각: 앞면이 평평하게 +Z 를 보도록 돌려 둔다
  const tube = (y0, y1, r0, r1, material) => {
    const g = new THREE.CylinderGeometry(r1 / K8, r0 / K8, y1 - y0, 8, 1);
    g.rotateY(Math.PI / 8);
    const m = add(torso, g, material, 0, (y0 + y1) / 2, 0);
    m.scale.z = b.ratio;
    return m;
  };
  // 가슴 앞면에 붙는 띠(넥타이, 안쪽 옷, 끈 등)
  const frontStrip = (y0, y1, w, thick, material, x = 0) => {
    const z0 = frontZ(y0), z1 = frontZ(y1);
    const len = Math.hypot(y1 - y0, z1 - z0);
    const m = box(torso, w, len, thick, x, (y0 + y1) / 2, (z0 + z1) / 2 + thick * 0.5, material);
    m.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    return m;
  };

  tube(-0.03, waistY, b.hipW, b.waistW, mTop);
  tube(waistY, b.torsoH, b.waistW, b.shoulderW, mTop);
  tube(b.torsoH, b.torsoH + 0.045, b.shoulderW, b.neckR * 1.7, mTop); // 어깨 경사
  if (b.belly) {
    const m = ball(torso, b.belly.r, 0, b.belly.y, b.belly.z, mTop, 1);
    m.scale.set(1.06, 0.95, 1);
  }
  if (b.inner != null) frontStrip(b.torsoH * 0.5, b.torsoH - 0.005, b.innerW, 0.012, mat(b.inner));
  if (b.collarUp) {
    const g = new THREE.CylinderGeometry(b.neckR * 1.75, b.neckR * 2.1, 0.1, 8, 1, true,
      Math.PI * 0.22, Math.PI * 1.56);
    add(torso, g, mat(b.top, true), 0, b.torsoH + 0.06, -0.005);
  }
  seg(torso, V(0, b.torsoH + 0.02, 0), V(0, b.torsoH + b.neckH + 0.03, 0), b.neckR, b.neckR, mSkin);

  // ---- 머리 (목을 축으로 숙이거나 듦) ----
  const head = new THREE.Group();
  head.position.set(0, b.torsoH + b.neckH * 0.5, 0);
  head.rotation.x = b.headTilt;
  torso.add(head);
  const R = b.headR;
  const Ry = R * b.headSY;
  const hy = b.neckH * 0.5 + Ry * 0.86;
  const skull = ball(head, R, 0, hy, 0.008, mSkin, 1);
  skull.scale.set(b.headSX, b.headSY, 1.04);
  let topExtra = 0; // 머리 위로 더 올라오는 높이(모자 등)

  // 프로필 판: 머리 앞면에서 살짝 튀어나온 둥근 판. 옆면과 앞 테두리는 그 사람 색, 가운데는 프로필 그림.
  // 그림은 조명이 어두워도 알아볼 수 있게 스스로 조금 빛난다.
  const faceR = R * 0.9;
  const faceY = hy - R * 0.04;
  const faceFront = R * 1.16;                     // 머리 공(앞끝 약 1.12R)보다 앞
  const rim = new THREE.CylinderGeometry(faceR, faceR, R * 0.8, FACE_SEGMENTS, 1, true);
  rim.rotateX(Math.PI / 2);
  add(head, rim, mAccent, 0, faceY, faceFront - R * 0.4);
  add(head, new THREE.RingGeometry(faceR * 0.9, faceR, FACE_SEGMENTS), mAccent, 0, faceY, faceFront);
  const face = add(head, new THREE.CircleGeometry(faceR * 0.9, FACE_SEGMENTS),
    new THREE.MeshLambertMaterial({ color: SKIN, emissive: 0x000000, emissiveIntensity: 0.45 }),
    0, faceY, faceFront);
  face.name = 'profile';

  const cap = (scale, tilt, material) => {
    const g = new THREE.SphereGeometry(R * scale, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const m = add(head, g, material, 0, hy, 0);
    m.scale.set(b.headSX, b.headSY, 1.06);
    m.rotation.x = tilt;
    return m;
  };
  const mHairD = mat(b.hairColor, true);
  switch (b.hair) {
    case 'short':
      cap(1.08, -0.5, mHair);
      break;
    case 'buzz':
      cap(1.035, -0.42, mHair);
      break;
    case 'bob': {
      cap(1.1, -0.3, mHair);
      const g = new THREE.CylinderGeometry(R * 1.14, R * 1.24, Ry * 1.3, 8, 1, true,
        Math.PI * 0.3, Math.PI * 1.4);
      add(head, g, mHairD, 0, hy - Ry * 0.3, -0.004);
      const bang = box(head, R * 1.7, R * 0.3, 0.03, 0, hy + R * 0.94, R * 1.18, mHair);
      bang.rotation.x = -0.35;
      topExtra = 0.012;
      break;
    }
    case 'long': {
      cap(1.09, -0.32, mHair);
      const hairTop = b.torsoH + b.neckH + Ry * 1.25;
      box(torso, R * 2.05, 0.46, 0.065, 0, hairTop - 0.23, -R * 0.8, mHair);     // 등 뒤로
      box(torso, 0.04, 0.3, 0.06, R * 0.98, hairTop - 0.2, R * 0.12, mHair);      // 옆머리
      box(torso, 0.04, 0.3, 0.06, -R * 0.98, hairTop - 0.2, R * 0.12, mHair);
      topExtra = 0.01;
      break;
    }
    case 'bun': {
      cap(1.07, -0.4, mHair);
      ball(head, R * 0.44, 0, hy + Ry * 0.82, -R * 0.62, mHair, 0);
      topExtra = R * 0.3;
      break;
    }
    case 'flatcap': {
      const mCap = mat(0x34302c);
      const c = add(head, new THREE.CylinderGeometry(R * 1.02, R * 1.14, R * 0.36, 8), mCap,
        0, hy + Ry * 0.9, 0.012);
      c.scale.z = 1.14;
      c.rotation.x = 0.12;
      box(head, R * 1.5, 0.016, R * 0.5, 0, hy + Ry * 0.8, R * 1.2, mCap).rotation.x = 0.2;
      const g = new THREE.CylinderGeometry(R * 1.08, R * 1.06, Ry * 0.52, 8, 1, true,
        Math.PI * 0.5, Math.PI);
      add(head, g, mHairD, 0, hy + Ry * 0.18, 0);                                 // 흰 옆·뒷머리
      const beard = add(head, new THREE.ConeGeometry(R * 0.5, R * 0.8, 5), mHair,
        0, hy - Ry * 1.2, R * 0.42);
      beard.rotation.x = Math.PI;                                                 // 흰 수염
      topExtra = R * 0.3;
      break;
    }
    case 'hood': {
      const g = new THREE.SphereGeometry(R * 1.4, 8, 6, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24);
      const m = add(head, g, mat(b.top, true), 0, hy + 0.012, -0.022);
      m.scale.set(1, 1.07, 1.12);
      tube(b.torsoH - 0.01, b.torsoH + 0.1, b.shoulderW * 0.86, R * 1.15, mTop); // 후드 목덜미
      topExtra = R * 0.5;
      break;
    }
    case 'fedora': {
      const brimY = hy + Ry * 0.86;
      add(head, new THREE.CylinderGeometry(R * 1.72, R * 1.72, 0.016, 10), mHair, 0, brimY, 0);
      add(head, new THREE.CylinderGeometry(R * 0.86, R * 1.02, R * 0.8, 8), mHair,
        0, brimY + R * 0.4, 0);
      if (b.accent === 'bowtie') {
        add(head, new THREE.CylinderGeometry(R * 1.05, R * 1.06, R * 0.2, 8), mAccent,
          0, brimY + R * 0.12, 0);                                                // 모자 띠
      }
      topExtra = R * 0.72;
      break;
    }
    default:
      break;
  }

  // ---- 다리 ----
  root.updateMatrixWorld(true);
  const mShin = mat(b.shin ?? b.bottom);
  const mShoe = mat(b.shoe);
  const legY = SEAT_HEIGHT + 0.07;
  box(root, b.hipW * 2 - 0.01, 0.13, b.hipW * 2 * b.ratio, 0, legY - 0.005, 0, mBottom);
  for (const s of [1, -1]) {
    const hip = V(s * b.hipW * 0.56, legY, 0.02);
    const knee = V(s * b.kneeX, legY - 0.01, b.thigh);
    const ankle = V(s * b.kneeX, 0.075, b.thigh - 0.04 + b.footZ);
    if (!b.skirt) seg(root, hip, knee, b.legR * 1.1, b.legR * 0.9, mBottom);
    ball(root, b.legR * 0.92, knee.x, knee.y, knee.z, b.skirt ? mShin : mBottom);
    seg(root, knee, ankle, b.legR * 0.85, b.legR * 0.62, mShin);
    box(root, b.legR * 1.5, 0.07, 0.21, ankle.x, 0.035, ankle.z + 0.05, mShoe);
  }
  if (b.skirt === 'pencil') {
    box(root, b.hipW * 2 + 0.01, 0.15, b.thigh + 0.02, 0, legY, b.thigh / 2 - 0.01, mBottom);
  } else if (b.skirt === 'long') {
    box(root, b.hipW * 2 + 0.06, 0.15, b.thigh + 0.06, 0, legY, b.thigh / 2, mBottom);
    const drape = add(root, new THREE.CylinderGeometry(0.19, 0.27, 0.34, 6), mBottom,
      0, legY - 0.2, b.thigh - 0.02);
    drape.scale.z = 0.5;
  }

  // ---- 팔 (자세) ----
  const toRoot = (obj, x, y, z) => obj.localToWorld(V(x, y, z));
  const TH = TABLE_HEIGHT;
  const sw = b.shoulderW;
  const sleeveR = b.armR * b.sleeveFat;
  const mFore = b.bareForearm ? mSkin : mSleeve;
  const chin = toRoot(head, 0, hy - Ry * 0.92, R * 0.55);
  const armEnds = (s) => {
    const sh = toRoot(torso, s * (sw - 0.012), b.torsoH - 0.035, 0);
    let elbow, hand;
    switch (b.pose) {
      case 'crossed': {
        const y = sh.y - 0.25;
        const cz = toRoot(torso, 0, b.torsoH - 0.24, frontZ(b.torsoH - 0.24)).z + b.armR + 0.015;
        elbow = V(s * (sw + 0.035), y, sh.z + 0.09);
        hand = s > 0 ? V(-sw * 0.5, y + 0.035, cz) : V(sw * 0.5, y - 0.03, cz + 0.035);
        break;
      }
      case 'lap':
        elbow = toRoot(torso, s * (sw + 0.045), b.torsoH - 0.27, -0.03);
        hand = V(s * 0.045, SEAT_HEIGHT + 0.2, 0.25);
        break;
      case 'pocket':
        elbow = toRoot(torso, s * (sw + 0.06), b.torsoH - 0.27, -0.04);
        hand = toRoot(torso, s * 0.075, 0.15, frontZ(0.15) + 0.035);
        break;
      case 'chin':
        if (s < 0) {
          elbow = V(-0.13, TH + 0.045, 0.37);
          hand = V(chin.x - 0.025, chin.y - 0.02, chin.z);
        } else {
          elbow = V(sw + 0.07, TH + 0.05, 0.22);
          hand = V(-0.03, TH + 0.04, 0.43);
        }
        break;
      case 'flat':
        elbow = V(s * (sw + 0.05), TH + 0.05, 0.2);
        hand = V(s * 0.13, TH + 0.035, 0.5);
        break;
      case 'wide':
        elbow = V(s * (sw + 0.09), TH + 0.07, 0.2);
        hand = V(s * 0.2, TH + 0.045, 0.5);
        break;
      case 'table':
      default:
        elbow = V(s * (sw + 0.07), TH + 0.05, 0.21);
        hand = V(s * 0.04, TH + 0.04, 0.47);
        break;
    }
    return { sh, elbow, hand };
  };
  for (const s of [1, -1]) {
    const { sh, elbow, hand } = armEnds(s);
    ball(root, sleeveR * 1.3, sh.x, sh.y, sh.z, mSleeve);
    seg(root, sh, elbow, sleeveR * 1.08, sleeveR * 0.92, mSleeve);
    ball(root, sleeveR * 0.95, elbow.x, elbow.y, elbow.z, mSleeve);
    seg(root, elbow, hand, (b.bareForearm ? b.armR : sleeveR) * 0.88, b.armR * 0.72, mFore);
    const h = ball(root, b.armR * 1.0, hand.x, hand.y, hand.z, mSkin);
    h.scale.set(1, 0.8, 1.15);
    if (b.accent === 'armband') {
      const p0 = sh.clone().lerp(elbow, 0.34), p1 = sh.clone().lerp(elbow, 0.58);
      seg(root, p0, p1, sleeveR * 1.2, sleeveR * 1.16, mAccent);
    }
  }

  // ---- 강조 소품 (이름표 색) ----
  const H = b.torsoH;
  switch (b.accent) {
    case 'tie':
      frontStrip(H * 0.42, H - 0.04, 0.046, 0.014, mAccent);
      box(torso, 0.056, 0.045, 0.03, 0, H - 0.015, frontZ(H) * 0.52, mAccent);
      break;
    case 'scarf': {
      const ring = add(torso, new THREE.CylinderGeometry(0.07, 0.092, 0.085, 8), mAccent,
        0, H + 0.045, 0);
      ring.scale.z = 0.95;
      frontStrip(H - 0.26, H, 0.075, 0.03, mAccent, 0.05);
      break;
    }
    case 'muffler':
      add(torso, new THREE.CylinderGeometry(0.085, 0.105, 0.1, 8), mAccent, 0, H + 0.04, 0.005);
      frontStrip(H - 0.15, H, 0.08, 0.035, mAccent, -0.045);
      break;
    case 'neckerchief': {
      add(torso, new THREE.CylinderGeometry(0.046, 0.056, 0.04, 8), mAccent, 0, H + 0.045, 0);
      const c = add(torso, new THREE.ConeGeometry(0.05, 0.11, 4), mAccent,
        0, H - 0.03, frontZ(H - 0.03) + 0.012);
      c.rotation.x = Math.PI;
      break;
    }
    case 'hairband': {
      const g = new THREE.TorusGeometry(R * 1.1, 0.014, 4, 8, Math.PI);
      const m = add(head, g, mAccent, 0, hy, R * 0.12);
      m.scale.set(b.headSX, b.headSY, 1);
      m.rotation.x = -0.12;
      tube(waistY - 0.028, waistY + 0.028, halfW(waistY - 0.028) * 1.07,
        halfW(waistY + 0.028) * 1.07, mAccent);                                   // 허리띠
      const brooch = box(torso, 0.07, 0.07, 0.02, 0, H - 0.03, frontZ(H - 0.03) + 0.01, mAccent);
      brooch.rotation.z = Math.PI / 4;
      break;
    }
    case 'stripe':
      tube(H * 0.6, H * 0.6 + 0.06, halfW(H * 0.6) * 1.035, halfW(H * 0.6 + 0.06) * 1.035, mAccent);
      frontStrip(H - 0.17, H - 0.01, 0.014, 0.012, mAccent, 0.035);
      frontStrip(H - 0.19, H - 0.01, 0.014, 0.012, mAccent, -0.035);
      break;
    case 'bowtie':
      for (const s of [1, -1]) {
        const c = add(torso, new THREE.ConeGeometry(0.036, 0.075, 4), mAccent,
          s * 0.04, H - 0.012, frontZ(H) * 0.62);
        c.rotation.z = s * Math.PI / 2;
      }
      break;
    default:
      break;
  }

  root.updateMatrixWorld(true);
  const headC = toRoot(head, 0, hy, 0);
  const headTop = toRoot(head, 0, hy + Ry + topExtra, 0);
  const faceC = toRoot(head, 0, faceY, faceFront);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  face.castShadow = false;
  root.userData = {
    mannequinId: def.id, label: def.label,
    headY: headC.y, headZ: headC.z,
    faceY: faceC.y, faceZ: faceC.z, faceR, face,
    tagY: Math.max(headTop.y, headC.y + Ry) + 0.1,
  };
  setMannequinProfile(root, opts.profile ?? makeInitialAvatar(opts.name ?? def.label, accentColor));
  return root;
}

// 마네킹과 같은 기준(자리 중심 바닥, +Z 가 앞)의 단순한 의자.
export function createChair(color = 0x1d1512) {
  const g = new THREE.Group();
  g.name = 'chair';
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const part = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  };
  part(0.5, 0.05, 0.48, 0, SEAT_HEIGHT - 0.025, 0.02);
  part(0.5, 0.62, 0.05, 0, SEAT_HEIGHT + 0.33, -0.25);
  for (const x of [-0.21, 0.21]) {
    for (const z of [-0.2, 0.22]) {
      part(0.05, SEAT_HEIGHT - 0.05, 0.05, x, (SEAT_HEIGHT - 0.05) / 2, z);
    }
  }
  return g;
}

// 장면에서 뺄 때 도형·재질 메모리를 비운다.
export function disposeMannequin(group) {
  const seen = new Set();
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    if (seen.has(o.material)) return;
    seen.add(o.material);
    if (o.material.map?.userData.madeByMannequin) o.material.map.dispose(); // 받은 텍스처는 건드리지 않는다
    o.material.dispose();
  });
}
