const SVG_NS = 'http://www.w3.org/2000/svg';

// Children are appended as text nodes, never parsed as HTML, so user-provided names stay inert.
export function h(tag, cls, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}

// `inner` must be static markup from icons.js, never user data.
export function svg(inner, viewBox = '0 0 24 24') {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.innerHTML = inner;
  return s;
}

const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export function avatar(player, cls = 'av') {
  const box = h('div', cls);
  if (player.avatar && JPEG.test(player.avatar)) {
    const img = h('img');
    img.src = player.avatar;
    img.alt = '';
    img.draggable = false;
    box.append(img);
  } else {
    box.classList.add('letter');
    box.append(h('span', '', [...(player.name || '?')][0]));
  }
  return box;
}

export const fmtShort = (n) => {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${+(n / 1000).toPrecision(3)}K`;
  return `${+(n / 1e6).toPrecision(3)}M`;
};
export const fmt = (n) => n.toLocaleString('en-US');
