import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
const std = (o) => new THREE.MeshStandardMaterial(o);

/* chips: denomination -> colour */
export const DENOMS = [['p', 5000], ['k', 1000], ['g', 500], ['b', 100], ['r', 50], ['w', 10]];
const COL = { w: '#f3efe6', r: '#cf4034', b: '#3a80d2', g: '#2fa37a', k: '#23272b', p: '#9a5fd6' };
const chipMat = {};
export function chipMaterials(c) {
  if (chipMat[c]) return chipMat[c];
  const mark = c === 'w' ? '#8a8375' : '#fffaf0';
  const side = canvasTex(256, 16, (g, w, h) => {
    g.fillStyle = COL[c]; g.fillRect(0, 0, w, h);
    g.fillStyle = mark;
    for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 4, 0, 12, h);
  });
  const top = canvasTex(128, 128, (g) => {
    g.fillStyle = COL[c]; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
    g.strokeStyle = mark; g.lineWidth = 9; g.setLineDash([13, 12]);
    g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
    g.setLineDash([]); g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 36, 0, 7); g.stroke();
  });
  return (chipMat[c] = [std({ map: side, roughness: 0.5 }), std({ map: top, roughness: 0.5 }), std({ map: top, roughness: 0.5 })]);
}
export const CR = 0.04;
export const CH = 0.0135;
export const chipGeo = new THREE.CylinderGeometry(CR, CR, CH - 0.0008, 32);

/* cards */
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const suitGlyph = (code) => SUIT[code[1]];
export const rankLabel = (code) => (code[0] === 'T' ? '10' : code[0]);

const backTex = canvasTex(256, 360, (g, w, h) => {
  g.fillStyle = '#f3ecd8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#243a86'; g.fillRect(14, 14, w - 28, h - 28);
  g.save(); g.beginPath(); g.rect(14, 14, w - 28, h - 28); g.clip();
  g.strokeStyle = '#3454b8'; g.lineWidth = 7;
  for (let i = -h; i < w + h; i += 24) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
  }
  g.restore();
  g.strokeStyle = '#e6c15a'; g.lineWidth = 5; g.strokeRect(24, 24, w - 48, h - 48);
  g.fillStyle = '#e6c15a'; g.beginPath(); g.arc(w / 2, h / 2, 44, 0, 7); g.fill();
  g.fillStyle = '#243a86'; g.font = '70px serif'; g.textAlign = 'center'; g.fillText('♠', w / 2, h / 2 + 24);
});

const faces = {};
// Joker is the code 'JK'. No mirrored index at the bottom right, per spec.
function faceMat(code) {
  if (faces[code]) return faces[code];
  const joker = code === 'JK';
  const tex = canvasTex(360, 504, (g, w, h) => {
    g.fillStyle = '#fffdf7'; g.fillRect(0, 0, w, h);
    g.fillStyle = joker || 'hd'.includes(code[1]) ? '#d0281e' : '#15181c';
    g.textAlign = 'center';
    const label = joker ? '★' : rankLabel(code);
    g.font = `700 ${label.length > 1 ? 76 : 92}px "Libre Baskerville",Georgia,serif`;
    g.fillText(label, 58, 98);
    if (!joker) { g.font = '74px serif'; g.fillText(SUIT[code[1]], 58, 172); }
    g.font = `${joker ? 230 : 210}px serif`;
    g.fillText(joker ? '★' : SUIT[code[1]], w / 2, h / 2 + 74);
    if (joker) { g.font = '700 34px "Libre Baskerville",Georgia,serif'; g.fillText('JOKER', w / 2, h / 2 + 140); }
  });
  return (faces[code] = std({ map: tex, roughness: 0.8, envMapIntensity: 0.2, color: 0xd8d2c6 }));
}

const cardGeo = new RoundedBoxGeometry(0.15, 0.003, 0.21, 2, 0.0012);
const edge = std({ color: 0xbdb6a8, roughness: 0.8 });
const backMat = std({ map: backTex, roughness: 0.7, envMapIntensity: 0.2 });

// A face-down card is rotated by PI about x; its top material is then the back.
export function cardMesh(code) {
  const m = new THREE.Mesh(cardGeo, [edge, edge, code ? faceMat(code) : backMat, backMat, edge, edge]);
  m.rotation.order = 'YXZ';
  m.castShadow = m.receiveShadow = true;
  return m;
}
export const setFace = (mesh, code) => { mesh.material[2] = code ? faceMat(code) : backMat; };

export const dealerButton = () => {
  const top = canvasTex(128, 128, (g) => {
    g.fillStyle = '#f3efe6'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1a1814'; g.font = '700 84px "Libre Baskerville",serif'; g.textAlign = 'center'; g.fillText('D', 64, 92);
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.007, 32), [std({ color: 0xddd6c6 }), std({ map: top }), std({ color: 0xddd6c6 })]);
  m.castShadow = true;
  return m;
};

export const plaqueMaterials = (rank) => {
  const front = std({
    roughness: 0.4,
    map: canvasTex(300, 240, (g, w, h) => {
      g.fillStyle = '#120c09'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffc62a'; g.lineWidth = 7; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#fff'; g.font = '400 34px "Black Han Sans"'; g.textAlign = 'center'; g.fillText('이번 카드', w / 2, 58);
      g.fillStyle = '#ffc62a'; g.font = `400 ${rank === 'J' ? 120 : 160}px "Bangers"`; g.fillText(rank, w / 2, 208);
    }),
  });
  const body = std({ color: 0x140c08 });
  return [body, body, body, body, front, body];
};
export const plaqueGeo = new RoundedBoxGeometry(0.3, 0.24, 0.025, 3, 0.01);
