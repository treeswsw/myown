// 공용 꾸미기 그리기 (SPEC 22-17). 프사에 모자·악세·페이셜·테두리를 겹치고, 칭호 배지·글자 색·아이콘을 만든다.
// CSS(look.css)는 coin/index.js 가 불러온다(여기서 불러오면 node 시험이 깨진다).
// 그림 항목(art/*.js)은 두 가지: { svg, w, dx, dy, fx? } 는 우리가 쓴 고정 svg 글자,
// { src, w, dx, dy, fx? } 는 그림 파일 주소(예: '/coin/art/hat.crown.webp', 256x256 투명 배경)를 <img> 로 그린다.
// fx 는 .lk-fx-<이름>(art/art.css). 효과가 그림 모양을 따라가도록 --lk-src 에 그림 주소를 넣어 둔다.
import { item, GRADES } from '../../../shared/coin/shop.js';
import hatArt from './art/hat.js';
import accArt from './art/acc.js';
import faceArt from './art/face.js';
import { applyFx } from './titlefx.js';

const ART = { hat: hatArt, acc: accArt, face: faceArt };
const FALLBACK = {
  top: { w: 0.5, dx: 0, dy: -0.55 },
  side: { w: 0.4, dx: 0.5, dy: 0.3 },
  bottom: { w: 0.4, dx: 0, dy: 0.55 },
  ring: { w: 0.4, dx: 0, dy: -0.55 },
  sticker: { w: 0.4, dx: 0, dy: 0 },
};

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cls = (s) => String(s).replace(/[^\w-]/g, '');

export function gradeColor(g) {
  const gr = GRADES.find((x) => x.g === g) || GRADES[0];
  return gr.color;
}
export const hexCss = (h) => '#' + ((Number(h) >>> 0) & 0xffffff).toString(16).padStart(6, '0');

// 그림 한 장의 자리. art = {w,dx,dy}, pos = {x,y,s,r}(sticker 만, 없으면 null), size = 프사 지름
// 돌려주는 값: 중심 좌표 cx·cy, 한 변 w, 돌림 rot(도). 프사 왼쪽 위 기준, size 와 같은 단위.
export function place(art, pos, size) {
  const a = art || FALLBACK.sticker;
  const p = pos || {};
  const x = clamp(num(p.x, 0), -0.5, 0.5), y = clamp(num(p.y, 0), -0.5, 0.5);
  const s = clamp(num(p.s, 1), 0.3, 2), r = clamp(num(p.r, 0), -180, 180);
  return {
    w: num(a.w, 1) * (pos ? s : 1) * size,
    cx: (0.5 + num(a.dx, 0) + (pos ? x : 0)) * size,
    cy: (0.5 + num(a.dy, 0) + (pos ? y : 0)) * size,
    rot: pos ? r : 0,
  };
}

function artOf(it) {
  const k = it.art && it.art.key;
  const reg = ART[it.slot];
  return (reg && k && reg[k]) || null;
}

function qmark(it) {
  const d = document.createElement('div');
  d.className = 'lk-q';
  const gc = gradeColor(it.g);
  d.style.setProperty('--lk-gc', gc === 'rainbow' ? '#ff6ad5' : gc);
  d.textContent = '?';
  return d;
}

function artBox(entry) {
  const d = document.createElement('div');
  d.className = 'lk-art' + (entry.fx ? ' lk-fx-' + cls(entry.fx) : '');
  if (entry.src) {
    const im = document.createElement('img');
    im.className = 'lk-img';
    im.alt = '';
    im.draggable = false;
    im.decoding = 'async';
    im.src = entry.src;
    d.appendChild(im);
    if (entry.fx) d.style.setProperty('--lk-src', `url("${entry.src}")`);
  } else {
    d.innerHTML = entry.svg; // 우리가 쓴 고정 svg 글자 (사용자 글자 아님)
  }
  return d;
}

function layer(c) {
  const d = document.createElement('div');
  d.className = 'lk-layer ' + c;
  return d;
}

function itemLayer(it, pos) {
  const type = (it.art && it.art.type) || 'sticker';
  const entry = artOf(it);
  const l = layer('lk-' + type);
  l.appendChild(entry ? artBox(entry) : qmark(it));
  if (type === 'cover') return l;
  const base = entry || FALLBACK[(it.art && it.art.at) || 'sticker'] || FALLBACK.sticker;
  // size=1 이면 값이 곧 비율(0~1)이다.
  const g = place(base, type === 'sticker' ? pos || {} : null, 1);
  l.style.width = l.style.height = g.w * 100 + '%';
  l.style.left = g.cx * 100 + '%';
  l.style.top = g.cy * 100 + '%';
  l.style.transform = 'translate(-50%,-50%)' + (g.rot ? ` rotate(${g.rot}deg)` : '');
  return l;
}

function frameLayer(it) {
  const l = layer('lk-ring');
  const v = it.v || {};
  l.style.setProperty('--lk-fc', hexCss(v.hex));
  if (v.fx) l.classList.add('lk-ring-' + cls(v.fx));
  if (it.g === 4) l.classList.add('lk-ring-rainbow');
  return l;
}

function unwrapAvatar(el) {
  const w = el.parentNode;
  if (w && w.classList && w.classList.contains('lk-wrap') && w.parentNode) {
    w.parentNode.insertBefore(el, w);
    w.remove();
  }
}

// 프사 요소를 .lk-wrap 으로 감싸 겹겹이 그린다. 다시 부르면 갈아 끼우고, look 이 없으면 원래대로 되돌린다.
export function decorate(avatarEl, look, opts = {}) {
  if (!avatarEl || !avatarEl.parentNode) return avatarEl;
  let wrap = avatarEl.parentNode;
  const wrapped = !!(wrap.classList && wrap.classList.contains('lk-wrap'));
  const items = look && typeof look === 'object'
    ? ['face', 'acc', 'hat', 'frame'].map((s) => item(look[s])).filter((i) => i && i.slot)
    : [];
  if (!items.length) {
    if (wrapped) unwrapAvatar(avatarEl);
    return avatarEl;
  }
  if (!wrapped) {
    wrap = document.createElement('span');
    wrap.className = 'lk-wrap';
    avatarEl.parentNode.insertBefore(wrap, avatarEl);
    wrap.appendChild(avatarEl);
  }
  wrap.querySelectorAll(':scope > .lk-layer').forEach((n) => n.remove());
  const size = num(opts.size, 0);
  if (size > 0) {
    wrap.style.width = wrap.style.height = size + 'px';
    wrap.style.setProperty('--lk-bw', Math.max(2, size * 0.07) + 'px');
  }
  const pos = (look && look.pos) || {};
  const by = (s) => items.find((i) => i.slot === s);
  const isCover = (i) => i.art && i.art.type === 'cover';
  const add = (n) => wrap.appendChild(n);
  for (const s of ['face', 'acc']) { const i = by(s); if (i && isCover(i)) add(itemLayer(i)); }
  const fr = by('frame');
  if (fr) add(frameLayer(fr));
  for (const s of ['face', 'acc', 'hat']) { const i = by(s); if (i && !isCover(i)) add(itemLayer(i, pos[i.id])); }
  return wrap;
}

export function titleBadge(look) {
  const it = look && item(look.title);
  if (!it || it.slot !== 'title') return null;
  const el = document.createElement('span');
  el.className = 'lk-title';
  el.textContent = String((it.v && it.v.text) || it.name);
  const gc = gradeColor(it.g);
  if (gc === 'rainbow') el.classList.add('lk-rainbow');
  else el.style.setProperty('--lk-gc', gc);
  if (it.v && it.v.fx) applyFx(el, it.v.fx);
  return el;
}

export function nameColor(look) {
  const it = look && item(look.color);
  if (!it || it.slot !== 'color' || !it.v) return null;
  return hexCss(it.v.hex);
}

export function itemIcon(id, size = 32) {
  const it = item(id);
  const box = document.createElement('span');
  box.className = 'lk-icon';
  box.style.width = box.style.height = size + 'px';
  if (!it) { box.appendChild(qmark({ g: 0 })); return box; }
  const v = it.v || {};
  const dot = (c) => { const i = document.createElement('i'); i.className = 'lk-dot ' + c; box.appendChild(i); return i; };
  if (it.slot === 'title') {
    box.classList.add('lk-icon-title');
    box.style.width = 'auto';
    box.style.fontSize = Math.max(9, size * 0.4) + 'px';
    box.appendChild(titleBadge({ title: id }));
  } else if (it.slot === 'color') {
    const c = dot(v.fx === 'rainbow' ? 'lk-rainbow-bg' : '');
    c.style.background = v.fx === 'rainbow' ? '' : hexCss(v.hex);
  } else if (it.slot === 'frame') {
    const c = dot('lk-dot-ring');
    c.style.setProperty('--lk-fc', it.g === 4 ? '#ff6ad5' : hexCss(v.hex));
  } else if (it.slot === 'suit') {
    const c = dot('lk-dot-suit');
    c.style.setProperty('--lk-su', hexCss(v.suit));
    c.style.setProperty('--lk-ti', hexCss(v.tie));
  } else {
    const e = artOf(it);
    box.appendChild(e ? artBox(e) : qmark(it));
  }
  const gc = gradeColor(it.g);
  if (gc !== 'rainbow') box.style.setProperty('--lk-gc', gc);
  return box;
}
