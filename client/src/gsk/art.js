// 갱스껄 조각 그림 — 사용자가 만든 그림(design/gsk/ref/ref-7-user-final.webp)을 잘라 쓴다.
// 자르는 법은 scripts/gsk-cut.py. 이 파일은 그림 주소와 "해골 원판에 프로필 사진 넣기"만 한다.
// 의존성 없음. 브라우저 전용 API(Image·canvas·fetch)는 함수 안에서만 쓴다(node 에서 import 만 해도 오류 없음).
// color = 0..5 (그림의 줄 순서: 초록·보라·노랑·빨강·파랑·주황).

// base 는 개인판 앞면의 대표색(그림에서 뽑음). flower 는 꽃 원판의 꽃 이름.
export const COLORS = [
  { id: 0, key: 'green',  name: '초록', flower: '연꽃',     base: '#74b940' },
  { id: 1, key: 'purple', name: '보라', flower: '장미',     base: '#8e4fa4' },
  { id: 2, key: 'yellow', name: '노랑', flower: '해바라기', base: '#e4930d' },
  { id: 3, key: 'red',    name: '빨강', flower: '백합',     base: '#d61b18' },
  { id: 4, key: 'blue',   name: '파랑', flower: '히비스커스', base: '#3da0bc' },
  { id: 5, key: 'orange', name: '주황', flower: '금잔화',   base: '#e8640c' },
];

// Vite 가 주소를 알아보도록 파일마다 글자 그대로 적는다.
const DISC_BACK = [
  new URL('./img/disc-back-0.png', import.meta.url).href,
  new URL('./img/disc-back-1.png', import.meta.url).href,
  new URL('./img/disc-back-2.png', import.meta.url).href,
  new URL('./img/disc-back-3.png', import.meta.url).href,
  new URL('./img/disc-back-4.png', import.meta.url).href,
  new URL('./img/disc-back-5.png', import.meta.url).href,
];
const DISC_FLOWER = [
  new URL('./img/disc-flower-0.png', import.meta.url).href,
  new URL('./img/disc-flower-1.png', import.meta.url).href,
  new URL('./img/disc-flower-2.png', import.meta.url).href,
  new URL('./img/disc-flower-3.png', import.meta.url).href,
  new URL('./img/disc-flower-4.png', import.meta.url).href,
  new URL('./img/disc-flower-5.png', import.meta.url).href,
];
const DISC_SKULL = [
  new URL('./img/disc-skull-0.png', import.meta.url).href,
  new URL('./img/disc-skull-1.png', import.meta.url).href,
  new URL('./img/disc-skull-2.png', import.meta.url).href,
  new URL('./img/disc-skull-3.png', import.meta.url).href,
  new URL('./img/disc-skull-4.png', import.meta.url).href,
  new URL('./img/disc-skull-5.png', import.meta.url).href,
];
const MAT_FRONT = [
  new URL('./img/mat-front-0.png', import.meta.url).href,
  new URL('./img/mat-front-1.png', import.meta.url).href,
  new URL('./img/mat-front-2.png', import.meta.url).href,
  new URL('./img/mat-front-3.png', import.meta.url).href,
  new URL('./img/mat-front-4.png', import.meta.url).href,
  new URL('./img/mat-front-5.png', import.meta.url).href,
];
const MAT_BACK = [
  new URL('./img/mat-back-0.png', import.meta.url).href,
  new URL('./img/mat-back-1.png', import.meta.url).href,
  new URL('./img/mat-back-2.png', import.meta.url).href,
  new URL('./img/mat-back-3.png', import.meta.url).href,
  new URL('./img/mat-back-4.png', import.meta.url).href,
  new URL('./img/mat-back-5.png', import.meta.url).href,
];
const FLOOR = new URL('./img/floor.webp', import.meta.url).href;
const FLOOR_TILE = new URL('./img/floor-tile.webp', import.meta.url).href;
const META = new URL('./img/meta.json', import.meta.url).href;

// 해골·꽃 원판 가운데 원(사진 자리). 이미지 크기 대비 비율. 값은 img/meta.json 이 기준(scripts/gsk-cut.py 가 잼).
const HOLE_FALLBACK = { cx: 0.5, cy: 0.5, r: 0.397 };

const ci = (c) => {
  const n = c | 0;
  return n < 0 ? 0 : n > 5 ? 5 : n;
};

export const discBackUrl = (c) => DISC_BACK[ci(c)];
export const discFlowerUrl = (c) => DISC_FLOWER[ci(c)];
export const discSkullUrl = (c) => DISC_SKULL[ci(c)];
export const matUrl = (c, flipped) => (flipped ? MAT_BACK : MAT_FRONT)[ci(c)];
export const floorUrl = () => FLOOR;
export const floorTileUrl = () => FLOOR_TILE;

export const ALL_URLS = () => [
  ...DISC_BACK, ...DISC_FLOWER, ...DISC_SKULL, ...MAT_FRONT, ...MAT_BACK, FLOOR, FLOOR_TILE,
];

function loadImage(url, cors) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image'));
    im.src = url;
  });
}

// 모든 조각 그림을 미리 불러온다(실패해도 끝까지 간다).
export function preload() {
  if (typeof Image === 'undefined') return Promise.resolve();
  return Promise.all(ALL_URLS().map((u) => loadImage(u).catch(() => null))).then(() => undefined);
}

let metaPromise = null;
function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch(META)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return metaPromise;
}

const photoCache = new Map();

// 그 색 해골 원판 가운데 원에 프로필 사진을 원형으로 꽉 차게(cover, 가운데) 넣은 그림 주소(Promise).
// 같은 (c, photoUrl) 은 한 번만 만든다. 사진을 못 불러오면 그림 해골 주소를 그대로 돌려준다.
export function skullPhotoUrl(c, photoUrl) {
  const base = discSkullUrl(c);
  if (!photoUrl || typeof document === 'undefined') return Promise.resolve(base);
  const key = ci(c) + '|' + photoUrl;
  let p = photoCache.get(key);
  if (!p) {
    p = makeSkullPhoto(ci(c), photoUrl, base).catch(() => base);
    photoCache.set(key, p);
  }
  return p;
}

async function makeSkullPhoto(c, photoUrl, base) {
  const isLocal = /^(data|blob):/.test(photoUrl);
  const [disc, photo, meta] = await Promise.all([loadImage(base), loadImage(photoUrl, !isLocal), loadMeta()]);
  const hole = (meta && meta.skullHole && meta.skullHole[c]) || HOLE_FALLBACK;
  const w = disc.naturalWidth || disc.width;
  const h = disc.naturalHeight || disc.height;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.drawImage(disc, 0, 0, w, h);
  const cx = hole.cx * w;
  const cy = hole.cy * h;
  const r = hole.r * w;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#120d0a';
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  const pw = photo.naturalWidth || photo.width;
  const ph = photo.naturalHeight || photo.height;
  const k = (r * 2) / Math.min(pw, ph); // cover: 짧은 쪽이 원 지름에 맞는다
  const dw = pw * k;
  const dh = ph * k;
  g.imageSmoothingQuality = 'high';
  g.drawImage(photo, cx - dw / 2, cy - dh / 2, dw, dh);
  // 아주 얇은 안쪽 그림자
  const edge = Math.max(2, w * 0.018);
  const grad = g.createRadialGradient(cx, cy, r - edge, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = grad;
  g.fillRect(cx - r, cy - r, r * 2, r * 2);
  g.restore();
  return cv.toDataURL('image/png');
}
