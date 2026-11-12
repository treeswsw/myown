import { saved } from './state.js';

let ctx;
let muted = saved.get('gk.muted') === '1';

const audio = () => {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

function noise(c, dur) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function burst({ dur, type = 'bandpass', f0, f1 = f0, q = 1, gain = 0.4, at = 0 }) {
  const c = audio();
  const t = c.currentTime + at;
  const src = noise(c, dur);
  const flt = c.createBiquadFilter();
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t);
  flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt).connect(g).connect(c.destination);
  src.start(t);
}

function tone({ f0, f1 = f0, dur, type = 'sine', gain = 0.3, at = 0 }) {
  const c = audio();
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}

const play = (fn) => () => { if (!muted) try { fn(); } catch { /* audio unavailable */ } };

export const sfx = {
  card: play(() => burst({ dur: 0.07, f0: 2600, q: 0.8, gain: 0.35 })),
  chip: play(() => { tone({ f0: 2100, f1: 1500, dur: 0.05, type: 'triangle', gain: 0.18 }); burst({ dur: 0.05, f0: 4000, q: 2, gain: 0.2, at: 0.03 }); }),
  turn: play(() => tone({ f0: 880, f1: 1175, dur: 0.12, gain: 0.15 })),
  thud: play(() => { tone({ f0: 120, f1: 40, dur: 0.35, gain: 0.5 }); burst({ dur: 0.2, type: 'lowpass', f0: 800, f1: 100, gain: 0.4 }); }),
  click: play(() => { tone({ f0: 900, f1: 500, dur: 0.04, type: 'square', gain: 0.18 }); tone({ f0: 420, f1: 260, dur: 0.06, type: 'square', gain: 0.18, at: 0.05 }); burst({ dur: 0.04, type: 'highpass', f0: 3000, gain: 0.2 }); }),
  shot: play(() => { burst({ dur: 0.45, type: 'lowpass', f0: 6000, f1: 200, gain: 0.9 }); tone({ f0: 110, f1: 35, dur: 0.4, gain: 0.7 }); }),
  win: play(() => [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.35, type: 'triangle', gain: 0.22, at: i * 0.11 }))),
};

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  saved.set('gk.muted', v ? '1' : '0');
}
