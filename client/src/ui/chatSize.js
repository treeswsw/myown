// Chat size marks (CONTRACTS 6): '#' = 2, '*' = 1, '**' = 2, '***' = 3. Nothing after the mark -> plain (0).
// Pure (no DOM, no CSS import) so tests can load it.
// Only marks/spaces after the mark (`#*`, `* *`) = no text: same rule as liar plainChat / server stripSizeMark.
const real = (s) => /[^\s#*]/u.test(s);

export function chatSize(raw) {
  const t = String(raw).trim();
  if (t.startsWith('#')) {
    const rest = t.slice(1).trimStart();
    return real(rest) ? { size: 2, text: rest } : { size: 0, text: t };
  }
  const stars = /^\*{1,3}/.exec(t)?.[0];
  if (!stars) return { size: 0, text: t };
  const rest = t.slice(stars.length).trimStart();
  return real(rest) ? { size: stars.length, text: rest } : { size: 0, text: t };
}

// Size 3 ('***') bubble: every letter gets its own random font, rainbow colour, tilt and size.
// Seeded from the message (sender id + time + text), so everyone in the room sees the same bubble.
// [Google font family, size factor (handwriting faces draw small)]
export const MAD_FONTS = [
  ['Black Han Sans', 1], ['Do Hyeon', 1.05], ['Dokdo', 1.2], ['East Sea Dokdo', 1.45], ['Nanum Myeongjo', 1],
  ['Song Myung', 1.05], ['Gothic A1', 0.95], ['Nanum Brush Script', 1.4], ['Gugi', 0.95], ['Kirang Haerang', 1.2],
  ['Yeon Sung', 1.15], ['Hahmlet', 1], ['Bagel Fat One', 0.95], ['Dongle', 1.6], ['Nanum Pen Script', 1.4], ['Jua', 1],
];
// Per-letter motion while the bubble is up (chat.css `.chat-fx-*`).
export const MAD_FX = ['shake', 'hop', 'pulse', 'wobble', 'blink', 'glitch'];
export const MAD_COLORS = ['#ff1a1a', '#ff8a00', '#ffe100', '#1fd655', '#2f86ff', '#6b5cff', '#b23cff']; // 빨주노초파남보

function seedRng(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  let a = h >>> 0;
  return () => { // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -> [{ ch, font?, k?, color?, rot?, dy?, sc?, fx?, delay? }] one entry per character; spaces get only `ch`.
// Neighbouring letters never share a colour or a font.
export function madLetters(text, key) {
  const rnd = seedRng(key);
  const int = (n) => Math.floor(rnd() * n);
  const range = (a, b) => a + rnd() * (b - a);
  let lastC = -1;
  let lastF = -1;
  return [...String(text)].map((ch) => {
    if (!ch.trim()) return { ch };
    let c; do c = int(MAD_COLORS.length); while (c === lastC);
    let f; do f = int(MAD_FONTS.length); while (f === lastF);
    lastC = c; lastF = f;
    return {
      ch, font: MAD_FONTS[f][0], k: MAD_FONTS[f][1], color: MAD_COLORS[c],
      rot: +range(-11, 11).toFixed(1), dy: +range(-0.12, 0.12).toFixed(3), sc: +range(0.9, 1.12).toFixed(3),
      fx: MAD_FX[int(MAD_FX.length)], delay: Math.round(range(0, 600)),
    };
  });
}
