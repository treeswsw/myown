// 갱식마인드 소리 표. 파일 없이 WebAudio 로 만든다. 어떤 소리를 언제 틀지는 index.js(pure.js)가 정한다.
// 소리 엔진(AudioContext·마스터 음량·소리 끄기·iPad 잠금 해제)은 사이트 공용 sound/core.js 하나다: createAudio({ sound }) 에
// 공용 엔진(ctx.sound: context(), output(), isMuted())을 받는다. 이 파일은 불러올 때 window 를 만지지 않는다.

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

export function createAudio({ sound } = {}) {
  let disposed = false;

  function play(name) {
    if (disposed || !sound) return;
    const notes = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
    if (!notes) return;
    try {
      if (sound.isMuted()) return;
      const ctx = sound.context();
      const out = sound.output();
      const t0 = ctx.currentTime;
      for (const [st, dur, f0, f1, type, vol] of notes) {
        const g = ctx.createGain();
        const a = t0 + st;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.exponentialRampToValueAtTime(vol * MASTER, a + Math.min(0.02, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, a + dur);
        g.connect(out);
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

  return { play, dispose() { disposed = true; } };
}
