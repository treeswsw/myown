// 수박 게임 과일 그림 (우리 것, canvas). 단계 0~10 마다 몸통(회전하는 무늬+얼굴)과 광택(안 도는 반짝임)을 따로 한 번 그려 캐시한다.
// 그림만 다룬다: 규칙·물리는 shared/solo/suika.js.
import { RADII } from '../../../../shared/solo/suika.js';

export const NAMES = ['체리', '딸기', '포도', '귤', '감', '사과', '배', '복숭아', '파인애플', '멜론', '수박'];

// [밝은 쪽, 어두운 쪽, 테두리]
const PAL = [
  ['#ff6b73', '#c4162f', '#7d0b1f'],   // 체리
  ['#ff7a78', '#d92b3c', '#8e1426'],   // 딸기
  ['#b58cff', '#6a3bc2', '#3f1d82'],   // 포도
  ['#ffc063', '#f08a12', '#a9570a'],   // 귤
  ['#ffa04d', '#e8601c', '#9a3a0c'],   // 감
  ['#ff8a80', '#d6262b', '#86121a'],   // 사과
  ['#f2f48a', '#b9cf3a', '#6f8316'],   // 배
  ['#ffd2c2', '#ff8c86', '#c4504d'],   // 복숭아
  ['#ffe873', '#f1bb1c', '#a37508'],   // 파인애플
  ['#e4f9a8', '#8fd05a', '#4e8a2c'],   // 멜론
  ['#7fd96a', '#2f9a3d', '#176a27'],   // 수박
];
export const COLORS = PAL.map((p) => p[1]);
export const GLOW = PAL.map((p) => p[0]);

function leaf(c, x, y, len, ang, col = '#47b34a') {
  c.save();
  c.translate(x, y); c.rotate(ang);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  c.fill();
  c.restore();
}

function body(c, R, k) {
  const [lt, dk, rim] = PAL[k];
  const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, lt); g.addColorStop(1, dk);
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, R, 0, 6.2832); c.fill();
  // 무늬는 둥근 몸통 안에서만
  c.save();
  c.beginPath(); c.arc(0, 0, R, 0, 6.2832); c.clip();
  detail(c, R, k);
  // 아래쪽 그늘
  const sh = c.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,10,10,.28)');
  c.fillStyle = sh; c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();
  c.lineWidth = Math.max(1.2, R * 0.07);
  c.strokeStyle = rim;
  c.beginPath(); c.arc(0, 0, R - c.lineWidth / 2, 0, 6.2832); c.stroke();
  extras(c, R, k);
  face(c, R, k);
}

function detail(c, R, k) {
  c.lineCap = 'round';
  if (k === 1) { // 딸기 씨
    c.fillStyle = 'rgba(255,235,150,.95)';
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (i * i + j * j > 5) continue;
      const x = (i + (j & 1 ? 0.5 : 0)) * R * 0.34, y = j * R * 0.32 + R * 0.12;
      c.beginPath(); c.ellipse(x, y, R * 0.05, R * 0.075, 0, 0, 6.2832); c.fill();
    }
  } else if (k === 2) { // 포도 알
    c.strokeStyle = 'rgba(40,10,90,.35)'; c.lineWidth = R * 0.05;
    for (const [x, y] of [[-0.45, -0.3], [0.45, -0.3], [0, -0.55], [-0.5, 0.35], [0.5, 0.35], [0, 0.6], [0, 0.05]]) {
      c.beginPath(); c.arc(x * R, y * R, R * 0.36, 0, 6.2832); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x * R - R * 0.1, y * R - R * 0.12, R * 0.09, 0, 6.2832); c.fill();
    }
  } else if (k === 3) { // 귤 껍질 점
    c.fillStyle = 'rgba(190,90,0,.22)';
    for (let i = 0; i < 16; i++) { const a = i * 2.4, rr = R * (0.2 + (i % 5) * 0.14); c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.035, 0, 6.2832); c.fill(); }
  } else if (k === 4) { // 감 결
    c.strokeStyle = 'rgba(160,50,0,.22)'; c.lineWidth = R * 0.06;
    for (const x of [-0.55, 0, 0.55]) { c.beginPath(); c.moveTo(x * R * 0.4, -R); c.quadraticCurveTo(x * R * 1.3, 0, x * R * 0.4, R); c.stroke(); }
  } else if (k === 6) { // 배 점
    c.fillStyle = 'rgba(120,110,20,.28)';
    for (let i = 0; i < 18; i++) { const a = i * 2.1, rr = R * (0.15 + (i % 6) * 0.13); c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.03, 0, 6.2832); c.fill(); }
  } else if (k === 7) { // 복숭아 볼
    const g = c.createRadialGradient(R * 0.35, R * 0.25, 0, R * 0.35, R * 0.25, R * 0.9);
    g.addColorStop(0, 'rgba(255,90,100,.5)'); g.addColorStop(1, 'rgba(255,90,100,0)');
    c.fillStyle = g; c.fillRect(-R, -R, R * 2, R * 2);
    c.strokeStyle = 'rgba(190,70,70,.45)'; c.lineWidth = R * 0.05;
    c.beginPath(); c.moveTo(0, -R * 0.95); c.quadraticCurveTo(R * 0.35, 0, 0, R * 0.95); c.stroke();
  } else if (k === 8) { // 파인애플 마름모
    c.strokeStyle = 'rgba(160,90,0,.4)'; c.lineWidth = R * 0.05;
    for (let i = -4; i <= 4; i++) {
      c.beginPath(); c.moveTo(i * R * 0.34 - R, -R); c.lineTo(i * R * 0.34 + R, R); c.stroke();
      c.beginPath(); c.moveTo(i * R * 0.34 + R, -R); c.lineTo(i * R * 0.34 - R, R); c.stroke();
    }
  } else if (k === 9) { // 멜론 그물
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = R * 0.04;
    for (let i = -4; i <= 4; i++) {
      c.beginPath(); c.moveTo(i * R * 0.3 - R * 0.5, -R); c.quadraticCurveTo(i * R * 0.5, 0, i * R * 0.3 - R * 0.5, R); c.stroke();
      c.beginPath(); c.moveTo(-R, i * R * 0.3 - R * 0.2); c.quadraticCurveTo(0, i * R * 0.3 + R * 0.1, R, i * R * 0.3 - R * 0.2); c.stroke();
    }
  } else if (k === 10) { // 수박 줄무늬
    c.fillStyle = 'rgba(10,80,30,.5)';
    for (const x of [-0.78, -0.4, 0, 0.4, 0.78]) {
      c.beginPath();
      c.moveTo(x * R * 0.85 - R * 0.07, -R);
      c.quadraticCurveTo(x * R * 1.5 - R * 0.12, 0, x * R * 0.85 - R * 0.07, R);
      c.lineTo(x * R * 0.85 + R * 0.07, R);
      c.quadraticCurveTo(x * R * 1.5 + R * 0.12, 0, x * R * 0.85 + R * 0.07, -R);
      c.fill();
    }
  }
}

// 몸통 위로 살짝 나오는 것(잎·꼭지)
function extras(c, R, k) {
  c.lineCap = 'round';
  if (k === 0) {
    c.strokeStyle = '#6b4a22'; c.lineWidth = Math.max(1.5, R * 0.1);
    c.beginPath(); c.moveTo(0, -R * 0.55); c.quadraticCurveTo(R * 0.15, -R * 0.95, R * 0.4, -R * 0.98); c.stroke();
    leaf(c, R * 0.4, -R * 0.98, R * 0.45, -0.2);
  } else if (k === 1) {
    for (let i = -2; i <= 2; i++) leaf(c, i * R * 0.12, -R * 0.84, R * 0.3, -1.57 + i * 0.5, '#3da845');
  } else if (k === 2) {
    c.strokeStyle = '#6b8a2a'; c.lineWidth = Math.max(1.5, R * 0.09);
    c.beginPath(); c.moveTo(0, -R * 0.8); c.lineTo(R * 0.05, -R * 1.02); c.stroke();
    leaf(c, 0, -R * 0.82, R * 0.45, -0.7);
  } else if (k === 3) {
    c.fillStyle = '#ffd77a'; c.beginPath(); c.arc(0, -R * 0.86, R * 0.13, 0, 6.2832); c.fill();
    leaf(c, R * 0.05, -R * 0.88, R * 0.42, -0.5);
  } else if (k === 4) {
    for (let i = 0; i < 4; i++) leaf(c, 0, -R * 0.72, R * 0.4, -1.57 + (i - 1.5) * 0.7, '#4aa842');
  } else if (k === 5) {
    c.strokeStyle = '#6b4a22'; c.lineWidth = Math.max(1.5, R * 0.09);
    c.beginPath(); c.moveTo(0, -R * 0.7); c.quadraticCurveTo(-R * 0.05, -R * 0.9, R * 0.08, -R * 1.02); c.stroke();
    leaf(c, R * 0.04, -R * 0.86, R * 0.5, -0.4);
  } else if (k === 6) {
    c.strokeStyle = '#7a5a2a'; c.lineWidth = Math.max(1.5, R * 0.08);
    c.beginPath(); c.moveTo(0, -R * 0.75); c.lineTo(R * 0.06, -R * 1.0); c.stroke();
  } else if (k === 7) {
    leaf(c, -R * 0.02, -R * 0.86, R * 0.5, -0.3); leaf(c, R * 0.02, -R * 0.86, R * 0.4, -1.1);
  } else if (k === 8) {
    for (let i = -3; i <= 3; i++) leaf(c, i * R * 0.07, -R * 0.82, R * 0.36, -1.57 + i * 0.28, '#3a9a3c');
  } else if (k === 9) {
    c.strokeStyle = '#5a7a2a'; c.lineWidth = Math.max(1.5, R * 0.09);
    c.beginPath(); c.moveTo(0, -R * 0.8); c.lineTo(R * 0.08, -R * 1.02); c.stroke();
  }
}

function face(c, R, k) {
  const ey = R * 0.08, ex = R * 0.3, er = Math.max(1.4, R * 0.1);
  c.fillStyle = 'rgba(255,120,130,.35)';
  for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * R * 0.5, R * 0.32, R * 0.16, R * 0.1, 0, 0, 6.2832); c.fill(); }
  c.fillStyle = '#2b1810';
  for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * ex, ey, er, er * 1.25, 0, 0, 6.2832); c.fill(); }
  c.fillStyle = '#fff';
  for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * ex - er * 0.3, ey - er * 0.45, er * 0.38, 0, 6.2832); c.fill(); }
  c.strokeStyle = '#2b1810'; c.lineWidth = Math.max(1.2, R * 0.06); c.lineCap = 'round';
  c.beginPath();
  if (k >= 9) { c.arc(0, R * 0.2, R * 0.2, 0.15, 3.0); } else { c.arc(0, R * 0.26, R * 0.14, 0.2, 2.94); }
  c.stroke();
}

function gloss(c, R) {
  c.save();
  c.translate(-R * 0.36, -R * 0.4); c.rotate(-0.6);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
  g.addColorStop(0, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, 0, R * 0.42, R * 0.24, 0, 0, 6.2832); c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.9)';
  c.beginPath(); c.arc(-R * 0.62, -R * 0.12, Math.max(1, R * 0.06), 0, 6.2832); c.fill();
  // 아래쪽 반사광
  const g2 = c.createRadialGradient(0, R * 0.85, 0, 0, R * 0.85, R * 0.5);
  g2.addColorStop(0, 'rgba(255,255,255,.18)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g2; c.beginPath(); c.arc(0, 0, R * 0.96, 0, 6.2832); c.fill();
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// scale = 논리 1px 이 화면 픽셀 몇 개인지(화면 배율 × 기기 배율). 반환: {body[k], gloss[k], half[k] 반쪽 크기(px)}
export function makeSprites(scale) {
  const out = { scale, body: [], gloss: [], half: [] };
  for (let k = 0; k < RADII.length; k++) {
    const R = RADII[k] * scale;
    const half = Math.ceil(R * 1.12) + 2;
    const size = half * 2;
    const b = canvas(size, size), bc = b.getContext('2d');
    bc.translate(half, half);
    body(bc, R, k);
    const g = canvas(size, size), gc = g.getContext('2d');
    gc.translate(half, half);
    gloss(gc, R);
    out.body.push(b); out.gloss.push(g); out.half.push(half);
  }
  return out;
}

// 한 과일을 (x, y) 에 그린다. 논리 좌표 → ctx 의 현재 변환이 이미 scale 을 곱한 상태라고 가정하고 sprites.scale 로 되돌려 그린다.
export function drawFruit(ctx, sp, k, x, y, ang, grow = 1, alpha = 1) {
  const h = sp.half[k], s = grow / sp.scale;
  ctx.save();
  ctx.translate(x, y);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.scale(s, s);
  if (ang) { ctx.rotate(ang); ctx.drawImage(sp.body[k], -h, -h); ctx.rotate(-ang); } else ctx.drawImage(sp.body[k], -h, -h);
  ctx.drawImage(sp.gloss[k], -h, -h);
  ctx.restore();
}
