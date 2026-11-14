// 요트다이스 소리 표(Web Audio 합성음). 소리 엔진·소리 끄기는 사이트 공용 sound/core.js 하나(끄면 master gain 0). Math.random 금지.
import { context, output, isMuted } from '../sound/core.js';
import { prng } from '../../../shared/yacht/sim.js';

let noiseBuf = null;
const ac = context;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.3), c.sampleRate);
    const d = noiseBuf.getChannelData(0), r = prng(20261113);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}
// 짧은 잡음(부딪힘)
function tick({ f = 2400, dur = 0.05, gain = 0.3, at = 0, q = 1.2 }) {
  const c = ac(), t = c.currentTime + at;
  const src = noise(c), flt = c.createBiquadFilter(), g = c.createGain();
  flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt).connect(g).connect(output());
  src.start(t); src.stop(t + dur + 0.02);
}
function tone({ f0, f1 = f0, dur = 0.15, gain = 0.2, at = 0, type = 'triangle' }) {
  const c = ac(), t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(output());
  o.start(t); o.stop(t + dur);
}
const play = (fn) => (...a) => { if (isMuted()) return; try { fn(...a); } catch { /* 소리를 못 내는 기기 */ } };
const notes = (list, step, gain = 0.2) => list.forEach((f, i) => tone({ f0: f, dur: 0.3, gain, at: i * step }));

export const ytSfx = {
  /** 컵 흔들기(흔드는 동안 0.1초쯤마다 한 번씩 부른다). */
  shake: play(() => { tick({ f: 1500, dur: 0.05, gain: 0.22 }); tick({ f: 2600, dur: 0.04, gain: 0.14, at: 0.045 }); }),
  /** 주사위가 바닥에 부딪힘. power 0..1 */
  hit: play((power = 0.6) => tick({ f: 1700 + 1500 * power, dur: 0.045, gain: 0.1 + 0.3 * power })),
  /** 2D 판: 굴림 한 번(부딪힘 몇 번). */
  roll: play(() => [0, 0.07, 0.16, 0.27].forEach((at, i) => tick({ f: 2600 - i * 250, dur: 0.045, gain: 0.32 - i * 0.06, at }))),
  keep: play(() => tick({ f: 3200, dur: 0.035, gain: 0.3, q: 3 })),
  score: play(() => notes([660, 880], 0.08, 0.16)),
  combo: play(() => notes([659, 784, 988], 0.09)),
  yacht: play(() => notes([523, 659, 784, 1047, 1319], 0.1, 0.22)),
  win: play(() => notes([523, 659, 784, 1047], 0.12, 0.22)),
  turn: play(() => tone({ f0: 880, f1: 1175, dur: 0.14, gain: 0.15, type: 'sine' })),
};
