// 갱스껄 그림 모듈 (G0, 2차 시안). 의존성 없음. SVG 필터를 쓰지 않는다(그라디언트·패턴만).
//
// SVG 문자열을 돌려주는 함수(1차와 같은 이름·같은 반환 형태):
//   discBack(color)              원판 뒷면 (꽃·해골 모두 똑같다)
//   discFlower(color)            꽃 원판 앞면 (색마다 다른 우리 꽃)
//   discSkull(color, photoUrl)   해골 원판 앞면. 사진이 있으면 가운데 원에 꽉 차게, 없으면 장식 해골
//   mat(color, flipped)          개인판 앞면 / 뒷면(1점, 흰·금 테두리)
//   skullIcon()                  작은 해골 표시(글자 색)
//   skullMarker()                탁자 가운데 큰 장식 해골 (새로 추가)
//
// 빠르게 쓰는 방법(새로 추가): 같은 그림을 색마다 한 번만 만들어 data URL 로 기억해 둔다.
// <img src> 나 background-image 로 쓰면 브라우저가 한 번만 그려 둔다.
//   discBackUrl(color) · discFlowerUrl(color) · discSkullUrl(color) · matUrl(color, flipped) · skullMarkerUrl()
//   (사진이 든 해골만 discSkull(color, photoUrl) 의 SVG 를 그대로 넣는다. 한 화면에 몇 장뿐이다.)
//
// color = 0..5 (GDD 1절 순서: 초록·보라·노랑·빨강·분홍·파랑).
// 그림·문양은 전부 여기서 새로 그린 것이다(원작 그림을 쓰지 않는다). 무작위 없음.
// 사용자 글자는 넣지 않는다. 사진 주소만 속성으로 들어가며 escAttr 로 감싼다.

// base 원판 테두리·이름 색 / dark·deep 어두운 바탕 / light 밝은 장식 / soft 개인판 바탕 / accent 강조 점
export const COLORS = [
  { id: 0, key: 'green',  name: '초록', flower: '목련', base: '#3f8a4c', dark: '#1f4d2c', deep: '#10281a', light: '#b4dba6', soft: '#7fb287', accent: '#e58a3a' },
  { id: 1, key: 'purple', name: '보라', flower: '모란', base: '#6b4a9c', dark: '#3a2562', deep: '#1f1338', light: '#cbb8ea', soft: '#9a83c4', accent: '#e0a84a' },
  { id: 2, key: 'yellow', name: '노랑', flower: '국화', base: '#d49a2a', dark: '#7a4a12', deep: '#3d240a', light: '#f6dfa0', soft: '#d9b866', accent: '#c2502c' },
  { id: 3, key: 'red',    name: '빨강', flower: '동백', base: '#b8322e', dark: '#6e1817', deep: '#380b0c', light: '#f0b49a', soft: '#cc6c5e', accent: '#e9b548' },
  { id: 4, key: 'pink',   name: '분홍', flower: '연꽃', base: '#cf4f86', dark: '#7a2148', deep: '#3f0f26', light: '#f7c2d5', soft: '#dc8aac', accent: '#f09a4a' },
  { id: 5, key: 'blue',   name: '파랑', flower: '수국', base: '#2f7f96', dark: '#164656', deep: '#0b2530', light: '#aadbe4', soft: '#74b0c1', accent: '#efe2bd' },
];
export const CREAM = '#f4ecd8';
const GOLD = ['#fff1b8', '#f2c444', '#a9781f'];
const INK = '#120d0a';

// 실제 게임 CSS 에 한 번 넣어 쓰는 최소 규칙
export const ART_CSS = '.gk-art-disc,.gk-art-mat,.gk-art-marker,.gk-art-icon{display:block;width:100%;height:100%;overflow:visible}';

// 인쇄 결(48x48 회색+투명 PNG, 스크립트로 만든 점 무늬). 패턴으로 깔아 종이 질감을 낸다.
const GRAIN = 'data:image/png;base64,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';

let seq = 0;
const uid = () => 'gka' + (++seq).toString(36);
const f = (n) => String(Math.round(n * 10) / 10);
const D = Math.PI / 180;
const pal = (c) => COLORS[((c | 0) % 6 + 6) % 6];
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

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
// 끝이 뾰족한 꽃잎(t = 가장 넓은 곳의 위치 0~1)
const pet = (r0, r1, w, t = .55) => {
  const m = r0 + (r1 - r0) * t, a = -r0 - (m - r0) * .35, b = -m - (r1 - m) * .55;
  return `M0,${f(-r0)}C${f(w)},${f(a)} ${f(w)},${f(b)} 0,${f(-r1)}C${f(-w)},${f(b)} ${f(-w)},${f(a)} 0,${f(-r0)}Z`;
};
// 끝이 둥근 꽃잎
const rpet = (r0, r1, w) => {
  const a = -r0 - (r1 - r0) * .22;
  return `M0,${f(-r0)}C${f(w * 1.1)},${f(a)} ${f(w * 1.25)},${f(-r1)} 0,${f(-r1)}C${f(-w * 1.25)},${f(-r1)} ${f(-w * 1.1)},${f(a)} 0,${f(-r0)}Z`;
};
// 끝이 두 갈래로 주름진 꽃잎
const ruf = (r0, r1, w) => {
  const a = -r0 - (r1 - r0) * .25;
  return `M0,${f(-r0)}C${f(w)},${f(a)} ${f(w * 1.35)},${f(-r1 + 5)} ${f(w * .55)},${f(-r1)}Q${f(w * .25)},${f(-r1 + 4)} 0,${f(-r1 + 1.5)}`
    + `Q${f(-w * .25)},${f(-r1 + 4)} ${f(-w * .55)},${f(-r1)}C${f(-w * 1.35)},${f(-r1 + 5)} ${f(-w)},${f(a)} 0,${f(-r0)}Z`;
};
const arc = (r, a0, a1) => {
  const x0 = r * Math.sin(a0 * D), y0 = -r * Math.cos(a0 * D), x1 = r * Math.sin(a1 * D), y1 = -r * Math.cos(a1 * D);
  return `M${f(x0)},${f(y0)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)},${f(y1)}`;
};

// ── 띠 문양 6가지 (반지름 r0~r1 사이를 채운다). a = 주 색, b = 점 색, c = 강조 색 ──
const BAND = [
  // 0 물결 아치
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(2 * Math.PI * m / (h * 1.12)), w = Math.PI * m / n * .9;
    return spin(n, `<path d="M${f(-w)},${f(-r0 - .5)}Q${f(-w)},${f(-r1 + 1)} 0,${f(-r1 + 1)}Q${f(w)},${f(-r1 + 1)} ${f(w)},${f(-r0 - .5)}" fill="none" stroke="${a}" stroke-width="${f(h * .13)}"/>`
        + `<circle cy="${f(-r0 - h * .4)}" r="${f(h * .15)}" fill="${b}"/>`)
      + spin(n, `<circle cy="${f(-r1 + h * .14)}" r="${f(h * .075)}" fill="${c}"/>`, 180 / n);
  },
  // 1 톱니
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(2 * Math.PI * m / (h * .78)), w = Math.PI * m / n * .86;
    return spin(n, `<path d="M${f(-w)},${f(-r0 - .6)}L0,${f(-r1 + 1.2)}L${f(w)},${f(-r0 - .6)}Z" fill="${a}"/>`
        + `<circle cy="${f(-r0 - h * .3)}" r="${f(h * .085)}" fill="${c}"/>`)
      + spin(n, `<circle cy="${f(-r1 + h * .2)}" r="${f(h * .09)}" fill="${b}"/>`, 180 / n);
  },
  // 2 긴 살·짧은 살
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(Math.PI * m / (h * .44)) * 2;
    return spin(n, (i) => i % 2
      ? `<path d="M0,${f(-r0 - 1.5)}V${f(-r0 - h * .5)}" stroke="${c}" stroke-width="${f(h * .15)}" stroke-linecap="round"/><circle cy="${f(-r1 + h * .22)}" r="${f(h * .1)}" fill="${b}"/>`
      : `<path d="M0,${f(-r0 - 1.5)}V${f(-r1 + 1.5)}" stroke="${a}" stroke-width="${f(h * .17)}" stroke-linecap="round"/>`);
  },
  // 3 기운 잎 사슬
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(2 * Math.PI * m / (h * .92));
    return spin(n, `<g transform="translate(0 ${f(-m)}) rotate(38)"><path d="M0,${f(h * .46)}Q${f(h * .33)},0 0,${f(-h * .46)}Q${f(-h * .33)},0 0,${f(h * .46)}Z" fill="${a}"/>`
        + `<path d="M0,${f(h * .3)}V${f(-h * .3)}" stroke="${c}" stroke-width="${f(h * .05)}"/></g>`)
      + spin(n, `<circle cy="${f(-r1 + h * .2)}" r="${f(h * .08)}" fill="${b}"/><circle cy="${f(-r0 - h * .2)}" r="${f(h * .06)}" fill="${b}"/>`, 180 / n);
  },
  // 4 구슬
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(2 * Math.PI * m / (h * .66));
    return spin(n, `<circle cy="${f(-m)}" r="${f(h * .25)}" fill="${a}"/><circle cy="${f(-m)}" r="${f(h * .1)}" fill="${c}"/>`)
      + spin(n, `<circle cy="${f(-r1 + h * .13)}" r="${f(h * .065)}" fill="${b}"/><circle cy="${f(-r0 - h * .13)}" r="${f(h * .065)}" fill="${b}"/>`, 180 / n);
  },
  // 5 겹물결
  (r0, r1, a, b, c) => {
    const h = r1 - r0, m = (r0 + r1) / 2, n = Math.round(2 * Math.PI * m / (h * 1.5));
    const wave = (ph) => {
      let d = '';
      const N = n * 16;
      for (let i = 0; i <= N; i++) {
        const t = i / N * 2 * Math.PI, r = m + h * .3 * Math.sin(t * n + ph);
        d += (i ? 'L' : 'M') + f(r * Math.sin(t)) + ',' + f(-r * Math.cos(t));
      }
      return d + 'Z';
    };
    return `<path d="${wave(0)}" fill="none" stroke="${a}" stroke-width="${f(h * .13)}" stroke-linejoin="round"/>`
      + `<path d="${wave(Math.PI)}" fill="none" stroke="${c}" stroke-width="${f(h * .07)}" stroke-linejoin="round"/>`
      + spin(n, `<circle cy="${f(-m)}" r="${f(h * .1)}" fill="${b}"/>`, 90 / n) + spin(n, `<circle cy="${f(-m)}" r="${f(h * .1)}" fill="${b}"/>`, 270 / n);
  },
];

// ── 뒷면·개인판 가운데 문양 (반지름 56 기준). a = 주 색, b = 강조 색 ──
const CENTER = [
  // 초록: 다섯 갈래 소용돌이
  (a, b) => spin(5, `<path d="${spiral(0, -29, 29, 3, 1.55, 180)}" fill="none" stroke="${a}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`)
    + spin(10, `<path d="${lens(46, 55, 2.6)}" fill="${a}"/>`, 18)
    + `<circle r="6" fill="${b}"/>` + spin(5, `<circle cy="-52" r="2.6" fill="${b}"/>`, 36),
  // 보라: 세 방향 격자와 별
  (a, b, id) => {
    let ln = '';
    for (let k = -3; k <= 3; k++) ln += `<path d="M-56,${k * 14}H56"/>`;
    return `<clipPath id="${id}l"><circle r="50"/></clipPath>`
      + `<g clip-path="url(#${id}l)" fill="none" stroke="${a}" stroke-width="1.5" opacity=".8">${spin(3, ln, 30)}</g>`
      + `<circle r="50" fill="none" stroke="${a}" stroke-width="2"/>`
      + spin(6, `<path d="M0,-37L5,-29L0,-21L-5,-29Z" fill="${b}"/>`)
      + spin(6, `<path d="${lens(3, 19, 4.2)}" fill="${a}"/>`, 30)
      + spin(6, `<circle cy="-44" r="2.2" fill="${a}"/>`, 30)
      + `<circle r="3.4" fill="${b}"/>`;
  },
  // 노랑: 해 바퀴
  (a, b) => spin(18, `<path d="M0,-53L6.4,-37L-6.4,-37Z" fill="${a}"/>`)
    + `<circle r="32" fill="none" stroke="${a}" stroke-width="3.2"/>`
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

// ── 꽃 6가지 (반지름 47 안에 그린다). 위에서 내려다본 모습 ──
const rg = (id, k, stops, r = 47) => `<radialGradient id="${id}${k}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${r}">`
  + stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</radialGradient>';
const leaves = (id, angs, c1, c2, r0 = 16, r1 = 48, w = 10) =>
  `<linearGradient id="${id}lf" gradientUnits="userSpaceOnUse" x1="-8" y1="0" x2="8" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`
  + angs.map((a) => `<g transform="rotate(${a})"><path d="${pet(r0, r1, w, .5)}" fill="url(#${id}lf)" stroke="${INK}" stroke-width=".8" stroke-opacity=".6"/>`
    + `<path d="M0,${-r0 - 3}V${-r1 + 4}" stroke="${mix(c2, '#ffffff', .35)}" stroke-width=".9" opacity=".8"/>`
    + [0.35, 0.55, 0.75].map((t) => { const y = -(r0 + (r1 - r0) * t); return `<path d="M0,${f(y)}l${f(w * .45)},${f(-w * .4)}M0,${f(y)}l${f(-w * .45)},${f(-w * .4)}" stroke="${mix(c2, '#ffffff', .3)}" stroke-width=".6" opacity=".6"/>`; }).join('')
    + '</g>').join('');
const layer = (n, d, fill, line, off = 0, vein = null) =>
  spin(n, `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width=".8"/>` + (vein ? `<path d="M0,${f(-vein[0])}V${f(-vein[1])}" stroke="${line}" stroke-width=".7" opacity=".45" stroke-linecap="round"/>` : ''), off);
const stamens = (r, n, stem, tip, core) => `<circle r="${r}" fill="${core}"/>`
  + spin(n, `<path d="M0,-${f(r * .3)}V-${f(r * .95)}" stroke="${stem}" stroke-width="1" stroke-linecap="round"/><circle cy="-${f(r)}" r="${f(r * .17)}" fill="${tip}"/>`)
  + spin(Math.round(n / 2), `<circle cy="-${f(r * .5)}" r="${f(r * .13)}" fill="${tip}"/>`, 180 / n) + `<circle r="${f(r * .2)}" fill="${tip}"/>`;

const FLOWER = [
  // 초록: 목련 — 크림빛 둥근 꽃잎 여섯 + 셋
  (id) => rg(id, 'a', [[0, '#e7b9a4'], [.35, '#f7ead0'], [1, '#fffaf0']]) + rg(id, 'b', [[0, '#e9c4a8'], [.5, '#fbf1dc'], [1, '#ffffff']], 32)
    + leaves(id, [30, 150, 270], '#2f7a45', '#5fae5a', 20, 49, 11)
    + layer(6, rpet(7, 45, 13.5), `url(#${id}a)`, '#9c8763', 0, [14, 36])
    + layer(3, rpet(5, 30, 11.5), `url(#${id}b)`, '#9c8763', 30, [10, 23])
    + `<circle r="8" fill="#b88a2c" stroke="#6b4a12" stroke-width=".8"/>` + spin(9, `<path d="${lens(2, 7.4, 1.7)}" fill="#f4d67a"/>`) + '<circle r="2" fill="#7d5a14"/>',
  // 보라: 모란 — 주름진 꽃잎이 겹겹이
  (id) => rg(id, 'a', [[0, '#3d2168'], [.5, '#7d57b8'], [1, '#c4a6ea']])
    + leaves(id, [45, 135, 225, 315], '#2c6a44', '#58a065', 22, 49, 9)
    + layer(8, ruf(10, 45, 12), `url(#${id}a)`, '#2c174d', 0, [20, 36])
    + layer(7, ruf(8, 37, 11.5), `url(#${id}a)`, '#2c174d', 26, [16, 29])
    + layer(6, ruf(6, 29, 10.5), `url(#${id}a)`, '#2c174d', 8, [12, 22])
    + layer(5, ruf(4, 21, 9), `url(#${id}a)`, '#2c174d', 36)
    + stamens(8, 12, '#c98f2a', '#ffe08a', '#6a3d10'),
  // 노랑: 국화 — 가는 꽃잎 네 겹
  (id) => rg(id, 'a', [[0, '#9a5510'], [.45, '#e0a22c'], [1, '#fbe08a']])
    + leaves(id, [60, 180, 300], '#3c6e2e', '#7aa646', 24, 49, 9)
    + layer(24, pet(12, 46, 4.7, .62), `url(#${id}a)`, '#6e3d0c')
    + layer(20, pet(9, 38, 4.5, .62), `url(#${id}a)`, '#6e3d0c', 9)
    + layer(16, pet(6, 30, 4.3, .62), `url(#${id}a)`, '#6e3d0c', 3)
    + layer(12, pet(3, 21, 4, .62), `url(#${id}a)`, '#6e3d0c', 15)
    + '<circle r="6.5" fill="#7a4a12"/>' + spin(8, '<circle cy="-3.6" r="1.1" fill="#f6d778"/>') + '<circle r="1.4" fill="#f6d778"/>',
  // 빨강: 동백 — 둥근 붉은 꽃잎과 금빛 꽃술
  (id) => rg(id, 'a', [[0, '#5c0f10'], [.5, '#b02a27'], [1, '#e8695a']])
    + leaves(id, [50, 170, 285], '#1f5a36', '#4d9a55', 20, 50, 12)
    + layer(6, rpet(8, 44, 15), `url(#${id}a)`, '#4a0b0c', 0, [20, 36])
    + layer(5, rpet(6, 33, 13), `url(#${id}a)`, '#4a0b0c', 30, [16, 26])
    + layer(3, rpet(4, 22, 10.5), `url(#${id}a)`, '#4a0b0c', 12)
    + stamens(10, 16, '#d7a130', '#ffe69a', '#7a4a12'),
  // 분홍: 연꽃 — 뾰족한 꽃잎 세 겹과 연밥
  (id) => rg(id, 'a', [[0, '#fff0f3'], [.5, '#f3a9c4'], [1, '#c9477f']])
    + `<circle r="47.5" fill="#2c6a4a" stroke="${INK}" stroke-width=".8" stroke-opacity=".6"/><path d="M0,0L-9,-48L9,-48Z" fill="${INK}" opacity=".55"/>`
    + spin(14, '<path d="M0,-14V-46" stroke="#69aa74" stroke-width=".7" opacity=".7"/>', 12.9)
    + layer(10, pet(10, 46, 9.5, .5), `url(#${id}a)`, '#7a2148', 0, [18, 38])
    + layer(10, pet(8, 37, 8.6, .5), `url(#${id}a)`, '#7a2148', 18, [14, 30])
    + layer(8, pet(5, 27, 7.4, .5), `url(#${id}a)`, '#7a2148', 4)
    + '<circle r="10" fill="#c9b24a" stroke="#6a6420" stroke-width="1"/>' + spin(6, '<circle cy="-5.6" r="1.6" fill="#5c6a1e"/>') + '<circle r="1.6" fill="#5c6a1e"/>',
  // 파랑: 수국 — 네 잎 작은 꽃 열아홉 송이
  (id) => {
    const tone = ['#8fc8da', '#5aa3bd', '#3b88a6', '#a9a4dc', '#74b6cc'];
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push([31.5, i * 60 + 10]);
    for (let i = 0; i < 6; i++) pts.push([27.5, i * 60 + 40]);
    for (let i = 0; i < 6; i++) pts.push([15.5, i * 60 + 25]);
    pts.push([0, 0]);
    return leaves(id, [20, 140, 260], '#1f5a4a', '#4f9a74', 22, 50, 13)
      + pts.map(([r, a], i) => {
        const c = tone[(i * 3 + (i >> 1)) % tone.length];
        return `<g transform="translate(${f(r * Math.sin(a * D))} ${f(-r * Math.cos(a * D))}) rotate(${(i * 37) % 90})">`
          + spin(4, `<path d="${rpet(.8, 9.2, 5.4)}" fill="${c}" stroke="#123a48" stroke-width=".7"/><path d="M0,-2.5V-6.5" stroke="#123a48" stroke-width=".5" opacity=".5"/>`)
          + `<circle r="1.5" fill="${CREAM}"/></g>`;
      }).join('');
  },
];

// ── 우리 장식 해골: 갓 쓴 해골 (가로 ±46, 세로 ±48). bone 뼈 색, ink 구멍·선 색, p1 갓 띠, p2 금 장식, p3 구슬 ──
const HEAD = 'M0,-46C28,-46 40,-27 40,-8C40,4 35,12 28,16L27,24C27,28 24,30 21,30L19,38C18,44 12,46 0,46C-12,46 -18,44 -19,38L-21,30C-24,30 -27,28 -27,24L-28,16C-35,12 -40,4 -40,-8C-40,-27 -28,-46 0,-46Z';
function skullArt(id, bone, ink, p1, p2, p3) {
  const shade = mix(bone, ink, .24), hat = '#16110e';
  // 갓끈: 갓 양 끝에서 턱 아래로 늘어진 구슬 줄
  let beads = '';
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, u = 1 - t;
    const x = u * u * 36 + 2 * u * t * 44 + t * t * 9, y = u * u * -12 + 2 * u * t * 26 + t * t * 47;
    const big = i === 5, c = big ? p2 : i % 2 ? p3 : p2;
    beads += [-1, 1].map((s) => `<circle cx="${f(x * s)}" cy="${f(y)}" r="${big ? 2.7 : 1.7}" fill="${c}" stroke="${ink}" stroke-width=".5"/>`).join('');
  }
  let mesh = '';
  for (let i = -5; i <= 5; i++) mesh += `M${f(i * 2.6)},-20L${f(i * 2.35)},-37`;
  return `<linearGradient id="${id}bn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(bone, '#ffffff', .5)}"/><stop offset=".6" stop-color="${bone}"/><stop offset="1" stop-color="${shade}"/></linearGradient>`
    + `<linearGradient id="${id}ht" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a302a"/><stop offset=".35" stop-color="${hat}"/><stop offset="1" stop-color="#0a0706"/></linearGradient>`
    + beads
    + '<g transform="translate(0 8.5) scale(.83)">'
    // 머리뼈 + 광대 + 턱
    + `<path d="${HEAD}" fill="url(#${id}bn)" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`
    // 관자놀이·광대 그늘
    + `<path d="M-38,-10C-38,2 -33,10 -27,14C-31,6 -33,-2 -32,-12ZM38,-10C38,2 33,10 27,14C31,6 33,-2 32,-12Z" fill="${shade}" opacity=".75"/>`
    + `<path d="M-26,17Q-20,22 -14,21M26,17Q20,22 14,21" fill="none" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>`
    // 눈구멍: 색 테 + 금빛 눈동자
    + [-1, 1].map((s) => `<g transform="translate(${16 * s} -3) rotate(${-9 * s})"><ellipse rx="11.6" ry="12.4" fill="${ink}"/>`
      + `<ellipse rx="11.6" ry="12.4" fill="none" stroke="${shade}" stroke-width="1.4"/>`
      + `<path d="${arc(8.4, 200, 300)}" fill="none" stroke="${bone}" stroke-width="1.3" stroke-linecap="round" opacity=".28"/>`
      + `<circle cy="1.5" r="3.4" fill="${p2}"/><circle cy="1.5" r="1.5" fill="${ink}"/><circle cx="-1.2" cy=".3" r=".8" fill="#fff"/></g>`).join('')
    // 코
    + `<path d="M0,8C4,8 8,16 6.5,20C5,22.5 1.5,21 0,18.5C-1.5,21 -5,22.5 -6.5,20C-8,16 -4,8 0,8Z" fill="${ink}"/>`
    // 이 (하나는 금니)
    + `<path d="M-17,26Q0,23.5 17,26L16,38Q0,41.5 -16,38Z" fill="${mix(bone, '#ffffff', .6)}" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<path d="M5.7,24.9L11.3,25.4L11.3,31.7L5.7,31.2Z" fill="${p2}"/>`
    + `<path d="M-16.5,32Q0,30.4 16.5,32M-11.3,25.2V39M-5.7,24.7V39.8M0,24.5V40M5.7,24.7V39.8M11.3,25.2V39" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`
    + '</g>'
    // 갓: 넓은 챙(비쳐 보인다) + 모자 + 띠
    + `<ellipse cy="-17" rx="48" ry="8.4" fill="${hat}" opacity=".9" stroke="${ink}" stroke-width=".8"/>`
    + `<ellipse cy="-17" rx="48" ry="8.4" fill="none" stroke="#7a6858" stroke-width=".9" opacity=".85"/>`
    + `<ellipse cy="-17.3" rx="41" ry="6.6" fill="none" stroke="#fff" stroke-width=".6" opacity=".16"/>`
    + `<ellipse cy="-17.6" rx="33" ry="4.9" fill="none" stroke="#fff" stroke-width=".5" opacity=".12"/>`
    + `<path d="M-15,-19.3L-13.6,-36Q0,-40 13.6,-36L15,-19.3Q0,-15.6 -15,-19.3Z" fill="url(#${id}ht)" stroke="${ink}" stroke-width=".8"/>`
    + `<path d="${mesh}" stroke="#fff" stroke-width=".45" opacity=".13"/>`
    + `<path d="M-13,-35.4Q0,-32 13,-35.4" fill="none" stroke="#fff" stroke-width=".7" opacity=".3"/>`
    + `<path d="M-15,-19.3L-14.7,-22.6Q0,-18.9 14.7,-22.6L15,-19.3Q0,-15.6 -15,-19.3Z" fill="${p1}" stroke="${ink}" stroke-width=".7"/>`
    + `<circle cy="-18.4" r="1.5" fill="${p2}"/>`;
}

const open = (cls, box) => `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${box}" aria-hidden="true" focusable="false">`;
const grainDef = (id) => `<pattern id="${id}g" width="24" height="24" patternUnits="userSpaceOnUse"><image href="${GRAIN}" width="24" height="24"/></pattern>`;

// 원판 공통 틀(두께·테두리·바깥 띠·구슬 줄). 얼굴 반지름 94, 가운데 (100,97). 가운데 (100,95). 아래로 7.6만큼 옆면이 보인다.
// face = 'back' | 'front', big = 가운데 원 반지름(앞면 63 / 뒷면 50)
function disc(p, id, face, middle, extraDefs = '') {
  const back = face === 'back';
  const bg = back ? p.dark : mix(p.deep, INK, .45);
  const a = back ? mix(p.base, p.light, .28) : p.base;
  const b = back ? p.light : CREAM;
  const c = p.accent;
  const defs = `<radialGradient id="${id}s" cx=".3" cy=".24" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>`
    + `<linearGradient id="${id}r" x1=".15" y1=".1" x2=".85" y2=".9"><stop offset="0" stop-color="${mix(p.base, '#ffffff', .45)}"/><stop offset=".5" stop-color="${p.base}"/><stop offset="1" stop-color="${mix(p.base, p.deep, .6)}"/></linearGradient>`
    + grainDef(id) + extraDefs;
  return open('gk-art-disc', '0 0 200 200') + `<defs>${defs}</defs><g transform="translate(100 95)">`
    // 옆면(두꺼운 판지가 겹친 모습)
    + `<circle cy="7.6" r="94" fill="${mix(p.deep, '#000000', .6)}"/><circle cy="5.6" r="94" fill="${mix(p.dark, p.base, .22)}"/><circle cy="4.2" r="94" fill="${mix(p.deep, '#000000', .35)}"/><circle cy="2.4" r="94" fill="${mix(p.dark, p.base, .12)}"/><circle cy="1" r="94" fill="${mix(p.deep, '#000000', .4)}"/>`
    // 윗면: 테두리 띠
    + `<circle r="94" fill="url(#${id}r)"/><circle r="93.2" fill="none" stroke="${mix(p.base, p.deep, .55)}" stroke-width=".9"/>`
    + spin(72, `<circle cy="-91" r=".95" fill="${back ? p.light : CREAM}" opacity=".85"/>`)
    + `<circle r="88.4" fill="${bg}"/><circle r="88.4" fill="none" stroke="${mix(p.deep, '#000000', .3)}" stroke-width="1.2"/>`
    // 바깥 문양 띠
    + BAND[p.id](back ? 71.5 : 69, 87.2, a, b, c)
    + middle
    // 종이 결 + 빛
    + `<circle r="94" fill="url(#${id}g)" opacity=".55"/><circle r="94" fill="url(#${id}s)"/>`
    + `<path d="${arc(92.6, -78, -12)}" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>`
    + `<path d="${arc(92.6, 100, 172)}" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round" opacity=".3"/>`
    + '</g></svg>';
}

// 앞면 가운데(반지름 67 안): 구슬 줄 + 큰 그림 자리
const frontMid = (p, inner) => `<circle r="67.5" fill="${p.base}"/><circle r="67.5" fill="none" stroke="${mix(p.deep, '#000000', .3)}" stroke-width="1.1"/>`
  + `<circle r="65" fill="${mix(p.deep, INK, .3)}"/>` + inner
  + spin(40, `<circle cy="-66.3" r="1.25" fill="${CREAM}"/>`);

export function discBack(color) {
  const p = pal(color), id = uid();
  const a = mix(p.base, p.light, .28);
  return disc(p, id, 'back',
    `<circle r="70" fill="${p.base}"/><circle r="70" fill="none" stroke="${p.deep}" stroke-width="1.1"/>`
    + spin(48, `<circle cy="-68.1" r="1.15" fill="${CREAM}"/>`)
    + `<circle r="66" fill="${p.deep}"/>`
    + BAND[(p.id + 3) % 6](52.5, 65, a, p.light, p.accent)
    + `<circle r="52" fill="${p.accent}"/><circle r="50.4" fill="${p.dark}"/><circle r="50.4" fill="none" stroke="${p.deep}" stroke-width="1"/>`
    + `<g transform="scale(.86)">${CENTER[p.id](p.light, p.accent, id)}</g>`);
}

export function discFlower(color) {
  const p = pal(color), id = uid();
  return disc(p, id, 'front', frontMid(p,
    `<circle r="62" fill="none" stroke="${p.base}" stroke-width=".8" opacity=".7"/>`
    + `<g transform="scale(1.27)">${FLOWER[p.id](id)}</g>`));
}

export function discSkull(color, photoUrl) {
  const p = pal(color), id = uid();
  let inner;
  if (photoUrl) {
    // 사진: 가운데 원(반지름 65)에 꽉 차게(cover). 아래에 작은 해골 표시를 얹어 "이 사진이 해골"임을 알린다.
    inner = `<clipPath id="${id}p"><circle r="65"/></clipPath>`
      + `<image href="${escAttr(photoUrl)}" x="-65" y="-65" width="130" height="130" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}p)"/>`
      + `<circle r="64.2" fill="none" stroke="#000" stroke-width="2.4" opacity=".28"/>`
      + `<g transform="translate(0 73)"><circle cy="1.6" r="17" fill="#000" opacity=".4"/><circle r="17" fill="${mix(p.deep, INK, .3)}"/><circle r="17" fill="none" stroke="${CREAM}" stroke-width="1.6"/>`
      + `<circle r="14.2" fill="none" stroke="${p.base}" stroke-width="1"/>`
      + `<g transform="scale(.29) translate(0 1)">${skullArt(id, CREAM, INK, p.base, GOLD[1], p.light)}</g></g>`;
  } else {
    inner = spin(16, `<path d="${lens(52, 62, 2.6)}" fill="${p.base}" opacity=".55"/>`)
      + `<g transform="scale(1.2) translate(0 .5)">${skullArt(id, CREAM, INK, p.base, GOLD[1], p.light)}</g>`;
  }
  return disc(p, id, 'front', frontMid(p, inner));
}

// ── 개인판 ── 240x240, 판은 232x232(아래로 4만큼 옆면)
const corner = (line, fill) => `<circle r="10" fill="none" stroke="${line}" stroke-width="1.5"/>`
  + spin(6, `<path d="${lens(2, 8.4, 2.5)}" fill="${fill}"/>`)
  + `<path d="M14,-1Q25,-4 34,4M-1,14Q-4,25 4,34" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>`
  + `<circle cx="38.5" cy="7" r="1.7" fill="${fill}"/><circle cx="7" cy="38.5" r="1.7" fill="${fill}"/>`;
const corners = (line, fill) => [[32, 30, 0], [208, 30, 90], [208, 206, 180], [32, 206, 270]]
  .map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${corner(line, fill)}</g>`).join('');
// 한 변을 따라가는 작은 아치 줄
const edgeRow = (line, fill) => {
  let s = '';
  for (let i = 0; i < 7; i++) {
    const x = 84 + i * 12;
    s += `<path d="M${x - 5},25Q${x},15 ${x + 5},25" fill="none" stroke="${line}" stroke-width="1.3" stroke-linecap="round"/><circle cx="${x}" cy="24" r="1.2" fill="${fill}"/>`;
  }
  return [0, 90, 180, 270].map((r) => `<g transform="rotate(${r} 120 118)">${s}</g>`).join('');
};

export function mat(color, flipped) {
  const p = pal(color), id = uid();
  const top = flipped ? CREAM : mix(p.soft, '#ffffff', .1), bot = flipped ? mix(CREAM, GOLD[2], .25) : mix(p.soft, p.base, .45);
  const defs = `<linearGradient id="${id}f" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`
    + `<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>`
    + `<radialGradient id="${id}c" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="${flipped ? p.dark : mix(p.base, p.dark, .45)}"/><stop offset="1" stop-color="${flipped ? p.deep : p.dark}"/></radialGradient>`
    + grainDef(id);
  // 판은 탁자에서 돌려 놓으므로 두께·그림자는 그리지 않는다(화면 CSS 가 돌리지 않은 바깥 칸에 입힌다).
  let body = `<rect x="4" y="2" width="232" height="232" rx="30" fill="url(#${id}f)"/>`
    + `<rect x="4.6" y="2.6" width="230.8" height="230.8" rx="29.4" fill="none" stroke="${flipped ? '#ffffff' : mix(p.soft, '#ffffff', .55)}" stroke-width="1.2" opacity=".7"/>`;
  if (!flipped) {
    const ln = mix(p.soft, '#ffffff', .42), fl = mix(p.soft, '#ffffff', .5);
    body += `<rect x="13" y="11" width="214" height="214" rx="22" fill="none" stroke="${ln}" stroke-width="1.3" opacity=".9"/>`
      + corners(ln, fl) + edgeRow(ln, fl);
  } else {
    // 1점: 흰 테 안에 금색 선, 속은 그 사람 색
    body += `<rect x="15" y="13" width="210" height="210" rx="20" fill="${p.base}"/>`
      + `<rect x="15" y="13" width="210" height="210" rx="20" fill="none" stroke="${GOLD[1]}" stroke-width="2.2"/>`
      + `<rect x="9.5" y="7.5" width="221" height="221" rx="25" fill="none" stroke="${GOLD[2]}" stroke-width="1" opacity=".7"/>`
      + corners(mix(p.base, p.light, .5), GOLD[1]) + edgeRow(mix(p.base, p.light, .5), GOLD[1]);
  }
  // 가운데 원(원판 놓는 자리): 살짝 파인 느낌 + 같은 색 문양
  const m1 = flipped ? mix(p.base, p.light, .2) : mix(p.base, p.soft, .35), m2 = flipped ? GOLD[1] : mix(p.soft, '#ffffff', .3);
  body += `<g transform="translate(120 118)"><circle r="88" fill="${flipped ? GOLD[1] : mix(p.soft, '#ffffff', .4)}" opacity="${flipped ? 1 : .8}"/>`
    + `<circle r="85" fill="url(#${id}c)"/><circle r="85" fill="none" stroke="url(#${id}h)" stroke-width="3"/>`
    + `<g opacity=".9">${BAND[p.id](66, 82, m1, m2, m1)}</g>`
    + `<circle r="64" fill="none" stroke="${m1}" stroke-width="1.4"/>`
    + `<g transform="scale(1.08)">${CENTER[p.id](m1, flipped ? GOLD[1] : m2, id)}</g></g>`;
  return open('gk-art-mat', '0 0 240 240') + `<defs>${defs}</defs>${body}`
    + `<rect x="4" y="2" width="232" height="232" rx="30" fill="url(#${id}g)" opacity=".6"/></svg>`;
}

// 작은 해골 표시(상태 줄·안내용). 색은 글자 색(currentColor)을 따른다.
export function skullIcon() {
  return open('gk-art-icon', '-50 -50 100 100')
    + '<path d="M0,-46C28,-46 40,-27 40,-8C40,4 35,12 28,16L27,24C27,28 24,30 21,30L19,38C18,44 12,46 0,46C-12,46 -18,44 -19,38L-21,30C-24,30 -27,28 -27,24L-28,16C-35,12 -40,4 -40,-8C-40,-27 -28,-46 0,-46Z" fill="currentColor"/>'
    + `<g fill="${INK}"><ellipse cx="-16" cy="-4" rx="11" ry="12"/><ellipse cx="16" cy="-4" rx="11" ry="12"/><path d="M0,8L6.5,20Q0,23.5 -6.5,20Z"/></g>`
    + `<path d="M-15,31H15M-9,26V37M-3,25.5V38M3,25.5V38M9,26V37" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}

// 탁자 가운데 큰 장식 해골(갓 쓴 해골). 100x116, 아래에 옅은 그림자까지 들어 있다.
export function skullMarker() {
  const id = uid();
  return open('gk-art-marker', '-50 -54 100 116')
    + `<defs><radialGradient id="${id}sh"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`
    + `<ellipse cy="52" rx="38" ry="8" fill="url(#${id}sh)"/>`
    + skullArt(id, '#f6efdf', '#1a1210', '#b8322e', '#e9b548', '#3fa58c')
    + '</svg>';
}

// ── 한 번 만들어 기억해 두는 data URL ──
export const artUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const cache = new Map();
const memo = (k, make) => { let u = cache.get(k); if (!u) { u = artUrl(make()); cache.set(k, u); } return u; };
const ci = (c) => pal(c).id;
export const discBackUrl = (color) => memo('b' + ci(color), () => discBack(color));
export const discFlowerUrl = (color) => memo('f' + ci(color), () => discFlower(color));
export const discSkullUrl = (color) => memo('s' + ci(color), () => discSkull(color, null));
export const matUrl = (color, flipped) => memo((flipped ? 'M' : 'm') + ci(color), () => mat(color, flipped));
export const skullMarkerUrl = () => memo('k', skullMarker);
