// 미니게임 효과음 — WebAudio 로 합성한 짧은 소리(파일 없음).
// 첫 누름(pointerdown/keydown) 전에는 AudioContext 를 만들지 않는다. 사이트 소리 끄기(gk.muted)를 따른다.
import { isMuted } from '../audio.js';

let ctx = null;
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* 소리 못 씀 */ }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

// 음 하나: f0 → f1 로 떨어지며 dur 초 동안 사라진다
function tone(type, f0, f1, dur, gain, at = 0) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  place: (at) => { tone('triangle', 620, 240, 0.07, 0.3, at); tone('sine', 1500, 700, 0.025, 0.12, at); }, // 딱
  flip: (at) => tone('triangle', 980, 620, 0.05, 0.14, at),
  capture: (at) => { tone('triangle', 300, 110, 0.11, 0.32, at); tone('sine', 900, 400, 0.04, 0.12, at + 0.02); },
  end: (at) => { tone('sine', 660, 660, 0.28, 0.2, at); tone('sine', 880, 880, 0.4, 0.2, at + 0.13); },
};

// play('place'|'flip'|'capture'|'end', 늦출 초)
export function play(name, at = 0) {
  if (!ctx || isMuted() || !SOUNDS[name]) return;
  try { if (ctx.state === 'suspended') ctx.resume(); SOUNDS[name](at); } catch { /* 소리 못 씀 */ }
}
