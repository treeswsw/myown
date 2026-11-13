// 사이트 소리 엔진 하나 (COMMON-CONTRACT 4-1). AudioContext 1개 + master gain, 소리 끄기(저장 키 gk.muted), iPad 잠금 해제.
// audio.js(포커 효과음)·media.js(이모티콘 사운드)·게임 audio 는 모두 이것 위에서 소리 표만 갖는다.
// 모듈을 불러올 때는 브라우저 기능을 건드리지 않는다(node 시험이 이 파일을 간접으로 불러온다).
import { saved } from '../state.js';

const KEY = 'gk.muted';
let ctx = null;
let master = null;
let muted = saved.get(KEY) === '1';
const subs = new Set();

/** AudioContext 를 (처음이면 만들고) 돌려준다. 멈춰 있으면 다시 깨운다. */
export function context() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}
/** 모든 소리가 나가는 곳(master gain). */
export function output() { context(); return master; }

export const isMuted = () => muted;
export function setMuted(v) {
  v = Boolean(v);
  if (v === muted) return;
  muted = v;
  saved.set(KEY, v ? '1' : '0');
  if (master) master.gain.value = v ? 0 : 1;
  for (const fn of subs) { try { fn(v); } catch (e) { console.error(e); } }
}
/** 소리 켜기/끄기가 바뀔 때마다 fn(muted). 돌려준 함수로 끈다. */
export function onMute(fn) { subs.add(fn); return () => subs.delete(fn); }

// iOS 는 사용자 동작 안에서만 소리를 시작한다: 첫 동작에서 만들고 빈 소리를 한 번 낸다(media.js 방식).
let unlocking = false;
export function unlock() {
  if (unlocking) return;
  unlocking = true;
  const evs = ['pointerdown', 'touchend', 'keydown'];
  const go = () => {
    try { const c = context(); const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(master); s.start(); } catch { /* audio unavailable */ }
    for (const e of evs) removeEventListener(e, go, true);
  };
  for (const e of evs) addEventListener(e, go, true);
}

/** 짧은 음. 꺼져 있거나 소리를 못 내는 기기면 아무것도 안 한다. */
export function tone({ f0, f1 = f0, dur, type = 'sine', gain = 0.3, at = 0 }) {
  if (muted) return;
  try {
    const c = context();
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio unavailable */ }
}

/** 걸러 낸 잡음 한 번(카드·칩 소리). */
export function noise({ dur, type = 'bandpass', f0, f1 = f0, q = 1, gain = 0.4, at = 0 }) {
  if (muted) return;
  try {
    const c = context();
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // 소리 모양일 뿐 게임 무작위가 아니다
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(t);
  } catch { /* audio unavailable */ }
}

/** 풀어 둔 소리(AudioBuffer)를 낸다. maxSec 가 있으면 그만큼에서 자른다. 낸 source(또는 null). */
export function playBuffer(buf, { gain = 0.9, maxSec = 0 } = {}) {
  if (muted || !buf) return null;
  try {
    const c = context();
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g).connect(master);
    src.start();
    if (maxSec > 0) src.stop(c.currentTime + maxSec);
    return src;
  } catch { return null; }
}

export const sound = { context, output, isMuted, setMuted, onMute, unlock, tone, noise, playBuffer };
