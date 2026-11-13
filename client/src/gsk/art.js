// 갱스껄 그림 모듈 (G0). 의존성 없음. 모든 함수는 SVG 문자열을 돌려준다.
//   discBack(color)              원판 뒷면 (꽃·해골 모두 똑같다)
//   discFlower(color)            꽃 원판 앞면
//   discSkull(color, photoUrl)   해골 원판 앞면. 사진이 있으면 가운데 원에 꽉 차게, 없으면 해골 그림
//   mat(color, flipped)          개인판 앞면 / 뒷면(1점, 금색 테두리)
// color = 0..5 (GDD 1절 순서: 초록·보라·노랑·빨강·분홍·파랑).
// 문양은 전부 여기서 새로 그린 것이다(원작 그림을 쓰지 않는다). 무작위 없음(Math.random 금지).
// 사용자 글자는 넣지 않는다. 사진 주소만 속성으로 들어가며 escAttr 로 감싼다.

export const COLORS = [
  { id: 0, key: 'green',  name: '초록', base: '#5fbf3a', dark: '#1d4a1b', deep: '#12300f', light: '#c4ec8c', accent: '#f08a2c' },
  { id: 1, key: 'purple', name: '보라', base: '#7a3fa8', dark: '#35175a', deep: '#220e3c', light: '#cfaaf0', accent: '#eaa53c' },
  { id: 2, key: 'yellow', name: '노랑', base: '#e9a21b', dark: '#7a2c10', deep: '#4a1a0a', light: '#fde7a6', accent: '#c2441a' },
  { id: 3, key: 'red',    name: '빨강', base: '#d42a2a', dark: '#641010', deep: '#3d0909', light: '#f9b592', accent: '#f4b831' },
  { id: 4, key: 'pink',   name: '분홍', base: '#ec2f7d', dark: '#74103f', deep: '#480826', light: '#ffb9d3', accent: '#f9862e' },
  { id: 5, key: 'blue',   name: '파랑', base: '#3e8fa6', dark: '#153744', deep: '#0c232c', light: '#b0e0e8', accent: '#f1e5c4' },
];
export const CREAM = '#f6ecd6';
const GOLD = ['#fff1b8', '#f2c95a', '#b07a1e'];

// 실제 게임 CSS 에 한 번 넣어 쓰는 최소 규칙
export const ART_CSS = '.gk-art-disc,.gk-art-mat{display:block;width:100%;height:100%;overflow:visible}';

let seq = 0;
const uid = () => 'gka' + (++seq).toString(36);
const f = (n) => String(Math.round(n * 10) / 10);
const D = Math.PI / 180;
const pal = (c) => COLORS[((c | 0) % 6 + 6) % 6];
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// n 번 돌려 찍기
const spin = (n, body, off = 0) => {
  let s = '';
  for (let i = 0; i < n; i++) s += `<g transform="rotate(${f(off + i * 360 / n)})">${typeof body === 'function' ? body(i) : body}</g>`;
  return s;
};
// 위(12시)에서 시작해 시계 방향으로 감기는 소용돌이
const spiral = (cx, cy, r0, r1, turns, a0) => {
  const N = Math.ceil(turns * 28);
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = r0 + (r1 - r0) * t, a = (a0 + turns * 360 * t) * D;
    d += (i ? 'L' : 'M') + f(cx + r * Math.sin(a)) + ',' + f(cy - r * Math.cos(a));
  }
  return d;
};
// 가운데에서 바깥으로 뻗는 잎 모양(r0 → r1, 반 너비 w)
const lens = (r0, r1, w) => {
  const m = (r0 + r1) / 2;
  return `M0,${f(-r0)}Q${f(w)},${f(-m)} 0,${f(-r1)}Q${f(-w)},${f(-m)} 0,${f(-r0)}Z`;
};
const annulus = (r1, r2) =>
  `M0,${-r2}A${r2},${r2} 0 1 1 0,${r2}A${r2},${r2} 0 1 1 0,${-r2}ZM0,${-r1}A${r1},${r1} 0 1 0 0,${r1}A${r1},${r1} 0 1 0 0,${-r1}Z`;

// ── 테두리 띠 문양 (반지름 69~91 사이). a = 선 색, b = 점 색 ──
const BAND = [
  // 초록: 사슬 고리
  (a, b) => spin(14, `<circle cy="-80" r="10.5" fill="none" stroke="${a}" stroke-width="2.6"/>`)
    + spin(14, `<circle cy="-80" r="2.7" fill="${b}"/>`),
  // 보라: 마름모 격자
  (a, b) => {
    let p1 = '', p2 = '';
    for (let i = 0; i <= 24; i++) {
      const ang = i * 15 * D, s = Math.sin(ang), c = -Math.cos(ang);
      const ra = i % 2 ? 89 : 71, rb = i % 2 ? 71 : 89;
      p1 += (i ? 'L' : 'M') + f(ra * s) + ',' + f(ra * c);
      p2 += (i ? 'L' : 'M') + f(rb * s) + ',' + f(rb * c);
    }
    return `<path d="${p1}Z" fill="none" stroke="${a}" stroke-width="2" stroke-linejoin="round"/>`
      + `<path d="${p2}Z" fill="none" stroke="${a}" stroke-width="2" stroke-linejoin="round"/>`
      + spin(12, `<path d="M0,-84L3,-80L0,-76L-3,-80Z" fill="${b}"/>`, 7.5)
      + spin(12, `<circle cy="-80" r="1.6" fill="${a}"/>`, 22.5);
  },
  // 노랑: 겹친 아치
  (a, b) => spin(10, `<circle cy="-68" r="20" fill="none" stroke="${a}" stroke-width="3.2"/>`
      + `<circle cy="-68" r="13.5" fill="none" stroke="${b}" stroke-width="3"/>`
      + `<circle cy="-68" r="7" fill="${a}"/>`)
    + spin(10, `<path d="M0,-92L5,-83L-5,-83Z" fill="${a}"/>`, 18),
  // 빨강: 기운 깃
  (a, b) => spin(18, `<path d="M-5,-70Q-7,-84 8,-91Q3,-80 5,-70Z" fill="${a}"/>`)
    + spin(18, `<circle cx="-1" cy="-87" r="1.9" fill="${b}"/>`, 10),
  // 분홍: 가는 살
  (a, b) => spin(22, `<path d="${lens(70, 90, 3.4)}" fill="${a}"/>`)
    + spin(22, `<path d="${lens(72, 84, 2.4)}" fill="${b}"/>`, 360 / 44),
  // 파랑: 물결 고리
  (a, b) => spin(12, `<path d="M-19,-71C-13,-92 11,-93 11,-81C11,-73 2,-73 2,-79" fill="none" stroke="${a}" stroke-width="2.8" stroke-linecap="round"/>`)
    + spin(12, `<circle cx="-4" cy="-72.5" r="1.9" fill="${b}"/>`, 15),
];

// ── 가운데 문양 (반지름 56 기준으로 그린다). a = 주 색, b = 강조 색 ──
const CENTER = [
  // 초록: 다섯 갈래 소용돌이
  (a, b) => spin(5, `<path d="${spiral(0, -29, 29, 3, 1.55, 180)}" fill="none" stroke="${a}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`)
    + `<circle r="6" fill="${b}"/>` + spin(5, `<circle cy="-52" r="2.6" fill="${b}"/>`, 36),
  // 보라: 세 방향 격자와 별
  (a, b, id) => {
    let ln = '';
    for (let k = -3; k <= 3; k++) ln += `<path d="M-56,${k * 14}H56"/>`;
    return `<clipPath id="${id}l"><circle r="50"/></clipPath>`
      + `<g clip-path="url(#${id}l)" fill="none" stroke="${a}" stroke-width="1.5" opacity=".85">${spin(3, ln, 30)}</g>`
      + `<circle r="50" fill="none" stroke="${a}" stroke-width="2"/>`
      + spin(6, `<path d="M0,-37L5,-29L0,-21L-5,-29Z" fill="${b}"/>`)
      + spin(6, `<path d="${lens(3, 19, 4.2)}" fill="${a}"/>`, 30)
      + spin(6, `<circle cy="-44" r="2.2" fill="${a}"/>`, 30)
      + `<circle r="3.4" fill="${b}"/>`;
  },
  // 노랑: 해 바퀴
  (a, b) => spin(18, `<path d="M0,-53L6.4,-37L-6.4,-37Z" fill="${a}"/>`)
    + `<circle r="32" fill="none" stroke="${a}" stroke-width="3.4"/>`
    + spin(8, `<path d="${lens(8, 28, 6.5)}" fill="${b}"/>`)
    + spin(8, `<circle cy="-23" r="1.8" fill="${a}"/>`, 22.5)
    + `<circle r="6.5" fill="${a}"/>`,
  // 빨강: 일곱 날 바람개비
  (a, b) => spin(7, `<path d="M0,-7C15,-14 25,-32 12,-53C8,-37 1,-24 -7,-11Z" fill="${a}"/>`
      + `<path d="M3,-14C11,-22 15,-33 12,-45" fill="none" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>`)
    + `<circle r="7" fill="${b}"/><circle r="3" fill="${a}"/>`,
  // 분홍: 터지는 살
  (a, b) => spin(20, `<path d="${lens(11, 53, 3.6)}" fill="${a}"/>`)
    + spin(20, `<path d="${lens(15, 40, 2.4)}" fill="${b}"/>`, 9)
    + `<circle r="9" fill="${b}"/><circle r="4.5" fill="${a}"/>`,
  // 파랑: 여섯 물굽이
  (a, b) => spin(6, `<path d="${spiral(0, -32, 23, 2.5, 1.9, 180)}" fill="none" stroke="${a}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`)
    + spin(6, `<circle cy="-51" r="2.4" fill="${b}"/>`, 30)
    + `<circle r="9" fill="none" stroke="${a}" stroke-width="3.2"/><circle r="3.2" fill="${b}"/>`,
];

// ── 꽃 (가운데 원 반지름 64 안) ──
const PETALS = [8, 6, 12, 5, 10, 7];
function flowerArt(p) {
  const n = PETALS[p.id], w = Math.min(17, 118 / n);
  const pop = p.id === 5 ? '#e9a94a' : p.accent;
  return spin(n, `<path d="${lens(6, 57, w * 1.05)}" fill="${p.dark}"/>`)
    + spin(n, `<path d="${lens(8, 52, w * .78)}" fill="${p.base}"/>`)
    + spin(n, `<path d="M0,-14V-44" stroke="${p.dark}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`)
    + spin(n, `<path d="${lens(6, 40, w * .62)}" fill="${p.dark}"/><path d="${lens(8, 36, w * .42)}" fill="${pop}"/>`, 180 / n)
    + `<circle r="12.5" fill="${p.dark}"/>`
    + spin(8, `<circle cy="-7.6" r="1.9" fill="${CREAM}"/>`)
    + `<circle r="3.6" fill="${pop}"/>`;
}

// ── 문양형 해골 (가운데 원 반지름 64 안). bone = 뼈 색, ink = 구멍 색, pop = 장식 색 ──
function skullArt(bone, ink, pop) {
  return `<path d="M0,-47C27,-47 39,-29 39,-9C39,6 33,14 25,18L23,33C23,40 16,43 0,43C-16,43 -23,40 -23,33L-25,18C-33,14 -39,6 -39,-9C-39,-29 -27,-47 0,-47Z" fill="${bone}"/>`
    // 눈: 꽃잎 테를 두른 구멍
    + [-16, 16].map((x) => `<g transform="translate(${x} -5)"><circle r="11.5" fill="${ink}"/>`
      + spin(8, `<circle cy="-6.6" r="1.5" fill="${pop}"/>`) + `<circle r="2.6" fill="${bone}"/></g>`).join('')
    // 코
    + `<path d="M0,8L6.5,20Q0,23.5 -6.5,20Z" fill="${ink}"/>`
    // 이
    + `<path d="M-16,30.5H16M-10.5,25.5V36M-5.2,25V37M0,25V37.5M5.2,25V37M10.5,25.5V36" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round"/>`
    // 이마·볼 장식
    + `<path d="M0,-40L5,-32L0,-24L-5,-32Z" fill="${pop}"/>`
    + `<path d="M-12,-33Q-20,-32 -25,-25M12,-33Q20,-32 25,-25" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/>`
    + `<circle cx="-31" cy="8" r="2" fill="${pop}"/><circle cx="31" cy="8" r="2" fill="${pop}"/>`;
}

// 빛(왼쪽 위 밝게, 오른쪽 아래 어둡게)
const sheen = (id) => `<radialGradient id="${id}s" cx=".32" cy=".26" r=".95">`
  + '<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>'
  + '<stop offset="1" stop-color="#000" stop-opacity=".26"/></radialGradient>';

const open = (cls, box) => `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${box}" aria-hidden="true" focusable="false">`;

// 원판 공통 틀. face = 'back' | 'front'
function disc(p, id, face, middle) {
  const back = face === 'back';
  const bandBg = back ? p.dark : CREAM;
  const line = back ? p.base : p.dark;
  const dot = back ? p.light : (p.id === 5 ? p.base : p.accent);
  return open('gk-art-disc', '0 0 200 200') + `<defs>${sheen(id)}</defs><g transform="translate(100 100)">`
    + `<circle r="99" fill="${p.deep}"/><circle r="97" fill="${p.base}"/>`
    + `<circle r="93" fill="${bandBg}"/>`
    + `<clipPath id="${id}b"><path d="${annulus(67, 93)}" clip-rule="evenodd"/></clipPath>`
    + `<g clip-path="url(#${id}b)">${BAND[p.id](line, dot)}</g>`
    + `<circle r="93" fill="none" stroke="${back ? p.light : p.dark}" stroke-width="1.4" opacity="${back ? '.55' : '.8'}"/>`
    + middle
    + `<circle r="99" fill="url(#${id}s)"/></g></svg>`;
}

export function discBack(color) {
  const p = pal(color), id = uid();
  return disc(p, id, 'back',
    `<circle r="67" fill="${p.base}"/><circle r="67" fill="none" stroke="${p.deep}" stroke-width="2.4"/>`
    + `<circle r="60.5" fill="${p.dark}"/><circle r="60.5" fill="none" stroke="${p.light}" stroke-width="1.2" opacity=".6"/>`
    + `<g transform="scale(.98)">${CENTER[p.id](p.base, p.light, id)}</g>`);
}

export function discFlower(color) {
  const p = pal(color), id = uid();
  return disc(p, id, 'front',
    `<circle r="67" fill="${p.base}"/><circle r="67" fill="none" stroke="${p.deep}" stroke-width="2.4"/>`
    + `<circle r="62.5" fill="${CREAM}"/>`
    + spin(24, `<circle cy="-58.6" r="1.25" fill="${p.base}" opacity=".7"/>`)
    + `<g transform="scale(.96)">${flowerArt(p)}</g>`);
}

export function discSkull(color, photoUrl) {
  const p = pal(color), id = uid();
  const pop = p.id === 5 ? '#e9a94a' : p.accent;
  let mid = `<circle r="67" fill="${p.base}"/><circle r="67" fill="none" stroke="${p.deep}" stroke-width="2.4"/>`;
  if (photoUrl) {
    // 사진: 가운데 원(반지름 64)에 꽉 차게(cover). 아래 띠에 작은 해골 표시를 얹어 "이 사진이 해골"임을 알린다.
    mid += `<clipPath id="${id}p"><circle r="64"/></clipPath>`
      + `<circle r="64" fill="${p.deep}"/>`
      + `<image href="${escAttr(photoUrl)}" x="-64" y="-64" width="128" height="128" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}p)"/>`
      + `<circle r="64" fill="none" stroke="${CREAM}" stroke-width="2"/>`
      + `<g transform="translate(0 78)"><circle r="16.5" fill="${p.deep}"/><circle r="16.5" fill="none" stroke="${CREAM}" stroke-width="1.8"/>`
      + `<g transform="scale(.27) translate(0 2)">${skullArt(CREAM, p.deep, pop)}</g></g>`;
  } else {
    mid += `<circle r="62.5" fill="${p.deep}"/>`
      + spin(24, `<circle cy="-58.6" r="1.25" fill="${p.base}"/>`)
      + `<g transform="scale(1.02) translate(0 1)">${skullArt(CREAM, p.deep, pop)}</g>`;
  }
  return disc(p, id, 'front', mid);
}

// 개인판 모서리 장식
const corner = (line, fill) => `<circle r="11" fill="none" stroke="${line}" stroke-width="1.6"/>`
  + spin(6, `<path d="${lens(2, 9, 2.6)}" fill="${fill}"/>`)
  + `<path d="M15,0Q26,-2 34,6M0,15Q-2,26 6,34" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/>`
  + `<circle cx="38" cy="9" r="1.7" fill="${fill}"/><circle cx="9" cy="38" r="1.7" fill="${fill}"/>`;
const corners = (line, fill) => [[30, 30, 0], [210, 30, 90], [210, 210, 180], [30, 210, 270]]
  .map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${corner(line, fill)}</g>`).join('');

export function mat(color, flipped) {
  const p = pal(color), id = uid();
  const defs = `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1">`
    + '<stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>'
    + '<stop offset="1" stop-color="#000" stop-opacity=".24"/></linearGradient>'
    + (flipped ? `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD[0]}"/>`
      + `<stop offset=".45" stop-color="${GOLD[1]}"/><stop offset="1" stop-color="${GOLD[2]}"/></linearGradient>` : '');
  let body;
  if (!flipped) {
    body = `<rect x="2" y="2" width="236" height="236" rx="24" fill="${p.dark}"/>`
      + `<rect x="4" y="4" width="232" height="232" rx="22" fill="${p.base}"/>`
      + `<rect x="13" y="13" width="214" height="214" rx="15" fill="none" stroke="${p.light}" stroke-width="1.6" opacity=".75"/>`
      + `<rect x="18.5" y="18.5" width="203" height="203" rx="11" fill="none" stroke="${p.dark}" stroke-width="2.2" stroke-dasharray=".1 7" stroke-linecap="round" opacity=".7"/>`
      + corners(p.light, p.light)
      + `<g transform="translate(120 120)"><circle r="84" fill="${p.light}" opacity=".5"/><circle r="80" fill="${p.dark}"/>`
      + `<circle r="73" fill="none" stroke="${p.base}" stroke-width="1.5" opacity=".8"/>`
      + `<g transform="scale(1.2)">${CENTER[p.id](p.base, p.light, id)}</g></g>`;
  } else {
    const g = `url(#${id}g)`;
    body = `<rect x="2" y="2" width="236" height="236" rx="24" fill="${GOLD[2]}"/>`
      + `<rect x="4" y="4" width="232" height="232" rx="22" fill="${g}"/>`
      + `<rect x="13" y="13" width="214" height="214" rx="15" fill="${p.deep}"/>`
      + `<rect x="18.5" y="18.5" width="203" height="203" rx="11" fill="none" stroke="${g}" stroke-width="1.6"/>`
      + corners(GOLD[1], GOLD[0])
      + [0, 90, 180, 270].map((r) => `<path transform="rotate(${r} 120 120)" d="M120,22L126,30L120,38L114,30Z" fill="${g}"/>`).join('')
      + `<g transform="translate(120 120)"><circle r="85" fill="${g}"/><circle r="79" fill="${p.base}"/>`
      + `<circle r="73" fill="none" stroke="${GOLD[0]}" stroke-width="1.6"/>`
      + spin(36, `<path d="M0,-79L2.6,-74L0,-69L-2.6,-74Z" fill="${GOLD[0]}"/>`)
      + `<g transform="scale(1.12)">${CENTER[p.id](p.deep, GOLD[0], id)}</g></g>`;
  }
  return open('gk-art-mat', '0 0 240 240') + `<defs>${defs}</defs>${body}`
    + `<rect x="2" y="2" width="236" height="236" rx="24" fill="url(#${id}s)"/></svg>`;
}

// 작은 해골 표시(상태 줄·안내용). 색은 글자 색(currentColor)을 따른다.
export function skullIcon() {
  return open('gk-art-icon', '-50 -50 100 100') + skullArt('currentColor', '#17110a', '#17110a') + '</svg>';
}
