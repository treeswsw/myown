import { isMuted } from './audio.js';

// Photo/sound helpers for the emote panel: image shrinking, sound preparation, synthesised effects, playback.
// data URL string lengths, kept just under the server's 40 * 1024 and 200 * 1024
export const MAX_PHOTO = 40000;
export const MAX_SOUND = 200000;
export const MAX_SECONDS = 5;

const readDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

// ---- photos
export async function shrinkImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('사진을 열 수 없습니다'); }
  let scale = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  for (;;) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale));
    c.height = Math.max(1, Math.round(bmp.height * scale));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; // JPEG has no alpha
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    for (let q = 0.85; q > 0.3; q -= 0.1) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= MAX_PHOTO) { bmp.close?.(); return url; }
    }
    scale *= 0.8;
    if (c.width < 24) throw new Error('사진이 너무 큽니다');
  }
}

// ---- audio engine
let ctx;
let muted = false;
let active = 0;
export const setMediaMuted = (v) => { muted = v; };

const audio = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
};

// iOS only starts audio from inside a gesture: create the context and play a silent buffer on the first one.
export function unlockAudio() {
  const go = () => {
    try { const c = audio(); const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(); } catch { /* audio unavailable */ }
    for (const e of ['pointerdown', 'touchend', 'keydown']) removeEventListener(e, go, true);
  };
  for (const e of ['pointerdown', 'touchend', 'keydown']) addEventListener(e, go, true);
}

function playBuffer(buf) {
  if (muted || isMuted() || active >= 3) return;
  const c = audio();
  const src = c.createBufferSource();
  const g = c.createGain();
  g.gain.value = 0.9;
  src.buffer = buf;
  src.connect(g).connect(c.destination);
  active++;
  src.onended = () => { active--; };
  src.start();
  src.stop(c.currentTime + MAX_SECONDS);
}

const decoded = new Map(); // data URL -> Promise<AudioBuffer>
const decode = (url) => {
  if (!decoded.has(url)) {
    if (decoded.size >= 24) decoded.delete(decoded.keys().next().value);
    const p = fetch(url).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => audio().decodeAudioData(ab, res, rej)));
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
  }
  return decoded.get(url);
};

export async function playDataUrl(url) {
  try { playBuffer(await decode(url)); } catch { /* undecodable sound */ }
}

// ---- built-in effects, synthesised sample by sample (mono, 22.05 kHz) and normalised
const SR = 22050;
const noise = () => Math.random() * 2 - 1;
const lowpass = (k) => { let y = 0; return (x) => (y += k * (x - y)); };
const pulse = (t, at, decay) => (t < at ? 0 : Math.exp(-(t - at) / decay));
const TAU = Math.PI * 2;

function render(dur, fn) {
  const b = audio().createBuffer(1, Math.ceil(SR * dur), SR);
  const d = b.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i] = fn(i / SR)));
  for (let i = 0; i < d.length; i++) d[i] *= 0.55 / (peak || 1);
  return b;
}

// vowel-like voiced puff: a few harmonics of f, shaped by `amp`
const voice = (f, t, amp) => amp * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2 * f * t) + 0.25 * Math.sin(TAU * 3 * f * t));

export const BUILTINS = [
  { id: 'clap', label: '박수', make: () => {
    const hits = [0, 0.11, 0.2, 0.33, 0.4, 0.52, 0.6, 0.73, 0.8, 0.9];
    const lp = lowpass(0.5);
    return render(1.2, (t) => { const n = noise(); return (n - lp(n)) * hits.reduce((s, h) => s + pulse(t, h, 0.03), 0); });
  } },
  { id: 'laugh', label: '웃음', make: () => render(0.9, (t) => {
    const i = Math.min(3, Math.floor(t / 0.17));
    const local = t - i * 0.17;
    return voice(330 - i * 25 + 12 * Math.sin(local * 40), t, Math.min(local / 0.015, 1) * Math.exp(-local / 0.07) * (i === 3 && local > 0.2 ? 0 : 1));
  }) },
  { id: 'fail', label: '실패', make: () => {
    const notes = [[392, 0, 0.22], [370, 0.24, 0.22], [349, 0.48, 0.22], [311, 0.72, 0.7]];
    const lp = lowpass(0.16);
    let ph = 0;
    return render(1.5, (t) => {
      const n = notes.find(([, at, len]) => t >= at && t < at + len);
      if (!n) return lp(0);
      const local = t - n[1];
      ph += (n[0] * (n === notes[3] ? 1 - 0.04 * local - 0.012 * Math.sin(TAU * 6 * local) : 1)) / SR;
      return lp(2 * (ph % 1) - 1) * Math.min(local / 0.02, 1) * Math.min(1, (n[2] - local) / 0.04);
    });
  } },
  { id: 'roll', label: '드럼롤', make: () => {
    const hits = [];
    for (let t = 0, gap = 0.12; t < 1.3; t += gap, gap = Math.max(0.03, gap * 0.9)) hits.push(t);
    const lp = lowpass(0.35);
    const hp = lowpass(0.6);
    return render(2, (t) => {
      const n = noise();
      const roll = hits.reduce((s, h) => s + pulse(t, h, 0.035), 0) * (0.35 + t / 1.3) * lp(n);
      const crash = t > 1.4 ? (n - hp(n)) * pulse(t, 1.4, 0.35) * 1.3 : 0;
      return roll + crash + (t > 1.4 ? Math.sin(TAU * 90 * t) * pulse(t, 1.4, 0.12) : 0);
    });
  } },
  { id: 'ding', label: '딩동', make: () => render(1.3, (t) => {
    const bell = (f, at) => (t < at ? 0 : (Math.sin(TAU * f * (t - at)) + 0.3 * Math.sin(TAU * 2.76 * f * (t - at))) * pulse(t, at, 0.3));
    return bell(880, 0) + bell(659, 0.4);
  }) },
  { id: 'boo', label: '야유', make: () => {
    const lp = lowpass(0.07);
    let ph = 0;
    return render(1.4, (t) => {
      ph += (150 - 30 * t) / SR;
      return lp(2 * (ph % 1) - 1) * Math.min(t / 0.2, 1) * Math.min(1, (1.4 - t) / 0.3) * (0.75 + 0.25 * Math.sin(TAU * 6 * t));
    });
  } },
];

const built = new Map();
export function playBuiltin(id) {
  const def = BUILTINS.find((b) => b.id === id);
  if (!def) return;
  try {
    if (!built.has(id)) built.set(id, def.make());
    playBuffer(built.get(id));
  } catch { /* audio unavailable */ }
}

// ---- custom sounds
function wav(buf, rate, dur) {
  return new Promise((res, rej) => {
    const oc = new OfflineAudioContext(1, Math.ceil(rate * dur), rate);
    const s = oc.createBufferSource();
    s.buffer = buf;
    s.connect(oc.destination);
    s.start(0, 0, dur);
    oc.startRendering().then((out) => {
      const pcm = out.getChannelData(0);
      const v = new DataView(new ArrayBuffer(44 + pcm.length * 2));
      const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
      pcm.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
      res(readDataUrl(new Blob([v], { type: 'audio/wav' })));
    }, rej);
  });
}

// Plays as-is when <= 5 s and small enough; otherwise the first 5 s as downsampled mono WAV (decodes on every browser).
export async function prepareSound(file) {
  if (file.size > 30e6) throw new Error('소리가 너무 큽니다');
  let buf;
  try {
    const ab = await file.arrayBuffer();
    buf = await new Promise((res, rej) => audio().decodeAudioData(ab, res, rej));
  } catch { throw new Error('소리 파일을 읽을 수 없습니다'); }
  const duration = Math.min(buf.duration, MAX_SECONDS);
  if (buf.duration <= MAX_SECONDS + 0.05) {
    const data = await readDataUrl(file);
    if (data.length <= MAX_SOUND && data.startsWith('data:audio/')) return { data, duration };
  }
  const head = 'data:audio/wav;base64,'.length;
  const rate = Math.min(buf.sampleRate, 22050, Math.floor(((MAX_SOUND - head) * 0.75 - 44) / 2 / duration));
  if (rate < 8000) throw new Error('소리가 너무 큽니다');
  return { data: await wav(buf, rate, duration), duration };
}

// IndexedDB store for my sounds ({sid, name, data, ts}); every call resolves even when storage is unavailable.
const db = new Promise((res) => {
  try {
    const r = indexedDB.open('gk-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sounds', { keyPath: 'sid' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  } catch { res(null); }
});
const store = async (mode, fn) => {
  const d = await db;
  if (!d) return null;
  return new Promise((res) => {
    try {
      const q = fn(d.transaction('sounds', mode).objectStore('sounds'));
      q.onsuccess = () => res(q.result);
      q.onerror = () => res(null);
    } catch { res(null); }
  });
};
export const mySounds = {
  list: async () => ((await store('readonly', (s) => s.getAll())) ?? []).sort((a, b) => a.ts - b.ts),
  put: (item) => store('readwrite', (s) => s.put(item)),
  del: (sid) => store('readwrite', (s) => s.delete(sid)),
};
