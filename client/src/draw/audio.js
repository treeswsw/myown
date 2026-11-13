// 갱식마인드 효과음. 파일 없이 WebAudio 로 만든다. 어떤 소리를 언제 틀지는 index.js(pure.js)가 정한다.
// 모듈을 불러올 때는 window 를 만지지 않는다. AudioContext 는 unlock() 때 처음 만든다.
// 소리 끄기: createAudio({ isMuted }) 의 isMuted() 가 true 이면 틀지 않는다(사이트 공통 설정을 index.js 가 넘긴다).

export const SOUND_NAMES = ['myTurn', 'correct', 'hit', 'tenLeft', 'timeUp'];

const MASTER = 0.5;

// 음 하나: [시작초, 길이초, 시작Hz, 끝Hz, 파형, 음량]
const n = (t, d, f0, f1, type, g) => [t, d, f0, f1 ?? f0, type, g];
export const SOUNDS = {
  myTurn: [n(0, 0.16, 523, 523, 'triangle', 0.3), n(0.13, 0.32, 784, 784, 'triangle', 0.3)],
  correct: [n(0, 0.12, 523, 523, 'triangle', 0.3), n(0.1, 0.12, 659, 659, 'triangle', 0.3), n(0.2, 0.12, 784, 784, 'triangle', 0.3), n(0.3, 0.4, 1047, 1047, 'triangle', 0.3)],
  hit: [n(0, 0.1, 880, 1175, 'sine', 0.12)],
  tenLeft: [n(0, 0.07, 1320, 1320, 'square', 0.08), n(0.2, 0.07, 1320, 1320, 'square', 0.08)],
  timeUp: [n(0, 0.2, 392, 330, 'sawtooth', 0.14), n(0.18, 0.4, 262, 196, 'sawtooth', 0.14)],
};

export function createAudio({ isMuted } = {}) {
  let ctx = null;
  let master = null;
  let disposed = false;

  function unlock() {
    if (disposed) return;
    try {
      if (!ctx) {
        const AC = typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = MASTER;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume?.();
    } catch { ctx = null; master = null; }
  }

  function play(name) {
    if (disposed || !ctx || !master) return;
    let muted = false;
    try { muted = typeof isMuted === 'function' && !!isMuted(); } catch { muted = false; }
    if (muted) return;
    const notes = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
    if (!notes) return;
    try {
      if (ctx.state !== 'running') ctx.resume?.();
      const t0 = ctx.currentTime;
      for (const [st, dur, f0, f1, type, vol] of notes) {
        const g = ctx.createGain();
        const a = t0 + st;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(vol, a + Math.min(0.02, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, a + dur);
        g.connect(master);
        const src = ctx.createOscillator();
        src.type = type;
        src.frequency.setValueAtTime(f0, a);
        if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, a + dur);
        src.connect(g);
        src.start(a);
        src.stop(a + dur + 0.02);
      }
    } catch { /* 소리는 없어도 게임은 계속된다 */ }
  }

  function dispose() {
    disposed = true;
    const c = ctx;
    ctx = null; master = null;
    try { c?.close?.(); } catch { /* 무시 */ }
  }

  return { play, unlock, dispose };
}
