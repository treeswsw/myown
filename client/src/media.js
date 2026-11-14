import { context, isMuted, unlock, playBuffer as corePlay } from './sound/core.js';

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

// ---- audio engine: sound/core.js 하나 위에서 (COMMON-CONTRACT 4-1)
let active = 0;
const audio = () => context();

// iOS only starts audio from inside a gesture: sound/core.js unlocks on the first one.
export function unlockAudio() { unlock(); }

function playBuffer(buf) {
  if (isMuted() || active >= 3) return;
  const src = corePlay(buf, { gain: 0.9, maxSec: MAX_SECONDS });
  if (!src) return;
  active++;
  src.onended = () => { active--; };
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

// ---- built-in sounds: short files in client/public/sounds (volume evened out, 5 s max)
export const BUILTINS = [['one', '엄'], ['two', '뭐지'], ['three', '쿵'], ['four', '예'], ['five', '티원'], ['six', '딱']]
  .map(([id, label], i) => ({ id, label, url: `/sounds/s${i + 1}.mp3` }));

export function playBuiltin(id) {
  const def = BUILTINS.find((b) => b.id === id);
  if (def) playDataUrl(def.url);
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
