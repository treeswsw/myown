// 갱스껄 소리 — 파일 없이 WebAudio 로 만든다(디자인 캔버스 Flip.dc.html · Main.dc.html 의 소리 함수를 옮김).
// 사이트 소리 설정을 따른다: client/src/audio.js 의 isMuted()(저장 값 'gk.muted')가 true 면 아무 소리도 내지 않는다(요트와 같은 방식).
// AudioContext 는 첫 사용자 동작(누름·키) 때 만든다. 잡음은 고정 시드(Math.random 금지).
import { isMuted as siteMuted } from '../audio.js';
import { prng, stageSemi } from './anim/fx.pure.js';

const MASTER = 0.7;
const NOISE_SEC = 2.5;
const GESTURES = ['pointerdown', 'touchend', 'keydown'];

export function createAudio({ isMuted = siteMuted } = {}) {
  let ac = null, out = null, noiseBuf = null, disposed = false;
  const W = typeof window !== 'undefined' ? window : null;

  function make() {
    if (ac || disposed || !W) return;
    const A = W.AudioContext || W.webkitAudioContext;
    if (!A) return;
    try {
      ac = new A();
      out = ac.createGain();
      out.gain.value = MASTER;
      out.connect(ac.destination);
    } catch { ac = null; out = null; }
  }
  function unlock() {
    make();
    try { if (ac && ac.state === 'suspended') ac.resume(); } catch { /* 무시 */ }
  }
  if (W) for (const g of GESTURES) W.addEventListener(g, unlock, true);

  // 소리를 낼 수 있으면 AudioContext, 아니면 null (꺼짐·아직 안 풀림 → 밀린 소리가 나중에 한꺼번에 나지 않게 버린다)
  function ctx() {
    if (disposed) return null;
    let m = false;
    try { m = !!isMuted(); } catch { m = false; }
    if (m) return null;
    // 방에 들어오려고 이미 화면을 누른 사람은 바로 만든다. 한 번도 안 누른 기기에서는 만들지 않는다.
    let active = false;
    try { active = !!W?.navigator?.userActivation?.hasBeenActive; } catch { active = false; }
    if (ac || active) unlock();
    return ac && ac.state === 'running' ? ac : null;
  }
  function noiseSrc(c) {
    if (!noiseBuf) {
      const len = Math.floor(c.sampleRate * NOISE_SEC);
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0), r = prng(20261113);
      for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    }
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }

  // 여러 음을 한꺼번에. opt = { to: 끝 음높이 배수, lp: 저역 통과(Hz), att: 올라오는 시간 }
  function tone(freqs, dur, type, gain, delay, opt) {
    const c = ctx(); if (!c) return;
    const o = opt || {}, t = c.currentTime + (delay || 0) + 0.01;
    let dst = out;
    if (o.lp) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp;
      lp.connect(out); dst = lp;
    }
    for (const fq of freqs) {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(fq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, fq * o.to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + (o.att || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(dst);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
  }
  // 걸러 낸 잡음 한 번
  function noise(dur, gain, delay, freq, kind) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0) + 0.01;
    const src = noiseSrc(c);
    const f = c.createBiquadFilter(); f.type = kind || 'bandpass'; f.frequency.value = freq || 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + dur + 0.02);
  }
  // 서서히 올라오는 잡음(심벌 스웰)
  function swell(dur, gain, delay, freq) {
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0) + 0.01;
    const src = noiseSrc(c);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq || 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.78);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // 놓기 "탁": 짧은 잡음 + 떨어지는 저음. k = 크기(남의 것은 작게)
  function place(k = 1) {
    noise(0.05, 0.3 * k, 0, 1900, 'bandpass');
    tone([150], 0.1, 'sine', 0.4 * k, 0, { to: 0.45 });
    tone([420], 0.04, 'triangle', 0.08 * k, 0);
  }
  // 고르기·누르기의 아주 짧은 소리(캔버스에는 없음, 손·탁자가 부를 때만)
  function tick() {
    tone([880], 0.05, 'triangle', 0.07, 0);
    noise(0.02, 0.05, 0, 3200, 'bandpass');
  }
  // 꽃 단계음. 1: 도/레 한 음(번갈아) · 2: 미 + 5도 · 3: 솔 + 5도 + 옥타브 + 반짝임
  // 4: 시 + 레·파(풀리지 않은 화음) + 심벌 스웰 + 길게 남는 높은 음 → "다음 장이면 끝" · 5: 높은 도로 풀림
  // cool = 멈칫 뒤의 꽃: 조금 더 크고 맑게
  function stage(lv, n, d = 0, cool = false) {
    const f = 523.25 * Math.pow(2, stageSemi(lv, n) / 12), g = cool ? 1.25 : 1;
    tone([f], 0.55, 'sine', 0.2 * g, d);
    tone([f * 4], 0.14, 'sine', 0.05 * g, d);
    tone([f * 2], 0.3, 'triangle', 0.04, d);
    if (lv === 2 || lv === 3 || lv === 5) tone([f * 1.5], 0.5, 'sine', 0.1, d + 0.07);
    if (lv === 3 || lv === 5) { tone([f * 2], 0.6, 'sine', 0.09, d + 0.14); noise(0.35, 0.03, d + 0.05, 7000, 'highpass'); }
    if (lv === 4) {
      tone([f * 1.189, f * 1.414], 1.5, 'sine', 0.065, d + 0.12, { att: 0.03 });
      tone([f * 2], 2.6, 'sine', 0.034, d + 0.2, { att: 0.9 });
      tone([98], 2.2, 'sine', 0.11, d + 0.1, { att: 0.3 });
      swell(1.5, 0.085, d + 0.1, 6000);
    }
    if (lv === 5) { tone([f * 1.25, f * 3], 0.9, 'triangle', 0.05, d + 0.21); tone([f / 4], 0.9, 'sine', 0.13, d); }
    if (cool) { tone([f * 3], 0.5, 'sine', 0.04, d + 0.1); noise(0.4, 0.035, d + 0.04, 7500, 'highpass'); }
  }
  // 성공 피날레: 큰 장조 화음 + 위로 흩어지는 음 + 반짝임
  function win() {
    tone([261.63, 329.63, 392, 523.25, 659.25, 783.99], 2.4, 'sine', 0.085, 0, { att: 0.02 });
    tone([130.81], 2.4, 'triangle', 0.13, 0, { att: 0.02 });
    const a = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    for (let i = 0; i < a.length; i++) tone([a[i]], 0.9, 'sine', 0.09, 0.08 + i * 0.07);
    noise(1.4, 0.035, 0.1, 6500, 'highpass');
  }
  // 애태우기: 심장 박동 한 번(쿵-쿵)
  function beat(d = 0) {
    tone([62], 0.2, 'sine', 0.6, d, { to: 0.6 });
    tone([124], 0.1, 'triangle', 0.1, d, { to: 0.5 });
    tone([54], 0.24, 'sine', 0.42, d + 0.16, { to: 0.6 });
    tone([108], 0.1, 'triangle', 0.06, d + 0.16, { to: 0.5 });
    noise(0.06, 0.07, d, 180, 'lowpass');
  }
  // 해골 등장: 낮은 쿵 + 디튠된 불협 화음 + 아래로 일그러지는 소리
  function doom() {
    tone([72], 1.6, 'sine', 0.8, 0, { to: 0.38 });
    tone([110], 0.5, 'triangle', 0.22, 0, { to: 0.45 });
    noise(0.7, 0.5, 0, 320, 'lowpass');
    tone([55, 58.6, 77.8], 1.9, 'sawtooth', 0.11, 0.02, { lp: 520, att: 0.03 });
    tone([233.1, 246.9], 1.5, 'sawtooth', 0.045, 0.05, { lp: 1400, to: 0.5, att: 0.05 });
  }
  // 멈칫 뒤 꽃: "휴"
  function relief() {
    noise(0.55, 0.16, 0, 700, 'bandpass');
    noise(0.4, 0.05, 0.05, 2400, 'bandpass');
    tone([392, 493.88], 0.7, 'sine', 0.05, 0.02, { to: 0.94, att: 0.05 });
  }

  const safe = (fn) => (...a) => { try { fn(...a); } catch { /* 소리를 못 내는 기기 */ } };
  const sfx = {
    place: safe(place), tick: safe(tick), stage: safe(stage), win: safe(win),
    beat: safe(beat), doom: safe(doom), relief: safe(relief),
  };
  // 이름으로 부르기(손·탁자 모듈용): 'place' | 'placeSoft'(남의 것) | 'tick' | 'win' | 'beat' | 'doom' | 'relief'
  function play(name) {
    if (name === 'placeSoft') sfx.place(0.55);
    else if (name !== 'stage' && Object.prototype.hasOwnProperty.call(sfx, name)) sfx[name]();
  }
  function dispose() {
    disposed = true;
    if (W) for (const g of GESTURES) W.removeEventListener(g, unlock, true);
    const c = ac; ac = null; out = null; noiseBuf = null;
    try { c?.close?.(); } catch { /* 무시 */ }
  }
  return { ...sfx, play, unlock, dispose };
}
